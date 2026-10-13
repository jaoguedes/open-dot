import { applySample, backoffMs, correlateDeploy, initialIncident, planDue, type IncidentState } from "@open-dot/core";
import { checkSite } from "@open-dot/connectors/http-check.ts";
import { listDeployments } from "@open-dot/connectors/vercel.ts";
import { ConnectorError } from "@open-dot/connectors/errors.ts";
import { SubrequestBudget, type Ctx } from "./context.ts";
import { REQUIRED_SCHEMA, currentSchema } from "./db/migrate.ts";
import * as repo from "./repo.ts";
import { syncGmail } from "./services/gmail.ts";
import { runEmailReview } from "./services/email-review.ts";

/**
 * Tique do cron (a cada 5 minutos, UTC). Tudo é idempotente: o cron pode repetir
 * ou atrasar sem duplicar revisões. O computador do João não participa.
 */
export interface TickReport {
  skipped?: string;
  planned: number;
  synced: Array<{ connectionId: string; status: string; fetched: number }>;
  runs: Array<{ id: string; state: string }>;
  monitors: number;
  deployments: number;
  subrequests: number;
}

export async function tick(ctx: Ctx): Promise<TickReport> {
  const report: TickReport = { planned: 0, synced: [], runs: [], monitors: 0, deployments: 0, subrequests: 0 };
  const schema = await currentSchema(ctx.db);
  if (schema !== REQUIRED_SCHEMA) return { ...report, skipped: `schema ${schema ?? "ausente"}; esperado ${REQUIRED_SCHEMA}` };
  const budget = new SubrequestBudget(40);
  const f = budget.wrap(ctx.fetch);
  const now = ctx.now();

  // 1) Planejar slots vencidos (chave única impede duplicata).
  for (const r of await repo.enabledRoutines(ctx.db)) {
    const spec = { routineId: r.id, ownerId: r.owner_id, times: JSON.parse(r.times) as string[], timeZone: r.time_zone, weekdays: JSON.parse(r.weekdays) as number[] };
    const last = Date.parse(r.last_planned_at ?? r.created_at);
    const plan = planDue(spec, last, now);
    for (const s of plan.create) {
      if (await repo.createRunForSlot(ctx.db, { ownerId: r.owner_id, routineId: r.id, agentId: r.agent_id, kind: r.kind, slotKey: s.key, scheduledAt: s.scheduledAt, late: s.late, now })) report.planned++;
    }
    await repo.setPlanned(ctx.db, r.id, now);
  }

  // 2) Sincronizar Gmail (antes da revisão, para o resumo ter dados frescos).
  for (const c of await repo.connectionsByProvider(ctx.db, "gmail")) {
    if (budget.remaining() < 5) break;
    const s = await syncGmail(ctx, c, f);
    report.synced.push({ connectionId: c.id, status: s.status, fetched: s.fetched });
  }

  // 3) Executar runs vencidos com lease + CAS.
  for (const run of await repo.dueRuns(ctx.db, now, 2)) {
    const claimed = await repo.claimRun(ctx.db, run, now);
    if (!claimed) continue;
    try {
      if (claimed.kind === "email_review") {
        const r = await runEmailReview(ctx, claimed, f);
        await repo.finishRun(ctx.db, claimed, { state: r.state, ...(r.errorCode ? { errorCode: r.errorCode } : {}), ...(r.message ? { errorMessage: r.message } : {}), now: ctx.now() });
        report.runs.push({ id: claimed.id, state: r.state });
      } else {
        await repo.finishRun(ctx.db, claimed, { state: "failed", errorCode: "not_supported", errorMessage: `tipo ${claimed.kind} não implementado`, now: ctx.now() });
      }
    } catch (e) {
      const retryable = claimed.attempt < 4;
      const retryAfter = e instanceof ConnectorError ? e.retryAfterMs : null;
      await repo.finishRun(ctx.db, claimed, {
        state: retryable ? "retry_scheduled" : "failed",
        errorCode: e instanceof ConnectorError ? e.code : "internal",
        errorMessage: e instanceof Error ? e.message : "erro",
        nextAttemptAt: ctx.now() + backoffMs(claimed.attempt, { baseMs: 60_000, retryAfterMs: retryAfter }),
        now: ctx.now(),
      });
      report.runs.push({ id: claimed.id, state: retryable ? "retry_scheduled" : "failed" });
    }
  }

  // 4) Monitores HTTP.
  for (const m of await repo.dueMonitors(ctx.db, now, 3)) {
    if (budget.remaining() < 4) break;
    const sample = await checkSite(f, { url: m.url, allowedHosts: [m.host], now: ctx.now });
    const prev = { ...initialIncident, ...(JSON.parse(m.incident || "{}") as Partial<IncidentState>) };
    const { state, transition } = applySample(prev, sample);
    await repo.saveSample(ctx.db, m, sample, state);
    report.monitors++;
    if (transition === "opened") {
      const deploys = await ctx.db.query<{ deployment_id: string; created_at: string; sha: string | null }>("SELECT deployment_id, created_at, sha FROM od_deployments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 10", [m.owner_id]);
      const corr = correlateDeploy(sample.at, deploys.map((d) => ({ id: d.deployment_id, createdAt: Date.parse(d.created_at), sha: d.sha })));
      await repo.insertFeed(ctx.db, ctx.keys, {
        ownerId: m.owner_id,
        agentId: "sentinela",
        runId: `incident:${m.id}:${sample.at}`,
        kind: "site_incident",
        title: `${m.label} não está respondendo bem`,
        body: { summary: `Três verificações seguidas falharam (${sample.error ?? "erro"}). Medição de uma única origem.`, correlation: corr, href: m.url, actions: [{ kind: "open_agent", label: "Abrir com Sentinela" }] },
        freshness: "fresh",
        coverage: null,
        now: ctx.now(),
      });
    } else if (transition === "closed") {
      await repo.insertFeed(ctx.db, ctx.keys, {
        ownerId: m.owner_id,
        agentId: "sentinela",
        runId: `recovered:${m.id}:${sample.at}`,
        kind: "notice",
        title: `${m.label} voltou a responder`,
        body: { summary: "Duas verificações seguidas responderam normalmente." },
        freshness: "fresh",
        coverage: null,
        now: ctx.now(),
      });
    }
  }

  // 5) Vercel (leitura) a cada ~15 min, se configurado.
  if (ctx.env.VERCEL_TOKEN && ctx.env.VERCEL_PROJECT_ID && new Date(now).getUTCMinutes() % 15 < 5 && budget.remaining() >= 2) {
    const owners = await ctx.db.query<{ id: string }>("SELECT id FROM od_owners LIMIT 1");
    const ownerId = owners[0]?.id;
    if (ownerId) {
      try {
        const deps = await listDeployments(f, { token: ctx.env.VERCEL_TOKEN, projectId: ctx.env.VERCEL_PROJECT_ID, ...(ctx.env.VERCEL_TEAM_ID ? { teamId: ctx.env.VERCEL_TEAM_ID } : {}), limit: 10, now });
        for (const d of deps) {
          const r = await ctx.db.run(
            "INSERT INTO od_deployments (owner_id, deployment_id, project_id, state, target, sha, url, inspector_url, created_at, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, deployment_id) DO UPDATE SET state = excluded.state, observed_at = excluded.observed_at WHERE od_deployments.state <> excluded.state",
            [ownerId, d.id, ctx.env.VERCEL_PROJECT_ID, d.state, d.target, d.sha, d.url, d.inspectorUrl, new Date(d.createdAt).toISOString(), new Date(now).toISOString()],
          );
          report.deployments++;
          if (r.changes === 1 && d.state === "ERROR") {
            await repo.insertFeed(ctx.db, ctx.keys, {
              ownerId,
              agentId: "sentinela",
              runId: `deploy:${d.id}`,
              kind: "deploy",
              title: "Um deploy da Vercel falhou",
              body: { summary: `Deploy ${d.sha ? d.sha.slice(0, 7) : d.id} terminou com erro. Os logs de build não foram lidos automaticamente.`, href: d.inspectorUrl },
              freshness: "fresh",
              coverage: null,
              now: ctx.now(),
            });
          }
        }
      } catch (e) {
        await repo.audit(ctx.db, { ownerId, actor: "system", action: "vercel_poll", outcome: "error", detail: e instanceof Error ? e.message : "erro", now: ctx.now() });
      }
    }
  }

  // 6) Retenção uma vez por hora.
  if (new Date(now).getUTCMinutes() < 5) await repo.applyRetention(ctx.db, now);

  report.subrequests = budget.used;
  return report;
}

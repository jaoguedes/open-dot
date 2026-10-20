import { expireProjectMemory } from "./continuity/routes.ts";
import { reconcileRunnerTasks } from "./runner/routes.ts";
import { applySample, correlateDeploy, explainError, initialIncident, planDue, type IncidentState } from "@open-dot/core";
import { checkSite } from "@open-dot/connectors/http-check.ts";
import { listDeployments } from "@open-dot/connectors/vercel.ts";
import { BudgetExhausted, SubrequestBudget, type Ctx } from "./context.ts";
import { REQUIRED_SCHEMA, currentSchema, schemaCompatible } from "./db/migrate.ts";
import * as repo from "./repo.ts";
import { safeReason } from "./reasons.ts";
import { syncGmail } from "./services/gmail.ts";
import { runEmailReview } from "./services/email-review.ts";
import { organizeUpload } from "./services/uploads.ts";
import { ingestNews, publishWorldToday } from "./services/news.ts";
import { ingestQuotes } from "./services/quotes.ts";
import { pollShipments, extractShipments } from "./services/shipments.ts";

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
  shipments: number;
  subrequests: number;
  stepErrors: Array<{ step: string; reason: string }>;
}

export async function tick(outer: Ctx): Promise<TickReport> {
  const report: TickReport = { planned: 0, synced: [], runs: [], monitors: 0, deployments: 0, shipments: 0, subrequests: 0, stepErrors: [] };
  const { version } = await currentSchema(outer.db);
  if (!schemaCompatible(version, REQUIRED_SCHEMA)) return { ...report, skipped: `schema ${version ?? "ausente"}; esperado ${REQUIRED_SCHEMA}` };
  const budget = new SubrequestBudget(44);
  const ctx: Ctx = { ...outer, db: budget.watch(outer.db), fetch: budget.wrap(outer.fetch) };
  const f = ctx.fetch;
  const now = ctx.now();
  try {
    await repo.expireStaleRuns(ctx.db, now);
    await reconcileRunnerTasks(ctx);
    await expireProjectMemory(ctx);

    const failStep = async (step: string, e: unknown) => {
      if (e instanceof BudgetExhausted) throw e;
      const reason = safeReason(e);
      report.stepErrors.push({ step, reason });
      try {
        const owners = await outer.db.query<{ id: string }>("SELECT id FROM od_owners LIMIT 1");
        if (owners[0]) await repo.audit(outer.db, { ownerId: owners[0].id, actor: "system", action: "tick_step", outcome: "error", detail: `${step}:${reason}`, now });
      } catch {
        /* o passo já está em stepErrors; a auditoria não pode derrubar o tique */
      }
    };

    // 1) Planejar slots vencidos (chave única impede duplicata).
    try {
      for (const r of await repo.enabledRoutines(ctx.db)) {
        const spec = { routineId: r.id, ownerId: r.owner_id, times: JSON.parse(r.times) as string[], timeZone: r.time_zone, weekdays: JSON.parse(r.weekdays) as number[] };
        const last = Date.parse(r.last_planned_at ?? r.created_at);
        const plan = planDue(spec, last, now);
        for (const s of plan.create) {
          if (await repo.createRunForSlot(ctx.db, { ownerId: r.owner_id, routineId: r.id, agentId: r.agent_id, kind: r.kind, slotKey: s.key, scheduledAt: s.scheduledAt, late: s.late, now }))
            report.planned++;
        }
        await repo.setPlanned(ctx.db, r.id, now);
      }
    } catch (e) {
      await failStep("1", e);
    }

    // 2) Sincronizar Gmail (antes da revisão, para o resumo ter dados frescos).
    try {
      for (const c of await repo.connectionsByProvider(ctx.db, "gmail")) {
        if (budget.remaining() < 5) break;
        const s = await syncGmail(ctx, c, f);
        report.synced.push({ connectionId: c.id, status: s.status, fetched: s.fetched });
      }
    } catch (e) {
      await failStep("2", e);
    }

    // 3) Executar runs vencidos com lease + CAS.
    try {
      for (const run of await repo.dueRuns(ctx.db, now, 2)) {
        const claimed = await repo.claimRun(ctx.db, run, now);
        if (!claimed) continue;
        let closed = false;
        try {
          if (claimed.kind === "email_review") {
            const r = await runEmailReview(ctx, claimed, f);
            await repo.finishRun(ctx.db, claimed, { state: r.state, ...(r.errorCode ? { errorCode: r.errorCode } : {}), ...(r.message ? { errorMessage: r.message } : {}), now: ctx.now() });
            report.runs.push({ id: claimed.id, state: r.state });
          } else if (claimed.kind === "file_organize") {
            const r = await organizeUpload(ctx, claimed);
            await repo.finishRun(ctx.db, claimed, { state: r.state, ...(r.errorCode ? { errorCode: r.errorCode } : {}), ...(r.message ? { errorMessage: r.message } : {}), now: ctx.now() });
            report.runs.push({ id: claimed.id, state: r.state });
          } else if (claimed.kind === "news_review") {
            await ingestNews(ctx, claimed.owner_id, f, { maxFeeds: Math.min(8, budget.remaining()) });
            await publishWorldToday(ctx, claimed.owner_id, claimed.id);
            await repo.finishRun(ctx.db, claimed, { state: "succeeded", now: ctx.now() });
            report.runs.push({ id: claimed.id, state: "succeeded" });
          } else {
            await repo.finishRun(ctx.db, claimed, { state: "failed", errorCode: "not_supported", errorMessage: explainError("not_supported").frase, now: ctx.now() });
            report.runs.push({ id: claimed.id, state: "failed" });
          }
          closed = true;
        } catch (e) {
          const code = safeReason(e);
          await repo.finishRun(ctx.db, claimed, {
            state: "failed",
            errorCode: code,
            errorMessage: explainError(code).frase,
            now: ctx.now(),
          });
          report.runs.push({ id: claimed.id, state: "failed" });
          closed = true;
        } finally {
          if (!closed) {
            await repo.finishRun(ctx.db, claimed, { state: "failed", errorCode: "unknown", errorMessage: explainError("unknown").frase, now: ctx.now() });
            report.runs.push({ id: claimed.id, state: "failed" });
          }
        }
      }
    } catch (e) {
      await failStep("3", e);
    }

    // 4) Monitores HTTP.
    try {
      for (const m of await repo.dueMonitors(ctx.db, now, 3)) {
        if (budget.remaining() < 4) break;
        const sample = await checkSite(f, { url: m.url, allowedHosts: [m.host], now: ctx.now });
        const prev = { ...initialIncident, ...(JSON.parse(m.incident || "{}") as Partial<IncidentState>) };
        const { state, transition } = applySample(prev, sample);
        await repo.saveSample(ctx.db, m, sample, state);
        report.monitors++;
        if (transition === "opened") {
          const deploys = await ctx.db.query<{ deployment_id: string; created_at: string; sha: string | null }>(
            "SELECT deployment_id, created_at, sha FROM od_deployments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 10",
            [m.owner_id],
          );
          const corr = correlateDeploy(
            sample.at,
            deploys.map((d) => ({ id: d.deployment_id, createdAt: Date.parse(d.created_at), sha: d.sha })),
          );
          await repo.insertFeed(ctx.db, ctx.keys, {
            ownerId: m.owner_id,
            agentId: "sentinela",
            runId: `incident:${m.id}:${sample.at}`,
            kind: "site_incident",
            title: `${m.label} não está respondendo bem`,
            body: {
              summary: `Três verificações seguidas falharam (${sample.error ?? "erro"}). Medição de uma única origem.`,
              correlation: corr,
              href: m.url,
              actions: [{ kind: "open_agent", label: "Abrir com Sentinela" }],
            },
            freshness: "fresh",
            coverage: null,
            now: ctx.now(),
          });
        } else if (transition === "closed") {
          await repo.markFeedDone(ctx.db, m.owner_id, "site_incident", `incident:${m.id}:%`, ctx.now());
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
    } catch (e) {
      await failStep("4", e);
    }

    // 5) Vercel (leitura) a cada ~15 min, se configurado.
    try {
      if (ctx.env.VERCEL_TOKEN && ctx.env.VERCEL_PROJECT_ID && new Date(now).getUTCMinutes() % 15 < 5 && budget.remaining() >= 2) {
        const owners = await ctx.db.query<{ id: string }>("SELECT id FROM od_owners LIMIT 1");
        const ownerId = owners[0]?.id;
        if (ownerId) {
          try {
            const deps = await listDeployments(f, {
              token: ctx.env.VERCEL_TOKEN,
              projectId: ctx.env.VERCEL_PROJECT_ID,
              ...(ctx.env.VERCEL_TEAM_ID ? { teamId: ctx.env.VERCEL_TEAM_ID } : {}),
              limit: 10,
              now,
            });
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
            await repo.audit(ctx.db, { ownerId, actor: "system", action: "vercel_poll", outcome: "error", detail: safeReason(e), now: ctx.now() });
          }
        }
      }
    } catch (e) {
      await failStep("5", e);
    }

    // 5) Encomendas antes das leituras públicas, para o orçamento não deixar o rastreio de fora.
    let ownersEarly: { id: string }[] = [];
    try {
      ownersEarly = await ctx.db.query<{ id: string }>("SELECT id FROM od_owners LIMIT 3");
      for (const o of ownersEarly) {
        await extractShipments(ctx, o.id);
        if (budget.remaining() >= 1) {
          const poll = await pollShipments(ctx, o.id, f, Math.min(2, budget.remaining()));
          report.shipments += poll.checked;
        }
      }
    } catch (e) {
      await failStep("5b", e);
    }

    // 5c) Notícias e cotações.
    try {
      for (const o of ownersEarly) {
        try {
          if (budget.remaining() >= 5) await ingestNews(ctx, o.id, f, { maxFeeds: Math.min(4, budget.remaining() - 1) });
          if (budget.remaining() >= 3) await ingestQuotes(ctx, o.id, f);
        } catch (e) {
          if (e instanceof BudgetExhausted) throw e;
          await failStep("5c", e);
        }
      }
    } catch (e) {
      await failStep("5c", e);
    }

    // 6) Retenção uma vez por hora.
    try {
      if (new Date(now).getUTCMinutes() < 5) await repo.applyRetention(ctx.db, now);
    } catch (e) {
      await failStep("6", e);
    }

    report.subrequests = budget.used;
    await saveTick(outer, report, now);
    return report;
  } catch (e) {
    report.subrequests = budget.used;
    if (e instanceof BudgetExhausted) {
      const out = { ...report, skipped: "subrequest_limit" };
      await saveTick(outer, out, now);
      return out;
    }
    throw e;
  }
}

/** Última rodada do cron para o Diagnóstico (F4). Só contagens e códigos. Falhar aqui não derruba o tique. */
async function saveTick(outer: Ctx, report: TickReport, now: number): Promise<void> {
  try {
    const summary = { at: new Date(now).toISOString(), planned: report.planned, runs: report.runs.length, monitors: report.monitors, subrequests: report.subrequests, stepErrors: report.stepErrors, skipped: report.skipped ?? null };
    await repo.setSystemState(outer.db, "last_tick", JSON.stringify(summary), now);
  } catch {
    /* sem o registro, o Diagnóstico só mostra "sem rodada registrada" */
  }
}

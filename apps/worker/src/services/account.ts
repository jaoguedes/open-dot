// SPDX-License-Identifier: AGPL-3.0-only
import { explainError } from "@open-dot/core";
import { revoke } from "@open-dot/connectors/google.ts";
import type { Ctx } from "../context.ts";
import { configured } from "../env.ts";
import { REQUIRED_SCHEMA, currentSchema, schemaCompatible } from "../db/migrate.ts";
import * as repo from "../repo.ts";
import { listUploads } from "./uploads.ts";

/** Diagnóstico (F4): só para o dono autenticado. Códigos e frases do dicionário; nada de segredo. */
export async function diagnostics(ctx: Ctx, ownerId: string) {
  const { version, error } = await currentSchema(ctx.db);
  const runs = await repo.listRuns(ctx.db, ownerId, 30);
  const lastTick = await repo.getSystemState(ctx.db, "last_tick");
  return {
    health: { ok: schemaCompatible(version, REQUIRED_SCHEMA), schema: version, requiredSchema: REQUIRED_SCHEMA, schemaError: error ?? null, env: ctx.env.APP_ENV, configured: configured(ctx.env) },
    lastTick: lastTick ? { ...(JSON.parse(lastTick.value) as object), savedAt: lastTick.updated_at } : null,
    failures: runs
      .filter((r) => r.state === "failed" || r.state === "uncertain")
      .slice(0, 10)
      .map((r) => {
        const code = r.error_code || "unknown";
        const e = explainError(code);
        return { runId: r.id, agentId: r.agent_id, kind: r.kind, state: r.state, at: r.updated_at, code, frase: e.frase, acao: e.acao };
      }),
    time: new Date(ctx.now()).toISOString(),
  };
}

/**
 * Exportar meus dados (F6, LGPD): tudo do dono em JSON legível, já decifrado.
 * Ficam de fora tokens de conexão, hash de sessão e o texto integral de arquivos absorvidos.
 */
export async function exportData(ctx: Ctx, ownerId: string) {
  const owner = await repo.getOwner(ctx.db, ownerId);
  const feed = await repo.listFeed(ctx.db, ctx.keys, ownerId, { before: null, limit: 1000, now: ctx.now() });
  const conns = await repo.listConnections(ctx.db, ownerId);
  const audit = await ctx.db.query<{ at: string; actor: string; action: string; target: string | null; outcome: string; detail: string | null }>(
    "SELECT at, actor, action, target, outcome, detail FROM od_audit_events WHERE owner_id = ? ORDER BY at DESC LIMIT 1000",
    [ownerId],
  );
  return {
    exportedAt: new Date(ctx.now()).toISOString(),
    format: "open-dot-export/1",
    owner: owner && { email: owner.email, name: owner.display_name, timeZone: owner.time_zone },
    connections: conns.map((c) => ({ provider: c.provider, status: c.status, account: c.account_label, scopes: JSON.parse(c.scopes) as string[], lastSyncAt: c.last_sync_at })),
    routines: (await repo.listRoutines(ctx.db, ownerId)).map((r) => ({ agentId: r.agent_id, kind: r.kind, times: JSON.parse(r.times) as string[], timeZone: r.time_zone, enabled: r.enabled === 1 })),
    runs: (await repo.listRuns(ctx.db, ownerId, 200)).map((r) => ({ agentId: r.agent_id, kind: r.kind, state: r.state, scheduledAt: r.scheduled_at, updatedAt: r.updated_at, errorCode: r.error_code })),
    feed: feed.map((f) => ({ agentId: f.agentId, kind: f.kind, title: f.title, state: f.state, createdAt: f.createdAt, body: f.body })),
    approvals: (await repo.listApprovals(ctx.db, ctx.keys, ownerId)).map((a) => ({ action: a.action, status: a.status, createdAt: a.createdAt, proposal: a.proposal })),
    monitors: (await repo.listMonitors(ctx.db, ownerId)).map((m) => ({ url: m.url, label: m.label, enabled: m.enabled === 1, lastCheckAt: m.last_check_at })),
    shipments: (await repo.listShipments(ctx.db, ownerId)).map((s) => ({ code: s.code, carrier: s.carrier, status: s.status_label, lastEvent: s.last_event, createdAt: s.created_at })),
    uploads: (await listUploads(ctx, ownerId)).map((u) => ({ fileName: u.fileName, state: u.state, createdAt: u.createdAt, result: u.result ? { title: u.result.title, keywords: u.result.keywords } : null })),
    silencedSenders: await repo.silencedSenders(ctx.db, ctx.keys, ownerId),
    audit,
  };
}

/** Tabelas com dados do dono, filhas antes das mães. A ordem importa quando há chave estrangeira. */
const OWNER_TABLES = [
  "od_task_checkpoints",
  "od_project_ledgers",
  "od_project_memory_policies",
  "od_runner_tasks",
  "od_runner_pairings",
  "od_runner_devices",
  "od_feed_evidence",
  "od_evidence",
  "od_feed_items",
  "od_email_pending",
  "od_email_messages",
  "od_inbox_events",
  "od_approvals",
  "od_runs",
  "od_routines",
  "od_connection_secrets",
  "od_connections",
  "od_oauth_states",
  "od_quota_reservations",
  "od_ai_usage",
  "od_monitor_samples",
  "od_monitors",
  "od_github_resources",
  "od_github_installations",
  "od_deployments",
  "od_uploads",
  "od_agent_settings",
  "od_news_items",
  "od_quotes",
  "od_shipments",
  "od_tracking_budget",
  "od_triage_feedback",
  "od_audit_events",
  "od_sessions",
] as const;

/**
 * Apagar tudo (F6): tenta revogar o acesso no Google e apaga, numa transação, cada linha
 * do dono e o próprio dono. Outros donos não são tocados.
 */
export async function deleteAccount(ctx: Ctx, ownerId: string): Promise<{ revoked: number; tables: number }> {
  let revoked = 0;
  for (const c of (await repo.listConnections(ctx.db, ownerId)).filter((x) => x.provider === "gmail" || x.provider === "gsc").slice(0, 2)) {
    try {
      const t = await repo.readSecret(ctx.db, ctx.keys, ownerId, c.id);
      if (t?.refreshToken && (await revoke(ctx.fetch, t.refreshToken))) revoked++;
    } catch {
      /* a revogação é cortesia; o dado local é apagado de qualquer jeito */
    }
  }
  await ctx.db.batch([
    {sql:"DELETE FROM od_engineering_dependencies WHERE task_id IN (SELECT t.id FROM od_engineering_tasks t JOIN od_engineering_plans p ON p.id=t.plan_id WHERE p.owner_id=?)",args:[ownerId]},
    {sql:"DELETE FROM od_engineering_attempts WHERE task_id IN (SELECT t.id FROM od_engineering_tasks t JOIN od_engineering_plans p ON p.id=t.plan_id WHERE p.owner_id=?)",args:[ownerId]},
    {sql:"DELETE FROM od_engineering_tasks WHERE plan_id IN (SELECT id FROM od_engineering_plans WHERE owner_id=?)",args:[ownerId]},
    {sql:"DELETE FROM od_engineering_plans WHERE owner_id=?",args:[ownerId]},
    {sql:"DELETE FROM od_runner_events WHERE task_id IN (SELECT id FROM od_runner_tasks WHERE owner_id=?)",args:[ownerId]},
    {sql:"DELETE FROM od_runner_approvals WHERE task_id IN (SELECT id FROM od_runner_tasks WHERE owner_id=?)",args:[ownerId]},
    ...OWNER_TABLES.map((t) => ({ sql: `DELETE FROM ${t} WHERE owner_id = ?`, args: [ownerId] })),
    { sql: "DELETE FROM od_quota_counters WHERE scope_key = ?", args: [`owner:${ownerId}`] },
    { sql: "DELETE FROM od_owners WHERE id = ?", args: [ownerId] },
  ]);
  return { revoked, tables: OWNER_TABLES.length + 4 };
}

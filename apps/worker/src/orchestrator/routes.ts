// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Orquestrador v0.2 no Worker: guarda o snapshot de ferramentas que o Runner AUTENTICADO envia
 * (nunca o navegador) e devolve ao dono junto com o catálogo. Sem credenciais em nenhum ponto.
 */
import { z } from "zod";
import catalogJson from "../../../../orchestrator/catalog/ferramentas.json";
import weightsJson from "../../../../orchestrator/config/pesos.json";
import agentsJson from "../../../../orchestrator/generated/agents.json";
import { loadAgentPackage, type AgentFiles, type AgentPackage, type Role } from "@open-dot/core/orchestrator/agents.ts";
import { TOOL_IDS, type ToolId } from "@open-dot/core/orchestrator/catalog.ts";
import { assembleTeam, type Evidence, type Weights } from "@open-dot/core/orchestrator/selector.ts";
import { freshQuota, rollover, setUserLimit, type QuotaState } from "@open-dot/core/orchestrator/quota.ts";
import { parseCatalog } from "@open-dot/core/orchestrator/catalog.ts";
import { DetectionSnapshotSchema, type DetectionSnapshot } from "@open-dot/core/orchestrator/detection.ts";
import type { Handler } from "../app.ts";
import { json, problem } from "../http.ts";
import { device, read } from "../runner/routes.ts";

type Registrar = (method: string, path: string, opts: { auth: boolean; csrf?: boolean }, handler: Handler) => void;
export const CATALOG = parseCatalog(catalogJson);
const WEIGHTS = weightsJson as unknown as Weights & { padraoDeChamadasPorDia: Partial<Record<ToolId, number | null>> };
let agentsCache: Promise<AgentPackage[]> | null = null;
/** Pacotes de agentes gerados no build, conferidos pelo hash de cada um. */
export function agentPackages(): Promise<AgentPackage[]> {
  agentsCache ??= Promise.all((agentsJson as { agentes: Array<{ files: AgentFiles; hash: string }> }).agentes.map((a) => loadAgentPackage(a.files, a.hash)));
  return agentsCache;
}

export async function quotas(ctx: Parameters<Handler>[0], owner: string): Promise<Partial<Record<ToolId, QuotaState>>> {
  const rows = await ctx.db.query<{ tool_id: ToolId; state_json: string }>("SELECT tool_id,state_json FROM od_tool_quota WHERE owner_id=?", [owner]);
  const out: Partial<Record<ToolId, QuotaState>> = {};
  for (const r of rows) out[r.tool_id] = rollover(JSON.parse(r.state_json) as QuotaState, ctx.now());
  for (const id of TOOL_IDS) out[id] ??= freshQuota(ctx.now(), WEIGHTS.padraoDeChamadasPorDia[id] ?? null);
  return out;
}

async function evidence(ctx: Parameters<Handler>[0], owner: string) {
  const rows = await ctx.db.query<{ tool_id: ToolId; role: Role; ok: number; total: number }>(
    "SELECT tool_id,role,SUM(CASE WHEN outcome='aprovado' THEN 1 ELSE 0 END) AS ok,COUNT(*) AS total FROM od_orchestrator_outcomes WHERE owner_id=? GROUP BY tool_id,role",
    [owner],
  );
  const out: Partial<Record<ToolId, Partial<Record<Role, Evidence>>>> = {};
  for (const r of rows) (out[r.tool_id] ??= {})[r.role] = { aprovadas: r.ok, total: r.total };
  return out;
}

async function settings(ctx: Parameters<Handler>[0], owner: string) {
  const row = (await ctx.db.query<{ claude_opt_in: number; claude_ack_at: number | null }>("SELECT claude_opt_in,claude_ack_at FROM od_orchestrator_settings WHERE owner_id=?", [owner]))[0];
  return { claudeCode: row?.claude_opt_in === 1, claudeAvisoAceitoEm: row?.claude_ack_at ?? null };
}

const TeamInputSchema = z
  .object({
    ideia: z.string().trim().min(3).max(2000),
    deviceId: z.string().uuid(),
    overrides: z.record(z.string().regex(/^[a-z][a-z0-9-]{1,40}$/), z.enum(TOOL_IDS)).optional(),
    permitirPossivelmentePago: z.array(z.enum(TOOL_IDS)).max(TOOL_IDS.length).optional(),
  })
  .strict();

export function registerOrchestratorRoutes(route: Registrar) {
  route("POST", "/api/runner/device/tools", { auth: false, csrf: false }, async (ctx, req) => {
    const d = await device(ctx, req);
    if (!d) return problem(401, "device_revoked", "Dispositivo indisponível.");
    const snapshot = DetectionSnapshotSchema.parse(await read(req));
    if (snapshot.observedAt > ctx.now() + 300_000) return problem(400, "invalid_input", "Horário do snapshot no futuro.");
    await ctx.db.run(
      "INSERT INTO od_tool_snapshots(device_id,owner_id,snapshot_json,observed_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,observed_at=excluded.observed_at,updated_at=excluded.updated_at WHERE excluded.observed_at>=od_tool_snapshots.observed_at",
      [d.id, d.owner_id, JSON.stringify(snapshot), snapshot.observedAt, ctx.now()],
    );
    return json({ accepted: true });
  });

  route("GET", "/api/orchestrator/tools", { auth: true }, async (ctx, _req, _p, owner) => {
    const rows = await ctx.db.query<{ device_id: string; name: string; snapshot_json: string; updated_at: number; seen_at: number }>(
      "SELECT s.device_id,d.name,s.snapshot_json,s.updated_at,d.seen_at FROM od_tool_snapshots s JOIN od_runner_devices d ON d.id=s.device_id WHERE s.owner_id=? AND d.revoked_at IS NULL ORDER BY s.updated_at DESC LIMIT 20",
      [owner!],
    );
    const devices = rows.flatMap((r) => {
      const parsed = DetectionSnapshotSchema.safeParse(JSON.parse(r.snapshot_json));
      return parsed.success ? [{ deviceId: r.device_id, name: r.name, online: r.seen_at > ctx.now() - 30_000, updatedAt: r.updated_at, snapshot: parsed.data }] : [];
    });
    return json({ catalog: CATALOG, devices });
  });
}

export function registerTeamRoutes(route: Registrar) {
  route("POST", "/api/orchestrator/team", { auth: true }, async (ctx, req, _p, owner) => {
    const data = TeamInputSchema.parse(await read(req));
    const dev = (await ctx.db.query<{ seen_at: number }>("SELECT seen_at FROM od_runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL", [data.deviceId, owner!]))[0];
    if (!dev) return problem(404, "not_found", "Computador não encontrado.");
    const snapshot = await latestSnapshot(ctx, owner!, data.deviceId);
    const team = assembleTeam({
      ideia: data.ideia,
      catalog: CATALOG,
      snapshot,
      online: dev.seen_at > ctx.now() - 30_000,
      agents: (await agentPackages()).map((p) => p.meta),
      quotas: await quotas(ctx, owner!),
      evidence: await evidence(ctx, owner!),
      weights: WEIGHTS,
      optIn: { claudeCode: (await settings(ctx, owner!)).claudeCode },
      ...(data.overrides ? { overrides: data.overrides } : {}),
      ...(data.permitirPossivelmentePago ? { permitirPossivelmentePago: data.permitirPossivelmentePago } : {}),
      now: ctx.now(),
    });
    return json({ team, snapshotDisponivel: snapshot !== null, executa: false, nota: "Proposta de equipe. Nada roda sem a sua confirmação." });
  });

  route("GET", "/api/orchestrator/settings", { auth: true }, async (ctx, _r, _p, owner) => json({ ...(await settings(ctx, owner!)), quotas: await quotas(ctx, owner!) }));

  route("PUT", "/api/orchestrator/settings", { auth: true }, async (ctx, req, _p, owner) => {
    const data = z.object({ claudeCode: z.boolean(), aviso: z.literal("uso-programatico-consome-credito-do-plano").optional() }).strict().parse(await read(req));
    if (data.claudeCode && !data.aviso) return problem(409, "aviso_necessario", "Confirme o aviso: o uso programático do Claude Code consome o crédito do seu plano; mantenha o uso extra desligado.");
    await ctx.db.run(
      "INSERT INTO od_orchestrator_settings(owner_id,claude_opt_in,claude_ack_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET claude_opt_in=excluded.claude_opt_in,claude_ack_at=COALESCE(excluded.claude_ack_at,od_orchestrator_settings.claude_ack_at),updated_at=excluded.updated_at",
      [owner!, data.claudeCode ? 1 : 0, data.claudeCode ? ctx.now() : null, ctx.now()],
    );
    return json(await settings(ctx, owner!));
  });

  route("PUT", "/api/orchestrator/quota/:tool", { auth: true }, async (ctx, req, p, owner) => {
    const tool = z.enum(TOOL_IDS).parse(p.tool);
    const { limiteDia } = z.object({ limiteDia: z.number().int().min(1).max(100_000).nullable() }).strict().parse(await read(req));
    const next = setUserLimit((await quotas(ctx, owner!))[tool]!, limiteDia);
    await ctx.db.run("INSERT INTO od_tool_quota(owner_id,tool_id,state_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,tool_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at", [owner!, tool, JSON.stringify(next), ctx.now()]);
    return json({ tool, quota: next });
  });
}

/** Snapshot mais recente do dono para um dispositivo; null se não houver. */
export async function latestSnapshot(ctx: Parameters<Handler>[0], owner: string, deviceId: string): Promise<DetectionSnapshot | null> {
  const row = (await ctx.db.query<{ snapshot_json: string }>("SELECT snapshot_json FROM od_tool_snapshots WHERE owner_id=? AND device_id=?", [owner, deviceId]))[0];
  if (!row) return null;
  const parsed = DetectionSnapshotSchema.safeParse(JSON.parse(row.snapshot_json));
  return parsed.success ? parsed.data : null;
}

export const DeviceIdSchema = z.string().uuid();

// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Orquestrador v0.3 no Worker: preferências (tudo desligado por padrão) e calibração adaptativa.
 * A calibração só usa resultados medidos deste dono, roda no máximo um ciclo por dia e nunca
 * vale quando está desligada. "Zerar" apaga o estado.
 */
import { z } from "zod";
import { DEFAULT_PREFS, PrefsSchema, parsePrefs, type OrchestratorPrefs } from "@open-dot/core/orchestrator/prefs.ts";
import { EMPTY_CALIBRATION, calibrate, explainKey, type CalibrationState, type MeasuredOutcome, type OutcomeKind } from "@open-dot/core/orchestrator/calibration.ts";
import type { Role } from "@open-dot/core/orchestrator/agents.ts";
import type { ToolId } from "@open-dot/core/orchestrator/catalog.ts";
import type { ProjectType } from "@open-dot/core/orchestrator/profile.ts";
import type { Handler } from "../app.ts";
import { json } from "../http.ts";
import { read } from "../runner/routes.ts";

type Registrar = (method: string, path: string, opts: { auth: boolean; csrf?: boolean }, handler: Handler) => void;
type Ctx = Parameters<Handler>[0];
const DAY = 86_400_000;

export async function prefsFor(ctx: Ctx, owner: string): Promise<OrchestratorPrefs> {
  const row = (await ctx.db.query<{ prefs_json: string }>("SELECT prefs_json FROM od_orchestrator_prefs WHERE owner_id=?", [owner]))[0];
  return parsePrefs(row?.prefs_json);
}

async function measured(ctx: Ctx, owner: string): Promise<MeasuredOutcome[]> {
  const rows = await ctx.db.query<{ role: Role; tool_id: ToolId; outcome: OutcomeKind; team_json: string | null }>(
    `SELECT o.role,o.tool_id,o.outcome,p.team_json FROM od_orchestrator_outcomes o
     LEFT JOIN od_pipeline_steps s ON s.runner_task_id=o.runner_task_id
     LEFT JOIN od_pipelines p ON p.id=s.pipeline_id
     WHERE o.owner_id=? ORDER BY o.created_at DESC LIMIT 2000`,
    [owner],
  );
  return rows.map((r) => {
    let tipo: ProjectType | "qualquer" = "qualquer";
    try {
      const t = r.team_json ? (JSON.parse(r.team_json) as { tipo?: ProjectType }).tipo : undefined;
      if (t) tipo = t;
    } catch {
      /* equipe antiga sem tipo: conta só em "qualquer" */
    }
    return { role: r.role, tool: r.tool_id, tipo, outcome: r.outcome };
  });
}

async function storedCalibration(ctx: Ctx, owner: string): Promise<{ state: CalibrationState; updatedAt: number } | null> {
  const row = (await ctx.db.query<{ state_json: string; updated_at: number }>("SELECT state_json,updated_at FROM od_orchestrator_calibration WHERE owner_id=?", [owner]))[0];
  if (!row) return null;
  try {
    return { state: JSON.parse(row.state_json) as CalibrationState, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

/** Estado da calibração para montar equipes; null quando desligada. Roda um ciclo por dia, no máximo. */
export async function calibrationFor(ctx: Ctx, owner: string): Promise<CalibrationState | null> {
  if (!(await prefsFor(ctx, owner)).calibracao) return null;
  const stored = await storedCalibration(ctx, owner);
  if (stored && stored.updatedAt > ctx.now() - DAY) return stored.state;
  const { state } = calibrate(await measured(ctx, owner), stored?.state ?? EMPTY_CALIBRATION);
  await ctx.db.run(
    "INSERT INTO od_orchestrator_calibration(owner_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at",
    [owner, JSON.stringify(state), ctx.now()],
  );
  return state;
}

export function registerV03Routes(route: Registrar) {
  route("GET", "/api/orchestrator/prefs", { auth: true }, async (ctx, _r, _p, owner) => json({ prefs: await prefsFor(ctx, owner!), padrao: DEFAULT_PREFS }));

  route("PUT", "/api/orchestrator/prefs", { auth: true }, async (ctx, req, _p, owner) => {
    const patch = PrefsSchema.partial().strict().parse(await read(req));
    const next = PrefsSchema.parse({ ...(await prefsFor(ctx, owner!)), ...patch });
    await ctx.db.run(
      "INSERT INTO od_orchestrator_prefs(owner_id,prefs_json,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET prefs_json=excluded.prefs_json,updated_at=excluded.updated_at",
      [owner!, JSON.stringify(next), ctx.now()],
    );
    // Desligar a sugestão de skill apaga as propostas pendentes (parte 3, item 3).
    if (patch.sugestaoDeSkill === false) await ctx.db.run("DELETE FROM od_skill_proposals WHERE owner_id=? AND state='pendente'", [owner!]);
    return json({ prefs: next });
  });

  route("GET", "/api/orchestrator/calibration", { auth: true }, async (ctx, _r, _p, owner) => {
    const prefs = await prefsFor(ctx, owner!);
    const state = prefs.calibracao ? await calibrationFor(ctx, owner!) : ((await storedCalibration(ctx, owner!))?.state ?? null);
    const keys = state ? Object.keys(state.detalhes).sort() : [];
    return json({
      ativa: prefs.calibracao,
      ciclo: state?.ciclo ?? 0,
      fatores: state?.fatores ?? {},
      porque: state ? keys.map((k) => explainKey(state, k)) : [],
      regras: "Mínimo de 8 resultados por papel e ferramenta, taxa encolhida para o neutro, passo máximo de 0,05 por dia, fator entre 0,75 e 1,25. Nunca passa por cima de restrição dura nem da sua escolha manual.",
    });
  });

  route("POST", "/api/orchestrator/calibration/reset", { auth: true }, async (ctx, req, _p, owner) => {
    z.object({ confirmar: z.literal("zerar-calibracao") }).strict().parse(await read(req));
    await ctx.db.run("DELETE FROM od_orchestrator_calibration WHERE owner_id=?", [owner!]);
    return json({ zerada: true });
  });
}

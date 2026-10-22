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
import { detectPatterns, draftHash, newProposals, parseSignals, type SkillDraft, type UserSignal } from "@open-dot/core/orchestrator/skill-suggest.ts";
import { loadAgentPackage, type AgentFiles } from "@open-dot/core/orchestrator/agents.ts";
import type { Handler } from "../app.ts";
import { open } from "../crypto.ts";
import { json, problem } from "../http.ts";
import { agentPackages } from "./routes.ts";
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

const TEST_PATH = /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.[a-z]+$/i;

/**
 * Sinais ESTRUTURADOS do próprio dono: decisões de aprovação (e se a proposta tinha teste) e
 * receitas escolhidas. Nenhum texto de e-mail, página, README ou saída de ferramenta entra aqui;
 * da proposta só se lê o caminho dos arquivos para saber se havia teste.
 */
async function userSignals(ctx: Ctx, owner: string): Promise<UserSignal[]> {
  const signals: UserSignal[] = [];
  const decisions = await ctx.db.query<{ task_id: string; decision: string; proposal_enc: string }>(
    "SELECT a.task_id,a.decision,a.proposal_enc FROM od_runner_approvals a JOIN od_runner_tasks t ON t.id=a.task_id WHERE t.owner_id=? AND a.decision IN ('approve','reject') ORDER BY a.decided_at DESC LIMIT 200",
    [owner],
  );
  for (const d of decisions) {
    let paths: string[] = [];
    try {
      paths = ((JSON.parse(await open(ctx.keys, d.proposal_enc, `runner:proposal:${d.task_id}`)) as { files?: Array<{ path?: unknown }> }).files ?? []).map((f) => String(f.path ?? ""));
    } catch {
      continue;
    }
    signals.push({ tipo: "decisao", aprovou: d.decision === "approve", propostaTinhaTeste: paths.some((p) => TEST_PATH.test(p)) });
  }
  const pipes = await ctx.db.query<{ team_json: string; created_at: number }>("SELECT team_json,created_at FROM od_pipelines WHERE owner_id=? ORDER BY created_at LIMIT 500", [owner]);
  let lastChange = -Infinity;
  for (const p of pipes) {
    let t: { receita?: string | null; passos?: Array<{ papel: string }> } = {};
    try {
      t = JSON.parse(p.team_json);
    } catch {
      continue;
    }
    const writes = (t.passos ?? []).some((s) => s.papel === "implementador");
    if (t.receita) signals.push({ tipo: "receita", receita: t.receita, depoisDeMudanca: !writes && p.created_at - lastChange < DAY });
    if (writes) lastChange = p.created_at;
  }
  return parseSignals(signals);
}

export function draftAgentFiles(d: SkillDraft): AgentFiles {
  const evals = Object.keys(d.arquivos)
    .filter((k) => k.startsWith("evals/"))
    .sort()
    .map((k) => d.arquivos[k]!);
  return { agentMd: d.arquivos["AGENT.md"] ?? "", rubrica: d.arquivos["rubrica.md"] ?? "", schema: d.arquivos["schema.json"] ?? "", evals };
}

export function registerV03Routes(route: Registrar) {
  route("GET", "/api/orchestrator/prefs", { auth: true }, async (ctx, _r, _p, owner) => json({ prefs: await prefsFor(ctx, owner!), padrao: DEFAULT_PREFS }));

  route("PUT", "/api/orchestrator/prefs", { auth: true }, async (ctx, req, _p, owner) => {
    const body = PrefsSchema.partial().extend({ consentimento: z.literal("aprender-com-minhas-decisoes").optional() }).strict().parse(await read(req));
    const { consentimento, ...patch } = body;
    // Consentimento próprio para aprender com as decisões do dono (parte 3, item 3).
    if (patch.sugestaoDeSkill === true && !consentimento) return problem(409, "consentimento_necessario", "Para sugerir skills, o Dot usa só as suas decisões (aprovou, rejeitou, receita escolhida). Confirme o consentimento.");
    const next = PrefsSchema.parse({ ...(await prefsFor(ctx, owner!)), ...patch });
    await ctx.db.run(
      "INSERT INTO od_orchestrator_prefs(owner_id,prefs_json,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET prefs_json=excluded.prefs_json,updated_at=excluded.updated_at",
      [owner!, JSON.stringify(next), ctx.now()],
    );
    // Desligar a sugestão de skill apaga as propostas pendentes (parte 3, item 3).
    if (patch.sugestaoDeSkill === false) await ctx.db.run("DELETE FROM od_skill_proposals WHERE owner_id=? AND state='pendente'", [owner!]);
    return json({ prefs: next });
  });

  route("GET", "/api/orchestrator/skills", { auth: true }, async (ctx, _r, _p, owner) => {
    const prefs = await prefsFor(ctx, owner!);
    if (prefs.sugestaoDeSkill) {
      const existing = await ctx.db.query<{ pattern: string; state: string }>("SELECT pattern,state FROM od_skill_proposals WHERE owner_id=?", [owner!]);
      for (const d of newProposals(detectPatterns(await userSignals(ctx, owner!)), existing))
        await ctx.db.run("INSERT INTO od_skill_proposals(id,owner_id,pattern,evidence_json,draft_json,hash,state,created_at,updated_at) VALUES(?,?,?,?,?,?,'pendente',?,?)", [
          crypto.randomUUID(),
          owner!,
          d.padrao,
          JSON.stringify({ evidencia: d.evidencia, numeros: d.numeros }),
          JSON.stringify(d),
          await draftHash(d),
          ctx.now(),
          ctx.now(),
        ]);
    }
    const rows = await ctx.db.query<{ id: string; pattern: string; evidence_json: string; draft_json: string; hash: string; state: string }>(
      "SELECT id,pattern,evidence_json,draft_json,hash,state FROM od_skill_proposals WHERE owner_id=? AND state IN ('pendente','ativa') ORDER BY created_at",
      [owner!],
    );
    return json({
      ativa: prefs.sugestaoDeSkill,
      propostas: rows.map((r) => {
        const d = JSON.parse(r.draft_json) as SkillDraft;
        return { id: r.id, padrao: r.pattern, estado: r.state, ...JSON.parse(r.evidence_json), tipo: d.tipo, arquivos: d.arquivos, hash: r.hash, nivel: "experimental" };
      }),
    });
  });

  route("POST", "/api/orchestrator/skills/:id/approve", { auth: true }, async (ctx, req, p, owner) => {
    const { hash } = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await read(req));
    const row = (await ctx.db.query<{ draft_json: string; hash: string; state: string }>("SELECT draft_json,hash,state FROM od_skill_proposals WHERE id=? AND owner_id=?", [p.id!, owner!]))[0];
    if (!row || row.state !== "pendente") return problem(404, "not_found", "Proposta não encontrada ou já decidida.");
    const d = JSON.parse(row.draft_json) as SkillDraft;
    // O hash é recalculado do rascunho guardado: aprovar só vale para o conteúdo exato mostrado.
    if (hash !== row.hash || (await draftHash(d)) !== row.hash) return problem(409, "hash_mismatch", "O rascunho mudou desde que você viu. Revise de novo.");
    if (d.tipo === "agente") {
      const files = draftAgentFiles(d);
      const pkg = await loadAgentPackage(files);
      if ((await agentPackages()).some((a) => a.meta.id === pkg.meta.id)) return problem(409, "conflict", "Já existe um agente com esse id.");
      await ctx.db.run(
        "INSERT INTO od_agent_imports(owner_id,agent_id,hash,files_json,enabled,created_at,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(owner_id,agent_id) DO UPDATE SET hash=excluded.hash,files_json=excluded.files_json,enabled=1,updated_at=excluded.updated_at",
        [owner!, pkg.meta.id, pkg.hash, JSON.stringify(files), ctx.now(), ctx.now()],
      );
    }
    await ctx.db.run("UPDATE od_skill_proposals SET state='ativa',updated_at=? WHERE id=? AND owner_id=? AND state='pendente'", [ctx.now(), p.id!, owner!]);
    return json({ ativa: true, nivel: "experimental" });
  });

  route("POST", "/api/orchestrator/skills/:id/forget", { auth: true }, async (ctx, _r, p, owner) => {
    // "Esquecer isto": a proposta some e o mesmo padrão não volta a ser sugerido.
    const r = await ctx.db.run("UPDATE od_skill_proposals SET state='esquecida',draft_json='{}',evidence_json='{}',updated_at=? WHERE id=? AND owner_id=? AND state IN ('pendente','ativa')", [ctx.now(), p.id!, owner!]);
    return r.changes ? json({ esquecida: true }) : problem(404, "not_found", "Proposta não encontrada.");
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

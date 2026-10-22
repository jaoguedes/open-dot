// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Seletor e montador de equipe (partes E e F). Estágio 1 em código, sem IA: restrições duras,
 * pontuação neutra e explicável, revisor ≠ implementador quando possível. Determinístico.
 */
import type { Catalog, ToolEntry, ToolId } from "./catalog.ts";
import type { DetectionSnapshot, ToolSnapshot } from "./detection.ts";
import type { AgentMeta, Role } from "./agents.ts";
import { profileFromIdea, type ProjectProfile } from "./profile.ts";
import { isExhausted, slack, type QuotaState } from "./quota.ts";
import { calibrationFactor, type CalibrationState } from "./calibration.ts";

export interface Weights {
  pontuacaoInicial: number;
  pesoEvidenciaMedida: number;
  minimoDeAmostras: number;
  fatorOffline: number;
  folgaMinima: number;
  custoRelativo: Partial<Record<ToolId, number>>;
}

/** O que cada driver do Runner garante em código (não o que o fabricante promete). */
export const DRIVER_CAPABILITIES: Record<ToolId, ReadonlyArray<AgentMeta["capacidades_exigidas"][number]>> = {
  codex: ["somente_leitura", "json_com_esquema", "proposta_de_arquivos"],
  "claude-code": ["somente_leitura", "json_com_esquema", "proposta_de_arquivos"],
  gemini: [],
  cursor: [],
  ollama: [],
  opencode: [],
};

export interface Evidence {
  aprovadas: number;
  total: number;
}

export interface TeamInput {
  ideia: string;
  stack?: string[];
  catalog: Catalog;
  snapshot: DetectionSnapshot | null;
  online: boolean;
  agents: AgentMeta[];
  quotas: Partial<Record<ToolId, QuotaState>>;
  evidence?: Partial<Record<ToolId, Partial<Record<Role, Evidence>>>>;
  weights: Weights;
  optIn: { claudeCode: boolean };
  overrides?: Record<string, ToolId>;
  permitirPossivelmentePago?: ToolId[];
  /** Calibração adaptativa (G). Só é passada quando o dono a ligou; ausente = neutro. */
  calibration?: CalibrationState | null;
  /** Receita escolhida (v0.3): fixa a ordem de agentes no lugar da heurística do perfil. */
  recipe?: { id: string; agentes: string[] } | null;
  now: number;
}

export interface Candidate {
  tool: ToolId;
  pontuacao: number | null;
  excluida: string | null;
  fatores: string[];
}
export interface Step {
  agente: string;
  papel: Role;
  ferramenta: ToolId | null;
  motivo: string;
  candidatas: Candidate[];
}
export interface Team {
  perfil: ProjectProfile;
  receita: string | null;
  passos: Step[];
  modoUmaFerramenta: boolean;
  estimativa: Partial<Record<ToolId, number>>;
  avisos: string[];
  pronta: boolean;
}

function toolSnap(s: DetectionSnapshot | null, id: ToolId): ToolSnapshot | undefined {
  return s?.tools.find((t) => t.id === id);
}

/** Primeiro motivo que exclui a ferramenta para este agente; null = elegível. */
export function exclusion(entry: ToolEntry, snap: ToolSnapshot | undefined, agent: AgentMeta, input: TeamInput): string | null {
  if (entry.estado === "planejado" || entry.estado === "indisponivel") return `integração ${entry.estado === "planejado" ? "planejada" : "indisponível"} nesta versão`;
  if (!snap || !snap.installed) return "CLI não instalado neste computador";
  if (snap.loggedIn !== true) return "sem login confirmado pelo próprio CLI";
  if (snap.possiblyPaid && !input.permitirPossivelmentePago?.includes(entry.id)) return `login possivelmente pago (${snap.authMethod}); não usado por padrão`;
  if (entry.id === "claude-code" && !input.optIn.claudeCode) return "Claude Code é opt-in e está desligado";
  if (!snap.executable) return "driver indisponível neste Runner";
  const missing = agent.capacidades_exigidas.filter((c) => !DRIVER_CAPABILITIES[entry.id].includes(c));
  if (missing.length) return `o driver não garante: ${missing.join(", ")}`;
  if (agent.capacidades_exigidas.includes("json_com_esquema") && entry.modos.jsonComEsquema.valor !== true) return "saída JSON com esquema não verificada no catálogo";
  const q = input.quotas[entry.id];
  if (q && isExhausted(q, input.now)) return "cota esgotada até a renovação";
  return null;
}

function score(entry: ToolEntry, agent: AgentMeta, input: TeamInput, tipo?: ProjectProfile["tipos"][number]): { valor: number; fatores: string[] } {
  const w = input.weights;
  const fatores = [`base ${w.pontuacaoInicial}`];
  let v = w.pontuacaoInicial;
  const ev = input.evidence?.[entry.id]?.[agent.papel];
  if (w.pesoEvidenciaMedida > 0 && ev && ev.total >= w.minimoDeAmostras) {
    const f = 1 + w.pesoEvidenciaMedida * (ev.aprovadas / ev.total - 0.5);
    v *= f;
    fatores.push(`evidência medida ${ev.aprovadas}/${ev.total} (×${f.toFixed(2)})`);
  } else fatores.push("sem evidência medida suficiente (neutro)");
  if (!input.online) {
    v *= w.fatorOffline;
    fatores.push(`Runner offline (×${w.fatorOffline})`);
  }
  const q = input.quotas[entry.id];
  const s = q ? slack(q, input.now, w.folgaMinima) : 1;
  v *= s;
  fatores.push(q && q.limiteDia !== null ? `folga de cota ×${s.toFixed(2)} (${q.usadasHoje}/${q.limiteDia} hoje)` : "cota desconhecida (neutro)");
  if (input.calibration) {
    const c = calibrationFactor(input.calibration, agent.papel, entry.id, tipo);
    v *= c.fator;
    fatores.push(c.chave ? `calibração ×${c.fator} (${c.chave})` : "calibração ligada, sem ajuste para esta ferramenta (neutro)");
  }
  const custo = w.custoRelativo[entry.id] ?? 1;
  v /= custo;
  if (custo !== 1) fatores.push(`custo relativo ÷${custo}`);
  return { valor: Math.round(v * 1000) / 1000, fatores };
}

function pipelineFor(perfil: ProjectProfile, agents: AgentMeta[], recipe?: TeamInput["recipe"]): AgentMeta[] {
  const by = (id: string) => agents.find((a) => a.id === id);
  if (recipe) return recipe.agentes.map(by).filter((a): a is AgentMeta => Boolean(a));
  const ids = ["produto", ...(perfil.precisaPesquisa ? ["pesquisa"] : []), ...(perfil.precisaDesign ? ["design"] : []), "desenvolvedor", "qa"];
  return ids.map(by).filter((a): a is AgentMeta => Boolean(a));
}

function pick(agent: AgentMeta, input: TeamInput, avoid: ToolId | null, tipo?: ProjectProfile["tipos"][number]): Step {
  const candidatas: Candidate[] = input.catalog.ferramentas.map((entry) => {
    const ex = exclusion(entry, toolSnap(input.snapshot, entry.id), agent, input);
    if (ex) return { tool: entry.id, pontuacao: null, excluida: ex, fatores: [] };
    const s = score(entry, agent, input, tipo);
    return { tool: entry.id, pontuacao: s.valor, excluida: null, fatores: s.fatores };
  });
  const order = input.catalog.ferramentas.map((f) => f.id);
  const eligible = candidatas.filter((c) => c.pontuacao !== null).sort((a, b) => b.pontuacao! - a.pontuacao! || order.indexOf(a.tool) - order.indexOf(b.tool));
  const override = input.overrides?.[agent.id];
  if (override) {
    const chosen = eligible.find((c) => c.tool === override);
    if (chosen) return { agente: agent.id, papel: agent.papel, ferramenta: override, motivo: "escolha do usuário (passa nas restrições)", candidatas };
  }
  const preferred = avoid ? (eligible.find((c) => c.tool !== avoid) ?? eligible[0]) : eligible[0];
  if (!preferred) return { agente: agent.id, papel: agent.papel, ferramenta: null, motivo: "nenhuma ferramenta passa nas restrições", candidatas };
  const motivo =
    eligible.length === 1
      ? "única ferramenta que passa nas restrições"
      : avoid && preferred.tool !== avoid
        ? `maior pontuação entre as que não implementaram (${preferred.pontuacao})`
        : `maior pontuação (${preferred.pontuacao}); empate decidido pela ordem do catálogo`;
  return { agente: agent.id, papel: agent.papel, ferramenta: preferred.tool, motivo, candidatas };
}

export function assembleTeam(input: TeamInput): Team {
  const perfil = profileFromIdea(input.ideia, input.stack);
  const agents = pipelineFor(perfil, input.agents, input.recipe);
  const avisos: string[] = [];
  const implAgent = agents.find((a) => a.papel === "implementador");
  const tipo = perfil.tipos[0];
  const impl = implAgent ? pick(implAgent, input, null, tipo) : null;
  const passos = agents.map((a) => (a === implAgent ? impl! : pick(a, input, a.papel === "revisor" ? (impl?.ferramenta ?? null) : null, tipo)));
  for (const p of passos.filter((s) => s.papel === "revisor" && s.ferramenta && s.ferramenta === impl?.ferramenta)) {
    p.motivo = `${p.motivo}; mesma ferramenta do implementador: revisão em sessão limpa, sem o histórico`;
  }
  const used = new Set(passos.map((p) => p.ferramenta).filter(Boolean));
  const modoUmaFerramenta = used.size === 1;
  if (modoUmaFerramenta) avisos.push("Modo uma ferramenta: os papéis rodam em sessões limpas, mas a revisão não é independente. Instale e entre em outra ferramenta para revisão cruzada.");
  for (const id of Object.keys(input.overrides ?? {})) {
    const step = passos.find((p) => p.agente === id);
    if (step && step.ferramenta !== input.overrides![id]) {
      const why = step.candidatas.find((c) => c.tool === input.overrides![id])?.excluida ?? "ferramenta desconhecida";
      avisos.push(`Troca pedida para ${id} recusada: ${why}.`);
    }
  }
  if (perfil.risco === "alto") avisos.push("Risco alto: a ideia cita dado sensível ou escrita externa. Nada será enviado ou cobrado sem a sua aprovação do conteúdo exato.");
  const estimativa: Partial<Record<ToolId, number>> = {};
  for (const p of passos) if (p.ferramenta) estimativa[p.ferramenta] = (estimativa[p.ferramenta] ?? 0) + 1;
  const pronta = passos.every((p) => p.ferramenta !== null);
  if (!pronta) avisos.push("Equipe incompleta: veja em cada passo por que nenhuma ferramenta foi aceita.");
  return { perfil, receita: input.recipe?.id ?? null, passos, modoUmaFerramenta: modoUmaFerramenta && pronta, estimativa, avisos, pronta };
}

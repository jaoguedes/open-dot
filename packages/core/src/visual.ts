import type { AgentId } from "./types.ts";

/**
 * Resolvedor visual único do Dot (capítulos 22, 29 e 38 do PDF).
 * Separa: identidade do agente (cor habitual), estado semântico (pode substituir a cor),
 * expressão, movimento do corpo, acessório e efeitos cosméticos.
 * Recebe eventos possivelmente duplicados ou fora de ordem e nunca regride.
 */

export type SemanticState =
  | "idle"
  | "thinking"
  | "working"
  | "waiting" // aprovação pendente
  | "question" // perguntando (abaixo de waiting)
  | "success" // transitório
  | "error" // erro confirmado
  | "disconnected" // conexão indisponível
  | "sleep";

/** Ordem de prioridade (maior vence). Fonte: capítulo 38. */
export const SEMANTIC_PRIORITY: Record<SemanticState, number> = {
  error: 100,
  waiting: 90,
  question: 85,
  disconnected: 80,
  working: 70,
  thinking: 60,
  success: 50,
  idle: 10,
  sleep: 5,
};

/** Tokens de arte em sRGB (não são cores de texto). */
export const AGENT_COLORS: Record<AgentId, string> = {
  dot: "#F2EBDD",
  correio: "#64B5F6",
  codigo: "#AA96EF",
  sentinela: "#59CFC6",
  foco: "#8C9AE8",
  social: "#F2EBDD",
};

export const STATE_COLORS = {
  waiting: "#E9B75E",
  success: "#79C9A5",
  error: "#EB6470",
  disconnected: "#A4A5AE",
  affection: "#EBA1BF",
} as const;

export type Expression = "neutral" | "look_up" | "focused" | "attentive" | "happy" | "eyes_low" | "sleep" | "surprised";
export type BodyClip = "idle_breathe" | "think" | "work" | "wait_ok" | "success" | "error" | "sleep_idle";
export type Accessory = "none" | "mail_cap" | "glasses" | "headphones" | "antenna" | "visor" | "beret" | "beanie" | "bucket" | "crown";

export const DEFAULT_ACCESSORY: Record<AgentId, Accessory> = {
  dot: "none",
  correio: "mail_cap",
  codigo: "glasses",
  sentinela: "none", // aro é efeito temporário durante verificação, não peça presa
  foco: "headphones",
  social: "none",
};

export interface VisualEvent {
  eventId: string;
  agentId: AgentId;
  /** Execução que originou o evento; null para estado de conexão do agente. */
  jobId: string | null;
  /** Revisão monotônica por (agente, job). Eventos com revisão menor ou igual são descartados. */
  revision: number;
  happenedAt: number;
  state: SemanticState | "resolved";
  reason?: string;
}

interface JobSlot {
  state: SemanticState;
  revision: number;
  happenedAt: number;
  reason?: string;
}

export interface AgentVisual {
  agentId: AgentId;
  semantic: SemanticState;
  /** Job dominante (para o rótulo textual). */
  jobId: string | null;
  reason: string | null;
  /** Cor de acento aplicada no terço inferior (metade no erro). */
  tint: string;
  tintCoverage: "lower_third" | "half";
  expression: Expression;
  bodyClip: BodyClip;
  /** Pulso suave só ao pensar. */
  pulse: boolean;
  /** Efeitos cosméticos (corações) permitidos agora? */
  allowCosmetic: boolean;
  label: string;
}

const SUCCESS_VISIBLE_MS = 2500;

const LABELS: Record<SemanticState, string> = {
  idle: "Em repouso",
  thinking: "Pensando",
  working: "Trabalhando",
  waiting: "Esperando seu OK",
  question: "Perguntando",
  success: "Concluído",
  error: "Com erro",
  disconnected: "Sem conexão",
  sleep: "Dormindo",
};

const EXPRESSION: Record<SemanticState, Expression> = {
  idle: "neutral",
  thinking: "look_up",
  working: "focused",
  waiting: "attentive",
  question: "look_up",
  success: "happy",
  error: "eyes_low",
  disconnected: "neutral",
  sleep: "sleep",
};

const CLIP: Record<SemanticState, BodyClip> = {
  idle: "idle_breathe",
  thinking: "think",
  working: "work",
  waiting: "wait_ok",
  question: "think",
  success: "success",
  error: "error",
  disconnected: "idle_breathe",
  sleep: "sleep_idle",
};

export class VisualStateStore {
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];
  private readonly jobs = new Map<AgentId, Map<string, JobSlot>>();

  constructor(private readonly maxSeen = 500) {}

  /** Aplica um evento. Retorna false quando ignorado (duplicado ou antigo). */
  apply(event: VisualEvent): boolean {
    if (this.seen.has(event.eventId)) return false;
    this.remember(event.eventId);
    const key = event.jobId ?? "__connection__";
    let agentJobs = this.jobs.get(event.agentId);
    if (!agentJobs) {
      agentJobs = new Map();
      this.jobs.set(event.agentId, agentJobs);
    }
    const current = agentJobs.get(key);
    if (current && event.revision <= current.revision) return false;
    if (event.state === "resolved") {
      agentJobs.set(key, { state: "idle", revision: event.revision, happenedAt: event.happenedAt });
      return true;
    }
    agentJobs.set(key, {
      state: event.state,
      revision: event.revision,
      happenedAt: event.happenedAt,
      ...(event.reason ? { reason: event.reason } : {}),
    });
    return true;
  }

  /** Substitui tudo por um snapshot do servidor (após reconexão). */
  loadSnapshot(events: VisualEvent[]): void {
    this.jobs.clear();
    for (const e of [...events].sort((a, b) => a.revision - b.revision)) this.apply({ ...e, eventId: e.eventId + ":snap" });
  }

  resolve(agentId: AgentId, now: number): AgentVisual {
    const agentJobs = this.jobs.get(agentId);
    let best: { state: SemanticState; jobId: string | null; reason: string | null; happenedAt: number } = {
      state: "idle",
      jobId: null,
      reason: null,
      happenedAt: 0,
    };
    if (agentJobs) {
      for (const [jobKey, slot] of agentJobs) {
        let state = slot.state;
        if (state === "success" && now - slot.happenedAt > SUCCESS_VISIBLE_MS) state = "idle";
        const better =
          SEMANTIC_PRIORITY[state] > SEMANTIC_PRIORITY[best.state] ||
          (SEMANTIC_PRIORITY[state] === SEMANTIC_PRIORITY[best.state] && slot.happenedAt > best.happenedAt);
        if (better) {
          best = {
            state,
            jobId: jobKey === "__connection__" ? null : jobKey,
            reason: slot.reason ?? null,
            happenedAt: slot.happenedAt,
          };
        }
      }
    }
    return toVisual(agentId, best.state, best.jobId, best.reason);
  }

  /** Incidente prioritário para a ilha global, com identificação do agente. */
  dominant(agents: readonly AgentId[], now: number): AgentVisual {
    let best = this.resolve(agents[0] ?? "dot", now);
    for (const a of agents.slice(1)) {
      const v = this.resolve(a, now);
      if (SEMANTIC_PRIORITY[v.semantic] > SEMANTIC_PRIORITY[best.semantic]) best = v;
    }
    return best;
  }

  private remember(id: string): void {
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > this.maxSeen) {
      const old = this.seenOrder.shift();
      if (old) this.seen.delete(old);
    }
  }
}

export function toVisual(agentId: AgentId, semantic: SemanticState, jobId: string | null = null, reason: string | null = null): AgentVisual {
  let tint: string = AGENT_COLORS[agentId];
  if (semantic === "error") tint = STATE_COLORS.error; // troca direta, sem misturar com a cor do agente
  else if (semantic === "waiting") tint = STATE_COLORS.waiting;
  else if (semantic === "success") tint = STATE_COLORS.success;
  else if (semantic === "disconnected") tint = STATE_COLORS.disconnected;
  return {
    agentId,
    semantic,
    jobId,
    reason,
    tint,
    tintCoverage: semantic === "error" ? "half" : "lower_third",
    expression: EXPRESSION[semantic],
    bodyClip: CLIP[semantic],
    pulse: semantic === "thinking",
    allowCosmetic: SEMANTIC_PRIORITY[semantic] < SEMANTIC_PRIORITY.disconnected,
    label: LABELS[semantic],
  };
}

import { TERMINAL_RUN_STATES, type RunState } from "./types.ts";

/**
 * Máquina de estados de uma execução. Transições não listadas são proibidas.
 * Estados terminais nunca são sobrescritos por execução atrasada.
 */
const ALLOWED: Record<RunState, readonly RunState[]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "waiting_approval", "waiting_quota", "retry_scheduled", "uncertain", "cancelled"],
  waiting_approval: ["queued", "cancelled", "failed"],
  waiting_quota: ["queued", "cancelled", "failed"],
  retry_scheduled: ["queued", "cancelled", "failed"],
  // Incerto só sai por reconciliação explícita com o provedor.
  uncertain: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: RunState, to: RunState): boolean {
  return ALLOWED[from].includes(to);
}

export interface RunSnapshot {
  state: RunState;
  version: number;
}

export type TransitionResult =
  | { ok: true; next: RunSnapshot }
  | { ok: false; reason: "stale_version" | "terminal" | "forbidden" };

/**
 * Transição com controle otimista: só aplica se a versão esperada for a atual.
 * O banco repete a mesma regra com UPDATE ... WHERE version = ?.
 */
export function transition(current: RunSnapshot, to: RunState, expectedVersion: number): TransitionResult {
  if (current.version !== expectedVersion) return { ok: false, reason: "stale_version" };
  if (TERMINAL_RUN_STATES.has(current.state)) return { ok: false, reason: "terminal" };
  if (!canTransition(current.state, to)) return { ok: false, reason: "forbidden" };
  return { ok: true, next: { state: to, version: current.version + 1 } };
}

/** Estado que a interface deve mostrar para o mascote a partir do estado da execução. */
export function runToSemantic(state: RunState): "working" | "waiting" | "paused" | "error" | "success" | "idle" | "uncertain" {
  switch (state) {
    case "queued":
    case "running":
    case "retry_scheduled":
      return "working";
    case "waiting_approval":
      return "waiting";
    case "waiting_quota":
      return "paused";
    case "failed":
      return "error";
    case "uncertain":
      return "uncertain";
    case "succeeded":
      return "success";
    case "cancelled":
      return "idle";
  }
}

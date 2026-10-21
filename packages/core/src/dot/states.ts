// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
export type DotStateKey = "idle" | "thinking" | "working" | "waiting" | "error" | "disconnected" | "question" | "sleep";

export type EyePair = "open" | "focused" | "attentive" | "big" | "serious" | "half" | "happy" | "closed" | "squint" | "wink" | "angry" | "spiral";

export type IndKind = "balls" | "waves" | "bang" | "x" | "dot" | "heart" | "spiral" | "question" | "check" | null;

export interface StateCfg {
  name: string;
  glow: string;
  eyes: EyePair;
  look: "free" | [number, number];
  float: number;
  ind?: Exclude<IndKind, null>;
  jitter?: number;
  emit?: [string, number];
  enter?: "errorEnter";
  tint?: string;
  tintAmt?: number;
  grey?: number;
  tilt?: number;
  slow?: number;
  sy?: number;
}

export const STATES: Record<DotStateKey, StateCfg> = {
  idle: { name: "repouso", glow: "#3F7BFF", eyes: "open", look: "free", float: 1 },
  thinking: { name: "pensando", glow: "#9E83FF", eyes: "open", look: [0.17, 0.15], ind: "balls", float: 1 },
  working: { name: "trabalhando", glow: "#36A8FF", eyes: "focused", look: [0, -0.06], ind: "waves", jitter: 1, float: 0.6, emit: ["square", 0.5] },
  waiting: { name: "esperando seu OK", glow: "#E9B75E", eyes: "open", look: [0, 0.03], ind: "bang", float: 0.5 },
  error: { name: "erro", glow: "#FF4D6A", tint: "#FF5A70", tintAmt: 0.42, eyes: "angry", look: [0, -0.04], ind: "x", float: 0.3, enter: "errorEnter" },
  disconnected: { name: "desconectado", glow: "#7E8090", eyes: "half", look: [0, -0.08], grey: 1, float: 0.35 },
  question: { name: "perguntando", glow: "#2CC7FC", eyes: "open", look: [0.08, 0.05], ind: "question", float: 1, tilt: 3 },
  sleep: { name: "dormindo", glow: "#4D5BD8", eyes: "closed", look: [0, -0.04], float: 0.7, slow: 1, sy: 0.975, emit: ["z", 1.5] },
};

/** Carinho e tonto ficam bloqueados em erro, aprovação e pergunta. */
export const BLOCK_PLAY: ReadonlySet<DotStateKey> = new Set(["error", "waiting", "question"]);

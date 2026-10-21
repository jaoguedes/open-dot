// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import type { AgentVisual, SemanticState } from "@open-dot/core";

/** Contrato publicado por `blender/validate_glb.py` em `assets/dot/manifest.json`. */
export interface DotManifest {
  assetVersion: string;
  base: string;
  root: string;
  requiredNodes: string[];
  morphs: { Eyes: string[]; Body: string[] };
  clips: { body: string[]; face: string[] };
  states: Record<string, { body: string; face: string | null }>;
  props: Record<string, { file: string; anchor: string }>;
  fx: Record<string, { file: string }>;
  limits: { fps: number; maxHearts: number; maxDpr: number; gazeYawDeg: number; gazePitchDeg: number };
  validation: { structural: string; khronos: string; runtime: string };
}

export type FallbackReason = "no-webgl" | "context-lost" | "reduced-motion" | "manifest" | "load-failed" | "busy";

export const FALLBACK_TEXT: Record<FallbackReason, string> = {
  "no-webgl": "Prévia 2D: este navegador não oferece WebGL.",
  "context-lost": "Prévia 2D: o contexto gráfico foi perdido.",
  "reduced-motion": "Prévia 2D: movimento reduzido ativado.",
  manifest: "Prévia 2D: o modelo 3D ainda não foi publicado.",
  "load-failed": "Prévia 2D: o modelo 3D não carregou.",
  busy: "Prévia 2D: o modelo 3D já está aberto em outro lugar.",
};

/** Decide entre 3D e 2D. A ordem importa: o motivo mostrado é o primeiro que impede o 3D. */
export function chooseRenderer(input: {
  webgl: boolean;
  reducedMotion: boolean;
  contextLost: boolean;
  manifestOk: boolean | null;
  loadFailed: boolean;
  canvasFree: boolean;
}): { kind: "3d" } | { kind: "2d"; reason: FallbackReason } {
  if (input.reducedMotion) return { kind: "2d", reason: "reduced-motion" };
  if (!input.webgl) return { kind: "2d", reason: "no-webgl" };
  if (input.contextLost) return { kind: "2d", reason: "context-lost" };
  if (!input.canvasFree) return { kind: "2d", reason: "busy" };
  if (input.manifestOk === false) return { kind: "2d", reason: "manifest" };
  if (input.loadFailed) return { kind: "2d", reason: "load-failed" };
  return { kind: "3d" };
}

/** Confere o manifesto antes de baixar o GLB: um manifesto incompleto não deve quebrar a tela. */
export function validateManifest(m: unknown): m is DotManifest {
  if (!m || typeof m !== "object") return false;
  const x = m as Partial<DotManifest>;
  if (typeof x.base !== "string" || !/^[\w.-]+\.glb$/.test(x.base)) return false;
  if (!x.states || !x.clips || !x.limits || !x.morphs) return false;
  const clips = new Set([...(x.clips.body ?? []), ...(x.clips.face ?? [])]);
  for (const s of Object.values(x.states)) {
    if (!clips.has(s.body)) return false;
    if (s.face && !clips.has(s.face)) return false;
  }
  for (const p of [...Object.values(x.props ?? {}), ...Object.values(x.fx ?? {})]) if (!/^[\w.-]+\.glb$/.test(p.file)) return false;
  return true;
}

/** Estado semântico do resolvedor → chave do STATE_MAP do manifesto. */
const SEMANTIC_TO_MANIFEST: Record<SemanticState, string> = {
  idle: "idle",
  thinking: "thinking",
  working: "working",
  waiting: "waiting",
  question: "thinking",
  success: "success",
  error: "error",
  disconnected: "idle",
  sleep: "sleep",
};

export interface ClipPlan {
  body: string;
  face: string | null;
  /** Clipes de estado contínuo repetem; os de reação tocam uma vez e seguram o último quadro. */
  loopBody: boolean;
}

const ONE_SHOT_BODY = new Set(["body_success", "body_error", "body_touch_squash", "body_surprised", "body_absorb_receive", "body_wake", "body_sleep_enter"]);

export function clipsFor(visual: Pick<AgentVisual, "semantic">, manifest: Pick<DotManifest, "states">, override?: "touch" | "absorb" | "affection"): ClipPlan {
  const key = override ?? SEMANTIC_TO_MANIFEST[visual.semantic];
  const s = manifest.states[key] ?? manifest.states.idle;
  if (!s) throw new Error("manifesto sem estado idle");
  return { body: s.body, face: s.face, loopBody: !ONE_SHOT_BODY.has(s.body) };
}

/** Duração do crossfade entre clipes: sempre entre 150 e 250 ms. */
export function blendMs(requested = 200): number {
  return Math.min(250, Math.max(150, requested));
}

/** Olhar limitado aos ângulos do manifesto (graus). */
export function clampGaze(yawDeg: number, pitchDeg: number, limits: Pick<DotManifest["limits"], "gazeYawDeg" | "gazePitchDeg">): { yaw: number; pitch: number } {
  const c = (v: number, m: number) => (Number.isFinite(v) ? Math.max(-m, Math.min(m, v)) : 0);
  return { yaw: c(yawDeg, limits.gazeYawDeg), pitch: c(pitchDeg, limits.gazePitchDeg) };
}

/** Converte a posição do ponteiro (relativa ao centro do Dot, em px) em ângulos de olhar. */
export function gazeFromPointer(dx: number, dy: number, radiusPx: number, limits: Pick<DotManifest["limits"], "gazeYawDeg" | "gazePitchDeg">) {
  const r = Math.max(1, radiusPx);
  return clampGaze((dx / r) * limits.gazeYawDeg, (-dy / r) * limits.gazePitchDeg, limits);
}

/**
 * Governador de quadros: no máximo `fps` por segundo, e nenhum quadro em repouso.
 * "Ativo" = há crossfade, clipe não repetitivo tocando, corações vivos, olhar se movendo
 * ou um pedido explícito (`invalidate`). Fora disso, o loop para e só volta com um pedido.
 */
export class FrameGovernor {
  private last = -Infinity;
  private activeUntil = -Infinity;
  private dirty = true;
  private paused = false;
  rendered = 0;
  skipped = 0;

  constructor(private readonly fps = 30) {}

  get minIntervalMs(): number {
    return 1000 / Math.max(1, Math.min(60, this.fps));
  }

  /** Mantém o loop vivo por `ms` (crossfade, clipe de reação, piscada). */
  keepAlive(now: number, ms: number): void {
    this.activeUntil = Math.max(this.activeUntil, now + ms);
  }

  invalidate(): void {
    this.dirty = true;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.dirty = true;
  }

  /** Precisa continuar pedindo requestAnimationFrame? */
  wantsLoop(now: number, extraActive = false): boolean {
    if (this.paused) return false;
    return this.dirty || extraActive || now < this.activeUntil;
  }

  /** Chamado a cada rAF: decide se desenha este quadro (limite de fps). */
  shouldRender(now: number, extraActive = false): boolean {
    if (!this.wantsLoop(now, extraActive)) return false;
    // Tolerância de 1 ms para não perder quadros por jitter do rAF de 60 Hz.
    if (now - this.last < this.minIntervalMs - 1) {
      this.skipped++;
      return false;
    }
    this.last = now;
    this.dirty = false;
    this.rendered++;
    return true;
  }
}

/** Intervalo até a próxima piscada (repouso): 3 a 6 s, determinístico com `random` injetável. */
export function nextBlinkMs(random: () => number = Math.random): number {
  return 3000 + Math.floor(random() * 3000);
}

/** Cobertura do tom do agente/estado em fração da altura (0 = base). */
export function tintCoverage(visual: Pick<AgentVisual, "tintCoverage" | "agentId" | "semantic">): { height: number; amount: number } {
  if (visual.agentId === "dot" && visual.semantic === "idle") return { height: 0, amount: 0 };
  return { height: visual.tintCoverage === "half" ? 0.5 : 0.34, amount: visual.semantic === "error" ? 0.62 : 0.5 };
}

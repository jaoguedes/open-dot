/**
 * Efeitos transitórios (corações, partículas) com ciclo de vida independente.
 * Capítulo 24: cada instância tem id, seed, início, duração e trajetória próprios.
 * Cancelar uma instância não afeta as outras nem o corpo do Dot.
 */

export interface EffectInstance {
  id: string;
  kind: "heart" | "spark";
  seed: number;
  startAt: number;
  durationMs: number;
  /** Deslocamento lateral final, em fração da largura do Dot (-1..1). */
  driftX: number;
  /** Subida final, em fração da altura do Dot. */
  rise: number;
  rotationDeg: number;
  /** true quando renderizado parado (movimento reduzido). */
  static: boolean;
}

export interface EffectFrame {
  id: string;
  kind: EffectInstance["kind"];
  /** 0..1 */
  progress: number;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  rotationDeg: number;
}

export interface HeartEmitterOptions {
  maxAlive?: number;
  cooldownMs?: number;
  perGesture?: number;
  delaysMs?: readonly number[];
  minLifeMs?: number;
  maxLifeMs?: number;
  random?: () => number;
}

export type EmitResult =
  | { ok: true; created: EffectInstance[] }
  | { ok: false; reason: "cooldown" | "suppressed" | "hidden" };

export class HeartEmitter {
  private alive = new Map<string, EffectInstance>();
  private lastGestureAt = -Infinity;
  private counter = 0;
  private hidden = false;
  private readonly o: Required<HeartEmitterOptions>;

  constructor(opts: HeartEmitterOptions = {}) {
    this.o = {
      maxAlive: opts.maxAlive ?? 6,
      cooldownMs: opts.cooldownMs ?? 2500,
      perGesture: opts.perGesture ?? 3,
      delaysMs: opts.delaysMs ?? [0, 120, 240],
      minLifeMs: opts.minLifeMs ?? 900,
      maxLifeMs: opts.maxLifeMs ?? 1300,
      random: opts.random ?? Math.random,
    };
  }

  /**
   * Gesto de carinho. Durante o cooldown, repetições são descartadas (sem fila).
   * `allowCosmetic` vem do resolvedor visual: erro/aprovação suprimem o efeito.
   */
  emit(now: number, ctx: { allowCosmetic: boolean; reducedMotion: boolean }): EmitResult {
    if (this.hidden) return { ok: false, reason: "hidden" };
    if (!ctx.allowCosmetic) return { ok: false, reason: "suppressed" };
    if (now - this.lastGestureAt < this.o.cooldownMs) return { ok: false, reason: "cooldown" };
    this.lastGestureAt = now;
    this.prune(now);

    const count = ctx.reducedMotion ? 1 : this.o.perGesture;
    const created: EffectInstance[] = [];
    for (let i = 0; i < count; i++) {
      if (this.alive.size >= this.o.maxAlive) break;
      const r = this.o.random;
      const inst: EffectInstance = {
        id: `heart-${++this.counter}`,
        kind: "heart",
        seed: Math.floor(r() * 1e9),
        startAt: now + (ctx.reducedMotion ? 0 : this.o.delaysMs[i] ?? i * 120),
        durationMs: Math.round(this.o.minLifeMs + r() * (this.o.maxLifeMs - this.o.minLifeMs)),
        driftX: (r() - 0.5) * 0.3,
        rise: ctx.reducedMotion ? 0 : 0.18 + r() * 0.12,
        rotationDeg: (r() - 0.5) * 24,
        static: ctx.reducedMotion,
      };
      this.alive.set(inst.id, inst);
      created.push(inst);
    }
    return { ok: true, created };
  }

  /** Cancela uma instância; as demais continuam no próprio relógio. */
  cancel(id: string): boolean {
    return this.alive.delete(id);
  }

  /** Janela oculta: encerra tudo e não reproduz histórico ao voltar. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) this.alive.clear();
  }

  aliveCount(now: number): number {
    this.prune(now);
    return this.alive.size;
  }

  frames(now: number): EffectFrame[] {
    this.prune(now);
    const out: EffectFrame[] = [];
    for (const inst of this.alive.values()) {
      if (now < inst.startAt) continue;
      const p = Math.min(1, (now - inst.startAt) / inst.durationMs);
      const ease = 1 - (1 - p) ** 2;
      const scaleIn = Math.min(1, 0.6 + p * 4 * 0.4);
      const fadeOut = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      out.push({
        id: inst.id,
        kind: inst.kind,
        progress: p,
        x: inst.driftX * ease,
        y: -inst.rise * ease,
        scale: inst.static ? 1 : scaleIn,
        alpha: inst.static ? (p < 0.85 ? 1 : (1 - p) / 0.15) : fadeOut,
        rotationDeg: inst.rotationDeg * ease,
      });
    }
    return out;
  }

  private prune(now: number): void {
    for (const [id, inst] of this.alive) {
      if (now >= inst.startAt + inst.durationMs) this.alive.delete(id);
    }
  }
}

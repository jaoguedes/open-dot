// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
/**
 * Um único requestAnimationFrame para todas as instâncias do Dot.
 * Pausa com a aba oculta. Fora da tela o inscrito se marca invisível.
 * Avatares pequenos só recebem dt quando `active` (estado/reação mudou).
 * v0.3 (G2): teto de quadros por segundo configurável (perfil de desempenho) e pausa explícita
 * (janela nativa oculta, que nem sempre dispara `visibilitychange`). Padrão: sem teto, sem pausa.
 */

export type TickFn = (dt: number, now: number) => void;

interface Sub {
  fn: TickFn;
  visible: boolean;
  small: boolean;
  active: boolean;
  last: number;
}

const subs = new Set<Sub>();
let raf = 0;
let timer: ReturnType<typeof setTimeout> | 0 = 0;
let hidden = false;
let paused = false;
let maxFps = 0;
let lastRun = 0;

function loop(now: number): void {
  raf = 0;
  if (paused || (typeof document !== "undefined" && document.hidden)) {
    hidden = true;
    for (const s of subs) s.last = now;
    return;
  }
  hidden = false;
  let need = false;
  for (const s of subs) {
    if (!s.visible) {
      s.last = now;
      continue;
    }
    if (s.small && !s.active) {
      s.last = now;
      continue;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    s.fn(dt, now);
    need = true;
  }
  lastRun = now;
  if (need) schedule();
}

function schedule(): void {
  if (raf || timer) return;
  const gap = maxFps > 0 ? 1000 / maxFps - (performance.now() - lastRun) : 0;
  if (gap > 4) {
    timer = setTimeout(() => {
      timer = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    }, gap);
  } else raf = requestAnimationFrame(loop);
}

function ensure(): void {
  if (!paused && subs.size) schedule();
}

/** Teto de quadros por segundo para todas as instâncias (0 = sem teto, a taxa da tela). */
export function setMaxFps(fps: number): void {
  maxFps = Number.isFinite(fps) && fps > 0 ? Math.min(120, fps) : 0;
}

/** Pausa tudo (janela nativa oculta ou minimizada). Retomar recomeça o relógio sem salto. */
export function setPaused(p: boolean): void {
  paused = p;
  const now = performance.now();
  for (const s of subs) s.last = now;
  if (p) {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    raf = 0;
    timer = 0;
  } else ensure();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const now = performance.now();
    for (const s of subs) s.last = now;
    if (document.hidden) {
      hidden = true;
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      raf = 0;
      timer = 0;
      return;
    }
    hidden = false;
    ensure();
  });
}

export interface TickerHandle {
  setVisible(v: boolean): void;
  setActive(v: boolean): void;
  stop(): void;
  framesWhileHidden(): boolean;
}

export function subscribe(fn: TickFn, opts: { small?: boolean } = {}): TickerHandle {
  const sub: Sub = { fn, visible: true, small: !!opts.small, active: !opts.small, last: 0 };
  subs.add(sub);
  ensure();
  return {
    setVisible(v) {
      sub.visible = v;
      if (v) {
        sub.last = performance.now();
        ensure();
      }
    },
    setActive(v) {
      sub.active = v;
      if (v) ensure();
    },
    stop() {
      subs.delete(sub);
      if (!subs.size) {
        if (raf) cancelAnimationFrame(raf);
        if (timer) clearTimeout(timer);
        raf = 0;
        timer = 0;
      }
    },
    framesWhileHidden: () => hidden,
  };
}

export function tickerBusy(): boolean {
  return raf !== 0 || timer !== 0;
}

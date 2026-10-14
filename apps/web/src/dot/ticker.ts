/**
 * Um único requestAnimationFrame para todas as instâncias do Dot.
 * Pausa com a aba oculta. Fora da tela o inscrito se marca invisível.
 * Avatares pequenos só recebem dt quando `active` (estado/reação mudou).
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
let hidden = false;

function loop(now: number): void {
  raf = 0;
  if (typeof document !== "undefined" && document.hidden) {
    hidden = true;
    for (const s of subs) s.last = now;
    return;
  }
  hidden = false;
  let need = false;
  for (const s of subs) {
    if (!s.visible) { s.last = now; continue; }
    if (s.small && !s.active) { s.last = now; continue; }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    s.fn(dt, now);
    need = true;
  }
  if (need) raf = requestAnimationFrame(loop);
}

function ensure(): void {
  if (!raf && subs.size) raf = requestAnimationFrame(loop);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const now = performance.now();
    for (const s of subs) s.last = now;
    if (document.hidden) {
      hidden = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
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
    setVisible(v) { sub.visible = v; if (v) { sub.last = performance.now(); ensure(); } },
    setActive(v) { sub.active = v; if (v) ensure(); },
    stop() {
      subs.delete(sub);
      if (!subs.size && raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    framesWhileHidden: () => hidden,
  };
}

export function tickerBusy(): boolean {
  return raf !== 0;
}

/** Molas subamortecidas e suavização independentes da taxa de quadros. */

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeIO(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Mola subamortecida: devolve [posição, velocidade]. */
export function spring(x: number, v: number, alvo: number, k: number, c: number, h: number): [number, number] {
  v += (k * (alvo - x) - c * v) * h;
  return [x + v * h, v];
}

/** Fração restante cai para `rest` em 1 s. Cores usam 0,003. */
export function smooth(rest: number, dt: number): number {
  return 1 - Math.pow(rest, dt);
}

export function hexRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** RNG com semente (Mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Geometria do Dot (fonte: docs/referencias/dot_motor.html). Sem DOM. */

export const CX = 130;
export const CY = 113;
export const RX = 83;
export const RY = 64;
export const SPH = 80;
export const BASE = 177;
export const VIEW_W = 260;
export const VIEW_H = 220;
export const BODY_SAMPLES = 96;
/** n = 2,7 no normal; 4,5 na absorção (m = 1). */
export const N_REST = 2.7;
export const N_ABSORB = 4.5;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function superN(m: number): number {
  return N_REST + Math.max(0, Math.min(1, m)) * (N_ABSORB - N_REST);
}

export function bodyPoints(m: number): Array<[number, number]> {
  const n = superN(m);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < BODY_SAMPLES; i++) {
    const th = (i / BODY_SAMPLES) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const x = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n);
    const y = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / n);
    pts.push([CX + RX * x, CY + RY * y]);
  }
  return pts;
}

export function bodyPath(m: number): string {
  const pts = bodyPoints(m);
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    d += (i ? "L" : "M") + round2(p[0]) + " " + round2(p[1]);
  }
  return d + "Z";
}

export interface Proj {
  x: number;
  y: number;
  z: number;
}

/** Projeção da esfera do rosto com a câmera levemente acima (vê o topo). */
export function proj(a: number, p: number, R = SPH): Proj {
  const t = 0.2;
  const X = R * Math.cos(p) * Math.sin(a);
  const Y = R * Math.sin(p);
  const Z = R * Math.cos(p) * Math.cos(a);
  return { x: CX + X, y: CY - (Y * Math.cos(t) - Z * Math.sin(t) + R * Math.sin(t)) * 0.9, z: Z * Math.cos(t) + Y * Math.sin(t) };
}

export interface SpherePt {
  x: number;
  y: number;
  fx: number;
  vis: number;
}

/** Ponto na esfera do rosto (olhos/blush), com escorço. */
export function onSphere(a: number, p: number): SpherePt {
  const cy = Math.cos(a);
  return {
    x: CX + SPH * Math.sin(a) * Math.cos(p),
    y: CY - SPH * Math.sin(p) * 0.9,
    fx: Math.max(0, cy),
    vis: clamp01((cy - 0.05) / 0.2),
  };
}

/** Ponto da silhueta (superelipse) deslocado para fora pela normal. */
export function bodyPt(th: number, m: number, off = 0): [number, number] {
  const n = superN(m);
  const at = (t: number): [number, number] => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [CX + RX * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n), CY + RY * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / n)];
  };
  const p = at(th);
  const a = at(th - 0.01);
  const b = at(th + 0.01);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [p[0] + (dy / l) * off, p[1] - (dx / l) * off];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

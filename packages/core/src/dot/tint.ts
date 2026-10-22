// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
/**
 * Cor interna do agente (v0.3, D-027). Parâmetro opcional: sem `tint`, a paleta é exatamente a do
 * corpo original (mesmas strings, mesmo caso). Só o degradê do corpo, o contorno interno e o brilho
 * mudam; olhos, bochechas, geometria e animações não.
 */
export interface DotTint {
  color: string;
  /** 0–100. Padrão do produto: 100. */
  intensity: number;
}

export interface BodyPalette {
  stops: [string, string, string, string, string];
  edge: [string, string, string];
  glow: string;
}

/** Valores originais, no caso exato em que o desenho sempre os escreveu. */
export const BASE_PALETTE: BodyPalette = {
  stops: ["#FFFFFF", "#FBF8FF", "#EDE8FC", "#D8D8FA", "#BCC6F8"],
  edge: ["#8D8BDA", "#8D8BDA", "#8382D4"],
  glow: "#3F7BFF",
};

const STOP_WEIGHT = [0.1, 0.3, 0.66, 0.9, 1] as const;
const EDGE_WEIGHT = 0.85;

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error("Cor do agente inválida: use #RRGGBB.");
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(c: [number, number, number]): string {
  return "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Interpolação linear em RGB: mix(a, c, t). */
export function mix(a: string, c: string, t: number): string {
  const x = rgb(a),
    y = rgb(c);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function bodyPalette(tint?: DotTint | null): BodyPalette {
  if (!tint) return BASE_PALETTE;
  const k = Math.min(100, Math.max(0, Number.isFinite(tint.intensity) ? tint.intensity : 0)) / 100;
  const c = hex(rgb(tint.color));
  const stops = BASE_PALETTE.stops.map((s, i) => mix(s, c, STOP_WEIGHT[i]! * k)) as BodyPalette["stops"];
  const e = mix(BASE_PALETTE.edge[0], c, EDGE_WEIGHT * k);
  return { stops, edge: [e, e, e], glow: c };
}

import { bodyPt, round2, type DotFrame } from "@open-dot/core";

/** Conquista: a coroa só liga quando existir a regra. */
export const CROWN_UNLOCKED = false;

function poly(pts: Array<[number, number] | { x: number; y: number }>, close = false): string {
  const xy = (p: [number, number] | { x: number; y: number }): [number, number] => ("x" in p ? [p.x, p.y] : p);
  return "M" + pts.map((p) => { const q = xy(p); return round2(q[0]) + " " + round2(q[1]); }).join(" L") + (close ? " Z" : "");
}

function shift(pts: Array<[number, number]>, dx: number, dy: number): Array<[number, number]> {
  return pts.map((p) => [p[0] + dx, p[1] + dy]);
}

/** Contorno da superelipse empurrado pela normal (livro: HAT.off). */
export function hatOff(t: number, d: number, m: number): [number, number] {
  return bodyPt(t, m, d);
}

export interface HatCrown {
  pts: Array<[number, number]>;
  L: [number, number];
  R: [number, number];
  top: [number, number];
  d: string;
  edge: (dy: number) => string;
  yAt: (x: number) => number;
}

/** Copa cortada na altura sideY, com a borda da frente caindo bow px. */
export function hatCrown(m: number, d0: number, dTop: number, sideY: number, bow: number): HatCrown {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 120; i++) {
    const t = Math.PI + (i / 120) * Math.PI;
    const lift = Math.max(0, -Math.sin(t));
    const d = d0 + dTop * lift * lift;
    const p = hatOff(t, d, m);
    if (p[1] <= sideY) pts.push(p);
  }
  const L = pts[0] ?? [47, sideY];
  const R = pts[pts.length - 1] ?? [213, sideY];
  const top = pts.reduce((mn, p) => (p[1] < mn[1] ? p : mn), pts[0] ?? [130, 49]);
  const cy = sideY + bow * 2;
  const d = poly(pts) + ` Q130 ${round2(cy)} ${round2(L[0])} ${round2(L[1])}Z`;
  const yAt = (x: number) => {
    const span = R[0] - L[0] || 1;
    const u = (x - L[0]) / span;
    const v = 1 - u;
    return v * v * L[1] + 2 * u * v * cy + u * u * R[1];
  };
  const edge = (dy: number) =>
    `M${round2(L[0])} ${round2(L[1] + dy)} Q130 ${round2(cy + dy)} ${round2(R[0])} ${round2(R[1] + dy)}`;
  return { pts, L, R, top, d, edge, yAt };
}

export function hatMeridians(c: HatCrown, n: number, spread: number): string {
  let o = "";
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const x = c.L[0] + (c.R[0] - c.L[0]) * u;
    const y = c.yAt(x);
    const ax = c.top[0] + (x - 130) * spread;
    const ay = c.top[1] + 2;
    const cx = x + (ax - x) * 0.12;
    const cy = ay + (y - ay) * 0.32;
    o += `M${round2(x)} ${round2(y)} Q${round2(cx)} ${round2(cy)} ${round2(ax)} ${round2(ay)} `;
  }
  return o;
}

function faceShadow(c: HatCrown, depth: number): string {
  return `${c.edge(2)} L${round2(c.R[0])} ${round2(c.R[1] + depth)} Q130 ${round2(c.yAt(130) * 2 - c.L[1] + depth)} ${round2(c.L[0])} ${round2(c.L[1] + depth)}Z`;
}

export interface AccLayout {
  cap: {
    on: number;
    crown: string;
    seams: string;
    visor: string;
    visorUnder: string;
    visorHi: string;
    band: string;
    bandShadow: string;
    visorShadow: string;
    faceShadow: string;
    apexX: number;
    apexY: number;
  };
  glasses: {
    on: number;
    l0x: number; l0y: number; l0fx: number;
    l1x: number; l1y: number; l1fx: number;
    bridge: string;
    temples: string;
  };
  phones: {
    on: number;
    bandIn: string;
    bandMid: string;
    bandTop: string;
    bandShadow: string;
    cups: Array<{
      cx: number; cy: number; side: number;
      endX: number; endY: number;
      hinge: string;
    }>;
  };
  ring: {
    on: number;
    back: string;
    front: string;
    dash: number;
  };
  beanie: {
    on: number;
    crown: string;
    ribs: string;
    faceShadow: string;
    band: string;
    bandBot: string;
    bandRibs: string;
    bandHi: string;
    ears: Array<{ d: string; inner: string; stitch: string }>;
  };
  bucket: {
    on: number;
    crown: string;
    ribs: string;
    brimBack: string;
    brim: string;
    brimStitch: string;
    front: string;
    frontClip: string;
    radial: string;
    faceShadow: string;
    rim: string;
  };
  visor: {
    on: number;
    band: string;
    visor: string;
    visorUnder: string;
    hi: string;
    faceShadow: string;
  };
  beret: {
    on: number;
    dome: string;
    rim: string;
    stem: string;
    faceShadow: string;
  };
  antenna: {
    on: number;
    baseX: number;
    baseY: number;
    stem: string;
    bulbX: number;
    bulbY: number;
  };
  gold: {
    on: number;
    group: string;
    back: string;
    front: string;
    band: string;
    bandHi: string;
    gems: Array<{ cx: number; cy: number; rx: number; ry: number; fill: string }>;
    tips: Array<{ cx: number; cy: number }>;
  };
}

const emptyCap = { on: 0, crown: "", seams: "", visor: "", visorUnder: "", visorHi: "", band: "", bandShadow: "", visorShadow: "", faceShadow: "", apexX: 130, apexY: 40 };
const emptyG = { on: 0, l0x: 111, l0y: 129, l0fx: 1, l1x: 149, l1y: 129, l1fx: 1, bridge: "", temples: "" };
const emptyP = { on: 0, bandIn: "", bandMid: "", bandTop: "", bandShadow: "", cups: [] as AccLayout["phones"]["cups"] };
const emptyR = { on: 0, back: "", front: "", dash: 0 };
const emptyBn = { on: 0, crown: "", ribs: "", faceShadow: "", band: "", bandBot: "", bandRibs: "", bandHi: "", ears: [] as AccLayout["beanie"]["ears"] };
const emptyBk = { on: 0, crown: "", ribs: "", brimBack: "", brim: "", brimStitch: "", front: "", frontClip: "", radial: "", faceShadow: "", rim: "" };
const emptyVs = { on: 0, band: "", visor: "", visorUnder: "", hi: "", faceShadow: "" };
const emptyBr = { on: 0, dome: "", rim: "", stem: "", faceShadow: "" };
const emptyAn = { on: 0, baseX: 130, baseY: 50, stem: "", bulbX: 144, bulbY: 10 };
const emptyGold = { on: 0, group: "", back: "", front: "", band: "", bandHi: "", gems: [] as AccLayout["gold"]["gems"], tips: [] as AccLayout["gold"]["tips"] };

function layoutCap(m: number): AccLayout["cap"] {
  const c = hatCrown(m, 3, 10, 88, 5);
  const seams = [-0.62, -0.28, 0, 0.28, 0.62]
    .map((s) => {
      const x = 130 + s * (c.R[0] - 130) * 1.05;
      const y = c.yAt(x);
      return `M${round2(x)} ${round2(y)} Q${round2(x + (c.top[0] - x) * 0.15)} ${round2(c.top[1] + (y - c.top[1]) * 0.3)} ${round2(c.top[0])} ${round2(c.top[1] + 3)}`;
    })
    .join(" ");
  const x0 = 118, x1 = 210;
  const pts: Array<[number, number]> = [], low: Array<[number, number]> = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, x = x0 + (x1 - x0) * t;
    pts.push([x, c.yAt(Math.max(c.L[0], Math.min(c.R[0], x))) - 1]);
    low.push([x + 26 * t, c.yAt(Math.max(c.L[0], Math.min(c.R[0], x))) + 3 + 11 * Math.sin(Math.PI * Math.pow(t, 0.8)) - 8 * t]);
  }
  const visor = poly(pts) + " " + poly([...low].reverse()).replace("M", "L") + "Z";
  return {
    on: 1, crown: c.d, seams, visor, visorUnder: visor, visorHi: poly(pts),
    band: c.edge(-5), bandShadow: poly(low), visorShadow: poly(shift(low, 0, 6)),
    faceShadow: faceShadow(c, 10), apexX: c.top[0], apexY: c.top[1] + 3,
  };
}

function layoutBeanie(m: number): AccLayout["beanie"] {
  const c = hatCrown(m, 5, 13, 92, 5);
  const ears = ([-1, 1] as const).map((s) => {
    const x = s < 0 ? 82 : 178;
    const tip: [number, number] = [x + s * 6, 14];
    const d = `M${x - 22} 56 C${x - 20} 38 ${tip[0] - 8} ${tip[1] + 4} ${tip[0]} ${tip[1]} C${tip[0] + 8} ${tip[1] + 4} ${x + 20} 38 ${x + 22} 56Z`;
    const inner = `M${x - 11} 52 C${x - 9} 40 ${tip[0] - 4} ${tip[1] + 14} ${tip[0]} ${tip[1] + 12} C${tip[0] + 4} ${tip[1] + 14} ${x + 9} 40 ${x + 11} 52Z`;
    const stitch = `M${x - 16} 50 Q${x} 46 ${x + 16} 50`;
    return { d, inner, stitch };
  });
  const Lx = c.L[0] - 6, Rx = c.R[0] + 6, H = 20;
  const top: Array<[number, number]> = [], bot: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i++) {
    const x = Lx + (Rx - Lx) * i / 40;
    const y = c.yAt(Math.max(c.L[0], Math.min(c.R[0], x))) - 13 + Math.pow(Math.abs(i / 20 - 1), 3) * 3;
    top.push([x, y]);
    bot.push([x, y + H]);
  }
  const lastT = top[40]!, lastB = bot[40]!, firstT = top[0]!, firstB = bot[0]!;
  const band =
    poly(top) +
    ` Q${round2(Rx + 6)} ${round2(lastT[1] + H / 2)} ${round2(lastB[0])} ${round2(lastB[1])} ` +
    poly([...bot].reverse()).replace("M", "L") +
    ` Q${round2(Lx - 6)} ${round2(firstT[1] + H / 2)} ${round2(firstT[0])} ${round2(firstT[1])}Z`;
  let ribs = "";
  for (let r = 0; r <= 40; r++) {
    const p = top[r]!, q = bot[r]!;
    ribs += `M${round2(p[0])} ${round2(p[1] + 1)} L${round2(q[0])} ${round2(q[1] - 1)} `;
  }
  return {
    on: 1, crown: c.d, ribs: hatMeridians(c, 26, 0.25), faceShadow: faceShadow(c, 16),
    band, bandBot: poly(bot), bandRibs: ribs, bandHi: poly(top), ears,
  };
}

function layoutBucket(m: number): AccLayout["bucket"] {
  const c = hatCrown(m, 4, 18, 77, 4);
  const cx = 130, by = 80, brx = 116, bry = 20;
  let radial = "";
  for (let a = 0; a <= 36; a++) {
    const th = Math.PI * a / 36;
    radial += `M${round2(cx + Math.cos(th) * (brx - 30))} ${round2(by + Math.sin(th) * (bry - 6))} L${round2(cx + Math.cos(th) * brx)} ${round2(by + Math.sin(th) * bry)} `;
  }
  const front = `M${cx - brx} ${by} A${brx} ${bry} 0 0 0 ${cx + brx} ${by}`;
  const frontClip = `${front} L${round2(c.R[0])} ${round2(c.R[1])} Q130 ${round2(c.yAt(130) * 2 - c.L[1])} ${round2(c.L[0])} ${round2(c.L[1])}Z`;
  return {
    on: 1, crown: c.d, ribs: hatMeridians(c, 34, 0.3),
    brimBack: "", brim: "", brimStitch: "",
    front, frontClip, radial, faceShadow: "", rim: c.edge(0),
  };
}

function layoutVisor(m: number): AccLayout["visor"] {
  const c = hatCrown(m, 1, 0, 84, 6);
  const band: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i++) {
    const x = c.L[0] + (c.R[0] - c.L[0]) * i / 40;
    band.push([x, c.yAt(x) + 3]);
  }
  const top = band.slice(8, 33);
  const low = top.map((p, j) => {
    const t = j / Math.max(1, top.length - 1);
    return [p[0] + (t - 0.5) * 10, p[1] + 8 + 15 * Math.sin(Math.PI * t)] as [number, number];
  });
  const visor = poly(top) + " " + poly([...low].reverse()).replace("M", "L") + "Z";
  return {
    on: 1, band: poly(band), visor, visorUnder: visor,
    hi: poly(low.map((p) => [p[0], p[1] - 3] as [number, number])),
    faceShadow: poly(low),
  };
}

function layoutBeret(m: number): AccLayout["beret"] {
  const c = hatCrown(m, 3, 6, 82, 4);
  const dome =
    `M${round2(c.L[0] - 4)} ${round2(c.L[1])} C${round2(c.L[0] - 10)} ${round2(c.L[1] - 38)} 112 34 156 34 C204 34 ${round2(c.R[0] + 26)} ${round2(c.R[1] - 20)} ${round2(c.R[0] + 18)} ${round2(c.R[1] + 2)} Q130 ${round2(c.yAt(130) + 10)} ${round2(c.L[0] - 4)} ${round2(c.L[1])}Z`;
  return { on: 1, dome, rim: c.edge(-1), stem: "M154 36 C153 28 156 24 160 22", faceShadow: c.edge(4) };
}

function layoutAntenna(m: number): AccLayout["antenna"] {
  const base = hatOff(Math.PI * 1.58, 0, m);
  const bx = base[0], by = base[1];
  const stem = `M${round2(bx)} ${round2(by - 1)} C${round2(bx + 2)} ${round2(by - 18)} ${round2(bx + 12)} ${round2(by - 24)} ${round2(bx + 14)} ${round2(by - 36)}`;
  return { on: 1, baseX: bx, baseY: by, stem, bulbX: bx + 14, bulbY: by - 40 };
}

function layoutGold(): AccLayout["gold"] {
  const cx = 150, cy = 50, rx = 30, ry = 8, h = 26, N = 5;
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, x = cx - rx + 2 * rx * t, base = cy + Math.sin(Math.PI * t) * ry;
    const spike = Math.pow(Math.abs(Math.cos(Math.PI * t * N)), 3);
    pts.push([x, base - 12 - spike * (h - 10) * (0.7 + 0.3 * Math.sin(Math.PI * t))]);
  }
  const front = `M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy} ` + poly([...pts].reverse()).replace("M", "L") + "Z";
  const back = `M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy} L${cx + rx} ${cy - h + 8} A${rx} ${ry} 0 0 0 ${cx - rx} ${cy - h + 8}Z`;
  const tips: Array<{ cx: number; cy: number }> = [];
  for (let k = 1; k < N; k++) {
    const p = pts[Math.round((k / N) * 40)]!;
    tips.push({ cx: p[0], cy: p[1] - 1 });
  }
  return {
    on: 1, group: `rotate(10 ${cx} ${cy})`, back, front,
    band: `M${cx - rx} ${cy - 4} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy - 4}`,
    bandHi: `M${cx - rx + 2} ${cy - 6.4} A${rx} ${ry} 0 0 0 ${cx + rx - 2} ${cy - 6.4}`,
    gems: [
      { cx, cy: cy + 3, rx: 4.4, ry: 3.4, fill: "ruby" },
      { cx: cx - 17, cy: cy + 1, rx: 3, ry: 2.6, fill: "blue" },
      { cx: cx + 17, cy: cy + 1, rx: 3, ry: 2.6, fill: "blue" },
    ],
    tips,
  };
}

export function accLayout(f: DotFrame): AccLayout {
  const a = f.accessory;
  const m = f.m;

  let cap = emptyCap;
  if (a === "cap") cap = layoutCap(m);

  let glasses = emptyG;
  if (a === "glasses") {
    const P0 = f.eyes[0], P1 = f.eyes[1];
    const br = "M" + round2(P0.x + 15 * P0.fx) + " " + round2(P0.y - 2) + " Q" + round2((P0.x + P1.x) / 2) + " " + round2(Math.min(P0.y, P1.y) - 8) + " " + round2(P1.x - 15 * P1.fx) + " " + round2(P1.y - 2);
    const temple = (side: number) => {
      const pts: Array<[number, number]> = [];
      const start = side * 0.62;
      const py = side < 0 ? P0.y : P1.y;
      for (let k = 0; k <= 16; k++) {
        const aa = start + side * k * 0.06, eff = aa + f.yaw, c = Math.cos(eff);
        if (c < 0.06) break;
        pts.push([130 + 80 * Math.sin(eff) * Math.cos(-0.12 + f.pitch), py - 4 - Math.pow(Math.abs(aa - start), 1.4) * 12]);
      }
      return pts.length > 1 ? poly(pts) : "";
    };
    glasses = { on: 1, l0x: P0.x, l0y: P0.y, l0fx: Math.max(0.05, P0.fx), l1x: P1.x, l1y: P1.y, l1fx: Math.max(0.05, P1.fx), bridge: br, temples: temple(-1) + " " + temple(1) };
  }

  let phones = emptyP;
  if (a === "phones") {
    const sx = Math.sin(f.yaw) * 10;
    const arc: Array<[number, number]> = [];
    for (let k = 0; k <= 30; k++) arc.push(bodyPt(Math.PI * (1.05 + k * (0.9 / 30)), m, 0));
    const off = (o: number) => arc.map((_, j) => {
      const th = Math.PI * (1.05 + j * (0.9 / 30));
      const q = bodyPt(th, m, o);
      return [q[0] + sx, q[1]] as [number, number];
    });
    const bandMid = off(5.6), bandIn = off(2.6), bandTop = off(8.6);
    const cups = ([-1, 1] as const).map((side) => {
      const c = bodyPt(side < 0 ? Math.PI : 0, m, 2);
      const end = bandMid[side < 0 ? 0 : bandMid.length - 1]!;
      const cx = c[0] + sx, cy = c[1] + 2;
      return {
        cx, cy, side,
        endX: end[0], endY: end[1],
        hinge: "M" + round2(end[0]) + " " + round2(end[1]) + " Q" + round2(cx + side * 6) + " " + round2(cy - 30) + " " + round2(cx + side * 3) + " " + round2(cy - 19),
      };
    });
    phones = { on: 1, bandIn: poly(bandIn), bandMid: poly(bandMid), bandTop: poly(bandTop), bandShadow: poly(off(-2)), cups };
  }

  let ring = emptyR;
  if (a === "ring") {
    const rx = f.ringRx, ry = f.ringRy, cy0 = f.ringCy;
    const back = "M" + round2(130 - rx) + " " + round2(cy0) + " A" + round2(rx) + " " + round2(ry) + " 0 0 1 " + round2(130 + rx) + " " + round2(cy0);
    const front = "M" + round2(130 - rx) + " " + round2(cy0) + " A" + round2(rx) + " " + round2(ry) + " 0 0 0 " + round2(130 + rx) + " " + round2(cy0);
    ring = { on: 1, back, front, dash: f.ringDash };
  }

  return {
    cap,
    glasses,
    phones,
    ring,
    beanie: a === "beanie" ? layoutBeanie(m) : emptyBn,
    bucket: a === "bucket" ? layoutBucket(m) : emptyBk,
    visor: a === "visor" ? layoutVisor(m) : emptyVs,
    beret: a === "beret" ? layoutBeret(m) : emptyBr,
    antenna: a === "antenna" ? layoutAntenna(m) : emptyAn,
    gold: a === "crown" ? layoutGold() : emptyGold,
  };
}

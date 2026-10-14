import { bodyPt, proj, round2, type DotFrame } from "@open-dot/core";

function poly(pts: Array<[number, number] | { x: number; y: number }>, close = false): string {
  const xy = (p: [number, number] | { x: number; y: number }): [number, number] => ("x" in p ? [p.x, p.y] : p);
  return "M" + pts.map((p) => { const q = xy(p); return round2(q[0]) + " " + round2(q[1]); }).join(" L") + (close ? " Z" : "");
}

function shift(pts: Array<[number, number]>, dx: number, dy: number): Array<[number, number]> {
  return pts.map((p) => [p[0] + dx, p[1] + dy]);
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
}

export function accLayout(f: DotFrame): AccLayout {
  const a = f.accessory;
  const m = f.m;
  const emptyCap = { on: 0, crown: "", seams: "", visor: "", visorUnder: "", visorHi: "", band: "", bandShadow: "", visorShadow: "", apexX: 130, apexY: 40 };
  const emptyG = { on: 0, l0x: 111, l0y: 129, l0fx: 1, l1x: 149, l1y: 129, l1fx: 1, bridge: "", temples: "" };
  const emptyP = { on: 0, bandIn: "", bandMid: "", bandTop: "", bandShadow: "", cups: [] as AccLayout["phones"]["cups"] };
  const emptyR = { on: 0, back: "", front: "", dash: 0 };

  let cap = emptyCap;
  if (a === "cap") {
    const yw = f.yaw * 0.7, sx0 = Math.sin(f.yaw) * 6, band: Array<[number, number]> = [];
    for (let i = 0; i <= 24; i++) {
      const q = proj(-1.42 + i * (2.84 / 24) + yw, 0.5);
      band.push([q.x, q.y]);
    }
    let crownTop: Array<[number, number]> = [];
    for (let k = 0; k <= 30; k++) {
      const th = Math.PI * (1.06 + k * (0.88 / 30));
      const bp = bodyPt(th, m, 3);
      const lift = Math.pow(Math.sin((Math.PI * k) / 30), 1.3) * 13;
      crownTop.push([bp[0] + sx0, bp[1] - lift]);
    }
    const bandY = (x: number) => {
      let best = band[0]!;
      for (const p of band) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
      return best[1];
    };
    crownTop = crownTop.filter((p) => p[1] < bandY(p[0]) - 1);
    const Lb = band[0]!, Rb = band[band.length - 1]!;
    const crown = poly([Lb, ...crownTop, Rb]) + " " + poly([...band].reverse()).replace("M", "L") + " Z";
    const apex = crownTop[Math.floor(crownTop.length / 2)] ?? [130, 40];
    const seams = [-0.8, -0.28, 0.28, 0.8]
      .map((s) => {
        const bq = proj(s * 1.25 + yw, 0.5);
        const cx = apex[0] + (bq.x - apex[0]) * 0.7 + s * 10;
        const cy = apex[1] + (bq.y - apex[1]) * 0.25;
        return "M" + round2(apex[0]) + " " + round2(apex[1] + 3) + " Q" + round2(cx) + " " + round2(cy) + " " + round2(bq.x) + " " + round2(bq.y);
      })
      .join(" ");
    const top: Array<[number, number]> = [], bot: Array<[number, number]> = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, qb2 = proj(-0.78 + t * 1.62 + yw, 0.5), depth = 4 + 11 * Math.sin(Math.PI * t), out = (t - 0.38) * 18;
      top.push([qb2.x + (t < 0.5 ? -2 : 2) * Math.abs(t - 0.5) * 2, qb2.y]);
      bot.push([qb2.x + out, qb2.y + depth]);
    }
    const visor = poly(top) + " " + poly([...bot].reverse()).replace("M", "L") + " Z";
    cap = {
      on: 1, crown, seams, visor, visorUnder: visor, visorHi: poly(top), band: poly(band),
      bandShadow: poly(shift(band, 0, 4)), visorShadow: poly(shift(bot, 0, 7)),
      apexX: apex[0], apexY: apex[1] + 2.5,
    };
  }

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

  return { cap, glasses, phones, ring };
}

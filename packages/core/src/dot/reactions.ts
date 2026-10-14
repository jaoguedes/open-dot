import { hexRgb } from "./physics.ts";
import type { EngineMut, ReactionName } from "./types.ts";

type Ev = [number, (e: EngineMut) => void];

const r = (e: EngineMut, a: number, b: number) => a + e.rng() * (b - a);

export const TL: Record<ReactionName | "errorEnter", () => Ev[]> = {
  oi: () => [
    [0, (E) => E.squash(1.2)],
    [0.12, (E) => E.hop(20)],
    [0.42, (E) => E.setEyes("squint")],
    [0.55, (E) => { E.setEyes("happy"); E.handsOn = 1; E.cheekAT = 1; }],
    [0.78, (E) => { E.waveOn = 1; E.emit("wave", 236, 96, { side: 1, vx: 24, life: 0.7, ay: 0 }); }],
    [1.35, (E) => E.emit("wave", 236, 96, { side: 1, vx: 24, life: 0.7, ay: 0 })],
    [1.55, (E) => E.setEyes("wink")],
    [1.95, (E) => E.setEyes("happy")],
    [2.15, (E) => { E.waveOn = 0; }],
    [2.45, (E) => { E.handsOn = 0; E.setEyes("open"); E.cheekAT = 0.8; }],
    [2.8, (E) => E.endReaction()],
  ],
  success: () => [
    [0, (E) => E.squash(1.4)],
    [0.12, (E) => { E.hop(30); E.spinTurns(1, 0.62); }],
    [0.74, (E) => {
      E.setEyes("happy"); E.cheekAT = 1; E.glowT = hexRgb("#2BD47F"); E.setInd("check");
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.45;
        E.emit("spark", 130 + Math.cos(a) * 60, 90 + Math.sin(a) * 30, { vx: Math.cos(a) * 70, vy: Math.sin(a) * 60 - 20, ay: 40, life: 1, r: r(E, 3, 6.5), vr: r(E, -200, 200) });
      }
    }],
    [2, (E) => E.endReaction()],
  ],
  surprised: () => [
    [0, (E) => {
      E.setEyes("big"); E.vsy += 2.6; E.vsx -= 1.6; E.hop(8); E.glowT = hexRgb("#FFC94D");
      for (const a of [-0.5, 0, 0.5]) E.emit("ryellow", 130 + a * 40, 46, { rot: a * 40, vx: a * 40, vy: -40, ay: 0, life: 0.7, len: a ? 9 : 11 });
    }],
    [0.2, (E) => E.shake(0.25)],
    [1.2, (E) => E.endReaction()],
  ],
  love: () => {
    const ev: Ev[] = [
      [0, (E) => { E.setEyes("happy"); E.setInd("heart"); E.tintT = hexRgb("#FFC9DE"); E.tintAT = 0.5; E.tintFull = 1; E.cheekAT = 1; E.glowT = hexRgb("#FF6FA3"); E.hop(12); }],
      [1.2, (E) => E.setEyes("wink")],
      [1.6, (E) => E.setEyes("happy")],
      [3.1, (E) => E.endReaction()],
    ];
    [0.25, 0.55, 0.85, 1.15, 1.5, 1.9, 2.3].forEach((t, i) => {
      ev.push([t, (E) => {
        const s = i % 2 ? 1 : -1;
        E.emit("heart", 130 + s * r(E, 50, 80), r(E, 70, 110), { vx: s * r(E, 10, 30), vy: r(E, -55, -35), ay: -10, life: r(E, 1.4, 2), sc: r(E, 0.35, 0.7), back: i === 3 || i === 6, vr: s * r(E, 10, 40), wob: 6 });
      }]);
    });
    return ev;
  },
  dizzy: () => [
    [0, (E) => { E.setEyes("spiral"); E.setInd("spiral"); E.tintT = hexRgb("#FFC9DE"); E.tintAT = 0.5; E.tintFull = 1; E.cheekAT = 1; E.glowT = hexRgb("#FF6FA3"); E.spinTurns(2, 1); E.hop(10); }],
    [0.5, (E) => { E.emit("spiral", 30, 96, { dir: -1, vr: -360, ay: -6, life: 1.4, wob: 4 }); E.emit("spiral", 232, 90, { dir: 1, vr: 360, ay: -6, life: 1.4, wob: 4 }); }],
    [1, (E) => { E.sway = { a: 4, w: 9, t0: E.t, dur: 1 }; }],
    [2.1, (E) => E.endReaction()],
  ],
  poke: () => [
    [0, (E) => { E.squash(2.2); E.setEyes("squint"); E.hop(7); }],
    [0.32, (E) => E.setEyes("open")],
    [0.55, (E) => E.endReaction()],
  ],
  slap: () => [
    [0, (E) => { E.vrot += 520; E.squash(1.6); E.setEyes("squint"); E.shake(0.2); E.emit("drop", 212, 70, { vx: 40, vy: -50, ay: 160, life: 0.8 }); }],
    [0.35, (E) => { E.setEyes("angry"); E.emit("cloud", 216, 76, { vx: 18, vy: -18, ay: -4, life: 1, sc: 0.8, v: 2 }); }],
    [1.1, (E) => E.setEyes("open")],
    [1.3, (E) => E.endReaction()],
  ],
  absorb: () => [
    [0, (E) => { E.setEyes("attentive"); E.forceLook = [0.26, 0.14]; E.file = { t: 0 }; }],
    [0.38, (E) => E.squash(0.8)],
    [0.55, (E) => { E.mT = 1; E.forceLook = [0, 0.1]; }],
    [1.05, (E) => { E.vsy -= 1.2; E.vsx += 0.8; }],
    [1.5, (E) => { E.hop(10); for (let i = 0; i < 4; i++) E.emit("spark", 130 + r(E, -24, 24), 62, { vy: -r(E, 30, 60), vx: r(E, -30, 30), r: 3.2, grad: "b", life: 0.8 }); }],
    [1.9, (E) => { E.mT = 0; E.forceLook = null; }],
    [2.15, (E) => { E.setEyes("happy"); E.setInd("check"); }],
    [3.2, (E) => E.endReaction()],
  ],
  errorEnter: () => [
    [0, (E) => {
      E.squash(1.6); E.shake(0.45);
      E.emit("cloud", 60, 84, { vx: -28, vy: -26, ay: -6, life: 1.3, v: 1 });
      E.emit("cloud", 202, 78, { vx: 28, vy: -26, ay: -6, life: 1.3, v: 2, sc: 0.9 });
      for (const a of [-60, -95, -25]) E.emit("ray", 170, 48, { rot: a, vx: -30, vy: -20, ay: 0, life: 0.7, len: 5.5 });
      for (const a of [60, 95, 25]) E.emit("ray", 204, 48, { rot: a, vx: 30, vy: -20, ay: 0, life: 0.7, len: 5.5 });
    }],
    [1.7, (E) => { if (E.state === "error") { E.setEyes("serious"); E.setInd("dot"); } }],
  ],
};

export const STILL: Record<ReactionName, (e: EngineMut) => void> = {
  oi: (E) => { E.setEyes("happy", true); E.handsOn = 1; E.waveOn = 1; },
  success: (E) => { E.setEyes("happy", true); E.setInd("check"); },
  surprised: (E) => E.setEyes("big", true),
  love: (E) => { E.setEyes("happy", true); E.setInd("heart"); E.tintAT = 0.5; E.tintFull = 1; },
  dizzy: (E) => { E.setEyes("spiral", true); E.setInd("spiral"); },
  poke: () => {},
  slap: () => {},
  absorb: (E) => E.setInd("check"),
};

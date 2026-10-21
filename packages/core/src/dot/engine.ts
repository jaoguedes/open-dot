// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
/* eslint-disable @typescript-eslint/no-this-alias -- `const E = this` deixa o passo da física legível e é usado no laço quente */
import { CX, RX, onSphere } from "./geometry.ts";
import { clamp, easeIO, hexRgb, lerp, mulberry32, smooth, spring } from "./physics.ts";
import { BLOCK_PLAY, STATES, type DotStateKey, type EyePair, type IndKind } from "./states.ts";
import { STILL, TL } from "./reactions.ts";
import type { AccessoryKind, DotFrame, EmitOpts, EngineMut, EyeFrame, EyeShape, HandFrame, ParticleKind, ReactResult, ReactionName } from "./types.ts";

const STEP = 1 / 120;
const BLINKABLE: Record<string, 1> = { open: 1, focused: 1, attentive: 1, big: 1, serious: 1 };
const EXPR: Record<EyePair, [EyeShape, EyeShape]> = {
  open: ["open", "open"],
  focused: ["focused", "focused"],
  attentive: ["attentive", "attentive"],
  big: ["big", "big"],
  serious: ["serious", "serious"],
  half: ["half", "half"],
  happy: ["happy", "happy"],
  closed: ["closed", "closed"],
  squint: ["gt", "lt"],
  wink: ["open", "lt"],
  angry: ["angryL", "angryR"],
  spiral: ["spiralL", "spiralR"],
};

interface Eye {
  shape: EyeShape | null;
  next: EyeShape | null;
  p: number;
}

interface P {
  id: number;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  drag: number;
  rot: number;
  vr: number;
  life: number;
  age: number;
  sc: number;
  wob: number;
  ph: number;
  back: number;
  variant: number;
  side: number;
  radius: number;
  grad: number;
  len: number;
  dir: number;
  s: number;
}

interface Tl {
  ev: Array<[number, (e: EngineMut) => void]>;
  t: number;
  i: number;
  reaction: boolean;
}

export interface EngineOpts {
  reducedMotion?: boolean;
  seed?: number;
  rng?: () => number;
}

export class DotEngine implements EngineMut {
  rm: boolean;
  rng: () => number;
  t = 0;
  sx = 1;
  sy = 1;
  vsx = 0;
  vsy = 0;
  rot = 0;
  vrot = 0;
  rotT = 0;
  posY = 0;
  vy = 0;
  shakeX = 0;
  shakeT = 0;
  m = 0;
  mT = 0;
  vm = 0;
  yaw = 0;
  pitch = 0;
  lookT: [number, number] = [0, 0];
  spin: { t: number; dur: number; turns: number } | null = null;
  spinYaw = 0;
  glowC: [number, number, number] = hexRgb("#3F7BFF");
  glowT: [number, number, number] = hexRgb("#3F7BFF");
  tintC: [number, number, number] = hexRgb("#FFC9DE");
  tintT: [number, number, number] = hexRgb("#FFC9DE");
  tintA = 0;
  tintAT = 0;
  tintFull = 0;
  tintF = 0;
  cheekA = 0.8;
  cheekAT = 0.8;
  blink = 1;
  nextBlink: number;
  blinkT = -1;
  indKind: IndKind = null;
  indPop = 0;
  vIndPop = 0;
  indAge = 0;
  handsOn = 0;
  handsS = 0;
  vHands = 0;
  waveOn = 0;
  waving = 0;
  particles: P[] = [];
  timelines: Tl[] = [];
  emitAcc = 0;
  pointer: [number, number] | null = null;
  pointerAt = -9;
  saccadeAt = 1;
  wander: [number, number] = [0, 0];
  acc: AccessoryKind = "none";
  file: { t: number } | null = null;
  state: DotStateKey = "idle";
  cfg = STATES.idle;
  reaction: ReactionName | null = null;
  greyF = 0;
  forceLook: [number, number] | null = null;
  sway: { a: number; w: number; t0: number; dur: number } | null = null;
  lastDizzy = -99;
  private pid = 1;
  private eyes: [Eye, Eye] = [
    { shape: "open", next: null, p: 1 },
    { shape: "open", next: null, p: 1 },
  ];

  constructor(opts: EngineOpts = {}) {
    this.rm = !!opts.reducedMotion;
    this.rng = opts.rng ?? (opts.seed !== undefined ? mulberry32(opts.seed) : Math.random);
    this.nextBlink = 1.5 + this.rng() * 2.5;
    this.setState("idle", true);
  }

  setState(key: DotStateKey, instant = false): void {
    const c = STATES[key];
    if (!c) return;
    this.state = key;
    this.cfg = c;
    this.glowT = hexRgb(c.glow);
    this.tintT = hexRgb(c.tint ?? "#FFC9DE");
    this.tintAT = c.tintAmt ?? 0;
    this.cheekAT = 0.8;
    this.setEyes(c.eyes, instant);
    this.setInd(c.ind ?? null);
    this.greyF = c.grey ? 1 : 0;
    this.timelines = this.timelines.filter((t) => t.reaction);
    if (c.enter && !this.rm) this.run(TL[c.enter](), false);
    if (c.enter && this.rm) this.setInd("dot");
    if (instant) {
      this.glowC = this.glowT.slice() as [number, number, number];
      this.tintC = this.tintT.slice() as [number, number, number];
      this.tintA = this.tintAT;
    }
  }

  react(name: ReactionName): ReactResult {
    if ((name === "love" || name === "dizzy") && BLOCK_PLAY.has(this.state)) return "bloqueado";
    if (name === "dizzy" && this.t - this.lastDizzy < 5) return "cooldown";
    if (name === "dizzy") this.lastDizzy = this.t;
    this.timelines = this.timelines.filter((t) => !t.reaction);
    this.endReaction();
    this.reaction = name;
    if (this.rm) {
      STILL[name]?.(this);
      this.run([[1.6, (E) => E.endReaction()]], true);
      return "ok";
    }
    this.run(TL[name](), true);
    return "ok";
  }

  setAccessory(a: AccessoryKind): void {
    this.acc = a;
  }

  look(x: number, y: number): void {
    this.pointer = [x, y];
    this.pointerAt = this.t;
  }

  setEyes(expr: EyePair, instant = false): void {
    const pair = EXPR[expr] ?? EXPR.open;
    this.eyes.forEach((eye, i) => {
      const s = pair[i]!;
      if (eye.shape === s && !eye.next) return;
      if (instant || this.rm || !eye.shape) {
        eye.shape = s;
        eye.next = null;
        eye.p = 1;
        return;
      }
      if (eye.next === s) return;
      eye.next = s;
      eye.p = 0;
    });
  }

  setInd(kind: IndKind): void {
    if (kind === this.indKind) return;
    this.indKind = kind;
    this.indAge = 0;
    this.indPop = this.rm ? 1 : 0;
    this.vIndPop = 0;
  }

  hop(h: number): void {
    if (this.posY <= 0.01) {
      this.vy = Math.sqrt(2 * 1500 * h);
      this.vsy += 1.6;
      this.vsx -= 1.1;
    }
  }

  squash(a: number): void {
    this.vsx += a;
    this.vsy -= a * 1.4;
  }

  spinTurns(turns: number, dur: number): void {
    this.spin = { t: 0, dur, turns };
  }

  shake(dur: number): void {
    this.shakeT = dur;
  }

  emit(kind: ParticleKind, x: number, y: number, o: EmitOpts = {}): void {
    if (this.rm || this.particles.length >= 18) return;
    this.particles.push({
      id: this.pid++,
      kind,
      x,
      y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      ay: o.ay == null ? -30 : o.ay,
      drag: o.drag == null ? 0.6 : o.drag,
      rot: o.rot ?? 0,
      vr: o.vr ?? 0,
      life: o.life ?? 1.6,
      age: 0,
      sc: o.sc ?? 1,
      wob: o.wob ?? 0,
      ph: this.rng() * 6,
      back: o.back ? 1 : 0,
      variant: o.v ?? 1,
      side: o.side ?? 0,
      radius: o.r ?? 5,
      grad: o.grad === "b" || o.grad === "url(#odStarB)" ? 1 : 0,
      len: o.len ?? 6,
      dir: o.dir ?? 1,
      s: o.s ?? 1,
    });
  }

  run(events: Array<[number, (e: EngineMut) => void]>, reaction: boolean): void {
    const ev = events.slice().sort((a, b) => a[0] - b[0]);
    this.timelines.push({ ev, t: 0, i: 0, reaction });
  }

  endReaction(): void {
    if (!this.reaction) return;
    this.reaction = null;
    const c = this.cfg;
    this.setEyes(c.eyes);
    this.setInd(c.ind ?? null);
    this.handsOn = 0;
    this.waveOn = 0;
    this.glowT = hexRgb(c.glow);
    this.tintT = hexRgb(c.tint ?? "#FFC9DE");
    this.tintAT = c.tintAmt ?? 0;
    this.cheekAT = 0.8;
    this.mT = 0;
    this.rotT = 0;
    this.forceLook = null;
    this.sway = null;
    this.tintFull = 0;
  }

  /** Avança a física. Subpassos internos de 120 Hz. */
  step(dt: number): void {
    const capped = Math.min(0.05, Math.max(0, dt));
    const n = Math.max(1, Math.ceil(capped / STEP));
    const h = capped / n;
    for (let i = 0; i < n; i++) this.tick(h);
  }

  private tick(h: number): void {
    const E = this;
    const c = E.cfg;
    E.t += h;
    for (const tl of E.timelines) {
      tl.t += h;
      while (tl.i < tl.ev.length && tl.ev[tl.i]![0] <= tl.t) {
        tl.ev[tl.i]![1](E);
        tl.i++;
      }
    }
    E.timelines = E.timelines.filter((tl) => tl.i < tl.ev.length);
    if (E.rm) {
      E.sx = 1;
      E.sy = c.sy ?? 1;
      E.m = E.mT;
      E.glowC = E.glowT.slice() as [number, number, number];
      E.tintC = E.tintT.slice() as [number, number, number];
      E.tintA = E.tintAT;
      E.cheekA = E.cheekAT;
      E.indPop = 1;
      E.handsS = E.handsOn;
      E.waving = E.waveOn;
      E.particles = [];
      return;
    }
    if (E.posY > 0 || E.vy > 0) {
      E.vy -= 1500 * h;
      E.posY += E.vy * h;
      if (E.posY <= 0) {
        const imp = Math.min(3, Math.abs(E.vy) / 90);
        E.posY = 0;
        E.vy = 0;
        E.vsx += imp * 0.9;
        E.vsy -= imp * 1.3;
      }
    }
    const air = E.posY > 0 ? clamp(E.vy / 900, -0.08, 0.08) : 0;
    const breathe = Math.sin((E.t * Math.PI * 2) / (c.slow ? 5.2 : 3.6)) * 0.01;
    let r = spring(E.sx, E.vsx, 1 - breathe * 0.5 - Math.abs(air) * 0.6, 520, 15, h);
    E.sx = r[0];
    E.vsx = r[1];
    r = spring(E.sy, E.vsy, (c.sy ?? 1) + breathe + Math.abs(air), 520, 15, h);
    E.sy = r[0];
    E.vsy = r[1];
    let rt = E.rotT + (c.tilt ?? 0);
    if (c.jitter) rt += Math.sin(E.t * 7) * 1.4;
    if (E.sway) {
      const st = E.t - E.sway.t0;
      if (st < E.sway.dur) rt += Math.sin(st * E.sway.w) * E.sway.a * (1 - (st / E.sway.dur) * 0.4);
      else E.sway = null;
    }
    r = spring(E.rot, E.vrot, rt, 260, 11, h);
    E.rot = r[0];
    E.vrot = r[1];
    r = spring(E.m, E.vm, E.mT, 120, 14, h);
    E.m = clamp(r[0], 0, 1.08);
    E.vm = r[1];
    if (E.shakeT > 0) {
      E.shakeT -= h;
      E.shakeX = Math.sin(E.t * 70) * 3 * clamp(E.shakeT / 0.3, 0, 1);
    } else E.shakeX = 0;
    let lt: [number, number];
    if (E.forceLook) lt = E.forceLook;
    else if (c.look === "free") {
      if (E.pointer && E.t - E.pointerAt < 2.5) lt = E.pointer;
      else {
        if (E.t > E.saccadeAt) {
          E.wander = E.rng() < 0.35 ? [0, 0] : [-0.16 + E.rng() * 0.32, -0.07 + E.rng() * 0.15];
          E.saccadeAt = E.t + 1.4 + E.rng() * 2.2;
        }
        lt = E.wander;
      }
    } else lt = [c.look[0] + Math.sin(E.t * 0.9) * 0.02, c.look[1] + Math.cos(E.t * 0.7) * 0.015];
    const kl = smooth(0.0006, h);
    E.yaw += (lt[0] - E.yaw) * kl;
    E.pitch += (lt[1] - E.pitch) * kl;
    if (E.spin) {
      E.spin.t += h;
      const p = clamp(E.spin.t / E.spin.dur, 0, 1);
      E.spinYaw = easeIO(p) * E.spin.turns * Math.PI * 2;
      if (p >= 1) {
        E.spin = null;
        E.spinYaw = 0;
      }
    }
    const kc = smooth(0.003, h);
    for (let j = 0; j < 3; j++) {
      E.glowC[j]! += (E.glowT[j]! - E.glowC[j]!) * kc;
      E.tintC[j]! += (E.tintT[j]! - E.tintC[j]!) * kc;
    }
    E.tintA += (E.tintAT - E.tintA) * kc;
    E.cheekA += (E.cheekAT - E.cheekA) * kc;
    E.nextBlink -= h;
    if (E.nextBlink <= 0 && E.blinkT < 0) {
      E.blinkT = 0;
      E.nextBlink = E.rng() < 0.15 ? 0.28 : 2.5 + E.rng() * 3.5;
    }
    if (E.blinkT >= 0) {
      E.blinkT += h;
      const bp = E.blinkT / 0.13;
      E.blink = bp < 0.5 ? 1 - bp * 1.8 : bp < 1 ? 0.1 + (bp - 0.5) * 1.8 : 1;
      if (bp >= 1) {
        E.blinkT = -1;
        E.blink = 1;
      }
    }
    for (const eye of E.eyes) {
      if (eye.next) {
        eye.p += h / 0.16;
        if (eye.p >= 1) {
          eye.shape = eye.next;
          eye.next = null;
          eye.p = 1;
        }
      }
    }
    r = spring(E.indPop, E.vIndPop, E.indKind ? 1 : 0, 340, 14, h);
    E.indPop = r[0];
    E.vIndPop = r[1];
    E.indAge += h;
    r = spring(E.handsS, E.vHands, E.handsOn, 300, 13, h);
    E.handsS = r[0];
    E.vHands = r[1];
    E.waving += ((E.waveOn ? 1 : 0) - E.waving) * smooth(0.0004, h);
    if (c.emit && !E.reaction) {
      E.emitAcc += h;
      if (E.emitAcc > c.emit[1]) {
        E.emitAcc = 0;
        if (c.emit[0] === "square") {
          const s = E.rng() < 0.5 ? -1 : 1;
          E.emit("square", 130 + s * (60 + E.rng() * 20), 70 + E.rng() * 30, {
            vx: s * (4 + E.rng() * 8),
            vy: -(25 + E.rng() * 15),
            vr: s * (90 + E.rng() * 110),
            ay: 0,
            life: 1.4,
            sc: 0.7 + E.rng() * 0.3,
          });
        }
        if (c.emit[0] === "z") E.emit("z", 176, 66, { vx: 8, vy: -14, ay: -2, life: 2.8, s: 0.9 + E.rng() * 0.5, wob: 5, vr: 8, rot: -8 });
      }
    }
    for (const q of E.particles) {
      q.age += h;
      const dr = Math.pow(q.drag, h);
      q.vx *= dr;
      q.vy = q.vy * dr + q.ay * h;
      q.x += q.vx * h;
      q.y += q.vy * h;
      q.rot += q.vr * h;
    }
    E.particles = E.particles.filter((q) => q.age < q.life);
    if (E.file) {
      E.file.t += h;
      if (E.file.t > 1.35) E.file = null;
    }
  }

  frame(): DotFrame {
    const E = this;
    const c = E.cfg;
    const fl = E.rm ? 0 : Math.sin((E.t * Math.PI * 2) / (c.slow ? 5.4 : 3.6)) * 4 * (c.float || 0);
    const lift = E.posY + fl;
    E.tintF += ((E.tintFull ? 1 : 0) - E.tintF) * 0.08;
    const yaw = E.yaw + E.spinYaw;
    const pitch = E.pitch;
    const eyes = [0, 1].map((i) => {
      const side = i ? 1 : -1;
      const q = onSphere(side * 0.37 + yaw, -0.12 + pitch);
      const eye = E.eyes[i]!;
      const rotSp = /spiral/.test(eye.shape ?? "") || /spiral/.test(eye.next ?? "") ? E.t * 360 * side : 0;
      const by = eye.shape && BLINKABLE[eye.shape] ? E.blink : 1;
      return {
        shape: (eye.shape ?? "open") as EyeShape,
        next: eye.next,
        p: eye.p,
        x: q.x,
        y: q.y,
        fx: Math.max(0.05, q.fx),
        vis: q.vis,
        blink: by,
        spinDeg: rotSp % 360,
      } satisfies EyeFrame;
    }) as [EyeFrame, EyeFrame];
    const cheeks = [0, 1].map((i) => {
      const side = i ? 1 : -1;
      const ck = onSphere(side * 0.62 + yaw, -0.2 + pitch);
      return { x: ck.x, y: ck.y, rx: 13 * Math.max(0.05, ck.fx), opacity: E.cheekA * ck.vis };
    }) as DotFrame["cheeks"];
    const gs = clamp(1 - lift / 110, 0.55, 1.05);
    let ix = 82,
      iy = 50 - lift + Math.sin(E.t * 2.2) * 2.5,
      extra = 0,
      s = Math.max(0, E.indPop);
    if (E.indKind === "question") extra = Math.sin(E.t * 2.4) * 10;
    if (E.indKind === "bang") extra = Math.sin(E.t * 4) * 6;
    if (E.indKind === "x" && E.indAge < 1.2) extra = Math.sin(E.indAge * 30) * 9 * (1 - E.indAge / 1.2);
    if (E.indKind === "heart") {
      const bt = E.t % 1;
      s *= 1 + (bt < 0.14 ? (bt / 0.14) * 0.2 : bt < 0.28 ? 0.2 - ((bt - 0.14) / 0.14) * 0.2 : bt < 0.4 ? ((bt - 0.28) / 0.12) * 0.12 : bt < 0.55 ? 0.12 - ((bt - 0.4) / 0.15) * 0.12 : 0);
      iy = 48 - lift;
    }
    if (E.indKind === "spiral") {
      extra = (E.t * 240) % 360;
      iy = 48 - lift;
    }
    if (E.indKind === "check") iy = 50 - lift;
    if (E.acc === "cap" || E.acc === "phones") {
      ix -= 8;
      iy -= 16;
    }
    const balls: Array<[number, number]> = [0, 1, 2].map((k) => {
      const ph = (E.t * 1.6 - k * 0.18) % 1;
      const yy = ph < 0.35 ? -Math.sin((ph / 0.35) * Math.PI) * 6 : 0;
      return [-14 + k * 14, 6 - k * 6 + yy];
    });
    const waves = (
      [
        ["l", -1, 0],
        ["lb", -1, 1],
        ["r", 1, 0],
        ["rb", 1, 1],
      ] as const
    ).map((w) => {
      const big = w[2];
      const ph = (E.t / 1.4 + (big ? 0.16 : 0)) % 1;
      const o = ph < 0.25 ? ph / 0.25 : ph < 0.6 ? 1 : 1 - (ph - 0.6) / 0.4;
      return { x: 130 + w[1] * (big ? 102 : 94), y: 124 - lift, sc: 0.8 + ph * 0.3, opacity: E.indKind === "waves" ? o : 0, side: w[1], big };
    });
    const hs = Math.max(0, E.handsS);
    const hands = ([0, 1] as const).map((i): HandFrame => {
      const side = i ? 1 : -1;
      let bx = 130 + side * (RX * E.sx + 13 * Math.min(1, hs));
      let by = 152 - lift + Math.sin(E.t * 3 + i * 2) * 1.5;
      let rot = 0;
      if (side === 1 && E.waving > 0.01) {
        const w = E.waving;
        bx += 5 * w;
        by -= 46 * w;
        rot = Math.sin(E.t * 13) * 30 * w;
      }
      return { x: bx, y: by, rot, scale: hs, opacity: clamp(hs * 1.6, 0, 1) };
    }) as [HandFrame, HandFrame];
    let file: DotFrame["file"] = null;
    if (E.file) {
      const ft = E.file.t;
      let fx: number,
        fy: number,
        fs = 1,
        fo = 1,
        rot = 0,
        sy = 1;
      if (ft < 0.7) {
        const u = easeIO(ft / 0.7);
        fx = lerp(236, 130, u);
        fy = lerp(30, 56, u) - Math.sin(u * Math.PI) * 26;
        fo = clamp(ft / 0.12, 0, 1);
        rot = 14 * (1 - ft / 0.7);
      } else {
        const v = clamp((ft - 0.7) / 0.5, 0, 1);
        fx = 130;
        fy = 56 + v * 20;
        fs = 1 - v * 0.7;
        sy = fs * 0.7;
        fo = 1 - clamp((v - 0.6) / 0.4, 0, 1);
      }
      file = { x: fx, y: fy - lift, rot, sx: fs, sy, opacity: fo };
    }
    const sc = Math.cos(E.spinYaw);
    const pulse = 1 + Math.sin(E.t * 2.4) * 0.02;
    const name = E.reaction ? `${STATES[E.state].name} · ${E.reaction}` : STATES[E.state].name;
    const pop = (a: number) => {
      if (a >= 0.25) return 1;
      const t = a / 0.25 - 1;
      const c1 = 1.70158;
      return 1 + (c1 + 1) * t * t * t + c1 * t * t;
    };
    return {
      t: E.t,
      state: E.state,
      reaction: E.reaction,
      ariaLabel: `Dot — ${name}`,
      m: E.m,
      sx: E.sx,
      sy: E.sy,
      rot: E.rot,
      lift,
      shakeX: E.shakeX,
      yaw,
      pitch: E.pitch,
      glow: [E.glowC[0], E.glowC[1], E.glowC[2]],
      tint: [E.tintC[0], E.tintC[1], E.tintC[2]],
      tintA: E.tintA,
      tintF: E.tintF,
      tintCy: lerp(168, 118, E.tintF),
      tintRy: lerp(60, 110, E.tintF),
      tintRx: lerp(120, 150, E.tintF),
      cheekA: E.cheekA,
      grey: E.greyF,
      reducedMotion: E.rm ? 1 : 0,
      accessory: E.acc,
      slotOpacity: clamp((E.m - 0.55) / 0.4, 0, 1),
      groundRx: 104 * gs,
      groundOp: 0.95 * gs,
      contactRx: 78 * gs,
      contactOp: clamp(gs, 0, 1),
      specCx: 112 - Math.sin(E.yaw) * 14,
      spec2Cx: 98 - Math.sin(E.yaw) * 16,
      eyes,
      cheeks,
      ind: {
        kind: E.indKind,
        x: ix,
        y: iy,
        scale: s,
        rot: extra,
        checkDash: 16 * (1 - clamp((E.indAge - 0.12) / 0.3, 0, 1)),
        balls,
      },
      waves,
      hands,
      file,
      particles: E.particles.map((q) => {
        const a = q.age;
        const op = a > q.life * 0.65 ? 1 - (a - q.life * 0.65) / (q.life * 0.35) : 1;
        const wx = q.wob ? Math.sin(a * 4 + q.ph) * q.wob : 0;
        return {
          id: q.id,
          kind: q.kind,
          x: q.x + wx,
          y: q.y,
          rot: q.rot,
          sc: Math.max(0, pop(a) * q.sc),
          opacity: clamp(op, 0, 1),
          back: q.back,
          variant: q.variant,
          side: q.side,
          radius: q.radius,
          grad: q.grad,
          len: q.len,
          dir: q.dir,
          s: q.s,
        };
      }),
      ringPulse: pulse,
      ringRx: 104 * pulse,
      ringRy: 15 * pulse,
      ringCy: 175 + Math.sin(E.t * 2) * 1.2,
      ringDash: -((E.t * 90) % 426),
      accSpinTx: E.spinYaw ? CX + Math.sin(E.spinYaw) * 34 : 0,
      accSpinSc: sc,
      accSpinOp: E.acc === "glasses" ? clamp(sc * 4, 0, 1) : 1,
    };
  }
}

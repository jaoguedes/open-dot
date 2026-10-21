// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import type { DotStateKey, EyePair, IndKind } from "./states.ts";

export type ReactionName = "oi" | "success" | "surprised" | "love" | "dizzy" | "poke" | "slap" | "absorb";
export type AccessoryKind = "none" | "cap" | "glasses" | "phones" | "ring" | "beanie" | "bucket" | "crown" | "antenna" | "visor" | "beret";
export type EyeShape = "open" | "focused" | "attentive" | "big" | "serious" | "half" | "happy" | "closed" | "gt" | "lt" | "angryL" | "angryR" | "spiralL" | "spiralR";
export type ParticleKind = "heart" | "cloud" | "spark" | "square" | "z" | "spiral" | "ray" | "ryellow" | "wave" | "drop";
export type ReactResult = "ok" | "bloqueado" | "cooldown";

export interface EyeFrame {
  shape: EyeShape;
  next: EyeShape | null;
  /** Crossfade 0→1 (160 ms). */
  p: number;
  x: number;
  y: number;
  fx: number;
  vis: number;
  blink: number;
  spinDeg: number;
}

export interface ParticleFrame {
  id: number;
  kind: ParticleKind;
  x: number;
  y: number;
  rot: number;
  sc: number;
  opacity: number;
  back: number;
  variant: number;
  side: number;
  radius: number;
  grad: number;
  len: number;
  dir: number;
  s: number;
}

export interface HandFrame {
  x: number;
  y: number;
  rot: number;
  scale: number;
  opacity: number;
}

export interface WaveFrame {
  x: number;
  y: number;
  sc: number;
  opacity: number;
  side: number;
  big: number;
}

export interface FileFrame {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  opacity: number;
}

export interface IndFrame {
  kind: IndKind;
  x: number;
  y: number;
  scale: number;
  rot: number;
  checkDash: number;
  balls: Array<[number, number]>;
}

export interface DotFrame {
  t: number;
  state: DotStateKey;
  reaction: ReactionName | null;
  ariaLabel: string;
  m: number;
  sx: number;
  sy: number;
  rot: number;
  lift: number;
  shakeX: number;
  yaw: number;
  pitch: number;
  glow: [number, number, number];
  tint: [number, number, number];
  tintA: number;
  tintF: number;
  tintCy: number;
  tintRy: number;
  tintRx: number;
  cheekA: number;
  grey: number;
  reducedMotion: number;
  accessory: AccessoryKind;
  slotOpacity: number;
  groundRx: number;
  groundOp: number;
  contactRx: number;
  contactOp: number;
  specCx: number;
  spec2Cx: number;
  eyes: [EyeFrame, EyeFrame];
  cheeks: [{ x: number; y: number; rx: number; opacity: number }, { x: number; y: number; rx: number; opacity: number }];
  ind: IndFrame;
  waves: WaveFrame[];
  hands: [HandFrame, HandFrame];
  file: FileFrame | null;
  particles: ParticleFrame[];
  ringPulse: number;
  ringRx: number;
  ringRy: number;
  ringCy: number;
  ringDash: number;
  accSpinTx: number;
  accSpinSc: number;
  accSpinOp: number;
}

export type EngineEvent = (e: EngineMut) => void;

/** Superfície que as linhas do tempo mutam. */
export interface EngineMut {
  t: number;
  state: DotStateKey;
  rm: boolean;
  squash(a: number): void;
  hop(h: number): void;
  shake(dur: number): void;
  spinTurns(turns: number, dur: number): void;
  setEyes(expr: EyePair, instant?: boolean): void;
  setInd(kind: IndKind): void;
  emit(kind: ParticleKind, x: number, y: number, o?: EmitOpts): void;
  endReaction(): void;
  glowT: [number, number, number];
  tintT: [number, number, number];
  tintAT: number;
  tintFull: number;
  cheekAT: number;
  handsOn: number;
  waveOn: number;
  mT: number;
  forceLook: [number, number] | null;
  file: { t: number } | null;
  sway: { a: number; w: number; t0: number; dur: number } | null;
  vsx: number;
  vsy: number;
  vrot: number;
  rng(): number;
}

export interface EmitOpts {
  vx?: number;
  vy?: number;
  ay?: number;
  drag?: number;
  rot?: number;
  vr?: number;
  life?: number;
  sc?: number;
  wob?: number;
  back?: boolean;
  v?: number;
  side?: number;
  r?: number;
  grad?: string;
  dir?: number;
  len?: number;
  s?: number;
}

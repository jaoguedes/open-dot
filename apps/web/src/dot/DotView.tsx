// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import { useEffect, useId, useRef, type PointerEvent, type KeyboardEvent } from "react";
import type { Accessory, AgentVisual, SemanticState } from "@open-dot/core";
import { DotEngine, bodyPalette, bodyPath, type AccessoryKind, type DotFrame, type DotMood, type DotStateKey, type DotTint, type ParticleFrame } from "@open-dot/core/dot/index.ts";
import { EYE, INK_COLOR, artDefs, badgeInner, heartPath, star4 } from "./art.ts";
import { CROWN_UNLOCKED, accLayout } from "./accessories.ts";
import { subscribe, type TickerHandle } from "./ticker.ts";

const ACC_MAP: Record<Accessory | "ring", AccessoryKind> = {
  none: "none",
  mail_cap: "cap",
  glasses: "glasses",
  headphones: "phones",
  ring: "ring",
  beanie: "beanie",
  bucket: "bucket",
  crown: "crown",
  antenna: "antenna",
  visor: "visor",
  beret: "beret",
};

const STATE_MAP: Record<SemanticState, DotStateKey | "react-success"> = {
  idle: "idle",
  thinking: "thinking",
  working: "working",
  waiting: "waiting",
  question: "question",
  error: "error",
  disconnected: "disconnected",
  sleep: "sleep",
  success: "react-success",
};

export interface DotViewProps {
  visual: AgentVisual;
  accessory: Accessory | "ring";
  size: number;
  reducedMotion: boolean;
  absorbing?: boolean;
  affectionSignal?: number;
  onAffection?: (r: "ok" | "cooldown" | "suppressed" | "hidden") => void;
  interactive?: boolean;
  small?: boolean;
  label?: string;
  /** Sentinela: anel só enquanto verifica. */
  ring?: boolean;
  /** Reação "oi" na montagem (splash). Com movimento reduzido o motor ignora a linha do tempo. */
  hello?: boolean;
  /** Antena: pisca só quando chega notícia importante. */
  antennaPulse?: boolean;
  /** Cor interna do agente (D-027). Ausente = Dot original. */
  tint?: DotTint;
  /** Calor/esforço medido 0..1 (D-028). Só a partir de estado real. */
  heat?: number;
  /** Carga no limite 0..1 (D-028). Só a partir de estado real. */
  strain?: number;
  /** Olhos acompanham o ponteiro/foco enquanto a janela está visível e focada (D-028). */
  followPointer?: boolean;
  /** Motivo real da reação, mostrado ao passar o mouse ou no foco ("CPU 92% há 1 min"). */
  reason?: string;
}

const GAZE_FRAME_MS = 33;

function resolveAcc(a: Accessory | "ring"): AccessoryKind {
  if (a === "crown" && !CROWN_UNLOCKED) return "none";
  return ACC_MAP[a];
}

function applyHats(svg: SVGSVGElement, acc: ReturnType<typeof accLayout>, pulse: boolean): void {
  set(q(svg, "cap-face"), "d", acc.cap.faceShadow);
  set(q(svg, "cap-face"), "opacity", acc.cap.on ? 0.3 : 0);
  set(q(svg, "bn"), "opacity", acc.beanie.on);
  if (acc.beanie.on) {
    set(q(svg, "bn-clip"), "d", acc.beanie.crown);
    set(q(svg, "bn-bandClip"), "d", acc.beanie.band);
    set(q(svg, "bn-face"), "d", acc.beanie.faceShadow);
    set(q(svg, "bn-crown"), "d", acc.beanie.crown);
    set(q(svg, "bn-ribs"), "d", acc.beanie.ribs);
    set(q(svg, "bn-ribs2"), "d", acc.beanie.ribs);
    set(q(svg, "bn-band"), "d", acc.beanie.band);
    set(q(svg, "bn-bandBot"), "d", acc.beanie.bandBot);
    set(q(svg, "bn-bandRibs"), "d", acc.beanie.bandRibs);
    set(q(svg, "bn-bandRibs2"), "d", acc.beanie.bandRibs);
    set(q(svg, "bn-bandHi"), "d", acc.beanie.bandHi);
    acc.beanie.ears.forEach((ear, i) => {
      set(q(svg, `bn-ear${i}`), "d", ear.d);
      set(q(svg, `bn-earIn${i}`), "d", ear.inner);
      set(q(svg, `bn-earSt${i}`), "d", ear.stitch);
    });
  }
  set(q(svg, "bk"), "opacity", acc.bucket.on);
  if (acc.bucket.on) {
    set(q(svg, "bk-clip"), "d", acc.bucket.crown);
    set(q(svg, "bk-fclip"), "d", acc.bucket.frontClip);
    set(q(svg, "bk-crown"), "d", acc.bucket.crown);
    set(q(svg, "bk-ribs"), "d", acc.bucket.ribs);
    set(q(svg, "bk-ribs2"), "d", acc.bucket.ribs);
    set(q(svg, "bk-front"), "d", acc.bucket.front);
    set(q(svg, "bk-radial"), "d", acc.bucket.radial);
    set(q(svg, "bk-rim"), "d", acc.bucket.rim);
  }
  set(q(svg, "vs"), "opacity", acc.visor.on);
  if (acc.visor.on) {
    set(q(svg, "vs-band"), "d", acc.visor.band);
    set(q(svg, "vs-band2"), "d", acc.visor.band);
    set(q(svg, "vs-visor"), "d", acc.visor.visor);
    set(q(svg, "vs-visorU"), "d", acc.visor.visorUnder);
    set(q(svg, "vs-hi"), "d", acc.visor.hi);
    set(q(svg, "vs-face"), "d", acc.visor.faceShadow);
  }
  set(q(svg, "br"), "opacity", acc.beret.on);
  if (acc.beret.on) {
    set(q(svg, "br-dome"), "d", acc.beret.dome);
    set(q(svg, "br-rim"), "d", acc.beret.rim);
    set(q(svg, "br-stem"), "d", acc.beret.stem);
    set(q(svg, "br-face"), "d", acc.beret.faceShadow);
  }
  const ant = q(svg, "antenna");
  set(ant, "opacity", acc.antenna.on);
  if (acc.antenna.on) {
    set(q(svg, "ant-base"), "cx", acc.antenna.baseX);
    set(q(svg, "ant-base"), "cy", acc.antenna.baseY + 1);
    set(q(svg, "ant-base2"), "cx", acc.antenna.baseX);
    set(q(svg, "ant-base2"), "cy", acc.antenna.baseY - 0.5);
    set(q(svg, "ant-sh"), "cx", acc.antenna.baseX);
    set(q(svg, "ant-sh"), "cy", acc.antenna.baseY + 4);
    set(q(svg, "ant-stem"), "d", acc.antenna.stem);
    set(q(svg, "ant-bulb"), "cx", acc.antenna.bulbX);
    set(q(svg, "ant-bulb"), "cy", acc.antenna.bulbY);
    set(q(svg, "ant-pulse"), "cx", acc.antenna.bulbX);
    set(q(svg, "ant-pulse"), "cy", acc.antenna.bulbY);
    ant.classList.toggle("pulse", pulse);
  } else ant.classList.remove("pulse");
  set(q(svg, "gold"), "opacity", acc.gold.on);
  if (acc.gold.on) {
    set(q(svg, "gold"), "transform", acc.gold.group);
    set(q(svg, "gold-back"), "d", acc.gold.back);
    set(q(svg, "gold-front"), "d", acc.gold.front);
    set(q(svg, "gold-band"), "d", acc.gold.band);
    set(q(svg, "gold-bandHi"), "d", acc.gold.bandHi);
    acc.gold.tips.forEach((t, i) => {
      set(q(svg, `gold-tip${i}`), "cx", t.cx);
      set(q(svg, `gold-tip${i}`), "cy", t.cy);
    });
    acc.gold.gems.forEach((g, i) => {
      set(q(svg, `gold-gem${i}`), "cx", g.cx);
      set(q(svg, `gold-gem${i}`), "cy", g.cy);
      set(q(svg, `gold-gem${i}`), "rx", g.rx);
      set(q(svg, `gold-gem${i}`), "ry", g.ry);
    });
  }
}

function q(svg: SVGSVGElement, role: string): SVGElement {
  return svg.querySelector(`[data-r="${role}"]`) as SVGElement;
}

function set(el: Element | null, attr: string, v: string | number): void {
  if (el) el.setAttribute(attr, String(v));
}

function apply(svg: SVGSVGElement, uid: string, f: DotFrame, pulse: boolean, glow = "rgb(63,123,255)"): void {
  // Iluminação original de repouso; com cor de agente (D-027), o brilho vira a cor do agente.
  svg.style.setProperty("--g", glow);
  svg.style.setProperty("--t", "#EDE8FC");
  svg.setAttribute("aria-label", f.ariaLabel);
  const d = bodyPath(f.m);
  set(q(svg, "body"), "d", d);
  set(q(svg, "clip"), "d", d);
  set(q(svg, "rim"), "d", d);
  set(q(svg, "fig"), "transform", `translate(${f.shakeX} ${-f.lift}) translate(130 177) rotate(${f.rot}) scale(${f.sx} ${f.sy}) translate(-130 -177)`);
  set(q(svg, "ground"), "rx", f.groundRx);
  set(q(svg, "ground"), "opacity", f.groundOp);
  set(q(svg, "contact"), "rx", f.contactRx);
  set(q(svg, "contact"), "opacity", f.contactOp);
  set(q(svg, "tint"), "cy", f.tintCy);
  set(q(svg, "tint"), "ry", f.tintRy);
  set(q(svg, "tint"), "rx", f.tintRx);
  set(q(svg, "tint"), "opacity", 0);
  set(q(svg, "slot"), "opacity", f.slotOpacity);
  set(q(svg, "spec"), "cx", f.specCx);
  set(q(svg, "spec2"), "cx", f.spec2Cx);
  q(svg, "fig").removeAttribute("filter");
  q(svg, "fig").setAttribute("opacity", "1");

  f.eyes.forEach((eye, i) => {
    const ga = q(svg, `eyeA${i}`),
      gb = q(svg, `eyeB${i}`);
    const pa = q(svg, `eyeAd${i}`),
      pb = q(svg, `eyeBd${i}`);
    const gr = eye.grow ?? 1;
    const trA = `translate(${eye.x} ${eye.y}) scale(${eye.fx * gr} ${eye.blink * gr}) rotate(${eye.spinDeg})`;
    const trB = `translate(${eye.x} ${eye.y}) scale(${eye.fx * gr} ${gr}) rotate(${eye.spinDeg})`;
    set(ga, "transform", trA);
    set(gb, "transform", trB);
    set(ga, "opacity", (eye.next ? 1 - eye.p : 1) * eye.vis);
    set(gb, "opacity", (eye.next ? eye.p : 0) * eye.vis);
    set(pa, "d", EYE[eye.shape]());
    if (eye.next) set(pb, "d", EYE[eye.next]());
    const glint = svg.querySelector(`[data-r="glint${i}"]`);
    if (glint) {
      set(glint, "transform", `translate(${eye.x - 2 * gr} ${eye.y - 5 * gr})`);
      set(glint, "opacity", (eye.glint ?? 0) * eye.vis * eye.blink);
    }
  });
  f.cheeks.forEach((c, i) => {
    const el = q(svg, `cheek${i}`);
    set(el, "cx", c.x);
    set(el, "cy", c.y);
    set(el, "rx", c.rx);
    if (c.ry !== undefined) set(el, "ry", c.ry);
    set(el, "opacity", c.opacity);
  });
  for (let i = 0; i < 2; i++) {
    const drop = svg.querySelector(`[data-r="sweat${i}"]`);
    if (!drop) break;
    const d = f.sweat?.[i];
    set(drop, "transform", d ? `translate(${d.x} ${d.y}) scale(${d.s})` : "");
    set(drop, "opacity", d ? d.opacity : 0);
  }

  const ind = q(svg, "ind");
  set(ind, "transform", `translate(${f.ind.x} ${f.ind.y}) scale(${f.ind.scale}) rotate(${f.ind.rot})`);
  for (const k of ["balls", "bang", "x", "dot", "heart", "spiral", "question", "check"] as const) {
    set(q(svg, `ind-${k}`), "opacity", f.ind.kind === k ? 1 : 0);
  }
  f.ind.balls.forEach((b, i) => set(q(svg, `ball${i}`), "transform", `translate(${b[0]} ${b[1]})`));
  const ck = svg.querySelector(`[data-r="ck"]`);
  if (ck) set(ck, "stroke-dashoffset", f.ind.checkDash);

  f.waves.forEach((w, i) => {
    const el = q(svg, `wave${i}`);
    set(el, "transform", `translate(${w.x} ${w.y}) scale(${w.sc})`);
    set(el, "opacity", w.opacity);
  });

  f.hands.forEach((h, i) => {
    const el = q(svg, `hand${i}`);
    set(el, "transform", `translate(${h.x} ${h.y}) rotate(${h.rot} 0 12) scale(${h.scale})`);
    set(el, "opacity", h.opacity);
  });

  const file = q(svg, "file");
  if (f.file) {
    set(file, "transform", `translate(${f.file.x} ${f.file.y}) rotate(${f.file.rot}) scale(${f.file.sx} ${f.file.sy})`);
    set(file, "opacity", f.file.opacity);
  } else set(file, "opacity", 0);

  const pool = svg.querySelectorAll("[data-part]");
  pool.forEach((el, i) => {
    const p = f.particles[i];
    if (!p) {
      set(el, "opacity", 0);
      return;
    }
    set(el, "transform", `translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.sc})`);
    set(el, "opacity", p.opacity);
    const use = el.querySelector("use");
    if (use) use.setAttribute("href", `#${uid}-p-${partId(p.kind, p)}`);
  });

  const acc = accLayout(f);
  set(q(svg, "accSpin"), "transform", f.accSpinTx ? `translate(${f.accSpinTx} 0) scale(${f.accSpinSc} 1) translate(-130 0)` : "");
  set(q(svg, "accSpin"), "opacity", f.accSpinOp);

  set(q(svg, "cap"), "opacity", acc.cap.on);
  if (acc.cap.on) {
    set(q(svg, "cap-crown"), "d", acc.cap.crown);
    set(q(svg, "cap-seams"), "d", acc.cap.seams);
    set(q(svg, "cap-visor"), "d", acc.cap.visor);
    set(q(svg, "cap-visorU"), "d", acc.cap.visorUnder);
    set(q(svg, "cap-visorH"), "d", acc.cap.visorHi);
    set(q(svg, "cap-band"), "d", acc.cap.band);
    set(q(svg, "cap-bandS"), "d", acc.cap.bandShadow);
    set(q(svg, "cap-visorS"), "d", acc.cap.visorShadow);
    set(q(svg, "cap-btn"), "cx", acc.cap.apexX);
    set(q(svg, "cap-btn"), "cy", acc.cap.apexY);
  }
  set(q(svg, "glasses"), "opacity", acc.glasses.on);
  if (acc.glasses.on) {
    set(q(svg, "gl0"), "transform", `translate(${acc.glasses.l0x} ${acc.glasses.l0y}) scale(${acc.glasses.l0fx} 1)`);
    set(q(svg, "gl1"), "transform", `translate(${acc.glasses.l1x} ${acc.glasses.l1y}) scale(${acc.glasses.l1fx} 1)`);
    set(q(svg, "g-bridge"), "d", acc.glasses.bridge);
    set(q(svg, "g-temples"), "d", acc.glasses.temples);
    set(q(svg, "g-pad0"), "cx", acc.glasses.l0x + 11 * acc.glasses.l0fx);
    set(q(svg, "g-pad0"), "cy", acc.glasses.l0y + 7);
    set(q(svg, "g-pad1"), "cx", acc.glasses.l1x - 11 * acc.glasses.l1fx);
    set(q(svg, "g-pad1"), "cy", acc.glasses.l1y + 7);
  }
  set(q(svg, "phones"), "opacity", acc.phones.on);
  if (acc.phones.on) {
    set(q(svg, "ph-in"), "d", acc.phones.bandIn);
    set(q(svg, "ph-mid"), "d", acc.phones.bandMid);
    set(q(svg, "ph-top"), "d", acc.phones.bandTop);
    set(q(svg, "ph-sh"), "d", acc.phones.bandShadow);
    acc.phones.cups.forEach((c, i) => {
      set(q(svg, `ph-cup${i}`), "transform", `translate(${c.cx} ${c.cy})`);
      set(q(svg, `ph-hinge${i}`), "d", c.hinge);
      set(q(svg, `ph-cush${i}`), "cx", c.cx - c.side * 2);
      set(q(svg, `ph-cush${i}`), "cy", c.cy);
      set(q(svg, `ph-shell${i}`), "cx", c.cx + c.side * 5);
      set(q(svg, `ph-shell${i}`), "cy", c.cy);
      set(q(svg, `ph-plate${i}`), "cx", c.cx + c.side * 7.5);
      set(q(svg, `ph-plate${i}`), "cy", c.cy - 1);
    });
  }
  applyHats(svg, acc, pulse);

  set(q(svg, "ringBack"), "opacity", acc.ring.on);
  set(q(svg, "ringFront"), "opacity", acc.ring.on);
  if (acc.ring.on) {
    set(q(svg, "ringB"), "d", acc.ring.back);
    set(q(svg, "ringF"), "d", acc.ring.front);
    set(q(svg, "ringShine"), "d", acc.ring.front);
    set(q(svg, "ringShine"), "stroke-dashoffset", acc.ring.dash);
  }
}

function partId(kind: ParticleFrame["kind"], p: Pick<ParticleFrame, "back" | "variant" | "side" | "grad" | "dir">): string {
  if (kind === "heart") return p.back ? "heartB" : "heart";
  if (kind === "cloud") return p.variant === 2 ? "cloud2" : "cloud1";
  if (kind === "spark") return p.grad ? "sparkB" : "sparkY";
  if (kind === "spiral") return p.dir < 0 ? "spiralN" : "spiralP";
  if (kind === "wave") return p.side < 0 ? "waveL" : "waveR";
  return kind;
}

export function DotView(props: DotViewProps) {
  const uid = useId().replace(/:/g, "");
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const eng = useRef<DotEngine | null>(null);
  const clicks = useRef<number[]>([]);
  const lastAff = useRef(props.affectionSignal ?? 0);
  const lastAbs = useRef(false);
  const lastSem = useRef<SemanticState | null>(null);
  const tickRef = useRef<TickerHandle | null>(null);
  const pulseRef = useRef(!!props.antennaPulse);
  pulseRef.current = !!props.antennaPulse;
  const moodOn = props.heat !== undefined || props.strain !== undefined || !!props.followPointer;
  const palette = props.tint ? bodyPalette(props.tint) : null;
  const glowRef = useRef<string | undefined>(undefined);
  glowRef.current = palette?.glow;
  const gazeRef = useRef<[number, number] | null>(null);
  const moodRef = useRef<DotMood | null>(null);
  moodRef.current = moodOn ? { gaze: gazeRef.current, heat: props.heat ?? 0, strain: props.strain ?? 0 } : null;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const engine = new DotEngine({ reducedMotion: props.reducedMotion });
    eng.current = engine;
    const acc = props.ring ? "ring" : resolveAcc(props.accessory);
    engine.setAccessory(acc);
    const map = STATE_MAP[props.visual.semantic];
    if (map === "react-success") engine.react("success");
    else engine.setState(map, true);
    lastSem.current = props.visual.semantic;
    if (props.hello) engine.react("oi");
    if (moodRef.current) engine.setMood(moodRef.current);
    apply(svg, uid, engine.frame(), pulseRef.current, glowRef.current);

    const tick = subscribe(
      (dt) => {
        engine.step(dt);
        apply(svg, uid, engine.frame(), pulseRef.current, glowRef.current);
        if (props.small && !engine.reaction) {
          const f = engine.frame();
          if (Math.abs(f.sx - 1) < 0.01 && Math.abs(f.m) < 0.02) tick.setActive(false);
        }
      },
      { small: props.small },
    );
    tickRef.current = tick;

    const io = wrap.current && "IntersectionObserver" in window ? new IntersectionObserver((ents) => tick.setVisible(!!ents[0]?.isIntersecting), { threshold: 0.01 }) : null;
    if (io && wrap.current) io.observe(wrap.current);

    return () => {
      tick.stop();
      tickRef.current = null;
      io?.disconnect();
      eng.current = null;
    };
    // motor vive pela vida do componente; reducedMotion só na criação
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, props.reducedMotion, props.small]);

  useEffect(() => {
    const e = eng.current;
    if (!e) return;
    const sem = props.visual.semantic;
    if (sem !== lastSem.current) {
      lastSem.current = sem;
      const map = STATE_MAP[sem];
      if (map === "react-success") e.react("success");
      else e.setState(map);
    }
    e.setAccessory(props.ring ? "ring" : resolveAcc(props.accessory));
    clicks.current = [];
    tickRef.current?.setVisible(true);
    tickRef.current?.setActive(true);
    const svg = svgRef.current;
    if (svg) apply(svg, uid, e.frame(), pulseRef.current, glowRef.current);
  }, [props.visual.semantic, props.accessory, props.ring, uid]);

  useEffect(() => {
    const e = eng.current;
    if (!e || props.affectionSignal === undefined || props.affectionSignal === lastAff.current) return;
    lastAff.current = props.affectionSignal;
    if (!props.visual.allowCosmetic) {
      props.onAffection?.("suppressed");
      return;
    }
    const r = e.react("love");
    if (r === "ok") {
      tickRef.current?.setVisible(true);
      tickRef.current?.setActive(true);
      e.step(0.3);
      const svg = svgRef.current;
      if (svg) apply(svg, uid, e.frame(), pulseRef.current, glowRef.current);
    }
    props.onAffection?.(r === "ok" ? "ok" : r === "cooldown" ? "cooldown" : "suppressed");
  }, [props.affectionSignal, props.visual.allowCosmetic, props.onAffection, uid]);

  useEffect(() => {
    const e = eng.current;
    if (!e) return;
    if (props.absorbing && !lastAbs.current) {
      e.react("absorb");
      tickRef.current?.setActive(true);
    }
    lastAbs.current = !!props.absorbing;
  }, [props.absorbing]);

  useEffect(() => {
    const e = eng.current;
    if (!e) return;
    e.setMood(moodRef.current);
    if (moodRef.current) {
      tickRef.current?.setVisible(true);
      tickRef.current?.setActive(true);
    }
  }, [moodOn, props.heat, props.strain]);

  // Olhar (D-028): só com a janela visível e focada, no máximo ~30 quadros/s, e nada de listener
  // com movimento reduzido ou janela oculta. Sair da janela devolve os olhos ao centro.
  useEffect(() => {
    if (!props.followPointer || props.reducedMotion) return;
    let last = 0;
    let listening = false;
    const aim = (x: number, y: number) => {
      const box = wrap.current?.getBoundingClientRect();
      const e = eng.current;
      if (!box || !e) return;
      const dx = (x - (box.left + box.width / 2)) / Math.max(240, box.width * 2);
      const dy = (y - (box.top + box.height * 0.55)) / Math.max(200, box.height * 2);
      gazeRef.current = [Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy))];
      e.setMood({ ...(moodRef.current ?? {}), gaze: gazeRef.current });
      tickRef.current?.setActive(true);
    };
    const center = () => {
      gazeRef.current = null;
      eng.current?.setMood({ ...(moodRef.current ?? {}), gaze: null });
    };
    const onPointer = (ev: globalThis.PointerEvent) => {
      const now = performance.now();
      if (now - last < GAZE_FRAME_MS) return;
      last = now;
      aim(ev.clientX, ev.clientY);
    };
    const onFocus = (ev: FocusEvent) => {
      const el = ev.target instanceof Element ? ev.target.getBoundingClientRect() : null;
      if (el && el.width + el.height > 0) aim(el.left + el.width / 2, el.top + el.height / 2);
    };
    const start = () => {
      if (listening || document.visibilityState !== "visible" || !document.hasFocus()) return;
      listening = true;
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("focusin", onFocus);
    };
    const stop = () => {
      if (listening) {
        window.removeEventListener("pointermove", onPointer);
        document.removeEventListener("focusin", onFocus);
      }
      listening = false;
      center();
    };
    const onVis = () => (document.visibilityState === "visible" && document.hasFocus() ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", start);
    window.addEventListener("blur", stop);
    document.documentElement.addEventListener("pointerleave", center);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", start);
      window.removeEventListener("blur", stop);
      document.documentElement.removeEventListener("pointerleave", center);
    };
  }, [props.followPointer, props.reducedMotion]);

  const onMove = (ev: PointerEvent<HTMLDivElement>) => {
    const e = eng.current,
      box = wrap.current?.getBoundingClientRect();
    if (!e || !box || !props.interactive) return;
    const cx = box.left + box.width / 2,
      cy = box.top + box.height * 0.55;
    const x = Math.max(-1, Math.min(1, (ev.clientX - cx) / (box.width * 0.55))) * 0.3;
    const y = Math.max(-1, Math.min(1, -(ev.clientY - cy) / (box.height * 0.6))) * 0.18;
    e.look(x, y);
  };
  const onTap = () => {
    const e = eng.current;
    if (!e || !props.interactive) return;
    const now = performance.now();
    clicks.current = clicks.current.filter((t) => now - t < 900);
    clicks.current.push(now);
    if (clicks.current.length >= 3) {
      clicks.current = [];
      e.react("dizzy");
    } else {
      e.react("poke");
    }
    tickRef.current?.setVisible(true);
    tickRef.current?.setActive(true);
    e.step(1 / 60);
    const svg = svgRef.current;
    if (svg) apply(svg, uid, e.frame(), pulseRef.current, glowRef.current);
  };

  const label = props.reason ? `${props.label ?? props.visual.label}. ${props.reason}` : (props.label ?? `${props.visual.label}`);
  return (
    <div
      ref={wrap}
      className="dot-view"
      data-dot-renderer="engine"
      style={{ width: props.size, cursor: props.interactive ? "pointer" : undefined, touchAction: "manipulation" }}
      title={props.reason}
      onPointerMove={onMove}
      onClick={props.interactive ? onTap : undefined}
      onKeyDown={
        props.interactive
          ? (ev: KeyboardEvent<HTMLDivElement>) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onTap();
              }
            }
          : undefined
      }
      role={props.interactive ? "button" : undefined}
      tabIndex={props.interactive ? 0 : undefined}
    >
      <svg
        ref={svgRef}
        className="dot-svg"
        data-small={props.small ? "1" : "0"}
        viewBox="0 0 260 220"
        width={props.size}
        height={(props.size * 220) / 260}
        role="img"
        aria-label={label}
        style={{ overflow: "visible", display: "block" }}
      >
        <defs>
          <g dangerouslySetInnerHTML={{ __html: palette ? artDefs(uid, palette) : artDefs(uid) }} />
          <clipPath id={`${uid}-clip`}>
            <path data-r="clip" d={bodyPath(0)} />
          </clipPath>
          <clipPath id={`${uid}-bnC`}>
            <path data-r="bn-clip" />
          </clipPath>
          <clipPath id={`${uid}-bnB`}>
            <path data-r="bn-bandClip" />
          </clipPath>
          <clipPath id={`${uid}-bkC`}>
            <path data-r="bk-clip" />
          </clipPath>
          <clipPath id={`${uid}-bkF`}>
            <path data-r="bk-fclip" />
          </clipPath>
          <g id={`${uid}-p-heart`}>
            <path d={heartPath()} fill={`url(#${uid}-gHeart)`} />
          </g>
          <g id={`${uid}-p-heartB`}>
            <path d={heartPath()} fill={`url(#${uid}-gHeartBack)`} opacity="0.8" />
          </g>
          <g id={`${uid}-p-cloud1`}>
            <circle cx="-5.5" cy="0" r="5" fill={`url(#${uid}-gCloud)`} />
            <circle cx=".5" cy="-4" r="5.2" fill={`url(#${uid}-gCloud)`} />
            <circle cx="6" cy="1" r="4.2" fill={`url(#${uid}-gCloud)`} />
            <circle cx="0" cy="3.2" r="4.6" fill={`url(#${uid}-gCloud)`} />
          </g>
          <g id={`${uid}-p-cloud2`}>
            <circle cx="-6" cy="1" r="4.6" fill={`url(#${uid}-gCloud)`} />
            <circle cx="0" cy="-3.4" r="5.6" fill={`url(#${uid}-gCloud)`} />
            <circle cx="6" cy="-.4" r="4.8" fill={`url(#${uid}-gCloud)`} />
            <circle cx="1" cy="3" r="4.4" fill={`url(#${uid}-gCloud)`} />
          </g>
          <g id={`${uid}-p-sparkY`} dangerouslySetInnerHTML={{ __html: star4(5, `url(#${uid}-gStarY)`) }} />
          <g id={`${uid}-p-sparkB`} dangerouslySetInnerHTML={{ __html: star4(5, `url(#${uid}-gStarB)`) }} />
          <g id={`${uid}-p-square`}>
            <rect x="-2.9" y="-2.9" width="5.8" height="5.8" rx="1.7" fill={`url(#${uid}-gSquare)`} />
          </g>
          <g id={`${uid}-p-z`}>
            <path d="M-4 -4.5 L4 -4.5 L-4 4.5 L4.4 4.5" fill="none" stroke={`url(#${uid}-gZ)`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g id={`${uid}-p-spiralP`}>
            <path d={EYE.spiralL()} fill={`url(#${uid}-gPinkS)`} />
          </g>
          <g id={`${uid}-p-spiralN`}>
            <path d={EYE.spiralR()} fill={`url(#${uid}-gPurple)`} />
          </g>
          <g id={`${uid}-p-ray`}>
            <path d="M0 0 L0 -6" stroke={`url(#${uid}-gRed)`} strokeWidth="3" strokeLinecap="round" />
          </g>
          <g id={`${uid}-p-ryellow`}>
            <path d="M0 0 L0 -9" stroke={`url(#${uid}-gStarY)`} strokeWidth="3.6" strokeLinecap="round" />
          </g>
          <g id={`${uid}-p-waveL`}>
            <path d="M0 -10 Q-7 0 0 10" fill="none" stroke={`url(#${uid}-gWave)`} strokeWidth="3.8" strokeLinecap="round" />
          </g>
          <g id={`${uid}-p-waveR`}>
            <path d="M0 -10 Q7 0 0 10" fill="none" stroke={`url(#${uid}-gWave)`} strokeWidth="3.8" strokeLinecap="round" />
          </g>
          <g id={`${uid}-p-drop`}>
            <path d="M0 -6 C 3 -1, 4 2, 0 5 C -4 2, -3 -1, 0 -6 Z" fill={`url(#${uid}-gDrop)`} />
          </g>
        </defs>
        <ellipse data-r="ground" cx="130" cy="178" rx="104" ry="16" fill={`url(#${uid}-eGlow)`} filter={`url(#${uid}-odB12)`} />
        <ellipse data-r="contact" cx="130" cy="177.5" rx="78" ry="5.5" fill={`url(#${uid}-eShadow)`} />
        <g data-r="ringBack" opacity="0">
          <path data-r="ringB" fill="none" stroke="#1C9C7A" strokeWidth="3.4" opacity="0.8" />
        </g>
        <g data-r="waves">
          {[0, 1, 2, 3].map((i) => (
            <g key={i} data-r={`wave${i}`} opacity="0">
              <use href={`#${uid}-p-wave${i < 2 ? "L" : "R"}`} />
            </g>
          ))}
        </g>
        <g data-r="fig">
          <path data-r="body" d={bodyPath(0)} fill={`url(#${uid}-eBody)`} stroke="rgba(130,128,200,.35)" strokeWidth="1" />
          <g clipPath={`url(#${uid}-clip)`}>
            <ellipse data-r="tint" cx="130" cy="168" rx="120" ry="60" fill={`url(#${uid}-eTint)`} opacity="0" />
            <ellipse cx="130" cy="196" rx="104" ry="30" fill={`url(#${uid}-eGlow)`} opacity="0.55" />
            <rect x="47" y="49" width="166" height="128" fill={`url(#${uid}-eEdge)`} />
            <rect x="47" y="49" width="166" height="128" fill={`url(#${uid}-eKey)`} />
            <ellipse data-r="spec" cx="112" cy="76" rx="60" ry="17" fill={`url(#${uid}-eSpec)`} />
            <ellipse data-r="spec2" cx="98" cy="71" rx="15" ry="4.5" fill={`url(#${uid}-eSpec)`} />
            <path data-r="rim" d={bodyPath(0)} fill="none" strokeWidth="6" opacity="0.35" mask={`url(#${uid}-odLower)`} filter={`url(#${uid}-odB3)`} style={{ stroke: "var(--g)" }} />
          </g>
          <g data-r="slot" opacity="0">
            <rect x="106" y="57" width="48" height="12" rx="6" style={{ fill: "var(--g)" }} opacity="0.6" filter={`url(#${uid}-odB3)`} />
            <rect x="111" y="60" width="38" height="7" rx="3.5" fill="#232A6B" />
            <rect x="114" y="62" width="32" height="3" rx="1.5" fill="#8FD8FF" />
          </g>
          <ellipse data-r="cheek0" rx="13" ry="8" fill={`url(#${uid}-odCheek)`} />
          <ellipse data-r="cheek1" rx="13" ry="8" fill={`url(#${uid}-odCheek)`} />
          <g data-r="eyeA0">
            <path data-r="eyeAd0" fill={INK_COLOR} />
          </g>
          <g data-r="eyeB0" opacity="0">
            <path data-r="eyeBd0" fill={INK_COLOR} />
          </g>
          <g data-r="eyeA1">
            <path data-r="eyeAd1" fill={INK_COLOR} />
          </g>
          <g data-r="eyeB1" opacity="0">
            <path data-r="eyeBd1" fill={INK_COLOR} />
          </g>
          {moodOn &&
            [0, 1].map((i) => (
              <g key={`m${i}`}>
                <ellipse data-r={`glint${i}`} rx="2.2" ry="3" fill="#FFFFFF" opacity="0" />
                <g data-r={`sweat${i}`} opacity="0">
                  <path d="M0 -9C3 -4 6 -1 6 3A6 6 0 0 1 -6 3C-6 -1 -3 -4 0 -9Z" fill="#8FD3FF" stroke="#5FB4F0" strokeWidth="1" />
                  <ellipse cx="-2" cy="2" rx="1.6" ry="2.4" fill="#FFFFFF" opacity="0.8" />
                </g>
              </g>
            ))}
          <g data-r="accSpin">
            <g data-r="ao">
              <path data-r="cap-bandS" fill="none" stroke="#4E46A8" strokeWidth="9" opacity="0.3" />
              <path data-r="cap-visorS" fill="none" stroke="#262B74" strokeWidth="13" opacity="0.3" />
              <path data-r="ph-sh" fill="none" stroke="#3E2F9C" strokeWidth="9" opacity="0.3" />
            </g>
            <g data-r="cap" opacity="0">
              <path data-r="cap-crown" fill={`url(#${uid}-aCrown)`} />
              <path data-r="cap-seams" fill="none" stroke="#D2CBF2" strokeWidth="1.15" strokeLinecap="round" />
              <circle data-r="cap-btn" r="4.2" fill={`url(#${uid}-aBtn)`} />
              <path data-r="cap-band" fill="none" stroke="#BEB6EC" strokeWidth="3.2" strokeLinecap="round" />
              <path data-r="cap-visorU" fill="#2C4BB0" transform="translate(0 2.6)" />
              <path data-r="cap-visor" fill={`url(#${uid}-aVisor)`} />
              <path data-r="cap-visorH" fill="none" stroke="#2F52BC" strokeWidth="1.4" opacity="0.55" />
            </g>
            <g data-r="glasses" opacity="0">
              <path data-r="g-temples" fill="none" stroke="#2A2850" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
              <g data-r="gl0">
                <circle r="14.2" fill={`url(#${uid}-aLens)`} />
                <circle r="15" fill="none" stroke={`url(#${uid}-aFrame)`} strokeWidth="3.6" />
              </g>
              <g data-r="gl1">
                <circle r="14.2" fill={`url(#${uid}-aLens)`} />
                <circle r="15" fill="none" stroke={`url(#${uid}-aFrame)`} strokeWidth="3.6" />
              </g>
              <path data-r="g-bridge" fill="none" stroke={`url(#${uid}-aFrame)`} strokeWidth="3.2" strokeLinecap="round" />
              <ellipse data-r="g-pad0" rx="1.6" ry="2.4" fill="#D9D3FA" />
              <ellipse data-r="g-pad1" rx="1.6" ry="2.4" fill="#D9D3FA" />
            </g>
            <g data-r="phones" opacity="0">
              <path data-r="ph-in" fill="none" stroke="#9A80EF" strokeWidth="3.2" strokeLinecap="round" />
              <path data-r="ph-mid" fill="none" stroke={`url(#${uid}-aBand)`} strokeWidth="8.5" strokeLinecap="round" />
              <path data-r="ph-top" fill="none" stroke="#F3EEFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
              <path data-r="ph-hinge0" fill="none" stroke="#7E60E2" strokeWidth="5" strokeLinecap="round" />
              <path data-r="ph-hinge1" fill="none" stroke="#7E60E2" strokeWidth="5" strokeLinecap="round" />
              <ellipse data-r="ph-cush0" rx="6.5" ry="19.5" fill={`url(#${uid}-aCushL)`} />
              <ellipse data-r="ph-cush1" rx="6.5" ry="19.5" fill={`url(#${uid}-aCushR)`} />
              <ellipse data-r="ph-shell0" rx="11" ry="21.5" fill={`url(#${uid}-aCup)`} />
              <ellipse data-r="ph-shell1" rx="11" ry="21.5" fill={`url(#${uid}-aCup)`} />
              <ellipse data-r="ph-plate0" rx="6.5" ry="14.5" fill={`url(#${uid}-aPlate)`} />
              <ellipse data-r="ph-plate1" rx="6.5" ry="14.5" fill={`url(#${uid}-aPlate)`} />
              <g data-r="ph-cup0" />
              <g data-r="ph-cup1" />
            </g>
            <path data-r="cap-face" fill="#2A2470" opacity="0.3" clipPath={`url(#${uid}-clip)`} />
            <g data-r="bn" opacity="0">
              <path data-r="bn-face" fill="#2A2470" opacity="0.45" clipPath={`url(#${uid}-clip)`} />
              <path data-r="bn-ear0" fill="#8FB0E6" />
              <path data-r="bn-earIn0" fill="#C9DAF7" />
              <path data-r="bn-earSt0" fill="none" stroke="#3F5FA8" strokeOpacity="0.3" strokeWidth="1.4" />
              <path data-r="bn-ear1" fill="#8FB0E6" />
              <path data-r="bn-earIn1" fill="#C9DAF7" />
              <path data-r="bn-earSt1" fill="none" stroke="#3F5FA8" strokeOpacity="0.3" strokeWidth="1.4" />
              <path data-r="bn-crown" fill="#8FB0E6" />
              <g clipPath={`url(#${uid}-bnC)`} fill="none" strokeLinecap="round">
                <path data-r="bn-ribs" stroke="#ADC7F1" strokeWidth="3.4" />
                <path data-r="bn-ribs2" stroke="#7397D6" strokeWidth="0.9" transform="translate(3.2 0)" />
                <rect x="30" y="0" width="200" height="110" fill={`url(#${uid}-hbns)`} />
                <rect x="30" y="0" width="200" height="110" fill={`url(#${uid}-hbnv)`} />
                <rect x="30" y="0" width="200" height="110" fill={`url(#${uid}-hbnk)`} />
              </g>
              <path data-r="bn-bandBot" fill="none" stroke="#2A2470" strokeOpacity="0.28" strokeWidth="5" />
              <path data-r="bn-band" fill="#8FB0E6" />
              <g clipPath={`url(#${uid}-bnB)`} fill="none" strokeLinecap="round">
                <path data-r="bn-bandRibs" stroke="#B4CCF3" strokeWidth="3.2" />
                <path data-r="bn-bandRibs2" stroke="#6E92D2" strokeWidth="1" transform="translate(2.6 0)" />
                <path data-r="bn-bandHi" stroke="#E3EDFF" strokeWidth="3" opacity="0.7" transform="translate(0 2)" />
                <rect x="20" y="60" width="220" height="70" fill={`url(#${uid}-hbns)`} />
                <rect x="20" y="60" width="220" height="70" fill={`url(#${uid}-hbnk)`} />
              </g>
            </g>
            <g data-r="bk" opacity="0">
              <ellipse cx="130" cy="84" rx="116" ry="20" fill="#6F8A6A" />
              <ellipse cx="130" cy="80" rx="116" ry="20" fill="#A6BE9F" />
              <ellipse cx="130" cy="80" rx="104" ry="16" fill="none" stroke="#7E9A78" strokeWidth="1.1" strokeDasharray="3 3" />
              <path data-r="bk-crown" fill="#A6BE9F" />
              <g clipPath={`url(#${uid}-bkC)`} fill="none" strokeLinecap="round">
                <path data-r="bk-ribs" stroke="#C1D4BC" strokeWidth="2.4" />
                <path data-r="bk-ribs2" stroke="#86A07F" strokeWidth="0.8" transform="translate(2.2 0)" />
                <rect x="30" y="20" width="200" height="80" fill={`url(#${uid}-hbks)`} />
                <rect x="30" y="20" width="200" height="80" fill={`url(#${uid}-hbkk)`} />
              </g>
              <ellipse cx="130" cy="98" rx="96" ry="14" fill="#1E3320" opacity="0.42" clipPath={`url(#${uid}-clip)`} />
              <path data-r="bk-front" fill="none" stroke="#5D7759" strokeWidth="7" transform="translate(0 3)" />
              <g clipPath={`url(#${uid}-bkF)`}>
                <rect x="0" y="60" width="260" height="70" fill="#A6BE9F" />
                <path data-r="bk-radial" fill="none" stroke="#C1D4BC" strokeWidth="2" />
                <rect x="0" y="60" width="260" height="70" fill={`url(#${uid}-hbks)`} />
                <rect x="0" y="60" width="260" height="70" fill={`url(#${uid}-hbkk)`} opacity="0.6" />
              </g>
              <path data-r="bk-rim" fill="none" stroke="#5D7759" strokeWidth="1.6" opacity="0.7" />
            </g>
            <g data-r="vs" opacity="0">
              <path data-r="vs-face" fill="none" stroke="#0B4A2C" strokeWidth="12" opacity="0.3" transform="translate(0 7)" clipPath={`url(#${uid}-clip)`} />
              <path data-r="vs-band" fill="none" stroke="#0F7A47" strokeWidth="7" strokeLinecap="round" />
              <path data-r="vs-band2" fill="none" stroke="#2FCB7E" strokeWidth="4.5" strokeLinecap="round" />
              <path data-r="vs-visorU" fill="#0F7A47" transform="translate(0 2.6)" />
              <path data-r="vs-visor" fill={`url(#${uid}-aVs)`} />
              <path data-r="vs-hi" fill="none" stroke="#D2FFE8" strokeWidth="1" strokeDasharray="2.4 2.4" opacity="0.8" />
            </g>
            <g data-r="br" opacity="0">
              <path data-r="br-face" fill="none" stroke="#5A1036" strokeWidth="10" opacity="0.3" clipPath={`url(#${uid}-clip)`} />
              <path data-r="br-dome" fill={`url(#${uid}-aBr)`} />
              <path data-r="br-rim" fill="none" stroke="#B92260" strokeWidth="4" strokeLinecap="round" />
              <path data-r="br-stem" fill="none" stroke="#B92260" strokeWidth="3.4" strokeLinecap="round" />
            </g>
            <g data-r="antenna" opacity="0">
              <ellipse data-r="ant-sh" rx="12" ry="4" fill="#2A2470" opacity="0.3" clipPath={`url(#${uid}-clip)`} />
              <ellipse data-r="ant-base" rx="9" ry="4" fill="#5B6070" />
              <ellipse data-r="ant-base2" rx="9" ry="3.6" fill="#A3A9BC" />
              <path data-r="ant-stem" fill="none" stroke="#5B6070" strokeWidth="3.2" strokeLinecap="round" />
              <circle data-r="ant-pulse" r="11" fill="#FF7A1F" opacity="0" />
              <circle data-r="ant-bulb" r="6.5" fill={`url(#${uid}-aAnt)`} />
            </g>
            <g data-r="gold" opacity="0">
              <ellipse cx="150" cy="54" rx="34" ry="9" fill="#2A2470" opacity="0.3" />
              <path data-r="gold-back" fill={`url(#${uid}-aGoldIn)`} />
              <path data-r="gold-front" fill={`url(#${uid}-aGold)`} stroke="#D4920F" strokeWidth="1.2" strokeLinejoin="round" />
              <path data-r="gold-band" fill="none" stroke="#E8A317" strokeWidth="5" />
              <path data-r="gold-bandHi" fill="none" stroke="#FFF1A8" strokeWidth="1.2" opacity="0.9" />
              <circle data-r="gold-tip0" r="2.6" fill="#FFE27A" stroke="#D4920F" strokeWidth="0.8" />
              <circle data-r="gold-tip1" r="2.6" fill="#FFE27A" stroke="#D4920F" strokeWidth="0.8" />
              <circle data-r="gold-tip2" r="2.6" fill="#FFE27A" stroke="#D4920F" strokeWidth="0.8" />
              <circle data-r="gold-tip3" r="2.6" fill="#FFE27A" stroke="#D4920F" strokeWidth="0.8" />
              <ellipse data-r="gold-gem0" fill={`url(#${uid}-aRuby)`} />
              <ellipse data-r="gold-gem1" fill={`url(#${uid}-aSap)`} />
              <ellipse data-r="gold-gem2" fill={`url(#${uid}-aSap)`} />
            </g>
          </g>
        </g>
        <g data-r="ringFront" opacity="0">
          <path data-r="ringF" fill="none" stroke={`url(#${uid}-aRing)`} strokeWidth="4.2" strokeLinecap="round" />
          <path data-r="ringShine" fill="none" stroke="#E6FFF7" strokeWidth="2" strokeLinecap="round" strokeDasharray="26 400" opacity="0.9" />
        </g>
        {[0, 1].map((i) => (
          <g key={i} data-r={`hand${i}`} opacity="0">
            <ellipse rx="10.5" ry="11.5" fill={`url(#${uid}-eBody)`} stroke="rgba(150,160,230,.35)" strokeWidth="0.8" />
            <ellipse cy="7.5" rx="7.5" ry="3.2" style={{ fill: "var(--g)" }} opacity="0.35" />
          </g>
        ))}
        <g data-r="file" opacity="0">
          <rect x="-12" y="-15" width="24" height="30" rx="4" fill="#4F8BFF" opacity="0.35" />
          <rect x="-11" y="-14" width="22" height="28" rx="4" fill="#5B8CFF" />
          <path d="M4 -14 L11 -7 L4 -7 Z" fill="#B9CEFF" />
          <path d="M-7 -3 H7 M-7 2 H7 M-7 7 H2" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <g data-r="ind">
          <g data-r="ind-balls" opacity="0">
            {[0, 1, 2].map((i) => (
              <g key={i} data-r={`ball${i}`}>
                <circle r={4.4 + i * 0.4} fill={`url(#${uid}-gBall)`} />
              </g>
            ))}
          </g>
          <g data-r="ind-bang" opacity="0" dangerouslySetInnerHTML={{ __html: badgeInner(uid, "gAmber", "!") }} />
          <g data-r="ind-x" opacity="0" dangerouslySetInnerHTML={{ __html: badgeInner(uid, "gRed", "x") }} />
          <g data-r="ind-dot" opacity="0">
            <circle r="6.2" fill="#0D0F17" />
            <circle r="4.6" fill={`url(#${uid}-gRed)`} />
          </g>
          <g data-r="ind-heart" opacity="0">
            <use href={`#${uid}-p-heart`} />
          </g>
          <g data-r="ind-spiral" opacity="0">
            <use href={`#${uid}-p-spiralP`} />
          </g>
          <g data-r="ind-question" opacity="0" dangerouslySetInnerHTML={{ __html: badgeInner(uid, "gCyan", "?") }} />
          <g data-r="ind-check" opacity="0" dangerouslySetInnerHTML={{ __html: badgeInner(uid, "gGreen", "v") }} />
        </g>
        {Array.from({ length: 18 }, (_, i) => (
          <g key={i} data-part opacity="0">
            <use href={`#${uid}-p-heart`} />
          </g>
        ))}
      </svg>
    </div>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import { AGENTS, HeartEmitter, type Accessory, type AgentVisual, type EffectFrame } from "@open-dot/core";

/**
 * PRÉVIA 2D do Dot — fallback do modelo 3D (Blender → GLB, `Dot3D.tsx`).
 * Usada sem WebGL, com perda de contexto, com movimento reduzido e nos ícones pequenos. Não substitui o modelo final.
 *
 * Anatomia (catálogo + correção do João): corpo marfim arredondado, olhos escuros baixos,
 * blush discreto, tracinho de absorção no alto da face frontal. Sem boca. Sem sobrancelhas.
 */

interface Props {
  visual: AgentVisual;
  accessory: Accessory;
  size: number;
  animate: boolean;
  reducedMotion: boolean;
  /** Mostra o selo "2D" indicando que é prévia. */
  showBadge?: boolean;
  /** Reage a clique (squash) e oferece carinho. */
  interactive?: boolean;
  label?: string;
  /** Incrementar para pedir carinho por botão (equivalente de teclado/toque ao hover). */
  affectionSignal?: number;
  onAffection?: (result: "ok" | "cooldown" | "suppressed" | "hidden") => void;
  /** Animação de entrada do arquivo pelo tracinho (só visual; não indica recebimento). */
  absorbing?: boolean;
}

const BODY = "M20 80 C20 40 26 32 80 32 C134 32 140 40 140 80 C140 116 134 126 80 126 C26 126 20 116 20 80 Z";
const EYE_Y = 98;
const EYE_DX = 19;

function Eyes({ expression }: { expression: AgentVisual["expression"] }) {
  const ink = "#292628";
  const xs = [80 - EYE_DX, 80 + EYE_DX];
  switch (expression) {
    case "happy":
      return (
        <g fill="none" stroke={ink} strokeWidth={3.2} strokeLinecap="round">
          {xs.map((x) => (
            <path key={x} d={`M${x - 5.5} ${EYE_Y + 2} Q${x} ${EYE_Y - 6} ${x + 5.5} ${EYE_Y + 2}`} />
          ))}
        </g>
      );
    case "sleep":
      return (
        <g fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round">
          {xs.map((x) => (
            <path key={x} d={`M${x - 5.5} ${EYE_Y - 1} Q${x} ${EYE_Y + 5} ${x + 5.5} ${EYE_Y - 1}`} />
          ))}
        </g>
      );
    case "eyes_low":
      return (
        <g fill={ink}>
          {xs.map((x) => (
            <path key={x} d={`M${x - 5} ${EYE_Y + 1} L${x + 5} ${EYE_Y + 1} Q${x + 5} ${EYE_Y + 8} ${x} ${EYE_Y + 8} Q${x - 5} ${EYE_Y + 8} ${x - 5} ${EYE_Y + 1} Z`} />
          ))}
        </g>
      );
    default: {
      const dy = expression === "look_up" ? -3 : 0;
      const ry = expression === "focused" ? 6 : expression === "surprised" ? 8 : expression === "attentive" ? 7.3 : 7;
      const rx = expression === "surprised" ? 6.6 : 5.9;
      return (
        <g fill={ink}>
          {xs.map((x) => (
            <ellipse key={x} cx={x} cy={EYE_Y + dy} rx={rx} ry={ry} />
          ))}
        </g>
      );
    }
  }
}

function AccessoryLayer({ kind }: { kind: Accessory }) {
  if (kind === "mail_cap")
    return (
      <g aria-hidden="true">
        <path d="M46 40 C46 22 114 22 114 40 Z" fill="#F3EDE2" stroke="#D9D1C3" strokeWidth={1.2} />
        <path d="M86 38 C104 36 124 38 130 44 C118 46 100 45 86 42 Z" fill="#A8BED8" stroke="#8FA7C4" strokeWidth={1} />
      </g>
    );
  if (kind === "glasses")
    return (
      <g fill="none" stroke="#44414A" strokeWidth={2} aria-hidden="true">
        <circle cx={80 - EYE_DX} cy={EYE_Y} r={12} />
        <circle cx={80 + EYE_DX} cy={EYE_Y} r={12} />
        <path d={`M${80 - EYE_DX + 12} ${EYE_Y} H${80 + EYE_DX - 12}`} />
        <path d={`M${80 - EYE_DX - 12} ${EYE_Y - 2} L22 ${EYE_Y - 6}`} />
        <path d={`M${80 + EYE_DX + 12} ${EYE_Y - 2} L138 ${EYE_Y - 6}`} />
      </g>
    );
  if (kind === "headphones")
    return (
      <g aria-hidden="true">
        <path d="M18 78 C18 18 142 18 142 78" fill="none" stroke="#B6ACD4" strokeWidth={7} strokeLinecap="round" />
        <rect x={10} y={66} width={16} height={30} rx={7} fill="#B6ACD4" />
        <rect x={134} y={66} width={16} height={30} rx={7} fill="#B6ACD4" />
      </g>
    );
  return null;
}

function Heart({ f }: { f: EffectFrame }) {
  return (
    <svg
      viewBox="0 0 24 22"
      style={{ transform: `translate(${-50 + f.x * 300}%, ${f.y * 500}%) scale(${f.scale}) rotate(${f.rotationDeg}deg)`, opacity: f.alpha, left: `${62 + (f.x > 0 ? 8 : 0)}%` }}
      aria-hidden="true"
    >
      <path d="M12 21 C5 15 1 11.5 1 7 C1 3.5 3.7 1 7 1 C9.2 1 11 2.2 12 4 C13 2.2 14.8 1 17 1 C20.3 1 23 3.5 23 7 C23 11.5 19 15 12 21 Z" fill="#EEB5C1" />
    </svg>
  );
}

export function Dot2D({ visual, accessory, size, animate, reducedMotion, showBadge, interactive, label, affectionSignal, onAffection, absorbing }: Props) {
  const gid = useId().replace(/:/g, "");
  const [squash, setSquash] = useState(0);
  const [frames, setFrames] = useState<EffectFrame[]>([]);
  const emitter = useRef(new HeartEmitter());
  const raf = useRef<number | null>(null);
  const hoverTimer = useRef<number | null>(null);

  // Pausa efeitos quando a janela fica oculta e não reproduz histórico ao voltar.
  useEffect(() => {
    const onVis = () => emitter.current.setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const loop = () => {
    const now = performance.now();
    const f = emitter.current.frames(now);
    setFrames(f);
    if (emitter.current.aliveCount(now) > 0) raf.current = requestAnimationFrame(loop);
    else raf.current = null;
  };

  const affection = () => {
    const r = emitter.current.emit(performance.now(), { allowCosmetic: visual.allowCosmetic, reducedMotion });
    if (r.ok && !raf.current) raf.current = requestAnimationFrame(loop);
    onAffection?.(r.ok ? "ok" : r.reason);
    return r.ok;
  };

  const lastSignal = useRef(affectionSignal ?? 0);
  useEffect(() => {
    if (affectionSignal !== undefined && affectionSignal !== lastSignal.current) {
      lastSignal.current = affectionSignal;
      affection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectionSignal]);

  const bodyClass =
    visual.bodyClip === "success"
      ? "bounce"
      : visual.bodyClip === "error"
        ? "shrink"
        : visual.pulse
          ? "pulse"
          : visual.bodyClip === "sleep_idle" || visual.semantic === "disconnected"
            ? ""
            : "breathe";
  const tintStart = visual.tintCoverage === "half" ? 0.5 : 0.66;
  const neutralTint = visual.agentId === "dot" && visual.semantic === "idle";

  return (
    <div
      className={`dot-wrap ${animate && !reducedMotion ? "anim" : ""}`}
      style={{ width: size }}
      onPointerEnter={interactive ? () => (hoverTimer.current = window.setTimeout(affection, 2000)) : undefined}
      onPointerLeave={interactive ? () => hoverTimer.current && window.clearTimeout(hoverTimer.current) : undefined}
    >
      <svg
        className="dot-svg"
        viewBox="0 0 160 140"
        width={size}
        height={(size * 140) / 160}
        role="img"
        aria-label={label ?? `${AGENTS[visual.agentId].name} — ${visual.label}`}
        onClick={interactive ? () => setSquash((n) => n + 1) : undefined}
        style={interactive ? { cursor: "pointer" } : undefined}
      >
        <defs>
          <linearGradient id={`t${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor={visual.tint} stopOpacity={0} />
            <stop offset={tintStart} stopColor={visual.tint} stopOpacity={0} />
            <stop offset={1} stopColor={visual.tint} stopOpacity={neutralTint ? 0 : visual.semantic === "error" ? 0.62 : 0.5} />
          </linearGradient>
          <radialGradient id={`h${gid}`} cx="0.32" cy="0.18" r="0.75">
            <stop offset={0} stopColor="#FFFFFF" stopOpacity={0.55} />
            <stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`s${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0.55} stopColor="#000" stopOpacity={0} />
            <stop offset={1} stopColor="#5A4E3C" stopOpacity={0.16} />
          </linearGradient>
        </defs>
        <ellipse cx={80} cy={130} rx={50} ry={5} fill="#000" opacity={0.18} />
        <g key={squash} className={`dot-body ${squash ? "squash" : bodyClass}`}>
          <path d={BODY} fill="#F3EDE2" />
          <path d={BODY} fill={`url(#s${gid})`} />
          <path d={BODY} fill={`url(#t${gid})`} />
          <path d={BODY} fill={`url(#h${gid})`} />
          {/* Tracinho de absorção (entrada de arquivos), no alto da face frontal. Não é boca. */}
          <rect x={68} y={47} width={24} height={5} rx={2.5} fill="#D6CDBF" />
          <rect x={70.5} y={48.6} width={19} height={1.8} rx={0.9} fill="#9C9386" opacity={0.75} />
          {absorbing && <rect className={`slot-glow ${reducedMotion ? "" : "pulse"}`} x={66} y={45.5} width={28} height={8} rx={4} fill="#F5D88A" opacity={0.55} />}
          <ellipse cx={80 - 37} cy={92} rx={9} ry={5} fill="#EAB6B2" opacity={0.5} />
          <ellipse cx={80 + 37} cy={92} rx={9} ry={5} fill="#EAB6B2" opacity={0.5} />
          <Eyes expression={visual.expression} />
          <AccessoryLayer kind={accessory} />
        </g>
        {absorbing && !reducedMotion && (
          // Folha descendo até o tracinho e sumindo dentro dele.
          <g className="absorb-sheet" aria-hidden="true">
            <rect x={71} y={2} width={18} height={22} rx={2} fill="#FFFFFF" stroke="#CFC6B8" strokeWidth={1} />
            <path d="M74 9 H86 M74 13 H86 M74 17 H82" stroke="#CFC6B8" strokeWidth={1.2} strokeLinecap="round" />
          </g>
        )}
      </svg>
      {frames.length > 0 && (
        <div className="hearts" aria-hidden="true">
          {frames.map((f) => (
            <Heart key={f.id} f={f} />
          ))}
        </div>
      )}
      {showBadge && (
        <span className="badge-2d" title="Prévia 2D (fallback do modelo 3D).">
          2D
        </span>
      )}
    </div>
  );
}

// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Marcador: mascote genérico para forks e builds sem o Dot (que tem licença própria).
 * Não é um personagem: hexágono com núcleo de estado, sem rosto. O estado também vai
 * em texto (aria-label e title), nunca só em cor. Selecione com tsconfig.placeholder.json.
 */
import type { Accessory, AgentVisual, SemanticState } from "@open-dot/core";

export interface AgentDotProps {
  visual: AgentVisual;
  accessory: Accessory;
  size: number;
  reducedMotion: boolean;
  absorbing?: boolean;
  affectionSignal?: number;
  onAffection?: (r: "ok" | "cooldown" | "suppressed" | "hidden") => void;
  interactive?: boolean;
  small?: boolean;
  animate?: boolean;
  label?: string;
  hello?: boolean;
  ring?: boolean;
  antennaPulse?: boolean;
}

/** Forma do núcleo por estado: o sinal não depende só da cor. */
const CORE: Record<SemanticState, "dot" | "bar" | "ring" | "cross" | "check" | "dash"> = {
  idle: "dot",
  thinking: "ring",
  working: "bar",
  waiting: "dash",
  question: "dash",
  success: "check",
  error: "cross",
  disconnected: "dash",
  sleep: "dash",
};

const HEX = "M50 6 L88 28 L88 72 L50 94 L12 72 L12 28 Z";

export function AgentDot({ visual, size, reducedMotion, label, interactive, onAffection, absorbing }: AgentDotProps) {
  const shape = CORE[visual.semantic] ?? "dot";
  const tint = visual.semantic === "idle" ? "var(--placeholder-core, #8A8D99)" : visual.tint;
  const moving = !reducedMotion && (visual.semantic === "thinking" || visual.semantic === "working" || Boolean(absorbing));
  const name = label ?? "Marcador";
  const text = `${name}: ${visual.label}`;
  const onClick = interactive && onAffection ? () => onAffection(visual.allowCosmetic ? "ok" : "suppressed") : undefined;
  return (
    <svg
      className={`placeholder-mascot${moving ? " is-moving" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={text}
      onClick={onClick}
      style={{ flex: "none", cursor: onClick ? "pointer" : undefined }}
    >
      <title>{text}</title>
      <path d={HEX} fill="var(--placeholder-fill, #2A2C33)" stroke="var(--placeholder-stroke, #6B6E7A)" strokeWidth="4" strokeLinejoin="round" />
      {shape === "dot" && <circle cx="50" cy="50" r="10" fill={tint} />}
      {shape === "ring" && <circle cx="50" cy="50" r="14" fill="none" stroke={tint} strokeWidth="6" strokeDasharray="22 66" />}
      {shape === "bar" && <rect x="30" y="44" width="40" height="12" rx="6" fill={tint} />}
      {shape === "dash" && <rect x="34" y="46" width="32" height="8" rx="4" fill={tint} />}
      {shape === "check" && <path d="M34 51 L45 62 L67 38" fill="none" stroke={tint} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />}
      {shape === "cross" && <path d="M36 36 L64 64 M64 36 L36 64" fill="none" stroke={tint} strokeWidth="8" strokeLinecap="round" />}
    </svg>
  );
}

export function SplashScreen({ fading, reducedMotion }: { fading: boolean; reducedMotion: boolean }) {
  const visual = { agentId: "dot", semantic: "idle", jobId: null, reason: null, tint: "#8A8D99", tintCoverage: "lower_third", expression: "neutral", bodyClip: "idle_breathe", pulse: false, allowCosmetic: false, label: "Em repouso" } as const satisfies AgentVisual;
  return (
    <div className={`splash${fading ? " fade" : ""}`} role="status" aria-label="Carregando Open Dot" aria-live="polite">
      <div className="splash-inner">
        <AgentDot visual={visual} accessory="none" size={160} reducedMotion={reducedMotion} label="Marcador" />
      </div>
    </div>
  );
}

/** O marcador não tem acessórios nem conquistas. */
export const CROWN_UNLOCKED = false;
export const MASCOT = { kind: "placeholder", name: "Marcador" } as const;

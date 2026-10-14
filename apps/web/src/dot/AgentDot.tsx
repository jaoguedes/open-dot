import type { Accessory, AgentVisual } from "@open-dot/core";
import { DotView, type DotViewProps } from "./DotView.tsx";

export interface AgentDotProps {
  visual: AgentVisual;
  accessory: Accessory;
  size: number;
  reducedMotion: boolean;
  absorbing?: boolean;
  affectionSignal?: number;
  onAffection?: DotViewProps["onAffection"];
  interactive?: boolean;
  /** Avatares pequenos só animam quando o estado muda. */
  small?: boolean;
  /** Compatível com o Dot2D: `animate={false}` vira `small`. */
  animate?: boolean;
  label?: string;
  hello?: boolean;
  ring?: boolean;
  antennaPulse?: boolean;
}

/** Ligação do app ao motor: semantic, acessório, anel da Sentinela, carinho e absorção. */
export function AgentDot({ animate, small, ring, ...rest }: AgentDotProps) {
  const isSmall = small ?? animate === false;
  const sentinelaRing =
    ring ?? (rest.visual.agentId === "sentinela" && (rest.visual.semantic === "working" || rest.visual.semantic === "thinking"));
  return <DotView {...rest} small={isSmall} ring={sentinelaRing} />;
}

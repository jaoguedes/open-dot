// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import type { Accessory, AgentVisual } from "@open-dot/core";
import { DotView, type DotViewProps } from "./DotView.tsx";
import { showSentinelaRing } from "./ring.ts";

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
  const sentinelaRing = showSentinelaRing({
    agentId: rest.visual.agentId,
    size: rest.size,
    semantic: rest.visual.semantic,
    ...(ring === undefined ? {} : { ring }),
  });
  return <DotView {...rest} small={isSmall} ring={sentinelaRing} />;
}

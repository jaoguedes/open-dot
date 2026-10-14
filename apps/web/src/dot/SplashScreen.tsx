import { toVisual } from "@open-dot/core";
import { AgentDot } from "./AgentDot.tsx";

export function SplashScreen({ fading, reducedMotion }: { fading: boolean; reducedMotion: boolean }) {
  const visual = toVisual("dot", "idle");
  return (
    <div className={`splash${fading ? " fade" : ""}`} role="status" aria-label="Carregando Open Dot" aria-live="polite">
      <div className="splash-inner">
        <AgentDot visual={visual} accessory="none" size={200} reducedMotion={reducedMotion} hello={!reducedMotion} label="Dot" />
        <span className="od-wordmark" aria-hidden="true">
          open<span className="od-wordmark-dot" />dot
        </span>
      </div>
    </div>
  );
}

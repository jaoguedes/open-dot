import { toVisual, type AgentId } from "@open-dot/core";
import { AgentDot } from "@open-dot/mascot";
import { useApp } from "../store.tsx";

/** Pílula de fonte (E5): carinha do agente + origem. O toque abre o e-mail ou a notícia original. */
export function SourcePill({ agentId, origin, href }: { agentId: AgentId; origin: string; href?: string | null }) {
  const app = useApp();
  const face = <AgentDot visual={toVisual(agentId, "idle")} accessory={app.accessoryFor(agentId)} size={18} animate={false} reducedMotion={app.reducedMotion} />;
  if (!href || app.mode === "demo" || !href.startsWith("https://")) {
    return (
      <span className="source-pill">
        {face}
        <span>{origin}</span>
      </span>
    );
  }
  return (
    <a className="source-pill" href={href} target="_blank" rel="noreferrer noopener" aria-label={`Abrir a fonte: ${origin}`}>
      {face}
      <span>{origin}</span>
    </a>
  );
}

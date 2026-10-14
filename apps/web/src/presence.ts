import type { AgentId, AgentVisual } from "@open-dot/core";
import type { FeedEntry, Monitor } from "./api.ts";

export type PresenceTone = "need" | "error" | "working" | "idle";

export interface AgentPresence {
  tone: PresenceTone;
  label: string;
  dotClass: "need" | "err" | "busy" | "";
}

/** Uma fonte da verdade para texto e ponto de status do agente. */
export function agentPresence(agentId: AgentId, visual: AgentVisual, feed: FeedEntry[], monitors: Monitor[]): AgentPresence {
  const mine = feed.filter((f) => f.agentId === agentId);
  const incidents = mine.filter((f) => f.kind === "ci_failure" || f.kind === "site_incident");
  const digest = mine.find((f) => f.kind === "email_digest");
  const quoteAlerts = mine.filter((f) => f.kind === "quote_alert").length;
  const needN = (digest?.body.counts?.important ?? 0) + quoteAlerts;
  const openInc = monitors.filter((m) => m.incident?.open).length;

  if (visual.semantic === "error" || incidents.length > 0 || (agentId === "sentinela" && openInc > 0)) {
    const n = Math.max(incidents.length, openInc, visual.semantic === "error" ? 1 : 0);
    return { tone: "error", label: n === 1 ? "1 incidente" : `${n} incidentes`, dotClass: "err" };
  }
  if (visual.semantic === "waiting" || needN > 0) {
    return { tone: "need", label: needN <= 1 ? "1 pede você" : `${needN} pedem você`, dotClass: "need" };
  }
  if (visual.semantic === "working" || visual.semantic === "thinking") {
    return { tone: "working", label: visual.label, dotClass: "busy" };
  }
  if (agentId === "sentinela" && monitors.length > 0) {
    const up = monitors.filter((m) => !m.incident?.open).length;
    return { tone: "idle", label: `${up} ${up === 1 ? "site no ar" : "sites no ar"}`, dotClass: "" };
  }
  return { tone: "idle", label: visual.label, dotClass: "" };
}

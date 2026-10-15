import { AGENTS, type AgentId, type AgentVisual, type SemanticState } from "@open-dot/core";
import type { FeedEntry, Monitor } from "./api.ts";

export type PresenceTone = "need" | "error" | "working" | "idle";

export interface AgentPresence {
  tone: PresenceTone;
  label: string;
  dotClass: "need" | "err" | "busy" | "";
}

function slowSite(feed: FeedEntry[], monitors: Monitor[]): boolean {
  return (
    monitors.some((m) => m.incident?.open && m.incident.kind === "slow") ||
    feed.some((f) => f.kind === "site_incident" && /lento|devagar/i.test(`${f.title} ${f.body.summary ?? ""}`))
  );
}

/** Estado semântico a partir do tipo do item do feed (e monitores abertos). */
export function semanticFromItems(agentId: AgentId, feed: FeedEntry[], monitors: Monitor[]): SemanticState {
  const mine = feed.filter((f) => f.agentId === agentId);
  if (mine.some((f) => f.kind === "ci_failure")) return "error";
  if (mine.some((f) => f.kind === "site_incident") || (agentId === "sentinela" && monitors.some((m) => m.incident?.open))) return "error";
  if (mine.some((f) => f.kind === "quote_alert")) return "waiting";
  if (mine.some((f) => f.kind === "email_digest")) return "working";
  return "idle";
}

/** Uma fonte da verdade para texto e ponto de status do agente. */
export function agentPresence(agentId: AgentId, visual: AgentVisual, feed: FeedEntry[], monitors: Monitor[]): AgentPresence {
  const mine = feed.filter((f) => f.agentId === agentId);
  const builds = mine.filter((f) => f.kind === "ci_failure").length;
  const sites = mine.filter((f) => f.kind === "site_incident").length;
  const digest = mine.find((f) => f.kind === "email_digest");
  const quoteAlerts = mine.filter((f) => f.kind === "quote_alert").length;
  const needN = (digest?.body.counts?.important ?? 0) + quoteAlerts;
  const openInc = agentId === "sentinela" ? monitors.filter((m) => m.incident?.open).length : 0;

  if (visual.semantic === "error" || builds > 0 || sites > 0 || openInc > 0) {
    if (builds > 0) return { tone: "error", label: builds === 1 ? "1 build falhou" : `${builds} builds falharam`, dotClass: "err" };
    if (slowSite(mine, monitors) || (agentId === "sentinela" && slowSite(feed, monitors))) {
      return { tone: "error", label: "Lento", dotClass: "err" };
    }
    const n = Math.max(sites, openInc, visual.semantic === "error" ? 1 : 0);
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

/** Texto da ilha: atividade atual; “concluído” só depois de terminar. */
export function islandLine(visual: AgentVisual): string {
  const name = AGENTS[visual.agentId].name;
  if (visual.semantic === "working" || visual.semantic === "thinking") return `${name} está lendo…`;
  if (visual.semantic === "success") return `${name} concluído`;
  return `${name} ${visual.label.toLowerCase()}`;
}

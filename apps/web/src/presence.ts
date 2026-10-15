import { AGENTS, type AgentId, type AgentVisual, type SemanticState } from "@open-dot/core";
import type { FeedEntry, Monitor } from "./api.ts";

export type PresenceTone = "need" | "error" | "working" | "idle" | "off";

export interface AgentPresence {
  tone: PresenceTone;
  label: string;
  dotClass: "need" | "err" | "busy" | "off" | "";
}

function slowSite(feed: FeedEntry[], monitors: Monitor[]): boolean {
  return (
    monitors.some((m) => m.incident?.open && m.incident.kind === "slow") ||
    feed.some((f) => f.kind === "site_incident" && /lento|devagar/i.test(`${f.title} ${f.body.summary ?? ""}`))
  );
}

/** Estado semântico a partir do tipo do item do feed (e monitores abertos). */
export function semanticFromItems(agentId: AgentId, feed: FeedEntry[], monitors: Monitor[]): SemanticState {
  const mine = feed.filter((f) => f.agentId === agentId && f.state !== "done" && f.state !== "snoozed");
  if (mine.some((f) => f.kind === "ci_failure")) return "error";
  if (mine.some((f) => f.kind === "site_incident") || (agentId === "sentinela" && monitors.some((m) => m.incident?.open))) return "error";
  if (mine.some((f) => f.kind === "quote_alert")) return "waiting";
  if (mine.some((f) => f.kind === "email_digest")) return "working";
  return "idle";
}

/** Uma fonte da verdade para texto e ponto de status do agente. */
export function agentPresence(
  agentId: AgentId,
  visual: AgentVisual,
  feed: FeedEntry[],
  monitors: Monitor[],
  opts?: { connected?: boolean; pendingShipments?: number },
): AgentPresence {
  if (opts?.connected === false) return { tone: "off", label: "Não conectado", dotClass: "off" };
  const mine = feed.filter((f) => f.agentId === agentId && f.state !== "done" && f.state !== "snoozed");
  const builds = mine.filter((f) => f.kind === "ci_failure").length;
  const sites = mine.filter((f) => f.kind === "site_incident").length;
  const digest = mine.find((f) => f.kind === "email_digest");
  const quoteAlerts = mine.filter((f) => f.kind === "quote_alert").length;
  const shipmentsWaiting = agentId === "entregas" ? (opts?.pendingShipments ?? 0) : 0;
  const mailNeed = digest?.body.itens?.length ?? digest?.body.counts?.important ?? 0;
  const needN = mailNeed + quoteAlerts + shipmentsWaiting;
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

export interface ConnectionFacts {
  demo: boolean;
  gmail: boolean;
  github: boolean;
  vercel: boolean;
  gsc: boolean;
  monitors: number;
  shipments: number;
  tracking: boolean;
  disabled: Partial<Record<AgentId, boolean>>;
}

/** Ligado o bastante para sair de "Não conectado". No exemplo, os agentes da história continuam ligados. */
export function agentConnected(id: AgentId, facts: ConnectionFacts): boolean {
  if (facts.disabled[id]) return false;
  if (facts.demo && id !== "entregas") return true;
  if (id === "dot" || id === "foco") return true;
  if (id === "noticias" || id === "mercado") return true;
  if (id === "correio") return facts.gmail;
  if (id === "codigo") return facts.github;
  if (id === "sentinela") return facts.monitors > 0 || facts.vercel;
  if (id === "marketing") return facts.gsc || facts.vercel;
  if (id === "entregas") return facts.shipments > 0 || facts.tracking;
  return true;
}

export function presenceRank(p: AgentPresence): number {
  if (p.tone === "need") return 0;
  if (p.tone === "error") return 1;
  if (p.tone === "working") return 2;
  return p.tone === "off" ? 4 : 3;
}

/** Quem pede você vai para o topo. A ordem relativa dos demais fica. */
export function sortAgents<T extends string>(ids: readonly T[], presence: (id: T) => AgentPresence): T[] {
  return ids
    .map((id, index) => ({ id, index, rank: presenceRank(presence(id)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.id);
}

/** Texto da ilha: atividade atual; “concluído” só depois de terminar. */
export function islandLine(visual: AgentVisual): string {
  const name = AGENTS[visual.agentId].name;
  if (visual.semantic === "working" || visual.semantic === "thinking") return `${name} está lendo…`;
  if (visual.semantic === "success") return `${name} concluído`;
  return `${name} ${visual.label.toLowerCase()}`;
}

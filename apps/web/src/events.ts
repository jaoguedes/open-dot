// SPDX-License-Identifier: AGPL-3.0-only
import { AGENTS, explainError, type AgentId } from "@open-dot/core";
import type { Snapshot } from "./api.ts";

/** Central do Dot (D2): eventos derivados do snapshot. Sem push. */
export interface DotEvent {
  id: string;
  at: string;
  tone: "ok" | "err" | "warn" | "info";
  text: string;
  agentId: AgentId;
  path: string;
}

const name = (a: AgentId) => AGENTS[a]?.name ?? "Dot";

export function buildEvents(snap: Snapshot | null, limit = 20): DotEvent[] {
  if (!snap) return [];
  const out: DotEvent[] = [];
  for (const r of snap.runs) {
    const at = r.updatedAt;
    if (r.state === "succeeded") out.push({ id: `run:${r.id}:ok`, at, tone: "ok", text: `${name(r.agentId)} concluiu uma execução.`, agentId: r.agentId, path: `/agente/${r.agentId}` });
    else if (r.state === "failed" || r.state === "uncertain") {
      const why = explainError(r.errorCode || "unknown").frase;
      out.push({ id: `run:${r.id}:err`, at, tone: "err", text: `${name(r.agentId)} falhou. ${why}`, agentId: r.agentId, path: `/agente/${r.agentId}` });
    }
  }
  for (const f of snap.feed) {
    if (f.kind === "notice") continue;
    const tone = f.kind === "site_incident" || f.kind === "ci_failure" ? "err" : f.kind === "email_digest" ? "warn" : "info";
    out.push({ id: `feed:${f.id}`, at: f.createdAt, tone, text: f.kind === "site_incident" ? `Incidente: ${f.title}` : `Novo: ${f.title}`, agentId: f.agentId, path: `/agente/${f.agentId}` });
  }
  for (const a of snap.approvals) {
    if (a.status !== "pending") continue;
    out.push({ id: `appr:${a.id}`, at: a.createdAt, tone: "warn", text: "Uma ação espera sua aprovação.", agentId: "correio", path: `/aprovacao/${encodeURIComponent(a.id)}` });
  }
  return out.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

export function unseenCount(events: DotEvent[], seenAt: string | null): number {
  if (!seenAt) return events.length;
  return events.filter((e) => e.at > seenAt).length;
}

const SEEN_KEY = "od-events-seen";
export function readSeenAt(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
export function writeSeenAt(iso: string): void {
  try {
    localStorage.setItem(SEEN_KEY, iso);
  } catch {
    /* sem armazenamento: o ponto volta ao recarregar */
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
import { parseRetryAfter, type EmailMeta } from "@open-dot/core";
import { ConnectorError, fetchWithTimeout } from "./errors.ts";

/**
 * Gmail API somente leitura (users.getProfile, messages.list, messages.get format=metadata,
 * history.list). Não lê corpo nem anexos. Links são montados a partir dos IDs.
 * Referência: developers.google.com/workspace/gmail/api/guides/sync
 */

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const META_HEADERS = ["From", "To", "Subject", "Date", "List-Unsubscribe", "Precedence", "Message-ID"];

async function call<T>(fetchImpl: typeof fetch, token: string, path: string, now: number): Promise<T> {
  const resp = await fetchWithTimeout(fetchImpl, `${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } }, 15_000);
  if (resp.ok) return (await resp.json()) as T;
  const body = (await resp.json().catch(() => ({}))) as { error?: { errors?: Array<{ reason?: string }>; status?: string } };
  const reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? "";
  if (resp.status === 401) throw new ConnectorError("unauthorized", "Token do Gmail expirado ou revogado.", null, 401);
  if (resp.status === 429 || (resp.status === 403 && /rateLimit/i.test(reason))) {
    throw new ConnectorError("rate_limited", "Gmail limitou as requisições.", parseRetryAfter(resp.headers.get("retry-after"), now) ?? 60_000, resp.status);
  }
  if (resp.status === 403) throw new ConnectorError("forbidden_scope", "Permissão do Gmail ausente.", null, 403);
  if (resp.status === 404) throw new ConnectorError(path.startsWith("/history") ? "cursor_expired" : "not_found", "Recurso do Gmail não encontrado.", null, 404);
  if (resp.status >= 500) throw new ConnectorError("upstream", `Gmail respondeu ${resp.status}.`, null, resp.status);
  throw new ConnectorError("invalid_response", `Gmail respondeu ${resp.status}.`, null, resp.status);
}

export interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

export async function getProfile(fetchImpl: typeof fetch, token: string, now: number): Promise<GmailProfile> {
  const p = await call<{ emailAddress: string; historyId: string | number }>(fetchImpl, token, "/profile", now);
  // historyId sempre como texto (precisão).
  return { emailAddress: p.emailAddress, historyId: String(p.historyId) };
}

/** Primeira sincronização: janela limitada (ex.: últimas 20 mensagens da caixa de entrada). */
export async function listRecentIds(
  fetchImpl: typeof fetch,
  token: string,
  p: { query: string; max: number; now: number },
): Promise<{ ids: Array<{ id: string; threadId: string }>; estimate: number | null }> {
  const q = new URLSearchParams({ q: p.query, maxResults: String(Math.min(p.max, 100)) });
  const r = await call<{ messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number }>(fetchImpl, token, `/messages?${q}`, p.now);
  return { ids: r.messages ?? [], estimate: r.resultSizeEstimate ?? null };
}

export interface HistoryPage {
  added: Array<{ id: string; threadId: string }>;
  nextPageToken: string | null;
  historyId: string;
}

export async function listHistory(fetchImpl: typeof fetch, token: string, p: { startHistoryId: string; pageToken?: string | null; now: number }): Promise<HistoryPage> {
  const q = new URLSearchParams({ startHistoryId: p.startHistoryId, historyTypes: "messageAdded", labelId: "INBOX", maxResults: "100" });
  if (p.pageToken) q.set("pageToken", p.pageToken);
  const r = await call<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }> }>; nextPageToken?: string; historyId: string | number }>(
    fetchImpl,
    token,
    `/history?${q}`,
    p.now,
  );
  const added: Array<{ id: string; threadId: string }> = [];
  const seen = new Set<string>();
  for (const h of r.history ?? []) {
    for (const a of h.messagesAdded ?? []) {
      if (seen.has(a.message.id)) continue;
      if (a.message.labelIds && (a.message.labelIds.includes("DRAFT") || a.message.labelIds.includes("SENT"))) continue;
      seen.add(a.message.id);
      added.push({ id: a.message.id, threadId: a.message.threadId });
    }
  }
  return { added, nextPageToken: r.nextPageToken ?? null, historyId: String(r.historyId) };
}

interface RawMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
}

export async function getMetadata(fetchImpl: typeof fetch, token: string, id: string, now: number): Promise<EmailMeta> {
  const q = new URLSearchParams({ format: "metadata" });
  for (const h of META_HEADERS) q.append("metadataHeaders", h);
  const m = await call<RawMessage>(fetchImpl, token, `/messages/${encodeURIComponent(id)}?${q}`, now);
  return normalizeMessage(m);
}

export function normalizeMessage(m: RawMessage): EmailMeta {
  const h = new Map((m.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
  const internal = Number(m.internalDate);
  return {
    id: m.id,
    threadId: m.threadId,
    from: (h.get("from") ?? "").slice(0, 300),
    to: (h.get("to") ?? "").slice(0, 300),
    subject: (h.get("subject") ?? "").slice(0, 300),
    snippet: decodeEntities(m.snippet ?? "").slice(0, 300),
    receivedAt: Number.isFinite(internal) && internal > 0 ? new Date(internal).toISOString() : new Date().toISOString(),
    labels: m.labelIds ?? [],
    listUnsubscribe: h.has("list-unsubscribe"),
    precedenceBulk: /bulk|list|junk/i.test(h.get("precedence") ?? ""),
    rfc822Id: (h.get("message-id") ?? "").replace(/[<>]/g, "").slice(0, 200) || null,
  };
}

/** Abre a busca pelo Message-Id. Sem ele, cai em #all/<id do Gmail>. */
export function gmailWebHref(gmailId: string, rfc822?: string | null): string {
  const id = (rfc822 ?? "").trim().replace(/[<>]/g, "");
  if (id && !/[\s/]/.test(id)) return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(id)}`;
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(gmailId)}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Link para a mensagem original, montado pelo conector a partir do ID (nunca vindo do modelo). */
export function messageLink(accountEmail: string, threadId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${encodeURIComponent(threadId)}`;
}

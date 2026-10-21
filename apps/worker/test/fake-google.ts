import { jsonResponse } from "./harness.ts";

/**
 * Google/Gmail simulado para testes. Comportamento configurável por campos públicos.
 * Não faz rede. Usado para exercitar fluxos e falhas; NÃO substitui o teste com conta real.
 */
export interface FakeMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  internalDate: number;
  labels?: string[];
  listUnsubscribe?: boolean;
}

export class FakeGoogle {
  messages: FakeMessage[] = [];
  historyId = 1000;
  /** history.list retorna 404 (cursor antigo). */
  historyExpired = false;
  /** refresh_token revogado → invalid_grant. */
  refreshRevoked = false;
  /** IDs cujo metadata responde 500. */
  failMeta = new Set<string>();
  /** responde 429 em tudo do Gmail. */
  rateLimited = false;
  /** mensagens adicionadas após cada historyId. */
  history: Array<{ historyId: number; ids: string[] }> = [];
  idEmail = "joao@example.com";
  idSub = "sub-joao";
  idEmailVerified = true;
  calls: string[] = [];
  accessExpiresIn = 3600;

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    this.calls.push(`${init?.method ?? "GET"} ${url.host}${url.pathname}`);
    if (url.host === "oauth2.googleapis.com" && url.pathname === "/token") {
      const body = new URLSearchParams(String(init?.body ?? ""));
      if (body.get("grant_type") === "refresh_token") {
        if (this.refreshRevoked) return jsonResponse({ error: "invalid_grant" }, 400);
        return jsonResponse({ access_token: `at-${this.calls.length}`, expires_in: this.accessExpiresIn, scope: "openid email https://www.googleapis.com/auth/gmail.readonly" });
      }
      const idPayload = {
        iss: "https://accounts.google.com",
        aud: "cid.apps.googleusercontent.com",
        sub: this.idSub,
        email: this.idEmail,
        email_verified: this.idEmailVerified,
        exp: 4_000_000_000,
        nonce: this.nextNonce,
      };
      const idToken = `x.${Buffer.from(JSON.stringify(idPayload)).toString("base64url")}.sig`;
      return jsonResponse({ access_token: "at-0", refresh_token: "rt-secret-123", expires_in: 3600, scope: this.grantedScope, id_token: idToken });
    }
    if (url.host === "oauth2.googleapis.com" && url.pathname === "/revoke") return new Response("", { status: 200 });
    if (url.host === "www.googleapis.com" && url.pathname === "/webmasters/v3/sites") {
      return jsonResponse({ siteEntry: [{ siteUrl: "https://exemplo.com/", permissionLevel: "siteOwner" }] });
    }
    if (url.host === "gmail.googleapis.com") {
      if (this.rateLimited) return jsonResponse({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 429, { "retry-after": "30" });
      const path = url.pathname.replace("/gmail/v1/users/me", "");
      if (path === "/profile") return jsonResponse({ emailAddress: "joao@gmail.com", historyId: String(this.historyId) });
      if (path === "/messages")
        return jsonResponse({
          messages: this.messages.slice(0, Number(url.searchParams.get("maxResults") ?? 20)).map((m) => ({ id: m.id, threadId: m.threadId })),
          resultSizeEstimate: this.messages.length,
        });
      if (path.startsWith("/messages/")) {
        const id = decodeURIComponent(path.split("/")[2]!);
        if (this.failMeta.has(id)) return jsonResponse({ error: { status: "INTERNAL" } }, 500);
        const m = this.messages.find((x) => x.id === id);
        if (!m) return jsonResponse({ error: { status: "NOT_FOUND" } }, 404);
        const headers = [
          { name: "From", value: m.from },
          { name: "Subject", value: m.subject },
          { name: "To", value: "joao@gmail.com" },
          ...(m.listUnsubscribe ? [{ name: "List-Unsubscribe", value: "<mailto:x>" }] : []),
        ];
        return jsonResponse({ id: m.id, threadId: m.threadId, labelIds: m.labels ?? ["INBOX"], snippet: m.snippet, internalDate: String(m.internalDate), payload: { headers } });
      }
      if (path === "/history") {
        if (this.historyExpired) return jsonResponse({ error: { status: "NOT_FOUND" } }, 404);
        const start = Number(url.searchParams.get("startHistoryId"));
        const added = this.history.filter((h) => h.historyId > start).flatMap((h) => h.ids);
        return jsonResponse({
          history: added.map((id) => ({ messagesAdded: [{ message: { id, threadId: this.messages.find((m) => m.id === id)?.threadId ?? id, labelIds: ["INBOX"] } }] })),
          historyId: String(this.historyId),
        });
      }
    }
    return new Response("rota não simulada: " + url.toString(), { status: 599 });
  };

  nextNonce: string | null = null;
  grantedScope = "openid email https://www.googleapis.com/auth/gmail.readonly";

  addMessage(m: Partial<FakeMessage> & { id: string }, viaHistory = true) {
    const full: FakeMessage = { threadId: `t-${m.id}`, from: "Ana <ana@exemplo.com>", subject: "Olá", snippet: "", internalDate: Date.parse("2026-10-13T09:00:00Z"), ...m };
    this.messages.unshift(full);
    if (viaHistory) {
      this.historyId += 1;
      this.history.push({ historyId: this.historyId, ids: [m.id] });
    }
  }
}

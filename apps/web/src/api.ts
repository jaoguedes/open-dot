import type { AgentId, AgentVisual, ProviderCard } from "@open-dot/core";

/** Tipos que a interface consome (espelham as rotas do worker). */

export interface DigestMail {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  reason: string;
  receivedAt: string;
  category: "important" | "review" | "low";
  href: string;
}

export interface FeedEntry {
  id: string;
  agentId: AgentId;
  runId: string | null;
  kind: "email_digest" | "site_incident" | "ci_failure" | "deploy" | "notice" | "file_organized" | "news_digest" | "quote_alert" | "marketing_ideas";
  title: string;
  body: {
    headline?: string;
    summary?: string;
    counts?: { important: number; review: number; low: number };
    total?: number;
    late?: boolean;
    top?: DigestMail[];
    rest?: DigestMail[];
    aiUsed?: boolean;
    aiNote?: string | null;
    correlation?: string | null;
    href?: string | null;
    actions?: Array<{ kind: string; label: string }>;
    worldToday?: Array<{ theme: string; items: Array<{ title: string; link: string; outlet: string; publishedAt: string | null }> }>;
    politics?: Array<{ topic: string; eachSide: Array<{ outlet: string; title: string; link: string }>; notice: string | null }>;
    drafts?: Array<{ text: string; sources: Array<{ title: string; link: string; outlet: string }>; status: "draft"; publish: false }>;
    published?: boolean;
    disclaimer?: string;
  };
  freshness: "fresh" | "stale" | "partial";
  coverage: { analyzed: number; available: number | null; syncedUntil: string | null; fieldsRead: string[]; partial: boolean; partialReason?: string } | null;
  createdAt: string;
}

export interface Connection {
  id: string;
  provider: "gmail" | "github" | "vercel" | "gsc";
  status: "connected" | "reauth_required" | "error" | "disabled";
  accountLabel: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface AgentSource {
  id: string;
  label: string;
  detail: string;
}

export interface AgentCard {
  id: "noticias" | "mercado" | "marketing";
  name: string;
  description: string;
  enabled: boolean;
  lastTestAt: string | null;
  lastError: string | null;
  sources: AgentSource[];
  missing: string[];
  note: string;
  quotes?: Array<{ symbol: string; price: number; changePct: number | null; source: string; quotedAt: string; fetchedAt: string; stale: boolean; disclaimer: string }>;
}

export interface Configured {
  database: boolean;
  google: boolean;
  owner: boolean;
  github: boolean;
  githubApp: boolean;
  vercel: boolean;
  ai: boolean;
  aiPrivate: boolean;
  finnhub: boolean;
}

export interface Routine {
  id: string;
  agentId: AgentId;
  kind: string;
  times: string[];
  timeZone: string;
  weekdays: number[];
  enabled: boolean;
  nextRunAt: string | null;
}

export interface RunInfo {
  id: string;
  agentId: AgentId;
  kind: string;
  state: string;
  scheduledAt: string | null;
  late: boolean;
  attempt: number;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface Usage {
  day: string;
  calls: number;
  tokens: number;
  limits: { calls: number; tokens: number };
  aiConfigured: boolean;
  privateAllowed: boolean;
}

export interface Monitor {
  id: string;
  url: string;
  label: string;
  enabled: boolean;
  incident: { open?: boolean; consecutiveFailures?: number; kind?: "slow" | "down" };
  lastCheckAt: string | null;
}

export interface AskAnswer {
  answer: string;
  sources: Array<{ id: string; title: string; detail: string; href: string | null; at: string }>;
  aiUsed: boolean;
  note: string | null;
}

export interface Snapshot {
  owner: { email: string; name: string | null; timeZone: string } | null;
  feed: FeedEntry[];
  connections: Connection[];
  configured: Configured;
  routines: Routine[];
  runs: RunInfo[];
  usage: Usage | null;
  monitors: Monitor[];
  status: Array<AgentVisual & { revision: number }>;
  agents: AgentCard[];
  providers: ProviderCard[];
  approvals: ApprovalView[];
  canSend: boolean;
}

export interface ApprovalView {
  id: string;
  action: string;
  payloadHash: string;
  status: string;
  version: number;
  expiresAt: string;
  createdAt: string;
  proposal: {
    action: string;
    service: string;
    account: string;
    resource: string;
    payload: Record<string, unknown>;
    consequence: string;
  } | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly missing?: string[],
  ) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("x-open-dot", "1");
  if (init.body) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "offline", "Sem conexão com o servidor.");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, "not_api", "O servidor não respondeu como a API do Open Dot.");
  }
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? `Erro ${res.status}`, data?.error?.missing);
  return data as T;
}

export const api = {
  session: () => req<{ authenticated: boolean; owner?: Snapshot["owner"]; devLoginAvailable?: boolean; googleLoginAvailable?: boolean }>("/api/session"),
  legal: () => req<{ contact: string | null }>("/api/legal"),
  devLogin: () => req<{ ok: true }>("/api/session/dev", { method: "POST" }),
  logout: () => req<{ ok: true }>("/api/logout", { method: "POST" }),
  feed: () => req<{ items: FeedEntry[]; next: string | null }>("/api/feed"),
  connections: () => req<{ configured: Configured; connections: Connection[]; agents: AgentCard[]; providers: ProviderCard[] }>("/api/connections"),
  testProvider: (id: string) =>
    req<{ ok: true; used: "fake"; realCall: false; note: string; result: { category: string; evidenceId: string } }>(`/api/ai/providers/${encodeURIComponent(id)}/test`, { method: "POST" }),
  startGsc: () => req<{ url: string }>("/api/connections/gsc/start", { method: "POST" }),
  testAgent: (id: string) => req<{ ok: true; failures?: string[]; missing?: string[]; published?: false; traded?: false; note?: string }>(`/api/agents/${encodeURIComponent(id)}/test`, { method: "POST" }),
  disableAgent: (id: string) => req<{ ok: true; enabled: false }>(`/api/agents/${encodeURIComponent(id)}/disable`, { method: "POST" }),
  enableAgent: (id: string) => req<{ ok: true; enabled: true }>(`/api/agents/${encodeURIComponent(id)}/enable`, { method: "POST" }),
  routines: () => req<{ routines: Routine[] }>("/api/routines"),
  runs: () => req<{ runs: RunInfo[] }>("/api/runs"),
  usage: () => req<Usage>("/api/usage"),
  monitors: () => req<{ monitors: Monitor[] }>("/api/monitors"),
  status: () => req<{ agents: Snapshot["status"] }>("/api/status"),
  startGmail: () => req<{ url: string }>("/api/connections/gmail/start", { method: "POST" }),
  disconnect: (id: string) => req<{ ok: true; revokedAtProvider: boolean }>(`/api/connections/${encodeURIComponent(id)}/disconnect`, { method: "POST" }),
  updateRoutine: (id: string, body: { times: string[]; timeZone: string; enabled: boolean }) => req<{ ok: true; cancelledFutureRuns: number }>(`/api/routines/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  runNow: (id: string) => req<{ ok: true; created: boolean; note: string }>(`/api/routines/${encodeURIComponent(id)}/run-now`, { method: "POST" }),
  addMonitor: (url: string, label: string) => req<{ id: string }>("/api/monitors", { method: "POST", body: JSON.stringify({ url, label }) }),
  ask: (question: string) => req<AskAnswer>("/api/ask", { method: "POST", body: JSON.stringify({ question }) }),
  approvals: () => req<{ approvals: ApprovalView[]; canSend: boolean }>("/api/approvals"),
  decideApproval: (id: string, body: { decision: "approve" | "reject"; expectedVersion: number; payloadHash: string }) =>
    req<{ result: string; executed?: boolean; sent?: boolean; note?: string | null }>(`/api/approvals/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(body) }),
  editApproval: (id: string, body: { expectedVersion: number; proposal: NonNullable<ApprovalView["proposal"]> }) =>
    req<{ result: string; payloadHash?: string; version?: number }>(`/api/approvals/${encodeURIComponent(id)}/edit`, { method: "POST", body: JSON.stringify(body) }),
  uploads: () => req<{ uploads: UploadView[] }>("/api/uploads"),
  upload: (id: string) => req<UploadView>(`/api/uploads/${encodeURIComponent(id)}`),
  processUpload: (id: string) => req<UploadView>(`/api/uploads/${encodeURIComponent(id)}/process`, { method: "POST" }),
  deleteUpload: (id: string) => req<{ ok: true }>(`/api/uploads/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export interface UploadView {
  id: string;
  fileName: string;
  mime: string;
  fileBytes: number;
  textChars: number;
  pages: number | null;
  state: "received" | "processing" | "organized" | "failed";
  runId: string | null;
  result: { title: string; chars: number; words: number; pages: number | null; headings: string[]; keywords: string[]; preview: string; readingMinutes: number } | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadBody {
  fileName: string;
  mime: string;
  fileBytes: number;
  fileSha256: string;
  text: string;
  textSha256: string;
  pages: number | null;
}

/**
 * Envio com progresso real (XHR expõe upload.onprogress; fetch não). Resolve só com a
 * resposta 201 do servidor — é ela que autoriza mostrar "recebido".
 */
export function sendUpload(body: UploadBody, onProgress: (loaded: number, total: number | null) => void, signal?: AbortSignal): Promise<{ id: string; runId: string; state: "received" }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.setRequestHeader("content-type", "application/json");
    xhr.setRequestHeader("x-open-dot", "1");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : null);
    xhr.onerror = () => reject(new ApiError(0, "offline", "Sem conexão com o servidor."));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Envio cancelado."));
    xhr.onload = () => {
      let data: any = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        return reject(new ApiError(xhr.status, "not_api", "O servidor não respondeu como a API do Open Dot."));
      }
      if (xhr.status === 201 && data?.id) return resolve(data);
      const err = new ApiError(xhr.status, data?.error?.code ?? "error", data?.error?.message ?? `Erro ${xhr.status}`);
      (err as ApiError & { existing?: unknown }).existing = data?.existing;
      reject(err);
    };
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(JSON.stringify(body));
  });
}

export async function loadSnapshot(owner: Snapshot["owner"]): Promise<{ snap: Snapshot; failures: string[] }> {
  const failures: string[] = [];
  const settle = async <T,>(name: string, p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      failures.push(name);
      if (e instanceof ApiError && e.status === 401) throw e;
      return fallback;
    }
  };
  const [feed, conns, routines, runs, usage, monitors, status, approvals] = await Promise.all([
    settle("feed", api.feed(), { items: [], next: null }),
    settle("conexões", api.connections(), { configured: emptyConfigured, connections: [], agents: [], providers: [] }),
    settle("rotinas", api.routines(), { routines: [] }),
    settle("execuções", api.runs(), { runs: [] }),
    settle("uso", api.usage(), null),
    settle("monitores", api.monitors(), { monitors: [] }),
    settle("estado", api.status(), { agents: [] }),
    settle("aprovações", api.approvals(), { approvals: [], canSend: false }),
  ]);
  return {
    snap: {
      owner,
      feed: feed.items,
      connections: conns.connections,
      configured: conns.configured,
      routines: routines.routines,
      runs: runs.runs,
      usage,
      monitors: monitors.monitors,
      status: status.agents,
      agents: conns.agents ?? [],
      providers: conns.providers ?? [],
      approvals: approvals.approvals,
      canSend: approvals.canSend,
    },
    failures,
  };
}

export const emptyConfigured: Configured = { database: false, google: false, owner: false, github: false, githubApp: false, vercel: false, ai: false, aiPrivate: false, finnhub: false };

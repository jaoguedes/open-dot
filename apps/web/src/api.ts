// SPDX-License-Identifier: AGPL-3.0-only
import { SNAPSHOT_PART_LABEL } from "./refresh-policy.ts";
import type { AgentId, AgentVisual, ProviderCard } from "@open-dot/core";

/** Tipos que a interface consome. Os contratos de resposta ficam em packages/core/src/contracts.ts (F3). */
import type { AskAnswer, Configured, Connection, Monitor, Routine, RunInfo, SessionView, Usage } from "@open-dot/core/contracts.ts";
export type { AskAnswer, Configured, Connection, Monitor, Routine, RunInfo, SessionView, Usage };

/** Só no build de desenvolvimento: confere a resposta contra o contrato e avisa no console. */
function devCheck(path: string, data: unknown): void {
  if (import.meta.env.DEV) {
    void import("@open-dot/core/contracts.ts").then(({ checkContract }) => {
      const problems = checkContract(path, data);
      if (problems.length) console.warn(`[contrato] ${path}`, problems);
    });
  }
}

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
  kind: "email_digest" | "site_incident" | "ci_failure" | "deploy" | "notice" | "file_organized" | "news_digest" | "quote_alert" | "marketing_ideas" | "shipment";
  title: string;
  state?: "open" | "done" | "snoozed";
  body: {
    headline?: string;
    summary?: string;
    counts?: { important: number; review: number; low: number };
    abertura?: string;
    itens?: Array<{
      categoria: string;
      titulo: string;
      quando: string;
      o_que_aconteceu: string;
      o_que_fazer: string;
      origem: string;
      sensivel: boolean;
      de?: string;
      href?: string;
      rfc822?: string | null;
      /** Hash do domínio do remetente (nunca o domínio). */
      remetente?: string | null;
    }>;
    sem_acao?: string[];
    ruido?: { contagem: number };
    anexos?: string;
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
  shipments: ShipmentSnapshot;
  /** Hashes de domínio dos remetentes silenciados (G). */
  silenced?: string[];
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
    readonly reason?: string,
  ) {
    super(message);
  }
}

const troubleAt = new Map<string, number>();
let quietTrouble = false;

function noteTrouble(code: string) {
  if (quietTrouble) return;
  const now = Date.now();
  const prev = troubleAt.get(code) ?? 0;
  if (now - prev < 5 * 60_000) return;
  troubleAt.set(code, now);
  window.dispatchEvent(new CustomEvent("od-trouble", { detail: { code } }));
}

const CLIENT_TIMEOUT_MS = 8_000;
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * fetch com timeout de 8 s. Leitura (GET) tem UMA nova tentativa em 5xx, 429 ou falha
 * de rede, respeitando Retry-After (até 3 s). Escrita nunca repete sozinha (C2).
 */
export async function fetchWithRetry(path: string, init: RequestInit, sleep: (ms: number) => Promise<void> = pause): Promise<Response> {
  const read = !init.method || init.method === "GET";
  const once = () => fetch(path, { ...init, credentials: "same-origin", signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
  let res: Response | null = null;
  try {
    res = await once();
  } catch (e) {
    if (!read) throw e;
  }
  if (!read || (res && res.status !== 429 && res.status < 500)) return res!;
  const after = Number(res?.headers.get("retry-after") ?? NaN);
  await sleep(Number.isFinite(after) && after >= 0 ? Math.min(3_000, after * 1000) : 400);
  return once();
}

async function req<T>(path: string, init: RequestInit = {}, quiet = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("x-open-dot", "1");
  if (init.body) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetchWithRetry(path, { ...init, headers });
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
  if (res.ok) devCheck(path, data);
  if (!res.ok) {
    const reason = typeof data?.error?.reason === "string" ? data.error.reason : undefined;
    if (!quiet && !quietTrouble && (reason || res.status >= 500)) noteTrouble(reason || "internal");
    throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? `Erro ${res.status}`, data?.error?.missing, reason);
  }
  return data as T;
}

export interface Diagnostics {
  health: { ok: boolean; schema: string | null; requiredSchema: string; schemaError: string | null; env: string; configured: Record<string, boolean | string> };
  lastTick: { at: string; planned: number; runs: number; monitors: number; subrequests: number; stepErrors: Array<{ step: string; reason: string }>; skipped: string | null; savedAt: string } | null;
  failures: Array<{ runId: string; agentId: string; kind: string; state: string; at: string; code: string; frase: string; acao: string }>;
  time: string;
}

export const api = {
  session: () => req<{ authenticated: boolean; owner?: Snapshot["owner"]; devLoginAvailable?: boolean; googleLoginAvailable?: boolean }>("/api/session"),
  version: () => req<{ app: string; worker: string }>("/api/version"),
  legal: () => req<{ contact: string | null; contactKind?: "email" | "url" | null }>("/api/legal"),
  contactSettings: () => req<{ value: string | null; kind: "email" | "url" | null; source: "app" | "ambiente" | "nenhum"; isLoginEmail: boolean }>("/api/settings/contact"),
  saveContact: (value: string) => req<{ value: string | null; kind: "email" | "url" | null; source: "app" | "ambiente" | "nenhum" }>("/api/settings/contact", { method: "PUT", body: JSON.stringify({ value }) }),
  devLogin: () => req<{ ok: true }>("/api/session/dev", { method: "POST" }),
  logout: () => req<{ ok: true }>("/api/logout", { method: "POST" }),
  sessions: () => req<{ sessions: SessionView[] }>("/api/sessions"),
  diagnostics: () => req<Diagnostics>("/api/diagnostics"),
  correioFeedback: (body: { messageId: string; categoria: string; rotulo: "importante" | "nao_importa" }) => req<{ ok: true; silenced: boolean; label: string | null; hash?: string }>("/api/correio/feedback", { method: "POST", body: JSON.stringify(body) }),
  silencedSenders: () => req<{ senders: Array<{ domainHash: string; label: string }> }>("/api/correio/silenced"),
  undoSilence: (hash: string) => req<{ ok: true }>(`/api/correio/silenced/${encodeURIComponent(hash)}/undo`, { method: "POST" }),
  deleteAccount: () => req<{ ok: true; revoked: number }>("/api/account/delete", { method: "POST", body: JSON.stringify({ confirm: "APAGAR TUDO" }) }),
  logoutAll: () => req<{ ok: true; removed: number }>("/api/sessions/logout-all", { method: "POST" }),
  feed: (before?: string | null) => req<{ items: FeedEntry[]; next: string | null }>(before ? `/api/feed?before=${encodeURIComponent(before)}` : "/api/feed"),
  connections: () => req<{ configured: Configured; connections: Connection[]; agents: AgentCard[]; providers: ProviderCard[] }>("/api/connections"),
  testProvider: (id: string) =>
    req<{ ok: true; used: "fake"; realCall: false; note: string; result: { category: string; evidenceId: string } }>(`/api/ai/providers/${encodeURIComponent(id)}/test`, { method: "POST" }),
  startGsc: () => req<{ url: string }>("/api/connections/gsc/start", { method: "POST" }),
  testAgent: (id: string) =>
    req<{ ok: true; failures?: Array<string | { source?: string; reason?: string }>; missing?: string[]; published?: false; traded?: false; note?: string }>(
      `/api/agents/${encodeURIComponent(id)}/test`,
      { method: "POST" },
    ),
  disableAgent: (id: string) => req<{ ok: true; enabled: false }>(`/api/agents/${encodeURIComponent(id)}/disable`, { method: "POST" }),
  enableAgent: (id: string) => req<{ ok: true; enabled: true }>(`/api/agents/${encodeURIComponent(id)}/enable`, { method: "POST" }),
  routines: () => req<{ routines: Routine[] }>("/api/routines"),
  runs: () => req<{ runs: RunInfo[] }>("/api/runs"),
  usage: () => req<Usage>("/api/usage"),
  monitors: () => req<{ monitors: Monitor[] }>("/api/monitors"),
  status: () => req<{ agents: Snapshot["status"] }>("/api/status"),
  startGmail: () => req<{ url: string }>("/api/connections/gmail/start", { method: "POST" }),
  disconnect: (id: string) => req<{ ok: true; revokedAtProvider: boolean }>(`/api/connections/${encodeURIComponent(id)}/disconnect`, { method: "POST" }),
  updateRoutine: (id: string, body: { times: string[]; timeZone: string; enabled: boolean }) =>
    req<{ ok: true; cancelledFutureRuns: number }>(`/api/routines/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
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
  updateName: (name: string) => req<{ name: string }>("/api/profile", { method: "PATCH", body: JSON.stringify({ name }) }),
  reviewNow: () => req<{ ok: boolean; synced: number; shipments: number; reviewed: boolean; note: string }>("/api/correio/review-now", { method: "POST" }),
  watchSelf: () => req<{ id: string; created: boolean }>("/api/monitors/self", { method: "POST" }),
  shipments: () => req<ShipmentSnapshot>("/api/shipments"),
  addShipment: (code: string, carrier?: string) =>
    req<ShipmentSnapshot & { created: boolean; shipment: ShipmentView | null }>("/api/shipments", { method: "POST", body: JSON.stringify({ code, ...(carrier ? { carrier } : {}) }) }),
  confirmShipmentCarrier: (id: string, carrier: string) => req<ShipmentSnapshot>(`/api/shipments/${encodeURIComponent(id)}/carrier`, { method: "POST", body: JSON.stringify({ carrier }) }),
  deleteShipment: (id: string) => req<{ ok: true }>(`/api/shipments/${encodeURIComponent(id)}`, { method: "DELETE" }),
  feedDone: (id: string) => req<{ ok: true }>(`/api/feed/${encodeURIComponent(id)}/done`, { method: "POST" }),
  feedSnooze: (id: string) => req<{ ok: true; until: string }>(`/api/feed/${encodeURIComponent(id)}/snooze`, { method: "POST" }),
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

export type SnapshotFetch = { kind: "same" } | { kind: "fresh"; snap: Snapshot; failures: string[]; etag: string | null; next: string | null } | { kind: "legacy" };

/**
 * Uma requisição com If-None-Match (C1). 304 = nada mudou. 404 = Worker antigo sem a
 * rota (rollback): quem chama volta às rotas separadas.
 */
export async function fetchSnapshot(etag: string | null): Promise<SnapshotFetch> {
  let res: Response;
  try {
    res = await fetchWithRetry("/api/snapshot", { headers: etag ? { "if-none-match": etag } : {} });
  } catch {
    throw new ApiError(0, "offline", "Sem conexão com o servidor.");
  }
  if (res.status === 304) return { kind: "same" };
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, "not_api", "O servidor não respondeu como a API do Open Dot.");
  }
  if (res.status === 404 && data?.error?.code === "not_found") return { kind: "legacy" };
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? `Erro ${res.status}`, data?.error?.missing, data?.error?.reason);
  devCheck("/api/snapshot", data);
  const failures = Array.isArray(data.failures) ? data.failures.map((f: { part?: string }) => SNAPSHOT_PART_LABEL[f.part ?? ""] ?? "servidor") : [];
  const conns = data.connections ?? { configured: emptyConfigured, connections: [], agents: [], providers: [] };
  const approvals = data.approvals ?? { approvals: [], canSend: false };
  return {
    kind: "fresh",
    etag: res.headers.get("etag"),
    failures,
    next: data.feed?.next ?? null,
    snap: {
      owner: data.owner ?? null,
      feed: data.feed?.items ?? [],
      connections: conns.connections,
      configured: conns.configured,
      routines: data.routines?.routines ?? [],
      runs: data.runs?.runs ?? [],
      usage: data.usage ?? null,
      monitors: data.monitors?.monitors ?? [],
      status: data.status?.agents ?? [],
      agents: conns.agents ?? [],
      providers: conns.providers ?? [],
      approvals: approvals.approvals,
      canSend: approvals.canSend,
      shipments: data.shipments ?? emptyShipments,
      silenced: Array.isArray(data.silenced?.senders) ? data.silenced.senders.map((s: { domainHash: string }) => s.domainHash) : [],
    },
  };
}

export async function loadSnapshot(owner: Snapshot["owner"]): Promise<{ snap: Snapshot; failures: string[] }> {
  const failures: string[] = [];
  quietTrouble = true;
  try {
    const settle = async <T>(name: string, p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch (e) {
        failures.push(name);
        if (e instanceof ApiError && e.status === 401) throw e;
        return fallback;
      }
    };
    const [feed, conns, routines, runs, usage, monitors, status, approvals, shipments] = await Promise.all([
      settle("feed", api.feed(), { items: [], next: null }),
      settle("conexões", api.connections(), { configured: emptyConfigured, connections: [], agents: [], providers: [] }),
      settle("rotinas", api.routines(), { routines: [] }),
      settle("execuções", api.runs(), { runs: [] }),
      settle("uso", api.usage(), null),
      settle("monitores", api.monitors(), { monitors: [] }),
      settle("estado", api.status(), { agents: [] }),
      settle("aprovações", api.approvals(), { approvals: [], canSend: false }),
      settle("encomendas", api.shipments(), emptyShipments),
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
        shipments,
      },
      failures,
    };
  } finally {
    quietTrouble = false;
  }
}

export interface ShipmentView {
  id: string;
  code: string;
  carrier: string | null;
  carrierLabel: string | null;
  storeLabel: string | null;
  status: string | null;
  statusLabel: string | null;
  lastEventAt: string | null;
  lastEvent: string | null;
  events: Array<{ at: string; label: string; attribution: boolean }>;
  page: string | null;
  active: boolean;
  needsCarrier: boolean;
  lastError: string | null;
  provider: string | null;
  attribution: { label: string; href: string } | null;
}

export interface ShipmentSnapshot {
  shipments: ShipmentView[];
  tracking: { enabled: boolean; providerId: string | null; reason: string; calls: number; stop: number; limit: number; paused: boolean };
  disabledProviders: Array<{ id: string; name: string; reason: string }>;
  carriers: Array<{ id: string; label: string }>;
}

export const emptyShipments: ShipmentSnapshot = {
  shipments: [],
  tracking: { enabled: false, providerId: null, reason: "Rastreio automático desligado.", calls: 0, stop: 900, limit: 1000, paused: false },
  disabledProviders: [],
  carriers: [],
};

export const emptyConfigured: Configured = {
  database: false,
  google: false,
  owner: false,
  github: false,
  githubApp: false,
  vercel: false,
  ai: false,
  aiPrivate: false,
  finnhub: false,
  tracking: false,
  trackingState: "desligado",
};

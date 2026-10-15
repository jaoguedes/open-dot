import { fetchWithTimeout, ConnectorError } from "./errors.ts";
import { isDeliveredStatus, statusLabel, type TrackingEvent } from "@open-dot/core";

/**
 * PacoteVício — GET /v1/track/:code (documentação em painel.pacotevicio.dev/docs, 15/10/2026).
 * Só o código vai na URL. A chave vai no header X-API-Key e não é logada.
 * O plano Básico exige manter o primeiro evento quando ele for a atribuição.
 */

export interface PacoteTrack {
  code: string;
  carrier: string | null;
  status: string;
  updatedAt: string | null;
  events: TrackingEvent[];
  delivered: boolean;
}

const CARRIER_MAP: Record<string, string> = {
  correios: "correios",
  aliexpress: "aliexpress",
  "ali-express": "aliexpress",
  anjun: "anjun",
  "anjun express": "anjun",
  "j&t": "jt",
  "j&t express": "jt",
  jt: "jt",
  jtexpress: "jt",
  "total express": "total",
  total: "total",
  totalexpress: "total",
  shopee: "shopee",
  "shopee express": "shopee",
};

export function mapPacoteCarrier(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = raw.trim().toLowerCase();
  return CARRIER_MAP[key] ?? null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export function parsePacoteBody(data: unknown, code: string): PacoteTrack {
  const body = asRecord(data);
  if (!body) throw new ConnectorError("invalid_response", "Resposta de rastreio inválida.");
  const err = asRecord(body.error);
  if (err && typeof err.code === "string") {
    const c = err.code;
    if (c === "unauthorized" || c === "invalid_api_key" || c === "forbidden") throw new ConnectorError("unauthorized", "Chave do PacoteVício recusada.", null, 401);
    if (c === "not_found" || c === "unknown_tracking_code") throw new ConnectorError("not_found", "Código não encontrado.", null, 404);
    if (c === "rate_limited" || c === "quota_exceeded") throw new ConnectorError("rate_limited", "PacoteVício limitou as consultas.", null, 429);
    throw new ConnectorError("upstream", "Consulta de rastreio indisponível.", null, null);
  }
  const eventsRaw = Array.isArray(body.events) ? body.events : [];
  const events: TrackingEvent[] = [];
  for (const item of eventsRaw) {
    const ev = asRecord(item);
    if (!ev) continue;
    const at = typeof ev.timestamp === "string" ? ev.timestamp : "";
    const status = typeof ev.status === "string" ? ev.status : "unknown";
    const description = typeof ev.description === "string" ? ev.description : "";
    const attribution = /pacote\s?v[ií]cio/i.test(`${description} ${status}`);
    events.push({
      at,
      status,
      label: (description || statusLabel(status)).slice(0, 160),
      attribution,
    });
  }
  const status = typeof body.status === "string" ? body.status : events.at(-1)?.status ?? "unknown";
  const updatedAt = typeof body.status_updated_at === "string" ? body.status_updated_at : events.at(-1)?.at || null;
  return {
    code: typeof body.tracking_code === "string" ? body.tracking_code : code,
    carrier: mapPacoteCarrier(body.courier),
    status,
    updatedAt,
    events: trimEvents(events),
    delivered: isDeliveredStatus(status),
  };
}

/** Mantém o primeiro evento (atribuição do plano Básico) e os mais recentes. */
export function trimEvents(events: TrackingEvent[]): TrackingEvent[] {
  if (events.length <= 12) return events;
  return [events[0]!, ...events.slice(1).slice(-11)];
}

export async function trackPacoteVicio(fetchImpl: typeof fetch, apiKey: string, code: string): Promise<PacoteTrack> {
  const url = `https://api.pacotevicio.dev/v1/track/${encodeURIComponent(code)}`;
  const resp = await fetchWithTimeout(
    fetchImpl,
    url,
    { method: "GET", headers: { accept: "application/json", "X-API-Key": apiKey } },
    12_000,
  );
  const data = await resp.json().catch(() => null);
  if (resp.status === 401 || resp.status === 403) throw new ConnectorError("unauthorized", "Chave do PacoteVício recusada.", null, resp.status);
  if (resp.status === 404) throw new ConnectorError("not_found", "Código não encontrado.", null, 404);
  if (resp.status === 429) throw new ConnectorError("rate_limited", "PacoteVício limitou as consultas.", null, 429);
  if (resp.status >= 500) throw new ConnectorError("upstream", "Consulta de rastreio indisponível.", null, resp.status);
  if (!resp.ok) throw new ConnectorError("invalid_response", "Consulta de rastreio recusada.", null, resp.status);
  return parsePacoteBody(data, code);
}

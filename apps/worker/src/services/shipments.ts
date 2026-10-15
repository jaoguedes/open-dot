import {
  CARRIER_LABEL,
  DISABLED_TRACKING_PROVIDERS,
  MANUAL_CARRIERS,
  PACOTEVICIO_ATTRIBUTION,
  TRACKING_BATCH,
  TRACKING_MIN_INTERVAL_MS,
  TRACKING_MONTHLY_LIMIT,
  TRACKING_MONTHLY_STOP,
  carrierPage,
  decideCarrier,
  detectCode,
  detectInText,
  isCarrierId,
  normalizeTrackingCode,
  pacotevicioCovers,
  randomId,
  shopLabel,
  statusLabel,
  trackingGate,
  type CarrierId,
  type TrackingEvent,
} from "@open-dot/core";
import { ConnectorError } from "@open-dot/connectors/errors.ts";
import { trackPacoteVicio } from "@open-dot/connectors/pacotevicio.ts";
import type { Ctx } from "../context.ts";
import * as repo from "../repo.ts";

function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function publicError(e: unknown): string {
  if (e instanceof ConnectorError) {
    if (e.code === "unauthorized") return "chave_recusada";
    if (e.code === "rate_limited") return "limite";
    if (e.code === "not_found") return "nao_encontrado";
    if (e.code === "timeout") return "tempo_esgotado";
  }
  return "indisponivel";
}

/** Varre assunto e trecho já guardados. Só grava código, loja e transportadora. */
export async function extractShipments(ctx: Ctx, ownerId: string): Promise<number> {
  const mails = await repo.recentMailTexts(ctx.db, ctx.keys, ownerId, 40);
  let created = 0;
  for (const mail of mails) {
    const found = detectInText(`${mail.subject}\n${mail.snippet}`);
    const byCode = new Map<string, typeof found>();
    for (const c of found) {
      const list = byCode.get(c.code) ?? [];
      list.push(c);
      byCode.set(c.code, list);
    }
    for (const [code, candidates] of byCode) {
      const decision = decideCarrier(candidates);
      if (decision.kind !== "match") continue;
      const pick = decision.candidates[0];
      if (!pick || pick.checksum === "invalid") continue;
      const store = shopLabel(mail.from);
      const ok = await repo.insertShipment(ctx.db, {
        id: randomId("shp_"),
        ownerId,
        code,
        carrier: pick.carrier,
        confidence: pick.confidence,
        storeLabel: store,
        needsCarrier: false,
        now: ctx.now(),
      });
      if (!ok) continue;
      created++;
      await repo.insertFeed(ctx.db, ctx.keys, {
        ownerId,
        agentId: "entregas",
        runId: `ship:${code}:posted`,
        kind: "shipment",
        title: "Encomenda postada",
        body: {
          summary: store ? `${CARRIER_LABEL[pick.carrier]} · ${store}` : CARRIER_LABEL[pick.carrier],
          code,
          carrier: pick.carrier,
          actions: [{ kind: "open_agent", label: "Ver Entregas" }],
        },
        freshness: "fresh",
        coverage: null,
        now: ctx.now(),
      });
    }
  }
  return created;
}

export function previewTrackingCode(raw: string) {
  const code = normalizeTrackingCode(raw);
  const candidates = detectCode(code);
  return { code, decision: decideCarrier(candidates), candidates };
}

export async function addShipment(ctx: Ctx, ownerId: string, raw: string, carrierChoice: string | null) {
  const preview = previewTrackingCode(raw);
  if (!/^[A-Z0-9]{8,40}$/.test(preview.code)) return { ok: false as const, status: 400, code: "invalid_code", message: "Código de rastreio inválido." };
  const decision = preview.decision;
  let carrier: CarrierId | null = null;
  let needsCarrier = false;
  let confidence: string | null = null;
  if (carrierChoice) {
    if (!isCarrierId(carrierChoice)) return { ok: false as const, status: 400, code: "invalid_carrier", message: "Transportadora desconhecida." };
    carrier = carrierChoice;
    confidence = decision.kind === "match" && decision.candidates[0]?.carrier === carrier ? "high" : "low";
  } else if (decision.kind === "match" && decision.candidates[0]) {
    carrier = decision.candidates[0].carrier;
    confidence = decision.candidates[0].confidence;
  } else {
    needsCarrier = true;
  }
  const id = randomId("shp_");
  const created = await repo.insertShipment(ctx.db, {
    id,
    ownerId,
    code: preview.code,
    carrier,
    confidence,
    storeLabel: null,
    needsCarrier,
    now: ctx.now(),
  });
  if (!created) {
    const existing = (await repo.listShipments(ctx.db, ownerId)).find((s) => s.code === preview.code);
    return { ok: true as const, created: false, shipment: existing ? toShipmentView(existing) : null, decision };
  }
  const row = (await repo.listShipments(ctx.db, ownerId)).find((s) => s.id === id);
  return { ok: true as const, created: true, shipment: row ? toShipmentView(row) : null, decision };
}

export async function confirmCarrier(ctx: Ctx, ownerId: string, id: string, carrier: string) {
  if (!isCarrierId(carrier)) return false;
  return repo.confirmShipmentCarrier(ctx.db, ownerId, id, carrier, ctx.now());
}

export function toShipmentView(row: repo.ShipmentRow) {
  let events: TrackingEvent[] = [];
  try {
    const parsed = JSON.parse(row.events_json) as TrackingEvent[];
    if (Array.isArray(parsed)) events = parsed;
  } catch {
    events = [];
  }
  const carrier = row.carrier && isCarrierId(row.carrier) ? row.carrier : null;
  return {
    id: row.id,
    code: row.code,
    carrier,
    carrierLabel: carrier ? CARRIER_LABEL[carrier] : null,
    storeLabel: row.store_label,
    status: row.status,
    statusLabel: row.status_label ?? (row.status ? statusLabel(row.status) : null),
    lastEventAt: row.last_event_at,
    lastEvent: row.last_event,
    events: events.map((e) => ({ at: e.at, label: e.label, attribution: Boolean(e.attribution) })),
    page: carrier ? carrierPage(carrier, row.code) : null,
    active: row.active === 1,
    needsCarrier: row.needs_carrier === 1,
    lastError: row.last_error,
    provider: row.provider,
    attribution: row.provider === "pacotevicio" ? PACOTEVICIO_ATTRIBUTION : null,
  };
}

export async function shipmentSnapshot(ctx: Ctx, ownerId: string) {
  const gate = trackingGate(ctx.env);
  const calls = await repo.trackingCalls(ctx.db, ownerId, monthKey(ctx.now()));
  const rows = await repo.listShipments(ctx.db, ownerId);
  return {
    shipments: rows.map(toShipmentView),
    tracking: {
      enabled: gate.enabled,
      providerId: gate.providerId,
      reason: gate.enabled ? "" : gate.reason,
      calls,
      stop: TRACKING_MONTHLY_STOP,
      limit: TRACKING_MONTHLY_LIMIT,
      paused: calls >= TRACKING_MONTHLY_STOP,
    },
    disabledProviders: DISABLED_TRACKING_PROVIDERS,
    carriers: MANUAL_CARRIERS.map((id) => ({ id, label: CARRIER_LABEL[id] })),
  };
}

/** Consulta poucas encomendas ativas. Não chama o provedor se ele estiver desligado. */
export async function pollShipments(ctx: Ctx, ownerId: string, fetchImpl: typeof fetch, limit = TRACKING_BATCH): Promise<{ checked: number; paused: boolean }> {
  const gate = trackingGate(ctx.env);
  const key = ctx.env.PACOTEVICIO_API_KEY;
  if (!gate.enabled || !key) return { checked: 0, paused: false };
  const dueBefore = new Date(ctx.now() - TRACKING_MIN_INTERVAL_MS).toISOString();
  const rows = await repo.dueShipments(ctx.db, ownerId, dueBefore, limit);
  let checked = 0;
  let paused = false;
  const month = monthKey(ctx.now());
  for (const row of rows) {
    if (row.carrier && !pacotevicioCovers(row.carrier)) {
      await repo.touchShipment(ctx.db, row.id, ownerId, "fora_da_cobertura", ctx.now());
      continue;
    }
    const slot = await repo.takeTrackingCall(ctx.db, ownerId, month, TRACKING_MONTHLY_STOP);
    if (!slot) {
      paused = true;
      break;
    }
    checked++;
    try {
      const track = await trackPacoteVicio(fetchImpl, key, row.code);
      const changed = Boolean(row.status) && track.status !== row.status;
      const label = statusLabel(track.status, track.events.at(-1)?.label);
      const last = track.events.at(-1);
      await repo.saveShipmentTrack(ctx.db, {
        id: row.id,
        ownerId,
        carrier: track.carrier && isCarrierId(track.carrier) ? track.carrier : row.carrier,
        status: track.status,
        statusLabel: label,
        lastEventAt: track.updatedAt,
        lastEvent: last?.label ?? label,
        eventsJson: JSON.stringify(track.events),
        provider: "pacotevicio",
        delivered: track.delivered,
        error: null,
        now: ctx.now(),
      });
      if (changed) {
        await repo.insertFeed(ctx.db, ctx.keys, {
          ownerId,
          agentId: "entregas",
          runId: `ship:${row.id}:${track.status}:${track.updatedAt ?? ctx.now()}`,
          kind: "shipment",
          title: `Encomenda ${label.toLowerCase()}`,
          body: { summary: `${row.code} · ${label}`, code: row.code, carrier: track.carrier ?? row.carrier },
          freshness: "fresh",
          coverage: null,
          now: ctx.now(),
        });
      }
    } catch (e) {
      const code = publicError(e);
      await repo.touchShipment(ctx.db, row.id, ownerId, code, ctx.now());
      if (code === "chave_recusada" || code === "limite") {
        paused = true;
        break;
      }
    }
  }
  return { checked, paused };
}

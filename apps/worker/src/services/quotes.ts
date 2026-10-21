// SPDX-License-Identifier: AGPL-3.0-only
import { DEFAULT_ASSETS, QUOTE_DISCLAIMER, hasTradeCapability, quoteCard, type Quote } from "@open-dot/core";
import { BudgetExhausted, type Ctx } from "../context.ts";
import * as repo from "../repo.ts";
import { safeReason } from "../reasons.ts";
import type { SourceFailure } from "./news.ts";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const QUOTE_INTERVAL_MS = 15 * 60_000;

export function quotesDue(lastTestAt: string | null | undefined, now: number): boolean {
  if (!lastTestAt) return true;
  const t = Date.parse(lastTestAt);
  return !Number.isFinite(t) || now - t >= QUOTE_INTERVAL_MS;
}

export async function ingestQuotes(ctx: Ctx, ownerId: string, fetchImpl: typeof fetch): Promise<{ quotes: Quote[]; failures: SourceFailure[]; notices: SourceFailure[]; skipped?: boolean }> {
  if (hasTradeCapability()) throw new Error("incapacidade de ordem violada");
  const settings = await repo.agentSettings(ctx.db, ownerId, "mercado");
  if (settings && settings.enabled === 0) return { quotes: [], failures: [{ source: "Mercado", reason: "disabled" }], notices: [] };
  const nowIso = new Date(ctx.now()).toISOString();
  if (!quotesDue(settings?.last_test_at, ctx.now())) {
    const rows = await ctx.db.query<{ symbol: string; price: number; change_pct: number | null; source: string; quoted_at: string; fetched_at: string }>(
      "SELECT symbol, price, change_pct, source, quoted_at, fetched_at FROM od_quotes WHERE owner_id = ?",
      [ownerId],
    );
    return {
      quotes: rows.map((q) => ({ symbol: q.symbol, price: q.price, changePct: q.change_pct, source: q.source, quotedAt: q.quoted_at, fetchedAt: q.fetched_at, disclaimer: QUOTE_DISCLAIMER })),
      failures: [],
      notices: [],
      skipped: true,
    };
  }
  const quotes: Quote[] = [];
  const failures: SourceFailure[] = [];
  const notices: SourceFailure[] = [];

  const crypto = DEFAULT_ASSETS.filter((a) => a.source === "coingecko");
  try {
    const ids = crypto.map((a) => a.externalId).join(",");
    const headers: Record<string, string> = { "user-agent": "OpenDot/1.0 (uso pessoal)", accept: "application/json" };
    if (ctx.env.COINGECKO_DEMO_API_KEY) headers["x-cg-demo-api-key"] = ctx.env.COINGECKO_DEMO_API_KEY;
    const res = await fetchImpl(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { headers });
    if (!res.ok) failures.push({ source: "CoinGecko", reason: `upstream_http_${res.status}` });
    else {
      const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
      for (const a of crypto) {
        const row = data[a.externalId];
        const price = num(row?.usd);
        if (price === null) {
          failures.push({ source: a.symbol, reason: "unknown" });
          continue;
        }
        quotes.push({
          symbol: a.symbol,
          price,
          changePct: num(row?.usd_24h_change),
          source: "CoinGecko",
          quotedAt: nowIso,
          fetchedAt: nowIso,
          disclaimer: QUOTE_DISCLAIMER,
        });
      }
    }
  } catch (e) {
    if (e instanceof BudgetExhausted) throw e;
    failures.push({ source: "CoinGecko", reason: safeReason(e) });
  }

  const fx = DEFAULT_ASSETS.filter((a) => a.source === "frankfurter");
  for (const a of fx) {
    try {
      const res = await fetchImpl(`https://api.frankfurter.app/latest?from=${a.externalId}&to=BRL`);
      if (!res.ok) {
        failures.push({ source: a.symbol, reason: `upstream_http_${res.status}` });
        continue;
      }
      const data = (await res.json()) as { date?: string; rates?: { BRL?: number } };
      const price = num(data.rates?.BRL);
      if (price === null) {
        failures.push({ source: a.symbol, reason: "unknown" });
        continue;
      }
      quotes.push({
        symbol: a.symbol,
        price,
        changePct: null,
        source: "Frankfurter/ECB",
        quotedAt: data.date ? `${data.date}T00:00:00.000Z` : nowIso,
        fetchedAt: nowIso,
        disclaimer: QUOTE_DISCLAIMER,
      });
    } catch (e) {
      if (e instanceof BudgetExhausted) throw e;
      failures.push({ source: a.symbol, reason: safeReason(e) });
    }
  }

  const key = ctx.env.FINNHUB_API_KEY;
  for (const a of DEFAULT_ASSETS.filter((x) => x.source === "finnhub")) {
    if (a.symbol === "PETR4.SA") {
      notices.push({ source: a.symbol, reason: "b3_fora_do_plano" });
      continue;
    }
    if (!key) {
      failures.push({ source: a.symbol, reason: "missing_key" });
      continue;
    }
    try {
      const res = await fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(a.externalId)}&token=${key}`);
      if (!res.ok) {
        failures.push({ source: a.symbol, reason: `upstream_http_${res.status}` });
        continue;
      }
      const data = (await res.json()) as { c?: number; dp?: number; t?: number };
      const price = num(data.c);
      if (price === null || price === 0) {
        failures.push({ source: a.symbol, reason: "unknown" });
        continue;
      }
      quotes.push({
        symbol: a.symbol,
        price,
        changePct: num(data.dp),
        source: "Finnhub",
        quotedAt: data.t ? new Date(data.t * 1000).toISOString() : nowIso,
        fetchedAt: nowIso,
        disclaimer: QUOTE_DISCLAIMER,
      });
    } catch (e) {
      if (e instanceof BudgetExhausted) throw e;
      failures.push({ source: a.symbol, reason: safeReason(e) });
    }
  }

  if (quotes.length) {
    await ctx.db.batch(
      quotes.map((q) => ({
        sql: "INSERT INTO od_quotes (owner_id, symbol, price, change_pct, source, quoted_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, symbol) DO UPDATE SET price = excluded.price, change_pct = excluded.change_pct, source = excluded.source, quoted_at = excluded.quoted_at, fetched_at = excluded.fetched_at",
        args: [ownerId, q.symbol, q.price, q.changePct, q.source, q.quotedAt, q.fetchedAt],
      })),
    );
  }

  const alerts = [];
  for (const q of quotes) {
    const spec = DEFAULT_ASSETS.find((a) => a.symbol === q.symbol);
    const card = quoteCard(q, ctx.now(), spec?.alertAbsPct ?? 8);
    if (!card.alert) continue;
    alerts.push({
      ownerId,
      agentId: "mercado",
      runId: null,
      kind: "quote_alert",
      title: `${q.symbol} passou do limite (${q.changePct?.toFixed(1)}%)`,
      body: {
        summary: `${spec?.label ?? q.symbol} variou ${q.changePct?.toFixed(1)}% (fonte ${q.source}, ${q.quotedAt}). ${QUOTE_DISCLAIMER}.`,
        href: null,
      },
      freshness: card.stale ? "stale" : "fresh",
      coverage: null,
      now: ctx.now(),
    });
  }
  await repo.insertFeeds(ctx.db, ctx.keys, alerts);

  await repo.touchAgentSettings(ctx.db, ownerId, "mercado", {
    lastTestAt: nowIso,
    lastError: failures.length ? failures.map((f) => `${f.source}:${f.reason}`).join(" ") : null,
    now: ctx.now(),
  });
  return { quotes, failures, notices };
}

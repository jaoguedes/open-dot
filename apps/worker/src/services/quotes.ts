import { DEFAULT_ASSETS, QUOTE_DISCLAIMER, hasTradeCapability, quoteCard, type Quote } from "@open-dot/core";
import type { Ctx } from "../context.ts";
import * as repo from "../repo.ts";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function ingestQuotes(ctx: Ctx, ownerId: string, fetchImpl: typeof fetch): Promise<{ quotes: Quote[]; failures: string[] }> {
  if (hasTradeCapability()) throw new Error("incapacidade de ordem violada");
  const settings = await repo.agentSettings(ctx.db, ownerId, "mercado");
  if (settings && settings.enabled === 0) return { quotes: [], failures: ["Mercado desativado."] };
  const nowIso = new Date(ctx.now()).toISOString();
  const quotes: Quote[] = [];
  const failures: string[] = [];

  const crypto = DEFAULT_ASSETS.filter((a) => a.source === "coingecko");
  try {
    const ids = crypto.map((a) => a.externalId).join(",");
    const res = await fetchImpl(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    if (!res.ok) failures.push(`CoinGecko: cotação indisponível (${res.status}).`);
    else {
      const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
      for (const a of crypto) {
        const row = data[a.externalId];
        const price = num(row?.usd);
        if (price === null) {
          failures.push(`${a.symbol}: sem preço na CoinGecko.`);
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
    failures.push(`CoinGecko: ${e instanceof Error ? e.message : "falha"}`);
  }

  const fx = DEFAULT_ASSETS.filter((a) => a.source === "frankfurter");
  for (const a of fx) {
    try {
      const res = await fetchImpl(`https://api.frankfurter.app/latest?from=${a.externalId}&to=BRL`);
      if (!res.ok) {
        failures.push(`Frankfurter ${a.symbol}: indisponível (${res.status}).`);
        continue;
      }
      const data = (await res.json()) as { date?: string; rates?: { BRL?: number } };
      const price = num(data.rates?.BRL);
      if (price === null) {
        failures.push(`${a.symbol}: sem taxa.`);
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
      failures.push(`Frankfurter ${a.symbol}: ${e instanceof Error ? e.message : "falha"}`);
    }
  }

  const key = ctx.env.FINNHUB_API_KEY;
  for (const a of DEFAULT_ASSETS.filter((x) => x.source === "finnhub")) {
    if (!key) {
      failures.push(`${a.symbol}: falta FINNHUB_API_KEY no setup:cloud (plano gratuito da Finnhub).`);
      continue;
    }
    try {
      const res = await fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(a.externalId)}&token=${key}`);
      if (!res.ok) {
        failures.push(`Finnhub ${a.symbol}: indisponível (${res.status}).`);
        continue;
      }
      const data = (await res.json()) as { c?: number; dp?: number; t?: number };
      const price = num(data.c);
      if (price === null || price === 0) {
        failures.push(`${a.symbol}: sem cotação.`);
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
      failures.push(`Finnhub ${a.symbol}: ${e instanceof Error ? e.message : "falha"}`);
    }
  }

  for (const q of quotes) {
    await ctx.db.run(
      "INSERT INTO od_quotes (owner_id, symbol, price, change_pct, source, quoted_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, symbol) DO UPDATE SET price = excluded.price, change_pct = excluded.change_pct, source = excluded.source, quoted_at = excluded.quoted_at, fetched_at = excluded.fetched_at",
      [ownerId, q.symbol, q.price, q.changePct, q.source, q.quotedAt, q.fetchedAt],
    );
  }

  for (const q of quotes) {
    const spec = DEFAULT_ASSETS.find((a) => a.symbol === q.symbol);
    const card = quoteCard(q, ctx.now(), spec?.alertAbsPct ?? 8);
    if (card.alert) {
      await repo.insertFeed(ctx.db, ctx.keys, {
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
  }

  await repo.touchAgentSettings(ctx.db, ownerId, "mercado", {
    lastTestAt: nowIso,
    lastError: failures.length ? failures.join(" ") : null,
    now: ctx.now(),
  });
  return { quotes, failures };
}

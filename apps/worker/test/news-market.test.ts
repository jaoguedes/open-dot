import { test } from "node:test";
import assert from "node:assert/strict";
import { client, makeCtx, jsonResponse } from "./harness.ts";
import { FakeGoogle } from "./fake-google.ts";
import { ingestNews } from "../src/services/news.ts";
import { ingestQuotes } from "../src/services/quotes.ts";
import { MARKETING_CAN_PUBLISH } from "@open-dot/core";

function rss(title: string, link: string) {
  return `<?xml version="1.0"?><rss><channel><item><title>${title}</title><link>${link}</link><pubDate>Wed, 14 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
}

const newsFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("bbci.co.uk") || url.includes("npr.org")) {
    const host = url.includes("npr") ? "npr" : "bbc";
    return new Response(rss(`Chip novo ${host}`, host === "npr" ? "https://www.npr.org/chip" : "https://www.bbc.com/chip"), { headers: { "content-type": "application/rss+xml" } });
  }
  if (url.includes("folha")) return new Response("paywall", { status: 403 });
  if (url.includes("coingecko.com")) {
    return jsonResponse({ bitcoin: { usd: 100_000, usd_24h_change: 9.2 }, ethereum: { usd: 4_000, usd_24h_change: 1.1 } });
  }
  if (url.includes("frankfurter.app")) return jsonResponse({ date: "2026-10-14", rates: { BRL: 5.4 } });
  if (url.includes("finnhub.io")) return jsonResponse({ c: 38.2, dp: 1.2, t: 1_760_400_000 });
  return new Response("sem rede no teste", { status: 599 });
};

test("notícias: ingestão deduplica, feed indisponível vira falha parcial", async () => {
  const ctx = await makeCtx({ fetch: newsFetch });
  const c = client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const r = await ingestNews(ctx, ownerId, newsFetch, { maxFeeds: 8 });
  assert.ok(r.failures.some((f) => f.reason === "upstream_http_403"));
  assert.ok(r.stored >= 1);
  const n = await ctx.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM od_news_items");
  const again = await ingestNews(ctx, ownerId, newsFetch, { maxFeeds: 8 });
  assert.equal(again.stored, 0, "dedupe por link");
  assert.equal((await ctx.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM od_news_items"))[0]!.n, n[0]!.n);
});

test("mercado: cotação velha marcada como desatualizada; nenhuma ordem", async () => {
  const ctx = await makeCtx({ fetch: newsFetch });
  const c = client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  await ctx.db.run(
    "INSERT INTO od_quotes (owner_id, symbol, price, change_pct, source, quoted_at, fetched_at) VALUES (?, 'BTC', 1, 0, 'CoinGecko', '2026-10-13T09:00:00.000Z', '2026-10-13T09:00:00.000Z')",
    [ownerId],
  );
  const cards = (await c.call("GET", "/api/connections")).json.agents;
  const mercado = cards.find((a: { id: string }) => a.id === "mercado");
  assert.equal(mercado.quotes[0].stale, true);
  assert.match(mercado.quotes[0].disclaimer, /não é recomendação/);
  const test = await c.call("POST", "/api/agents/mercado/test");
  assert.equal(test.status, 200);
  assert.equal(test.json.traded, false);
  assert.equal(test.json.disclaimer, "Só informativo, não é recomendação");
  assert.ok(test.json.quotes.some((q: { symbol: string }) => q.symbol === "BTC"));
});

test("marketing: não publica; Search Console só leitura; desativar bloqueia teste", async () => {
  assert.equal(MARKETING_CAN_PUBLISH, false);
  const google = new FakeGoogle();
  google.grantedScope = "openid email https://www.googleapis.com/auth/webmasters.readonly";
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
  const start = await c.call("POST", "/api/connections/gsc/start");
  assert.equal(start.status, 200);
  const authUrl = new URL(start.json.url);
  assert.match(authUrl.searchParams.get("scope") ?? "", /webmasters\.readonly/);
  google.nextNonce = authUrl.searchParams.get("nonce");
  const cb = await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(authUrl.searchParams.get("state")!)}`);
  assert.equal(cb.headers.get("location"), "/conexoes?ok=gsc");
  const conns = (await c.call("GET", "/api/connections")).json;
  assert.equal(conns.connections.some((x: { provider: string; status: string }) => x.provider === "gsc" && x.status === "connected"), true);
  const mkt = conns.agents.find((a: { id: string }) => a.id === "marketing");
  assert.ok(mkt.missing.some((x: string) => /Redes sociais/.test(x)));
  const t = await c.call("POST", "/api/agents/marketing/test");
  assert.equal(t.status, 200);
  assert.equal(t.json.published, false);
  assert.ok(google.calls.every((x) => !/twitter|instagram|facebook|publish|tweet/i.test(x)));
  const off = await c.call("POST", "/api/agents/noticias/disable");
  assert.equal(off.json.enabled, false);
  const blocked = await c.call("POST", "/api/agents/noticias/test");
  assert.equal(blocked.status, 409);
});

test("código do worker: ingestQuotes não negocia", async () => {
  const ctx = await makeCtx({ fetch: newsFetch });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const r = await ingestQuotes(ctx, ownerId, newsFetch);
  assert.ok(r.quotes.length >= 2);
  assert.ok(r.quotes.every((q) => q.disclaimer.includes("não é recomendação")));
  assert.equal(r.notices.some((n) => n.reason === "b3_fora_do_plano"), true);
  assert.equal(r.failures.some((f) => f.source === "PETR4.SA"), false);
  const again = await ingestQuotes(ctx, ownerId, newsFetch);
  assert.equal(again.skipped, true);
  const order = await c.call("POST", "/api/orders", { symbol: "BTC", side: "buy" });
  assert.ok(order.status >= 400);
});

test("provedor de IA: teste fictício não chama a Groq; pago recusado", async () => {
  const ctx = await makeCtx({ fetch: newsFetch });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const cards = (await c.call("GET", "/api/connections")).json.providers;
  assert.ok(cards.some((p: { id: string; enabled: boolean }) => p.id === "groq" && p.enabled));
  assert.ok(cards.some((p: { id: string; billing: string; enabled: boolean }) => p.id === "openrouter" && p.billing === "paid" && !p.enabled));
  const t = await c.call("POST", "/api/ai/providers/groq/test");
  assert.equal(t.status, 200);
  assert.equal(t.json.used, "fake");
  assert.equal(t.json.realCall, false);
  assert.ok(!JSON.stringify(t.json).includes("gsk_"));
  const paid = await c.call("POST", "/api/ai/providers/openrouter/test");
  assert.equal(paid.status, 409);
});

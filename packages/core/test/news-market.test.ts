import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorizeTool, AGENTS } from "../src/agents.ts";
import { NEWS_FEEDS, feedsForTheme } from "../src/news-feeds.ts";
import { dedupeNews, groupPolitics, parseFeedXml, worldToday, type NewsItem } from "../src/news.ts";
import { DEFAULT_ASSETS, QUOTE_DISCLAIMER, hasTradeCapability, isQuoteStale, quoteCard, TRADE_ACTIONS, type Quote } from "../src/quotes.ts";
import { MARKETING_CAN_PUBLISH, draftPostIdeas, publishMarketingPost } from "../src/marketing.ts";
import { AGENT_COLORS, DEFAULT_ACCESSORY } from "../src/visual.ts";

function item(p: Partial<NewsItem> & Pick<NewsItem, "title" | "link" | "outlet">): NewsItem {
  return { theme: "politica", publishedAt: "2026-10-14T08:00:00.000Z", feedId: "bbc-politics", ...p };
}

test("notícias: allowlist tem ≥ 2 veículos por tema e termos datados", () => {
  for (const theme of ["tecnologia", "mundo", "brasil", "politica"] as const) {
    const f = feedsForTheme(theme);
    assert.ok(f.length >= 2, theme);
    assert.equal(new Set(f.map((x) => x.outlet)).size, f.length, theme);
  }
  for (const f of NEWS_FEEDS) {
    assert.match(f.url, /^https:\/\//);
    assert.match(f.termsUrl, /^https:\/\//);
    assert.match(f.termsCheckedAt, /^2026-10-14$/);
  }
});

test("notícias: dedupe por link e título normalizado", () => {
  const a = item({ title: "Senado vota orçamento", link: "https://exemplo.com/a", outlet: "BBC News" });
  const b = item({ title: "Senado vota orçamento!!!", link: "https://exemplo.com/a#x", outlet: "BBC News" });
  const c = item({ title: "Senado vota orçamento", link: "https://outro.com/a", outlet: "BBC News" });
  const d = item({ title: "Outra pauta", link: "https://exemplo.com/b", outlet: "NPR" });
  const out = dedupeNews([a, b, c, d]);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.link, "https://exemplo.com/a");
});

test("notícias: agrupamento político exige 2 veículos; um só avisa", () => {
  const two = groupPolitics([
    item({ title: "Congresso discute reforma tributária hoje", link: "https://a.example/1", outlet: "BBC News" }),
    item({ title: "Congresso discute reforma tributária no plenário", link: "https://b.example/1", outlet: "NPR" }),
  ]);
  assert.equal(two.length, 1);
  assert.equal(two[0]!.singleOutlet, false);
  assert.equal(two[0]!.notice, null);
  assert.equal(two[0]!.eachSide.length, 2);

  const one = groupPolitics([item({ title: "Só a BBC falou disso agora", link: "https://a.example/2", outlet: "BBC News" })]);
  assert.equal(one[0]!.singleOutlet, true);
  assert.equal(one[0]!.notice, "Só um veículo cobriu este assunto.");
});

test("notícias: feed indisponível vira falha parcial com mensagem", () => {
  const empty = parseFeedXml("", "bbc-tech");
  assert.equal(empty.items.length, 0);
  assert.match(empty.error ?? "", /indisponível/);
  const junk = parseFeedXml("<html>paywall</html>", "bbc-tech");
  assert.equal(junk.items.length, 0);
  assert.ok(junk.error);
  const rss = parseFeedXml(
    `<?xml version="1.0"?><rss><channel><item><title>Chip novo</title><link>https://www.bbc.com/t</link><pubDate>Wed, 14 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`,
    "bbc-tech",
  );
  assert.equal(rss.items.length, 1);
  assert.equal(rss.items[0]!.outlet, "BBC News");
  assert.equal(rss.error, undefined);
});

test("notícias: O mundo hoje limita 3 por tema e guarda o link original", () => {
  const many: NewsItem[] = [];
  for (let i = 0; i < 5; i++) {
    many.push(item({ title: `Tech ${i}`, link: `https://t.example/${i}`, outlet: "BBC News", theme: "tecnologia", feedId: "bbc-tech" }));
  }
  const w = worldToday(many);
  assert.equal(w[0]!.items.length, 3);
  assert.ok(w[0]!.items.every((x) => x.link.startsWith("https://")));
});

test("mercado: cotação velha marcada como desatualizada; cartão com aviso", () => {
  const now = Date.parse("2026-10-14T12:00:00.000Z");
  const q: Quote = {
    symbol: "BTC",
    price: 100,
    changePct: 9,
    source: "CoinGecko",
    quotedAt: "2026-10-14T10:00:00.000Z",
    fetchedAt: "2026-10-14T10:00:00.000Z",
    disclaimer: QUOTE_DISCLAIMER,
  };
  assert.equal(isQuoteStale(q, now), true);
  const card = quoteCard({ ...q, fetchedAt: "2026-10-14T11:50:00.000Z" }, now, 8);
  assert.equal(card.stale, false);
  assert.equal(card.alert, true);
  assert.equal(card.disclaimer, "Só informativo, não é recomendação");
  assert.ok(DEFAULT_ASSETS.some((a) => a.symbol === "PETR4.SA" && a.source === "finnhub"));
});

test("mercado: nenhum caminho de código executa ordem", () => {
  assert.equal(hasTradeCapability(), false);
  assert.deepEqual(TRADE_ACTIONS, []);
  assert.equal(authorizeTool({ agentId: "mercado", tool: "quotes.read", ownerId: "o", resourceOwnerId: "o", origin: "routine", stepToolCalls: 0 }).allow, true);
  assert.equal(authorizeTool({ agentId: "mercado", tool: "gmail.send", ownerId: "o", resourceOwnerId: "o", origin: "model", stepToolCalls: 0 }).allow, false);
});

test("marketing: não publica; ideias são rascunho", () => {
  assert.equal(MARKETING_CAN_PUBLISH, false);
  const drafts = draftPostIdeas([item({ title: "IA no Brasil", link: "https://n.example/1", outlet: "Folha de S.Paulo", theme: "brasil", feedId: "folha-hora" })]);
  assert.equal(drafts[0]!.status, "draft");
  assert.equal(drafts[0]!.publish, false);
  assert.throws(() => publishMarketingPost(drafts[0]!), /não publica/);
  assert.ok(!AGENTS.marketing.tools.some((t) => /publish|post|tweet|instagram/i.test(t) && t !== "feed.publish"));
  assert.equal(authorizeTool({ agentId: "marketing", tool: "gsc.read", ownerId: "o", resourceOwnerId: "o", origin: "user", stepToolCalls: 0 }).allow, true);
});

test("agentes novos: cores, acessórios e só leitura nas ferramentas externas", () => {
  assert.equal(AGENT_COLORS.noticias, "#FF7A1F");
  assert.equal(AGENT_COLORS.mercado, "#16B26A");
  assert.equal(AGENT_COLORS.marketing, "#F0457F");
  assert.equal(DEFAULT_ACCESSORY.noticias, "antenna");
  assert.equal(DEFAULT_ACCESSORY.mercado, "visor");
  assert.equal(DEFAULT_ACCESSORY.marketing, "beret");
});

test("código do worker não declara rota de ordem (checagem de texto)", () => {
  const app = readFileSync(new URL("../../../apps/worker/src/app.ts", import.meta.url), "utf8");
  assert.equal(/route\([^)]*(order|trade|buy|sell)/i.test(app), false);
});

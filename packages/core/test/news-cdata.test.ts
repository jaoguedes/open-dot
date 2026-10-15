import assert from "node:assert/strict";
import test from "node:test";
import { parseFeedXml, worldToday } from "../src/news.ts";

test("título em CDATA não vira vazio", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Olá mundo]]></title><link>https://www.bbc.com/news/1</link><pubDate>Wed, 14 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
  const r = parseFeedXml(xml, "bbc-world");
  assert.equal(r.error, undefined);
  assert.equal(r.items[0]?.title, "Olá mundo");
});

test("&amp;lt; não vira menor-que", () => {
  const xml = `<rss><channel><item><title>Preço &amp;lt; 10</title><link>https://www.bbc.com/a</link></item></channel></rss>`;
  const r = parseFeedXml(xml, "bbc-world");
  assert.equal(r.items[0]?.title, "Preço &lt; 10");
});

test("link http da allowlist vira https", () => {
  const xml = `<rss><channel><item><title>Nota</title><link>http://www.bbc.com/news/2</link></item></channel></rss>`;
  const r = parseFeedXml(xml, "bbc-world");
  assert.equal(r.items[0]?.link.startsWith("https://"), true);
});

test("Atom usa link rel=alternate", () => {
  const xml = `<feed><entry><title>Átomo</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://www.npr.org/story"/></entry></feed>`;
  const r = parseFeedXml(xml, "npr-news");
  assert.equal(r.items[0]?.link, "https://www.npr.org/story");
});

test("link da Folha atrás de redirecionamento usa o artigo", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Petrobras</title><link>https://redir.folha.com.br/redir/online/rss091/*https://www1.folha.uol.com.br/mercado/petrobras.shtml</link></item></channel></rss>`;
  const r = parseFeedXml(xml, "folha-hora");
  assert.equal(r.error, undefined);
  assert.equal(r.items[0]?.link, "https://www1.folha.uol.com.br/mercado/petrobras.shtml");
});

test("mundo hoje ordena por data antes de cortar", () => {
  const old = { title: "Velho", link: "https://www.bbc.com/old", outlet: "BBC News", theme: "mundo" as const, publishedAt: "2020-01-01T00:00:00Z", feedId: "bbc-world" };
  const mid = { ...old, title: "Meio", link: "https://www.bbc.com/mid", publishedAt: "2026-06-01T00:00:00Z" };
  const neu = { ...old, title: "Novo", link: "https://www.bbc.com/new", publishedAt: "2026-10-01T00:00:00Z" };
  const sections = worldToday([old, mid, neu], 1);
  assert.equal(sections[0]?.items[0]?.title, "Novo");
});

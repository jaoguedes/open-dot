import { NEWS_FEEDS, dedupeNews, groupPolitics, normalizeTitle, parseFeedXml, randomId, worldToday, type NewsItem } from "@open-dot/core";
import type { Ctx } from "../context.ts";
import type { Db } from "../db/types.ts";
import * as repo from "../repo.ts";

export async function ingestNews(ctx: Ctx, ownerId: string, fetchImpl: typeof fetch, opts: { feedIds?: string[]; maxFeeds?: number } = {}): Promise<{ fetched: number; stored: number; failures: string[] }> {
  const settings = await repo.agentSettings(ctx.db, ownerId, "noticias");
  if (settings && settings.enabled === 0) return { fetched: 0, stored: 0, failures: ["Notícias desativado."] };
  const now = ctx.now();
  const allowed = opts.feedIds?.length ? NEWS_FEEDS.filter((f) => opts.feedIds!.includes(f.id)) : NEWS_FEEDS;
  const max = opts.maxFeeds ?? 4;
  const minute = new Date(now).getUTCMinutes();
  const start = minute % Math.max(1, allowed.length);
  const slice = [...allowed.slice(start), ...allowed.slice(0, start)].slice(0, max);
  const got: NewsItem[] = [];
  const failures: string[] = [];
  let fetched = 0;
  for (const spec of slice) {
    try {
      const res = await fetchImpl(spec.url, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
      fetched++;
      if (!res.ok) {
        failures.push(`${spec.outlet}: feed indisponível (${res.status}).`);
        continue;
      }
      const xml = await res.text();
      const parsed = parseFeedXml(xml, spec.id);
      if (parsed.error) failures.push(`${spec.outlet}: ${parsed.error}`);
      got.push(...parsed.items);
    } catch (e) {
      failures.push(`${spec.outlet}: ${e instanceof Error ? e.message : "falha de rede"}`);
    }
  }
  const unique = dedupeNews(got);
  let stored = 0;
  for (const it of unique) {
    const id = randomId("news_");
    const r = await ctx.db.run(
      "INSERT OR IGNORE INTO od_news_items (id, owner_id, feed_id, theme, outlet, title, title_norm, link, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, ownerId, it.feedId, it.theme, it.outlet, it.title, normalizeTitle(it.title), it.link, it.publishedAt, new Date(now).toISOString()],
    );
    if (r.changes === 1) stored++;
  }
  await repo.touchAgentSettings(ctx.db, ownerId, "noticias", {
    lastTestAt: new Date(now).toISOString(),
    lastError: failures.length ? failures.join(" ") : null,
    now,
  });
  return { fetched, stored, failures };
}

export async function listRecentNews(db: Db, ownerId: string, limit = 40): Promise<NewsItem[]> {
  const rows = await db.query<{ title: string; link: string; outlet: string; theme: NewsItem["theme"]; published_at: string | null; feed_id: string }>(
    "SELECT title, link, outlet, theme, published_at, feed_id FROM od_news_items WHERE owner_id = ? ORDER BY fetched_at DESC LIMIT ?",
    [ownerId, limit],
  );
  return rows.map((r) => ({ title: r.title, link: r.link, outlet: r.outlet, theme: r.theme, publishedAt: r.published_at, feedId: r.feed_id }));
}

export async function publishWorldToday(ctx: Ctx, ownerId: string, runId: string | null): Promise<void> {
  const items = await listRecentNews(ctx.db, ownerId, 80);
  if (!items.length) return;
  const sections = worldToday(items);
  const politics = groupPolitics(items);
  await repo.insertFeed(ctx.db, ctx.keys, {
    ownerId,
    agentId: "noticias",
    runId,
    kind: "news_digest",
    title: "O mundo hoje",
    body: {
      headline: "O mundo hoje",
      summary: "Títulos de feeds públicos da allowlist. Tom neutro; o Dot não opina.",
      worldToday: sections,
      politics: politics.map((c) => ({
        topic: c.topic,
        eachSide: c.eachSide,
        notice: c.notice,
      })),
      aiUsed: false,
      aiNote: "Resumo por IA só com dado público, quando o roteador tiver cota.",
    },
    freshness: "fresh",
    coverage: { analyzed: items.length, available: items.length, syncedUntil: new Date(ctx.now()).toISOString(), fieldsRead: ["título", "link", "veículo", "horário"], partial: false },
    now: ctx.now(),
  });
}

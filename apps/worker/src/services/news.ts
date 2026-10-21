// SPDX-License-Identifier: AGPL-3.0-only
import { NEWS_FEEDS, dedupeNews, feedStartIndex, groupPolitics, normalizeTitle, parseFeedXml, randomId, worldToday, type NewsItem } from "@open-dot/core";
import { BudgetExhausted, type Ctx } from "../context.ts";
import type { Db } from "../db/types.ts";
import * as repo from "../repo.ts";
import { safeReason } from "../reasons.ts";

export interface SourceFailure {
  source: string;
  reason: string;
}

const PER_FEED = 15;

async function readLimited(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, max);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= max) break;
  }
  const buf = new Uint8Array(Math.min(total, max));
  let o = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.length - o);
    buf.set(c.subarray(0, take), o);
    o += take;
    if (o >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

export async function ingestNews(
  ctx: Ctx,
  ownerId: string,
  fetchImpl: typeof fetch,
  opts: { feedIds?: string[]; maxFeeds?: number } = {},
): Promise<{ fetched: number; stored: number; failures: SourceFailure[] }> {
  const settings = await repo.agentSettings(ctx.db, ownerId, "noticias");
  if (settings && settings.enabled === 0) return { fetched: 0, stored: 0, failures: [{ source: "Notícias", reason: "disabled" }] };
  const now = ctx.now();
  const allowed = opts.feedIds?.length ? NEWS_FEEDS.filter((f) => opts.feedIds!.includes(f.id)) : NEWS_FEEDS;
  const max = opts.maxFeeds ?? 4;
  const start = feedStartIndex(allowed.length, now);
  const slice = [...allowed.slice(start), ...allowed.slice(0, start)].slice(0, max);
  const got: NewsItem[] = [];
  const failures: SourceFailure[] = [];
  let fetched = 0;
  for (const spec of slice) {
    try {
      const res = await fetchImpl(spec.url, {
        headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", "user-agent": "OpenDot/1.0 (uso pessoal)" },
        signal: AbortSignal.timeout(10_000),
      });
      fetched++;
      if (!res.ok) {
        failures.push({ source: spec.outlet, reason: `upstream_http_${res.status}` });
        continue;
      }
      const kind = res.headers.get("content-type") ?? "";
      if (kind && !/xml|rss|atom|text\/plain|octet-stream/i.test(kind)) {
        failures.push({ source: spec.outlet, reason: "invalid_feed" });
        continue;
      }
      const xml = await readLimited(res, 1_000_000);
      const parsed = parseFeedXml(xml, spec.id);
      if (parsed.error) failures.push({ source: spec.outlet, reason: "invalid_feed" });
      got.push(...parsed.items.slice(0, PER_FEED));
    } catch (e) {
      if (e instanceof BudgetExhausted) throw e;
      failures.push({ source: spec.outlet, reason: safeReason(e) });
    }
  }
  const unique = dedupeNews(got);
  let stored = 0;
  if (unique.length) {
    const iso = new Date(now).toISOString();
    const results = await ctx.db.batch(
      unique.map((it) => ({
        sql: "INSERT OR IGNORE INTO od_news_items (id, owner_id, feed_id, theme, outlet, title, title_norm, link, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [randomId("news_"), ownerId, it.feedId, it.theme, it.outlet, it.title, normalizeTitle(it.title), it.link, it.publishedAt, iso],
      })),
    );
    stored = results.reduce((n, r) => n + (r.changes === 1 ? 1 : 0), 0);
  }
  await repo.touchAgentSettings(ctx.db, ownerId, "noticias", {
    lastTestAt: new Date(now).toISOString(),
    lastError: failures.length ? failures.map((f) => `${f.source}:${f.reason}`).join(" ") : null,
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

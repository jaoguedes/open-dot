import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./harness.ts";
import { SubrequestBudget } from "../src/context.ts";
import { ingestNews } from "../src/services/news.ts";
import { tick } from "../src/jobs.ts";

function rss(n: number, feed: string) {
  const items = Array.from({ length: n }, (_, i) => `<item><title>Nota ${i}</title><link>https://example.com/${feed}/${i}</link></item>`).join("");
  return `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
}

test("4 feeds com 30 itens ficam abaixo de 45 subrequisições", async () => {
  const fetchImpl: typeof fetch = async (input) => new Response(rss(30, new URL(String(input)).hostname), { headers: { "content-type": "application/rss+xml" } });
  const ctx = await makeCtx({ fetch: fetchImpl });
  const c = (await import("./harness.ts")).client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const budget = new SubrequestBudget(44);
  const scoped = { ...ctx, db: budget.watch(ctx.db), fetch: budget.wrap(fetchImpl) };
  const r = await ingestNews(scoped, ownerId, scoped.fetch, { maxFeeds: 4 });
  assert.equal(r.fetched, 4);
  assert.ok(r.stored <= 60);
  assert.ok(budget.used < 45, `subrequisições ${budget.used}`);
});

test("exceção no meio das notícias encerra a execução como failed", async () => {
  const fetchImpl: typeof fetch = async (input) => new Response(rss(2, new URL(String(input)).hostname), { headers: { "content-type": "application/rss+xml" } });
  const ctx = await makeCtx({ fetch: fetchImpl });
  const c = (await import("./harness.ts")).client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const now = new Date(ctx.now()).toISOString();
  await ctx.db.run(
    "INSERT INTO od_runs (id, owner_id, agent_id, kind, state, version, attempt, next_attempt_at, scheduled_at, created_at, updated_at) VALUES (?, ?, 'noticias', 'news_review', 'queued', 1, 0, ?, '1970-01-01T00:00:00.000Z', ?, ?)",
    ["run_news_boom", ownerId, now, now, now],
  );
  const inner = ctx.db;
  const original = inner.batch.bind(inner);
  inner.batch = async (stmts) => {
    if (stmts.some((s) => s.sql.includes("od_news_items"))) throw new Error("sqlite: falha no lote");
    return original(stmts);
  };
  const report = await tick(ctx);
  const rows = await inner.query<{ id: string; state: string; error_code: string | null }>("SELECT id, state, error_code FROM od_runs WHERE id = ?", ["run_news_boom"]);
  assert.equal(rows[0]?.state, "failed");
  assert.equal(rows[0]?.error_code, "db_error");
  assert.ok(report.runs.some((r) => r.id === "run_news_boom" && r.state === "failed"));
  const status = await c.call("GET", "/api/status");
  const noticias = status.json.agents.find((a: { agentId: string; semantic: string }) => a.agentId === "noticias");
  assert.notEqual(noticias.semantic, "working");
});

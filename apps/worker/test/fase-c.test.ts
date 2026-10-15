import assert from "node:assert/strict";
import test from "node:test";
import { client, makeCtx } from "./harness.ts";
import * as repo from "../src/repo.ts";

test("snapshot devolve as mesmas partes das rotas antigas numa requisição só", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const snap = await c.call("GET", "/api/snapshot");
  assert.equal(snap.status, 200);
  for (const [part, path] of [
    ["feed", "/api/feed"],
    ["routines", "/api/routines"],
    ["runs", "/api/runs"],
    ["monitors", "/api/monitors"],
    ["status", "/api/status"],
    ["approvals", "/api/approvals"],
    ["shipments", "/api/shipments"],
  ] as const) {
    assert.deepEqual(snap.json[part], (await c.call("GET", path)).json, part);
  }
  assert.equal(snap.json.owner.name, "Desenvolvimento local");
  assert.deepEqual(snap.json.failures, []);
});

test("snapshot responde 304 com If-None-Match igual e 200 quando algo muda", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const first = await c.call("GET", "/api/snapshot");
  const etag = first.headers.get("etag");
  assert.ok(etag && etag.startsWith('W/"'));
  const again = await c.call("GET", "/api/snapshot", undefined, { "if-none-match": etag });
  assert.equal(again.status, 304);
  assert.equal(again.json, null);
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  await repo.insertFeed(ctx.db, ctx.keys, { ownerId, agentId: "correio", runId: "r1", kind: "notice", title: "Novo", body: { summary: "x" }, freshness: "fresh", coverage: null, now: ctx.now() });
  const changed = await c.call("GET", "/api/snapshot", undefined, { "if-none-match": etag });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
});

test("uma parte quebrada não derruba o snapshot", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const original = ctx.db.query.bind(ctx.db);
  ctx.db.query = (async (sql: string, args?: never[]) => {
    if (/FROM od_monitors/.test(sql)) throw new Error("sqlite: falha simulada");
    return original(sql, args);
  }) as typeof ctx.db.query;
  const snap = await c.call("GET", "/api/snapshot");
  assert.equal(snap.status, 200);
  assert.equal(snap.json.monitors, null);
  assert.deepEqual(snap.json.failures, [{ part: "monitors", reason: "db_error" }]);
  assert.ok(Array.isArray(snap.json.routines.routines));
});

test("snapshot sem sessão é 401", async () => {
  const ctx = await makeCtx();
  assert.equal((await client(ctx).call("GET", "/api/snapshot")).status, 401);
});

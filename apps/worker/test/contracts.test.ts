// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { FeedPageSchema, ProblemSchema, SessionResponseSchema, SnapshotResponseSchema, checkContract } from "@open-dot/core/contracts.ts";
import * as repo from "../src/repo.ts";
import { client, makeCtx } from "./harness.ts";

test("o worker devolve exatamente o contrato: sessão, snapshot, feed, aprovações e erros", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  assert.equal(SessionResponseSchema.safeParse((await c.call("GET", "/api/session")).json).success, true);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  await repo.insertFeed(ctx.db, ctx.keys, { ownerId, agentId: "codigo", runId: "r", kind: "ci_failure", title: "CI", body: { summary: "x" }, freshness: "fresh", coverage: null, now: ctx.now() });
  await repo.createApproval(ctx.db, ctx.keys, { ownerId, action: "gmail.send", proposal: { action: "gmail.send", service: "gmail", account: "a", resource: "r", payload: { body: "oi" }, consequence: "c" }, payloadHash: "a".repeat(64), now: ctx.now() });
  const session = await c.call("GET", "/api/session");
  assert.deepEqual(SessionResponseSchema.safeParse(session.json).error?.issues ?? [], []);
  const snap = await c.call("GET", "/api/snapshot");
  const r = SnapshotResponseSchema.safeParse(snap.json);
  assert.deepEqual(r.success ? [] : r.error.issues, []);
  assert.equal(FeedPageSchema.safeParse((await c.call("GET", "/api/feed")).json).success, true);
  for (const bad of [await c.call("GET", "/api/feed?before=lixo"), await c.call("GET", "/api/nao-existe")]) assert.equal(ProblemSchema.safeParse(bad.json).success, true);
  assert.deepEqual(checkContract("/api/sessions", (await c.call("GET", "/api/sessions")).json), []);
});

test("contrato acusa resposta fora do formato", () => {
  assert.notDeepEqual(checkContract("/api/ask", { answer: 1 }), []);
  assert.deepEqual(checkContract("/api/rota-sem-contrato", { x: 1 }), []);
});

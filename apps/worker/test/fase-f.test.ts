import assert from "node:assert/strict";
import test from "node:test";
import { client, makeCtx } from "./harness.ts";
import { tick } from "../src/jobs.ts";
import * as repo from "../src/repo.ts";

test("diagnóstico: health, última rodada do cron e falhas com texto humano, sem segredo nem e-mail", async () => {
  const ctx = await makeCtx({ env: { GROQ_API_KEY: "gsk_valor_falso_de_teste_1234567890" } }); // scan-secrets: teste
  const c = client(ctx);
  assert.equal((await c.call("GET", "/api/diagnostics")).status, 401);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const routine = (await repo.listRoutines(ctx.db, ownerId))[0]!;
  await repo.createRunForSlot(ctx.db, { ownerId, routineId: routine.id, agentId: routine.agent_id, kind: routine.kind, slotKey: "s1", scheduledAt: ctx.now(), late: false, now: ctx.now() });
  const run = await repo.runBySlot(ctx.db, ownerId, "s1");
  const claimed = await repo.claimRun(ctx.db, run!, ctx.now());
  await repo.finishRun(ctx.db, claimed!, { state: "failed", errorCode: "subrequest_limit", errorMessage: "x", now: ctx.now() });
  await tick(ctx);
  const d = await c.call("GET", "/api/diagnostics");
  assert.equal(d.status, 200);
  assert.equal(d.json.health.schema, "0010");
  assert.ok(d.json.lastTick?.at, "sem a última rodada do cron");
  assert.ok(Array.isArray(d.json.lastTick.stepErrors));
  const fail = d.json.failures.find((f: { code: string }) => f.code === "subrequest_limit");
  assert.ok(fail && fail.frase && !fail.frase.includes("subrequest_limit"));
  const text = JSON.stringify(d.json);
  for (const bad of ["gsk_", "dev@localhost", "TOKEN_KEYS", "csecret"]) assert.equal(text.includes(bad), false, bad);
});

test("exportar meus dados devolve JSON do dono sem segredos de conexão", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  await repo.insertFeed(ctx.db, ctx.keys, { ownerId, agentId: "codigo", runId: "r", kind: "ci_failure", title: "CI caiu", body: { summary: "detalhe" }, freshness: "fresh", coverage: null, now: ctx.now() });
  const r = await c.call("GET", "/api/export");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition") ?? "", /attachment; filename="open-dot-/);
  assert.equal(r.json.owner.email, "dev@localhost");
  assert.equal(r.json.feed[0].title, "CI caiu");
  assert.ok(Array.isArray(r.json.routines));
  const text = JSON.stringify(r.json);
  assert.equal(/token_enc|secret|id_hash|proposal_enc|refresh/i.test(text), false);
});

test("apagar tudo exige a frase de confirmação e apaga só o dono da sessão", async () => {
  const ctx = await makeCtx();
  const a = client(ctx);
  await a.call("POST", "/api/session/dev");
  const other = await repo.upsertOwner(ctx.db, { sub: "outro", email: "outro@example.com", name: null, now: ctx.now() });
  await repo.insertFeed(ctx.db, ctx.keys, { ownerId: other, agentId: "codigo", runId: "r", kind: "notice", title: "do outro", body: {}, freshness: "fresh", coverage: null, now: ctx.now() });
  assert.equal((await a.call("POST", "/api/account/delete", { confirm: "apagar" })).status, 400);
  const ok = await a.call("POST", "/api/account/delete", { confirm: "APAGAR TUDO" });
  assert.equal(ok.status, 200);
  assert.equal((await a.call("GET", "/api/session")).json.authenticated, false);
  const owners = await ctx.db.query<{ id: string }>("SELECT id FROM od_owners");
  assert.deepEqual(owners.map((o) => o.id), [other]);
  assert.equal((await ctx.db.query("SELECT id FROM od_feed_items WHERE owner_id = ?", [other])).length, 1);
});

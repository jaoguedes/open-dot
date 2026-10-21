import { test } from "node:test";
import assert from "node:assert/strict";
import { client, makeCtx } from "./harness.ts";
import { sha256Hex } from "@open-dot/core";
import { randomToken } from "../src/crypto.ts";

async function pair(c: ReturnType<typeof client>, ip: string) {
  return c.call(
    "POST",
    "/api/runner/pairings",
    { secretHash: await sha256Hex(randomToken()), tokenHash: await sha256Hex(randomToken()), name: "Teste" },
    { "cf-connecting-ip": ip, "x-open-dot": "1" },
  );
}

test("pareamento anônimo é limitado por origem: um atacante não bloqueia o dono (OD2-CLAUDE-03)", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  const attacker = await Promise.all(Array.from({ length: 40 }, () => pair(c, "203.0.113.7")));
  assert.equal(attacker.filter((r) => r.status === 201).length, 5);
  assert.equal(attacker.filter((r) => r.status === 429).length, 35);
  assert.equal((await pair(c, "198.51.100.20")).status, 201, "outra origem continua pareando");
  ctx.db.raw.close();
});

test("pareamento: IPv6 da mesma /64 conta como uma origem", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  const results = [];
  for (let i = 1; i <= 6; i++) results.push(await pair(c, `2001:db8:1:2::${i.toString(16)}`));
  assert.equal(results.filter((r) => r.status === 201).length, 5);
  ctx.db.raw.close();
});

test("pareamento: teto global continua valendo para muitas origens", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  const results = [];
  for (let i = 0; i < 205; i++) results.push((await pair(c, `192.0.2.${i % 250}${i >= 250 ? "x" : ""}`)).status);
  assert.equal(results.filter((s) => s === 201).length, 200);
  assert.equal(results.at(-1), 429);
  ctx.db.raw.close();
});

test("pareamento: janela vencida libera a origem de novo", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  for (let i = 0; i < 5; i++) assert.equal((await pair(c, "203.0.113.9")).status, 201);
  assert.equal((await pair(c, "203.0.113.9")).status, 429);
  ctx.clock.t += 5 * 60_000;
  assert.equal((await pair(c, "203.0.113.9")).status, 201);
  ctx.db.raw.close();
});

test("início do login é limitado por origem antes de gravar estado (OD2-CLAUDE-04)", async () => {
  const ctx = await makeCtx({ env: { OWNER_EMAIL: "dono@example.com" } });
  const c = client(ctx);
  const statuses = [];
  for (let i = 0; i < 22; i++) statuses.push(await c.call("GET", "/api/auth/google/start", undefined, { "cf-connecting-ip": "203.0.113.50" }));
  assert.equal(statuses.filter((r) => r.headers.get("location")?.startsWith("https://accounts.google.com")).length, 20);
  assert.equal(statuses.at(-1)!.headers.get("location"), "/?erro=muitas_tentativas");
  const states = await ctx.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM od_oauth_states");
  assert.equal(states[0]!.n, 20);
  const other = await c.call("GET", "/api/auth/google/start", undefined, { "cf-connecting-ip": "198.51.100.1" });
  assert.ok(other.headers.get("location")!.startsWith("https://accounts.google.com"));
  ctx.db.raw.close();
});

test("limitador não guarda o IP em claro", async () => {
  const ctx = await makeCtx();
  await pair(client(ctx), "203.0.113.77");
  const rows = await ctx.db.query<{ bucket: string }>("SELECT bucket FROM od_rate_limits");
  assert.ok(rows.length >= 2);
  for (const r of rows) assert.ok(!r.bucket.includes("203.0.113.77"));
  ctx.db.raw.close();
});

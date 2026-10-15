import assert from "node:assert/strict";
import test from "node:test";
import { displayNameFor } from "@open-dot/core";
import { sessionCookie } from "../src/http.ts";
import type { Ctx } from "../src/context.ts";
import { client, makeCtx } from "./harness.ts";
import { scrubSecrets } from "../src/reasons.ts";

test("cookie de produção usa __Host- sem Domain", () => {
  const ctx = { env: { APP_ORIGIN: "https://exemplo.invalid", SESSION_DAYS: 30 } } as Ctx;
  const cookie = sessionCookie(ctx, "a".repeat(40), 60);
  assert.match(cookie, /^__Host-od_session=/);
  assert.match(cookie, /;\s*Secure/);
  assert.match(cookie, /Path=\//);
  assert.equal(/Domain=/i.test(cookie), false);
});

test("sair de todos os aparelhos invalida as outras sessões", async () => {
  const ctx = await makeCtx();
  const a = client(ctx);
  const b = client(ctx);
  assert.equal((await a.call("POST", "/api/session/dev")).status, 200);
  assert.equal((await b.call("POST", "/api/session/dev")).status, 200);
  const cookieA = a.getCookie();
  assert.equal((await a.call("POST", "/api/sessions/logout-all")).status, 200);
  a.setCookie(cookieA);
  assert.equal((await a.call("GET", "/api/session")).json.authenticated, false);
  assert.equal((await b.call("GET", "/api/session")).json.authenticated, false);
});

test("nome mostrado vem da configuração, não de um nome fixo", () => {
  assert.equal(displayNameFor("ana@example.com", null, false, "Ana"), "Ana");
  assert.equal(displayNameFor("ana@example.com", "ana", false, "Ana"), "Ana");
});

test("log e resposta de erro não carregam isca", () => {
  const bait = "token=isca-secreta pessoa@example.com Authorization: Bearer abcdefghijklmnop";
  const clean = scrubSecrets(`falha ${bait}`);
  assert.equal(clean.includes("isca-secreta"), false);
  assert.equal(clean.includes("pessoa@example.com"), false);
  assert.equal(clean.includes("abcdefghijklmnop"), false);
});

test("varredura: isca em resposta de terceiros não aparece em log, resposta nem banco", async () => {
  const bait = ["isca-secreta", "pessoa@example.com", "abcdefghijklmnopqrstuvwxyz0123", "Bearer zzzzzzzzzzzzzzzz"];
  const baitText = `token=isca-secreta pessoa@example.com Authorization: Bearer zzzzzzzzzzzzzzzz key=abcdefghijklmnopqrstuvwxyz0123`;
  let calls = 0;
  const ctx = await makeCtx({
    fetch: async (input) => {
      calls++;
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ error: baitText }), { status: 400, headers: { "content-type": "application/json" } });
      if (calls % 2) throw new Error(baitText);
      return new Response(baitText, { status: 500, headers: { "content-type": "text/plain", "x-isca": baitText } });
    },
  });
  const logs: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of ["log", "error", "warn", "info"] as const) console[k] = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
  const outputs: string[] = [];
  try {
    const c = client(ctx);
    await c.call("POST", "/api/session/dev");
    for (const [method, path] of [
      ["POST", "/api/agents/noticias/test"],
      ["POST", "/api/agents/mercado/test"],
      ["POST", "/api/agents/marketing/test"],
      ["GET", `/api/feed?before=${encodeURIComponent(btoa(baitText))}`],
      ["GET", "/api/health"],
      ["GET", "/api/connections"],
      ["GET", "/api/runs"],
    ] as const) {
      const r = await c.call(method, path);
      outputs.push(JSON.stringify(r.json));
    }
    const start = await c.call("POST", "/api/connections/gmail/start");
    const state = new URL(start.json.url).searchParams.get("state")!;
    const cb = await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(state)}`);
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get("location") ?? "", /\?erro=callback_invalido$/);
    outputs.push(cb.headers.get("location") ?? "");
    const { tick } = await import("../src/jobs.ts");
    outputs.push(JSON.stringify(await tick(ctx)));
  } finally {
    Object.assign(console, original);
  }
  const db = ctx.db;
  for (const sql of [
    "SELECT last_error AS v FROM od_connections",
    "SELECT error_message AS v FROM od_runs",
    "SELECT detail AS v FROM od_audit_events",
    "SELECT last_error AS v FROM od_agent_settings",
  ]) {
    for (const row of await db.query<{ v: string | null }>(sql)) outputs.push(String(row.v ?? ""));
  }
  const all = [...logs, ...outputs].join("\n");
  for (const b of bait) assert.equal(all.includes(b), false, `vazou "${b}"`);
  assert.ok(calls > 0, "o teste precisa ter chamado a rede falsa");
});

test("logs do Worker passam pelo scrub (nenhum console.* direto fora de logSafe)", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = new URL("../src/", import.meta.url).pathname;
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts")) {
        readFileSync(full, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (/console\.(log|error|warn|info|debug)\(/.test(line) && !full.endsWith("reasons.ts")) offenders.push(`${full}:${i + 1}`);
          });
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});

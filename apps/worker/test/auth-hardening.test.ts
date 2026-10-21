import { test } from "node:test";
import assert from "node:assert/strict";
import { client, makeCtx } from "./harness.ts";
import { FakeGoogle } from "./fake-google.ts";

/** Login completo pelo Google simulado. Devolve o destino do callback. */
async function login(c: ReturnType<typeof client>, google: FakeGoogle, id: { sub: string; email: string; verified?: boolean }) {
  const start = await c.call("GET", "/api/auth/google/start");
  if (start.status !== 302) return { start, location: null };
  const url = new URL(start.headers.get("location")!);
  if (url.origin !== "https://accounts.google.com") return { start, location: start.headers.get("location") };
  google.nextNonce = url.searchParams.get("nonce");
  google.idSub = id.sub;
  google.idEmail = id.email;
  google.idEmailVerified = id.verified ?? true;
  const done = await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(url.searchParams.get("state")!)}`);
  return { start, location: done.headers.get("location") };
}

test("início do login público não revela o e-mail do dono (OD2-CLAUDE-01)", async () => {
  const ctx = await makeCtx({ env: { OWNER_EMAIL: "dono@example.com" } });
  const start = await client(ctx).call("GET", "/api/auth/google/start");
  assert.equal(start.status, 302);
  const location = start.headers.get("location")!;
  assert.equal(new URL(location).searchParams.get("login_hint"), null);
  assert.ok(!location.toLowerCase().includes("dono"), "o endereço de redirecionamento não pode conter o e-mail do dono");
});

test("sem OWNER_EMAIL e sem OWNER_GOOGLE_SUB ninguém entra, nem pelo callback", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch, env: { OWNER_EMAIL: "" } });
  const c = client(ctx);
  const start = await c.call("GET", "/api/auth/google/start");
  assert.equal(start.headers.get("location"), "/?erro=login_nao_configurado");
  assert.equal((await c.call("GET", "/api/session")).json.googleLoginAvailable, false);
});

test("só OWNER_EMAIL exige e-mail verificado", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch, env: { OWNER_EMAIL: "dono@example.com" } });
  const c = client(ctx);
  const r = await login(c, google, { sub: "sub-dono", email: "dono@example.com", verified: false });
  assert.equal(r.location, "/?erro=conta_nao_autorizada");
  assert.equal((await c.call("GET", "/api/session")).json.authenticated, false);
});

test("OWNER_GOOGLE_SUB tem precedência sobre o e-mail", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch, env: { OWNER_EMAIL: "dono@example.com", OWNER_GOOGLE_SUB: "sub-certo" } });
  const c = client(ctx);
  assert.equal((await login(c, google, { sub: "sub-errado", email: "dono@example.com" })).location, "/?erro=conta_nao_autorizada");
  assert.equal((await login(c, google, { sub: "sub-certo", email: "outro@example.com" })).location, "/");
});

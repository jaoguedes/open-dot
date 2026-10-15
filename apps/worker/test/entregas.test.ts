import { test } from "node:test";
import assert from "node:assert/strict";
import { client, jsonResponse, makeCtx } from "./harness.ts";
import { FakeGoogle } from "./fake-google.ts";
import { tick } from "../src/jobs.ts";
import { OPEN_DOT_HEALTH_URL } from "@open-dot/core";

test("login pede só openid email e recusa um segundo e-mail", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = client(ctx);
  const start = await c.call("GET", "/api/auth/google/start");
  assert.equal(start.status, 302);
  const url = new URL(start.headers.get("location")!);
  assert.equal(url.searchParams.get("scope"), "openid email");
  assert.equal(url.searchParams.get("access_type"), null);
  google.nextNonce = url.searchParams.get("nonce");
  google.idEmail = "outra@example.com";
  google.idSub = "sub-outra";
  const denied = await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(url.searchParams.get("state")!)}`);
  assert.equal(denied.headers.get("location"), "/?erro=conta_nao_autorizada");
  assert.equal((await c.call("GET", "/api/session")).json.authenticated, false);

  const start2 = await c.call("GET", "/api/auth/google/start");
  const url2 = new URL(start2.headers.get("location")!);
  google.nextNonce = url2.searchParams.get("nonce");
  google.idEmail = "joao@example.com";
  google.idSub = "sub-joao";
  const ok = await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(url2.searchParams.get("state")!)}`);
  assert.equal(ok.headers.get("location"), "/");
  assert.equal((await c.call("GET", "/api/session")).json.owner.name, "João");
  assert.equal((await c.call("PATCH", "/api/profile", { name: "Maria" })).status, 200);
  assert.equal((await c.call("GET", "/api/session")).json.owner.name, "Maria");
  assert.equal((await c.call("PATCH", "/api/profile", { name: "joao@example.com" })).status, 400);
});

test("revisar agora sem Gmail responde 409 e não chama a rede", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const r = await c.call("POST", "/api/correio/review-now");
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, "not_connected");
});

test("atalho Vigiar o próprio Open Dot é idempotente", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const first = await c.call("POST", "/api/monitors/self");
  assert.equal(first.status, 201);
  assert.equal(first.json.created, true);
  const second = await c.call("POST", "/api/monitors/self");
  assert.equal(second.status, 200);
  assert.equal(second.json.created, false);
  assert.equal(second.json.id, first.json.id);
  const rows = (await c.call("GET", "/api/monitors")).json.monitors;
  assert.equal(rows.filter((m: { url: string }) => m.url === OPEN_DOT_HEALTH_URL).length, 1);
});

test("encomenda: provedor desligado não consulta; ligado respeita cobertura, atribuição e o teto", async () => {
  const calls: string[] = [];
  let status = "in_transit";
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("https://api.pacotevicio.dev/")) {
      calls.push(url);
      assert.equal(new Headers(init?.headers).get("x-api-key"), "pv-test");
      assert.equal(url.includes("@"), false);
      return jsonResponse({
        tracking_code: "NN427247410BR",
        courier: "Correios",
        status,
        status_updated_at: "2026-10-15T12:00:00.000Z",
        events: [
          { timestamp: "2026-10-14T12:00:00.000Z", status: "posted", description: "Rastreamento por PacoteVício" },
          { timestamp: "2026-10-15T12:00:00.000Z", status, description: status === "delivered" ? "Entregue" : "Em trânsito" },
        ],
      });
    }
    return new Response("sem rede", { status: 599 });
  };

  const off = await makeCtx({ fetch });
  const cOff = client(off);
  await cOff.call("POST", "/api/session/dev");
  const saved = await cOff.call("POST", "/api/shipments", { code: "NN427247410BR" });
  assert.equal(saved.status, 201);
  assert.equal(calls.length, 0);
  assert.equal(saved.json.tracking.enabled, false);
  assert.match(saved.json.tracking.reason, /desligado/);
  assert.equal(saved.json.shipments[0].carrier, "correios");

  const on = await makeCtx({ fetch, env: { PACOTEVICIO_API_KEY: "pv-test", PACOTEVICIO_TERMS_CONFIRMED: "true" } });
  const c = client(on);
  await c.call("POST", "/api/session/dev");
  const ups = await c.call("POST", "/api/shipments", { code: "1Z5R89390357567127" });
  assert.equal(ups.status, 201);
  assert.equal(calls.length, 0, "UPS está fora da cobertura e não gasta consulta");
  assert.equal(ups.json.shipments.find((s: { code: string }) => s.code.startsWith("1Z")).lastError, "fora_da_cobertura");

  const tracked = await c.call("POST", "/api/shipments", { code: "NN427247410BR" });
  assert.equal(tracked.status, 201);
  assert.equal(calls.length, 1);
  const row = tracked.json.shipments.find((s: { code: string }) => s.code === "NN427247410BR");
  assert.equal(row.status, "in_transit");
  assert.equal(row.events[0].attribution, true);
  assert.equal(row.attribution.href, "https://pacotevicio.dev");
  assert.equal(JSON.stringify(row).includes("pv-test"), false);

  on.clock.t += 60_000;
  await tick(on);
  assert.equal(calls.length, 1, "intervalo de 6 horas");

  on.clock.t += 6 * 60 * 60 * 1000 + 1000;
  status = "delivered";
  await tick(on);
  assert.equal(calls.length, 2);
  const after = (await c.call("GET", "/api/shipments")).json.shipments.find((s: { code: string }) => s.code === "NN427247410BR");
  assert.equal(after.status, "delivered");
  assert.equal(after.active, false);

  on.clock.t += 6 * 60 * 60 * 1000 + 1000;
  await tick(on);
  assert.equal(calls.length, 2, "entregue não é consultada de novo");

  const owner = (await on.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!;
  await on.db.run("UPDATE od_tracking_budget SET calls = 900 WHERE owner_id = ?", [owner.id]);
  await on.db.run("UPDATE od_shipments SET active = 1, delivered_at = NULL, provider_checked_at = NULL, status = 'posted' WHERE code = ?", ["NN427247410BR"]);
  await tick(on);
  assert.equal(calls.length, 2, "para em 900");
  const paused = await c.call("GET", "/api/shipments");
  assert.equal(paused.json.tracking.paused, true);
  assert.equal(paused.json.tracking.calls, 900);
});

test("e-mail já lido vira card sem guardar e-mail do remetente", async () => {
  const google = new FakeGoogle();
  google.addMessage({ id: "m-ship", subject: "Seu pedido NN427247410BR foi postado", from: "Loja Azul <vendas@loja.example>", snippet: "CNPJ 00.000.000/0001-00" }, false);
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const start = await c.call("POST", "/api/connections/gmail/start");
  const authUrl = new URL(start.json.url);
  google.nextNonce = authUrl.searchParams.get("nonce");
  await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(authUrl.searchParams.get("state")!)}`);
  const review = await c.call("POST", "/api/correio/review-now");
  assert.equal(review.json.ok, true);
  const snap = await c.call("GET", "/api/shipments");
  const row = snap.json.shipments.find((s: { code: string }) => s.code === "NN427247410BR");
  assert.ok(row);
  assert.equal(row.storeLabel, "Loja Azul");
  const dump = JSON.stringify(ctx.db.raw.prepare("SELECT code, store_label, carrier FROM od_shipments").all());
  assert.equal(dump.includes("vendas@"), false);
  assert.equal(dump.includes("00.000.000"), false);
  assert.ok(google.calls.filter((x) => x.includes("gmail")).every((x) => x.startsWith("GET ")));
});

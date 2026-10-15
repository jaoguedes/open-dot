import assert from "node:assert/strict";
import test from "node:test";
import { FakeGoogle } from "./fake-google.ts";
import { client, makeCtx } from "./harness.ts";

async function connected(google: FakeGoogle) {
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const start = await c.call("POST", "/api/connections/gmail/start");
  const authUrl = new URL(start.json.url);
  google.nextNonce = authUrl.searchParams.get("nonce");
  await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(authUrl.searchParams.get("state")!)}`);
  return { ctx, c };
}

test("Não importa 2× silencia o domínio, sem guardar o domínio em claro; a revisão seguinte trata como ruído; desfazer volta", async () => {
  const google = new FakeGoogle();
  google.addMessage({ id: "f1", subject: "Sua fatura vence amanhã", from: "Loja Chata <avisos@loja-chata.test>", snippet: "R$ 10,00" }, false);
  const { ctx, c } = await connected(google);
  assert.equal((await c.call("POST", "/api/correio/review-now")).json.ok, true);
  const first = await c.call("POST", "/api/correio/feedback", { messageId: "f1", categoria: "pagamento", rotulo: "nao_importa" });
  assert.equal(first.status, 200);
  assert.equal(first.json.silenced, false);
  const second = await c.call("POST", "/api/correio/feedback", { messageId: "f1", categoria: "pagamento", rotulo: "nao_importa" });
  assert.equal(second.json.silenced, true);
  assert.equal(second.json.label, "loja-chata.test");
  const raw = JSON.stringify(ctx.db.raw.prepare("SELECT * FROM od_triage_feedback").all());
  assert.equal(raw.includes("loja-chata"), false, "domínio em claro no banco");
  assert.equal(raw.includes("avisos@"), false);
  const list = await c.call("GET", "/api/correio/silenced");
  assert.deepEqual(list.json.senders.map((s: { label: string }) => s.label), ["loja-chata.test"]);

  google.addMessage({ id: "f2", subject: "Sua fatura vence amanhã de novo", from: "Loja Chata <avisos@loja-chata.test>", snippet: "R$ 10,00" }, true);
  ctx.clock.t += 60_000;
  await c.call("POST", "/api/correio/review-now");
  const feed = (await c.call("GET", "/api/feed")).json.items.find((i: { kind: string; body: { itens?: Array<{ origem: string }> } }) => i.kind === "email_digest" && i.body.itens);
  assert.ok(feed);
  assert.equal(feed.body.itens.some((i: { origem: string }) => i.origem === "f2"), false, "remetente silenciado ainda virou item");

  const undo = await c.call("POST", `/api/correio/silenced/${list.json.senders[0].domainHash}/undo`);
  assert.equal(undo.status, 200);
  assert.deepEqual((await c.call("GET", "/api/correio/silenced")).json.senders, []);
});

test("retorno sobre mensagem de outro dono ou inexistente é 404", async () => {
  const google = new FakeGoogle();
  const { c } = await connected(google);
  assert.equal((await c.call("POST", "/api/correio/feedback", { messageId: "nao-existe", categoria: "outro", rotulo: "importante" })).status, 404);
  assert.equal((await c.call("POST", "/api/correio/feedback", { messageId: "x", categoria: "outro", rotulo: "qualquer" })).status, 400);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "@open-dot/core";
import { client, makeCtx } from "./harness.ts";
import { tick } from "../src/jobs.ts";
import * as repo from "../src/repo.ts";
import { handleApi } from "../src/app.ts";
import { MAX_UPLOAD_BODY } from "../src/services/uploads.ts";

const TEXT = "# Contrato de prestação\n\nO prestador entrega relatórios mensais de manutenção.\n\n## Prazos\n\nRelatório até o dia cinco de cada mês, com evidências de manutenção.";

async function body(text = TEXT, over: Record<string, unknown> = {}) {
  return { fileName: "contrato.md", mime: "text/markdown", fileBytes: 900, fileSha256: await sha256Hex("file:" + text), text, textSha256: await sha256Hex(text), pages: null, ...over };
}

async function signedIn() {
  const ctx = await makeCtx();
  const c = client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
  return { ctx, c };
}

test("upload: 'recebido' só depois de persistir; texto e nome cifrados; 'organizado' só após o job", async () => {
  const { ctx, c } = await signedIn();
  const r = await c.call("POST", "/api/uploads", await body());
  assert.equal(r.status, 201);
  assert.equal(r.json.state, "received");
  const row = ctx.db.raw.prepare("SELECT * FROM od_uploads").get() as Record<string, unknown>;
  assert.equal(row.state, "received");
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes("prestador") && !dump.includes("contrato.md"), "texto/nome não podem ficar em claro");

  // Antes do job: ainda não está organizado.
  const before = await c.call("GET", `/api/uploads/${r.json.id}`);
  assert.equal(before.json.state, "received");
  assert.equal(before.json.result, null);

  const done = await c.call("POST", `/api/uploads/${r.json.id}/process`);
  assert.equal(done.status, 200);
  assert.equal(done.json.state, "organized");
  assert.equal(done.json.result.title, "Contrato de prestação");
  assert.ok(done.json.result.keywords.includes("manutenção"));
  const run = ctx.db.raw.prepare("SELECT state, kind FROM od_runs WHERE id = ?").get(r.json.runId) as { state: string; kind: string };
  assert.deepEqual({ ...run }, { state: "succeeded", kind: "file_organize" });
  const feed = (await c.call("GET", "/api/feed")).json.items;
  assert.equal(feed[0].kind, "file_organized");
  assert.equal(feed[0].body.headline, "Contrato de prestação");
  const feedDump = JSON.stringify(ctx.db.raw.prepare("SELECT * FROM od_feed_items").all());
  assert.ok(!feedDump.includes("Contrato") && !feedDump.includes("manutenção"), "título e termos do arquivo só no corpo cifrado");

  // Apagar o arquivo remove também o aviso do feed.
  assert.equal((await c.call("DELETE", `/api/uploads/${r.json.id}`)).status, 200);
  assert.equal((await c.call("GET", "/api/feed")).json.items.length, 0);
});

test("upload: processamento concorrente (app + cron) produz um único efeito", async () => {
  const { ctx, c } = await signedIn();
  const r = await c.call("POST", "/api/uploads", await body());
  const [a, b, t] = await Promise.all([c.call("POST", `/api/uploads/${r.json.id}/process`), c.call("POST", `/api/uploads/${r.json.id}/process`), tick(ctx)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  void t;
  const final = await c.call("GET", `/api/uploads/${r.json.id}`);
  assert.equal(final.json.state, "organized");
  const feedRows = ctx.db.raw.prepare("SELECT COUNT(*) AS n FROM od_feed_items WHERE run_id = ?").get(r.json.runId) as { n: number };
  assert.equal(feedRows.n, 1, "um único aviso no feed");
  const run = ctx.db.raw.prepare("SELECT attempt FROM od_runs WHERE id = ?").get(r.json.runId) as { attempt: number };
  assert.equal(run.attempt, 1);
});

test("upload: o cron organiza se o app fechar antes de pedir", async () => {
  const { ctx, c } = await signedIn();
  const r = await c.call("POST", "/api/uploads", await body());
  const report = await tick(ctx);
  assert.ok(report.runs.some((x) => x.id === r.json.runId && x.state === "succeeded"));
  assert.equal((await c.call("GET", `/api/uploads/${r.json.id}`)).json.state, "organized");
});

test("upload: duplicado devolve 409 com o registro existente", async () => {
  const { c } = await signedIn();
  const first = await c.call("POST", "/api/uploads", await body());
  const again = await c.call("POST", "/api/uploads", await body());
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, "duplicate");
  assert.equal(again.json.existing.id, first.json.id);
  // Dois envios simultâneos do mesmo arquivo: só um registro.
  const other = await body(TEXT + "\nOutra versão do contrato com mais um parágrafo.");
  const pair = await Promise.all([c.call("POST", "/api/uploads", other), c.call("POST", "/api/uploads", other)]);
  assert.deepEqual(pair.map((x) => x.status).sort(), [201, 409]);
});

test("upload: PDF escaneado/vazio, hash divergente, tipo e tamanho recusados com mensagem específica", async () => {
  const { ctx, c } = await signedIn();
  const scanned = await c.call("POST", "/api/uploads", await body(" \n ", { fileName: "scan.pdf", mime: "application/pdf", pages: 4 }));
  assert.equal(scanned.status, 422);
  assert.equal(scanned.json.error.code, "no_text_scanned");
  assert.match(scanned.json.error.message, /escaneado|imagem/i);

  const empty = await c.call("POST", "/api/uploads", await body("", { fileName: "vazio.txt", mime: "text/plain" }));
  assert.equal(empty.status, 422);
  assert.equal(empty.json.error.code, "no_text");

  const mismatch = await c.call("POST", "/api/uploads", await body(TEXT, { textSha256: await sha256Hex("outra coisa") }));
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.json.error.code, "hash_mismatch");

  const big = await c.call("POST", "/api/uploads", await body(TEXT, { fileBytes: 5 * 1024 * 1024 + 1 }));
  assert.equal(big.status, 413);
  assert.equal(big.json.error.code, "too_large");

  const exe = await c.call("POST", "/api/uploads", await body(TEXT, { fileName: "virus.exe", mime: "text/plain" }));
  assert.equal(exe.status, 415);
  const fakePdf = await c.call("POST", "/api/uploads", await body(TEXT, { fileName: "nota.txt", mime: "application/pdf" }));
  assert.equal(fakePdf.status, 415);

  const tooLongText = "palavra ".repeat(30_000);
  const long = await c.call("POST", "/api/uploads", await body(tooLongText, { fileName: "longo.txt", mime: "text/plain" }));
  assert.equal(long.status, 422);
  assert.equal(long.json.error.code, "text_too_long");

  // Corpo acima do limite é recusado antes de ler JSON.
  const res = await handleApi(
    ctx,
    new Request("http://localhost:8787/api/uploads", {
      method: "POST",
      headers: { cookie: c.getCookie(), "x-open-dot": "1", "content-type": "application/json", "content-length": String(MAX_UPLOAD_BODY + 1) },
      body: "{}",
    }),
  );
  assert.equal(res.status, 413);
  assert.equal(ctx.db.raw.prepare("SELECT COUNT(*) AS n FROM od_uploads").get()!.n, 0);
});

test("upload: exige sessão e CSRF; outro dono não lê, processa nem apaga", async () => {
  const anon = client(await makeCtx());
  assert.equal((await anon.call("POST", "/api/uploads", await body())).status, 401);

  const { ctx, c } = await signedIn();
  assert.equal((await c.call("POST", "/api/uploads", await body(), { "x-open-dot": "0" })).status, 403);
  const r = await c.call("POST", "/api/uploads", await body());

  const ownerB = await repo.upsertOwner(ctx.db, { sub: "sub-b", email: "b@example.com", name: "B", now: ctx.now() });
  const b = client(ctx);
  const { startSession } = await import("../src/http.ts");
  b.setCookie((await startSession(ctx, new Request("http://localhost:8787/"), ownerB)).split(";")[0]!);
  assert.equal((await b.call("GET", `/api/uploads/${r.json.id}`)).status, 404);
  assert.equal((await b.call("POST", `/api/uploads/${r.json.id}/process`)).status, 404);
  assert.equal((await b.call("DELETE", `/api/uploads/${r.json.id}`)).status, 404);
  assert.equal((await b.call("GET", "/api/uploads")).json.uploads.length, 0);
  // B pode enviar o mesmo arquivo: duplicata é por dono.
  assert.equal((await b.call("POST", "/api/uploads", await body())).status, 201);

  assert.equal((await c.call("DELETE", `/api/uploads/${r.json.id}`)).status, 200);
  assert.equal((await c.call("GET", `/api/uploads/${r.json.id}`)).status, 404);
  const run = ctx.db.raw.prepare("SELECT state FROM od_runs WHERE id = ?").get(r.json.runId) as { state: string };
  assert.equal(run.state, "cancelled");
});

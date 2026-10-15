import { test } from "node:test";
import assert from "node:assert/strict";
import { client, makeCtx, loadMigrations } from "./harness.ts";
import { FakeGoogle } from "./fake-google.ts";
import { tick } from "../src/jobs.ts";
import * as repo from "../src/repo.ts";
import { applyMigrations, classifySchemaError, currentSchema } from "../src/db/migrate.ts";
import { SqliteDb } from "../src/db/sqlite.ts";
import { HranaError } from "../src/db/hrana.ts";
import { hashProposal } from "@open-dot/core";

async function connectGmail(google: FakeGoogle, ctx: Awaited<ReturnType<typeof makeCtx>>) {
  const c = client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
  const start = await c.call("POST", "/api/connections/gmail/start");
  assert.equal(start.status, 200);
  const authUrl = new URL(start.json.url);
  assert.equal(authUrl.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authUrl.searchParams.get("access_type"), "offline");
  google.nextNonce = authUrl.searchParams.get("nonce");
  const cb = await c.call("GET", `/api/oauth/google/callback?code=abc&state=${encodeURIComponent(authUrl.searchParams.get("state")!)}`);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), "/conexoes?ok=gmail");
  return c;
}

test("passo 2 do tique falha e os passos seguintes seguem", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const seen = { runs: 0, monitors: 0, owners: 0 };
  const db = ctx.db;
  const orig = db.query.bind(db);
  db.query = (async (sql: string, args?: import("../src/db/types.ts").SqlValue[]) => {
    if (sql.includes("od_connections") && sql.includes("provider")) throw new Error("gmail caiu");
    if (sql.includes("od_runs")) seen.runs++;
    if (sql.includes("od_monitors")) seen.monitors++;
    if (sql.includes("od_owners")) seen.owners++;
    return orig(sql, args);
  }) as typeof db.query;
  const report = await tick(ctx);
  assert.ok(report.stepErrors.some((s) => s.step === "2"));
  assert.ok(seen.runs > 0);
  assert.ok(seen.monitors > 0);
  assert.ok(seen.owners > 0);
  assert.equal(report.skipped, undefined);
});

test("migrações: idempotentes, detectam alteração e recusam destrutivas", async () => {
  const db = new SqliteDb();
  const ms = loadMigrations();
  assert.deepEqual((await applyMigrations(db, ms)).applied, ["0001", "0002", "0003", "0004", "0005", "0006"]);
  assert.deepEqual((await applyMigrations(db, ms)).skipped, ["0001", "0002", "0003", "0004", "0005", "0006"]);
  await assert.rejects(applyMigrations(db, [{ ...ms[0]!, sql: ms[0]!.sql + "\n-- mudou" }]), /alterada/);
  await assert.rejects(applyMigrations(db, [{ version: "0099", name: "x", sql: "DROP TABLE od_owners;" }]), /destrutiva/);
});

test("fluxo completo simulado: conectar Gmail (leitura), sincronizar e publicar revisão com links e cobertura", async () => {
  const google = new FakeGoogle();
  google.addMessage({ id: "m1", subject: "Confirme a entrega de amanhã?", from: "Loja <pedidos@loja.com>" }, false);
  google.addMessage({ id: "m2", subject: "Ofertas da semana", listUnsubscribe: true }, false);
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = await connectGmail(google, ctx);

  const conns = (await c.call("GET", "/api/connections")).json.connections;
  assert.equal(conns[0].status, "connected");
  assert.deepEqual(conns[0].scopes.filter((s: string) => s.includes("gmail")), ["https://www.googleapis.com/auth/gmail.readonly"]);

  const routines = (await c.call("GET", "/api/routines")).json.routines;
  const emailRt = routines.find((r: { kind: string }) => r.kind === "email_review");
  assert.ok(emailRt);
  assert.deepEqual(emailRt.times, ["08:00", "17:00"]);
  assert.equal(emailRt.timeZone, "America/Sao_Paulo");

  await c.call("POST", `/api/routines/${emailRt.id}/run-now`);
  const report = await tick(ctx);
  assert.equal(report.synced[0]?.fetched, 2);
  assert.equal(report.runs[0]?.state, "succeeded");

  const feed = (await c.call("GET", "/api/feed")).json.items;
  assert.equal(feed.length, 1);
  const d = feed[0];
  assert.equal(d.kind, "email_digest");
  assert.equal(d.body.total, 2);
  assert.equal(d.body.itens.length + d.body.sem_acao.length + d.body.ruido.contagem, 2);
  assert.equal(d.body.itens[0].categoria, "resposta");
  assert.match(d.body.itens[0].href, /^https:\/\/mail\.google\.com\/mail\/u\/0\/#all\/m1$/);
  assert.match(d.body.itens[0].o_que_fazer, /^(Confira|Pague|Veja|Responda|Acompanhe|Abra|Guarde)/);
  assert.equal(d.body.aiUsed, false);
  assert.match(d.body.aiNote, /regras/);
  assert.equal(d.body.ruido.contagem, 1);
  assert.ok(!JSON.stringify(d.body).includes("Menciona"));
  assert.equal(d.coverage.analyzed, 2);
  // nenhuma chamada de escrita ao Gmail (o tick também lê RSS/cotações no mesmo fetch)
  assert.ok(google.calls.filter((x) => x.includes("gmail")).every((x) => x.startsWith("GET ")), google.calls.join("\n"));
});

test("tokens ficam cifrados: refresh token não aparece em texto no banco", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch });
  await connectGmail(google, ctx);
  const dump = JSON.stringify(ctx.db.raw.prepare("SELECT * FROM od_connection_secrets").all());
  assert.ok(!dump.includes("rt-secret-123"));
  assert.ok(!dump.includes("at-0"));
});

test("isolamento por dono: outra sessão não lê nem desconecta dados alheios", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch });
  const a = await connectGmail(google, ctx);
  const connId = (await a.call("GET", "/api/connections")).json.connections[0].id;
  await repo.insertFeed(ctx.db, ctx.keys, { ownerId: (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id, agentId: "correio", runId: "r-a", kind: "notice", title: "Privado do A", body: { s: 1 }, freshness: "fresh", coverage: null, now: ctx.now() });

  // Dono B com sessão própria.
  const ownerB = await repo.upsertOwner(ctx.db, { sub: "sub-b", email: "b@example.com", name: "B", now: ctx.now() });
  const b = client(ctx);
  const { startSession } = await import("../src/http.ts");
  b.setCookie((await startSession(ctx, new Request("http://localhost:8787/"), ownerB)).split(";")[0]!);
  assert.equal((await b.call("GET", "/api/feed")).json.items.length, 0);
  assert.equal((await b.call("GET", "/api/connections")).json.connections.length, 0);
  assert.equal((await b.call("POST", `/api/connections/${connId}/disconnect`)).status, 404);
  assert.equal((await a.call("GET", "/api/connections")).json.connections[0].status, "connected");
});

test("CSRF: mutação sem cabeçalho próprio ou de outra origem é recusada", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  assert.equal((await c.call("POST", "/api/session/dev", undefined, { "x-open-dot": "0" })).status, 403);
  assert.equal((await c.call("POST", "/api/session/dev", undefined, { "x-open-dot": "1", origin: "https://evil.example" })).status, 403);
  assert.equal((await c.call("POST", "/api/session/dev")).status, 200);
});

test("OAuth: state reutilizado ou inválido é recusado", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const url = new URL((await c.call("POST", "/api/connections/gmail/start")).json.url);
  google.nextNonce = url.searchParams.get("nonce");
  const state = url.searchParams.get("state")!;
  assert.equal((await c.call("GET", `/api/oauth/google/callback?code=a&state=${state}`)).headers.get("location"), "/conexoes?ok=gmail");
  assert.equal((await c.call("GET", `/api/oauth/google/callback?code=a&state=${state}`)).headers.get("location"), "/?erro=estado_expirado");
  assert.equal((await c.call("GET", `/api/oauth/google/callback?code=a&state=forjado`)).headers.get("location"), "/?erro=estado_expirado");
});

test("OAuth: usuário que negou a permissão do Gmail não vira conexão", async () => {
  const google = new FakeGoogle();
  google.grantedScope = "openid email";
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const url = new URL((await c.call("POST", "/api/connections/gmail/start")).json.url);
  google.nextNonce = url.searchParams.get("nonce");
  const r = await c.call("GET", `/api/oauth/google/callback?code=a&state=${url.searchParams.get("state")}`);
  assert.equal(r.headers.get("location"), "/conexoes?erro=permissao_gmail_negada");
  assert.equal((await c.call("GET", "/api/connections")).json.connections.length, 0);
});

test("acesso revogado: marca reconexão uma única vez e para de sincronizar", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch });
  const c = await connectGmail(google, ctx);
  ctx.clock.t += 2 * 3600_000; // access token expirou
  google.refreshRevoked = true;
  const r1 = await tick(ctx);
  assert.equal(r1.synced[0]?.status, "reauth_required");
  ctx.clock.t += 5 * 60_000;
  const r2 = await tick(ctx);
  assert.equal(r2.synced.length, 0, "conexão em reauth não é sincronizada");
  const feed = (await c.call("GET", "/api/feed")).json.items.filter((i: any) => i.title === "Reconecte seu Gmail");
  assert.equal(feed.length, 1);
  const status = (await c.call("GET", "/api/status")).json.agents.find((a: any) => a.agentId === "correio");
  assert.equal(status.semantic, "disconnected");
});

test("sincronização incremental: dedupe, cursor expirado ressincroniza, falha parcial não perde mensagens", async () => {
  const google = new FakeGoogle();
  google.addMessage({ id: "a1" }, false);
  const ctx = await makeCtx({ fetch: google.fetch });
  await connectGmail(google, ctx);
  await tick(ctx);
  const count = async () => Number((await ctx.db.query<{ n: number }>("SELECT COUNT(*) n FROM od_email_messages"))[0]!.n);
  assert.equal(await count(), 1);

  google.addMessage({ id: "a2" });
  google.addMessage({ id: "a3" });
  google.failMeta.add("a3");
  ctx.clock.t += 5 * 60_000;
  const r = await tick(ctx);
  assert.equal(r.synced[0]?.status, "error");
  assert.equal(await count(), 2, "a2 salvo, a3 pendente");
  const pending = await ctx.db.query<{ message_id: string }>("SELECT message_id FROM od_email_pending");
  assert.deepEqual(pending.map((p) => p.message_id), ["a3"]);

  google.failMeta.clear();
  google.historyExpired = true; // cursor antigo → 404 → ressincroniza janela
  ctx.clock.t += 5 * 60_000;
  await tick(ctx);
  assert.equal(await count(), 3);
  // duplicatas da ressincronização não criam linhas novas
  ctx.clock.t += 5 * 60_000;
  await tick(ctx);
  assert.equal(await count(), 3);
});

test("rate limit do Gmail agenda nova tentativa sem perder a rotina", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch });
  await connectGmail(google, ctx);
  google.rateLimited = true;
  const r = await tick(ctx);
  assert.equal(r.synced[0]?.status, "rate_limited");
  const conn = (await ctx.db.query<{ status: string }>("SELECT status FROM od_connections"))[0]!;
  assert.equal(conn.status, "connected");
});

test("cron repetido no mesmo slot das 08h cria uma única revisão", async () => {
  const google = new FakeGoogle();
  const ctx = await makeCtx({ fetch: google.fetch });
  await connectGmail(google, ctx);
  ctx.clock.t = Date.parse("2026-10-13T11:01:00Z"); // 08:01 em São Paulo
  await tick(ctx);
  await tick(ctx);
  ctx.clock.t += 60_000;
  await tick(ctx);
  const runs = await ctx.db.query<{ slot_key: string; kind: string }>("SELECT slot_key, kind FROM od_runs WHERE slot_key NOT LIKE '%manual%' AND kind = 'email_review'");
  assert.equal(runs.length, 1);
  assert.match(runs[0]!.slot_key, /2026-10-13T08:00$/);
  const newsRuns = await ctx.db.query("SELECT id FROM od_runs WHERE kind = 'news_review' AND slot_key NOT LIKE '%manual%'");
  assert.ok(newsRuns.length <= 1);
  const digests = await ctx.db.query("SELECT id FROM od_feed_items WHERE kind = 'email_digest'");
  assert.equal(digests.length, 1);
});

test("lease/CAS: duas execuções disputando o mesmo run, só uma vence", async () => {
  const ctx = await makeCtx();
  const owner = await repo.upsertOwner(ctx.db, { sub: "s", email: "e@x.com", name: null, now: ctx.now() });
  await repo.createRunForSlot(ctx.db, { ownerId: owner, routineId: null, agentId: "correio", kind: "email_review", slotKey: "k", scheduledAt: ctx.now(), late: false, now: ctx.now() });
  const [run] = await repo.dueRuns(ctx.db, ctx.now());
  const [x, y] = await Promise.all([repo.claimRun(ctx.db, run!, ctx.now()), repo.claimRun(ctx.db, run!, ctx.now())]);
  assert.equal([x, y].filter(Boolean).length, 1);
});

test("aprovações concorrentes no banco: um único efeito", async () => {
  const ctx = await makeCtx();
  const owner = await repo.upsertOwner(ctx.db, { sub: "s", email: "e@x.com", name: null, now: ctx.now() });
  const proposal = { action: "gmail.draft", service: "gmail", account: "e@x.com", resource: "t1", payload: { body: "ok" }, consequence: "rascunho" };
  const h = await hashProposal(proposal);
  await ctx.db.run("INSERT INTO od_approvals (id, owner_id, action, proposal_enc, payload_hash, status, version, expires_at, created_at) VALUES ('ap1', ?, 'gmail.draft', 'x', ?, 'pending', 1, ?, ?)", [owner, h, new Date(ctx.now() + 3600_000).toISOString(), new Date(ctx.now()).toISOString()]);
  const results = await Promise.all([1, 2, 3].map(() => repo.decideApproval(ctx.db, { ownerId: owner, id: "ap1", decision: "approve", expectedVersion: 1, payloadHash: h, now: ctx.now() })));
  assert.deepEqual(results.sort(), ["conflict", "conflict", "ok"]);
  assert.equal(await repo.decideApproval(ctx.db, { ownerId: "outro", id: "ap1", decision: "approve", expectedVersion: 2, payloadHash: h, now: ctx.now() }), "not_found");
});

test("aprovação: editar gera hash novo; aprovar não envia", async () => {
  const ctx = await makeCtx({ fetch: async () => new Response("gmail-write-nao-deve", { status: 500 }) });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const proposal = { action: "gmail.send", service: "gmail", account: "dev@localhost", resource: "t1", payload: { to: "a@b.com", subject: "Re", body: "oi" }, consequence: "teste" };
  const h = await hashProposal(proposal);
  const id = await repo.createApproval(ctx.db, ctx.keys, { ownerId, action: "gmail.send", proposal, payloadHash: h, now: ctx.now() });
  const list = await c.call("GET", "/api/approvals");
  assert.equal(list.json.canSend, false);
  assert.equal(list.json.approvals[0].proposal.payload.body, "oi");
  const edited = { ...proposal, payload: { ...proposal.payload, body: "oi, edição" } };
  const ed = await c.call("POST", `/api/approvals/${id}/edit`, { expectedVersion: 1, proposal: edited });
  assert.equal(ed.status, 200);
  assert.notEqual(ed.json.payloadHash, h);
  const dec = await c.call("POST", `/api/approvals/${id}/decision`, { decision: "approve", expectedVersion: 2, payloadHash: ed.json.payloadHash });
  assert.equal(dec.status, 200);
  assert.equal(dec.json.sent, false);
  assert.equal(dec.json.executed, false);
  assert.match(dec.json.note, /não habilitado/);
});

test("orçamento de IA no banco: reservas concorrentes no último saldo não estouram", async () => {
  const ctx = await makeCtx();
  const ledger = new repo.DbLedger(ctx.db, { ownerCalls: 3, ownerTokens: 1000, modelRequests: () => 100, modelTokens: () => 100_000 }, ctx.now);
  const rs = await Promise.all(Array.from({ length: 8 }, () => ledger.reserve({ ownerId: "o", providerId: "groq", modelId: "m", day: "2026-10-13", tokens: 100 })));
  assert.equal(rs.filter((r) => r.ok).length, 3);
  const deny = rs.find((r) => !r.ok);
  assert.deepEqual(deny, { ok: false, reason: "owner_calls" });
  // release devolve a chamada; commit devolve tokens não usados
  const first = rs.find((r) => r.ok) as { ok: true; reservationId: string };
  await ledger.release(first.reservationId);
  await ledger.release(first.reservationId); // idempotente
  const c = await ctx.db.query<{ calls: number; tokens: number }>("SELECT calls, tokens FROM od_quota_counters WHERE scope_key = 'owner:o'");
  assert.deepEqual({ ...c[0] }, { calls: 2, tokens: 200 });
  // limite de tokens do modelo também barra
  const tight = new repo.DbLedger(ctx.db, { ownerCalls: 100, ownerTokens: 100_000, modelRequests: () => 100, modelTokens: () => 250 }, ctx.now);
  const t = await tight.reserve({ ownerId: "o2", providerId: "groq", modelId: "m", day: "2026-10-13", tokens: 100 });
  assert.deepEqual(t, { ok: false, reason: "model_tokens" });
});

test("webhook GitHub: assinatura inválida, entrega duplicada e evento fora de ordem", async () => {
  const ctx = await makeCtx({ env: { GITHUB_WEBHOOK_SECRET: "segredo-webhook" } });
  const owner = await repo.upsertOwner(ctx.db, { sub: "s", email: "e@x.com", name: null, now: ctx.now() });
  await ctx.db.run("INSERT INTO od_github_installations (installation_id, owner_id, active, updated_at) VALUES (42, ?, 1, ?)", [owner, new Date().toISOString()]);
  const sign = async (body: string) => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("segredo-webhook"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
    return `sha256=${mac}`;
  };
  const { handleApi } = await import("../src/app.ts");
  const send = async (body: string, delivery: string, sig?: string) =>
    handleApi(ctx, new Request("http://localhost:8787/api/webhooks/github", { method: "POST", body, headers: { "x-github-event": "workflow_run", "x-github-delivery": delivery, "x-hub-signature-256": sig ?? (await sign(body)) } }));
  const run = (conclusion: string, updated: string) =>
    JSON.stringify({ installation: { id: 42 }, repository: { full_name: "joao/app" }, workflow_run: { id: 7, name: "CI", status: "completed", conclusion, html_url: "https://github.com/joao/app/actions/runs/7", head_sha: "abcdef1234", updated_at: updated, run_number: 3 } });

  const failed = run("failure", "2026-10-13T10:05:00Z");
  assert.equal((await send(failed, "d1", "sha256=" + "0".repeat(64))).status, 401);
  assert.equal((await send(failed, "d1")).status, 200);
  const dup = await (await send(failed, "d1")).json();
  assert.equal(dup.duplicate, true);
  const older = await (await send(run("success", "2026-10-13T10:00:00Z"), "d2")).json();
  assert.equal(older.stale, true);
  const r = await ctx.db.query<{ conclusion: string }>("SELECT conclusion FROM od_github_resources");
  assert.equal(r[0]!.conclusion, "failure", "evento antigo não regride o estado");
  const feed = await ctx.db.query("SELECT id FROM od_feed_items WHERE kind = 'ci_failure'");
  assert.equal(feed.length, 1);
});

test("monitor: SSRF recusado no cadastro; incidente só após 3 falhas e com correlação honesta", async () => {
  let up = false;
  const ctx = await makeCtx({ fetch: async () => (up ? new Response("ok", { status: 200 }) : new Response("x", { status: 503 })) });
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  assert.equal((await c.call("POST", "/api/monitors", { url: "https://169.254.169.254/latest", label: "x" })).status, 400);
  assert.equal((await c.call("POST", "/api/monitors", { url: "http://meusite.vercel.app", label: "x" })).status, 400);
  assert.equal((await c.call("POST", "/api/monitors", { url: "https://meusite.vercel.app/", label: "Meu site" })).status, 200);
  for (let i = 0; i < 3; i++) {
    await tick(ctx);
    ctx.clock.t += 5 * 60_000;
  }
  const incidents = await ctx.db.query("SELECT title FROM od_feed_items WHERE kind = 'site_incident'");
  assert.equal(incidents.length, 1);
  up = true;
  for (let i = 0; i < 2; i++) {
    await tick(ctx);
    ctx.clock.t += 5 * 60_000;
  }
  const recovered = await ctx.db.query("SELECT title FROM od_feed_items WHERE title LIKE '%voltou%'");
  assert.equal(recovered.length, 1);
});

test("health não expõe segredos", async () => {
  const ctx = await makeCtx({ env: { GROQ_API_KEY: "gsk_super_secreta" } });
  const r = await client(ctx).call("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.schema, "0006");
  assert.equal(r.json.schemaError, null);
  assert.ok(!JSON.stringify(r.json).includes("gsk_super_secreta"));
  assert.equal(r.json.configured.ai, true);
  assert.equal(r.json.configured.aiPrivate, false);
});

test("currentSchema devolve código curto sem mensagem, token ou URL", async () => {
  const empty = new SqliteDb(":memory:");
  const missing = await currentSchema(empty);
  assert.equal(missing.version, null);
  assert.equal(missing.error, "tabela_inexistente");
  assert.ok(!JSON.stringify(missing).includes("od_schema"));

  const db = new SqliteDb(":memory:");
  await applyMigrations(db, loadMigrations());
  assert.deepEqual(await currentSchema(db), { version: "0006" });

  assert.equal(classifySchemaError(new HranaError("Turso respondeu 401", 401)), "http_401");
  assert.equal(classifySchemaError(new HranaError("Turso respondeu 403", 403)), "http_401");
  assert.equal(classifySchemaError(new HranaError("Turso respondeu 404", 404)), "http_404");
  assert.equal(classifySchemaError(new TypeError("fetch failed")), "rede");
  assert.equal(classifySchemaError(new Error("no such table: od_schema_migrations")), "tabela_inexistente");
});

test("health com tabela ausente expõe só schemaError curto", async () => {
  const ctx = await makeCtx();
  ctx.db = new SqliteDb(":memory:");
  const r = await client(ctx).call("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.schema, null);
  assert.equal(r.json.schemaError, "tabela_inexistente");
  const blob = JSON.stringify(r.json);
  assert.ok(!blob.includes("no such table"));
  assert.ok(!blob.includes("od_schema_migrations"));
});

test("legal público: contato do ambiente, sem login e sem segredo", async () => {
  const ctx = await makeCtx({ env: { GROQ_API_KEY: "gsk_super_secreta" } });
  const r = await client(ctx).call("GET", "/api/legal");
  assert.equal(r.status, 200);
  assert.equal(r.json.contact, "joao@example.com");
  assert.ok(!JSON.stringify(r.json).includes("gsk_super_secreta"));
  const health = await client(ctx).call("GET", "/api/health");
  assert.ok(!JSON.stringify(health.json).includes("joao@example.com"));
});

test("pergunta sem IA aprovada responde só com fontes do feed do próprio dono", async () => {
  const google = new FakeGoogle();
  google.addMessage({ id: "f1", subject: "Fatura do cartão vence sexta", from: "Banco <aviso@banco.com>" }, false);
  const ctx = await makeCtx({ fetch: google.fetch, env: { GROQ_API_KEY: "k" } });
  const c = await connectGmail(google, ctx);
  const rid = (await c.call("GET", "/api/routines")).json.routines.find((r: { kind: string }) => r.kind === "email_review").id;
  await c.call("POST", `/api/routines/${rid}/run-now`);
  await tick(ctx);
  const r = await c.call("POST", "/api/ask", { question: "quando vence a fatura?" });
  assert.equal(r.status, 200);
  assert.equal(r.json.aiUsed, false, "sem ZDR, e-mail privado não vai para IA");
  assert.ok(r.json.sources.length >= 1);
  assert.match(r.json.sources[0].href, /^https:\/\/mail\.google\.com\//);
  assert.ok(google.calls.every((x) => !x.includes("groq")));
  const none = await c.call("POST", "/api/ask", { question: "resultado do jogo de ontem" });
  assert.equal(none.json.sources.length, 0);
  assert.match(none.json.answer, /Não encontrei/);
});

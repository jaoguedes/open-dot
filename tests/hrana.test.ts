import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { HranaDb } from "../apps/worker/src/db/hrana.ts";
import { applyMigrations } from "../apps/worker/src/db/migrate.ts";
import { loadMigrations } from "../scripts/lib/migrations.ts";
import { DbLedger } from "../apps/worker/src/repo.ts";

/**
 * Servidor Hrana /v2/pipeline simulado sobre SQLite real, seguindo o formato da documentação
 * (docs.turso.tech/sdk/http/reference). Valida o cliente sem acesso ao Turso.
 * Não substitui o teste contra o Turso real (pendente: precisa do banco do João).
 */
function fakeTurso(token: string) {
  const db = new DatabaseSync(":memory:");
  const calls: any[] = [];
  const toVal = (v: any) => (v.type === "null" ? null : v.type === "integer" ? Number(v.value) : v.type === "float" ? v.value : v.value);
  const fromVal = (v: any) =>
    v === null ? { type: "null" } : typeof v === "number" ? (Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v }) : typeof v === "bigint" ? { type: "integer", value: String(v) } : { type: "text", value: String(v) };
  const exec = (stmt: any) => {
    const st = db.prepare(stmt.sql);
    const args = (stmt.args ?? []).map(toVal);
    const reader = /^\s*(select|pragma|with)/i.test(stmt.sql) || /returning/i.test(stmt.sql);
    if (reader) {
      const rows = st.all(...args) as Record<string, unknown>[];
      const cols = rows[0] ? Object.keys(rows[0]).map((name) => ({ name })) : (st as unknown as { columns(): { name: string }[] }).columns().map((c) => ({ name: c.name }));
      return { cols, rows: rows.map((r) => cols.map((c) => fromVal(r[c.name]))), affected_row_count: 0 };
    }
    const r = st.run(...args);
    return { cols: [], rows: [], affected_row_count: Number(r.changes) };
  };
  const evalCond = (c: any, ok: boolean[]): boolean => (c.type === "ok" ? ok[c.step] === true : c.type === "not" ? !evalCond(c.cond, ok) : false);
  const fetchImpl = (async (url: string, init: RequestInit) => {
    assert.match(String(url), /\/v2\/pipeline$/);
    if ((init.headers as Record<string, string>).authorization !== `Bearer ${token}`) return new Response("", { status: 401 });
    const body = JSON.parse(String(init.body));
    calls.push(body);
    assert.equal(body.requests.at(-1).type, "close");
    const results = body.requests.map((r: any) => {
      if (r.type === "close") return { type: "ok", response: { type: "close" } };
      if (r.type === "execute") {
        try {
          return { type: "ok", response: { type: "execute", result: exec(r.stmt) } };
        } catch (e) {
          return { type: "error", error: { message: String(e) } };
        }
      }
      if (r.type === "batch") {
        const ok: boolean[] = [];
        const step_results: any[] = [];
        const step_errors: any[] = [];
        r.batch.steps.forEach((s: any, i: number) => {
          if (s.condition && !evalCond(s.condition, ok)) {
            ok[i] = false;
            step_results.push(null);
            step_errors.push(null);
            return;
          }
          try {
            step_results.push(exec(s.stmt));
            step_errors.push(null);
            ok[i] = true;
          } catch (e) {
            step_results.push(null);
            step_errors.push({ message: String(e) });
            ok[i] = false;
          }
        });
        return { type: "ok", response: { type: "batch", result: { step_results, step_errors } } };
      }
      return { type: "error", error: { message: "tipo desconhecido" } };
    });
    return new Response(JSON.stringify({ baton: null, base_url: null, results }), { status: 200 });
  }) as unknown as typeof fetch;
  return { db, calls, fetchImpl };
}

test("cliente Turso (Hrana): tipos, parâmetros e URL libsql://", async () => {
  const t = fakeTurso("tok");
  const h = new HranaDb("libsql://open-dot-joao.turso.io", "tok", t.fetchImpl);
  await h.run("CREATE TABLE x (id TEXT, n INTEGER, f REAL, z TEXT)");
  await h.run("INSERT INTO x VALUES (?, ?, ?, ?)", ["a", 42, 1.5, null]);
  const rows = await h.query<{ id: string; n: number; f: number; z: null }>("SELECT * FROM x WHERE id = ?", ["a"]);
  assert.deepEqual(rows, [{ id: "a", n: 42, f: 1.5, z: null }]);
  assert.deepEqual(t.calls[1].requests[0].stmt.args, [{ type: "text", value: "a" }, { type: "integer", value: "42" }, { type: "float", value: 1.5 }, { type: "null" }]);
});

test("cliente Turso: transação é tudo ou nada", async () => {
  const t = fakeTurso("tok");
  const h = new HranaDb("https://db.turso.io", "tok", t.fetchImpl);
  await h.run("CREATE TABLE y (id INTEGER PRIMARY KEY)");
  await assert.rejects(h.batch([{ sql: "INSERT INTO y VALUES (1)" }, { sql: "INSERT INTO y VALUES (1)" }]));
  assert.deepEqual(await h.query("SELECT COUNT(*) AS n FROM y"), [{ n: 0 }]);
  const ok = await h.batch([{ sql: "INSERT INTO y VALUES (2)" }, { sql: "INSERT INTO y VALUES (3)" }]);
  assert.deepEqual(ok.map((r) => r.changes), [1, 1]);
});

test("cliente Turso: token inválido não vaza e falha com erro claro", async () => {
  const t = fakeTurso("certo");
  const h = new HranaDb("https://db.turso.io", "errado", t.fetchImpl);
  await assert.rejects(h.query("SELECT 1"), (e: Error) => /401/.test(e.message) && !e.message.includes("errado"));
});

test("migrações e reserva atômica de orçamento funcionam pelo caminho HTTP do Turso", async () => {
  const t = fakeTurso("tok");
  const h = new HranaDb("https://db.turso.io", "tok", t.fetchImpl);
  const r = await applyMigrations(h, loadMigrations());
  assert.deepEqual(r.applied, ["0001", "0002", "0003"]);
  const ledger = new DbLedger(h, { ownerCalls: 2, ownerTokens: 1000, modelRequests: () => 10, modelTokens: () => 10_000 }, () => Date.now());
  const res = [];
  for (let i = 0; i < 4; i++) res.push(await ledger.reserve({ ownerId: "o", providerId: "groq", modelId: "m", day: "2026-10-13", tokens: 50 }));
  assert.equal(res.filter((x) => x.ok).length, 2);
  const model = await h.query<{ calls: number }>("SELECT calls FROM od_quota_counters WHERE scope_key = 'model:groq:m'");
  assert.equal(model[0]!.calls, 2, "contador do modelo não avança quando o do dono recusa");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { HranaDb } from "../apps/worker/src/db/hrana.ts";

const okSelect = () =>
  new Response(
    JSON.stringify({
      results: [
        { type: "ok", response: { type: "execute", result: { cols: [{ name: "n" }], rows: [[{ type: "integer", value: "1" }]], affected_row_count: 0 } } },
        { type: "ok", response: { type: "close" } },
      ],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );

function db(fetchImpl: typeof fetch, waits: number[] = []) {
  return new HranaDb("libsql://exemplo.turso.io", "tok", fetchImpl, { sleep: async (ms) => void waits.push(ms) });
}

test("leitura repete uma vez em 503 e respeita Retry-After", async () => {
  let n = 0;
  const waits: number[] = [];
  const d = db((async () => (++n === 1 ? new Response("", { status: 503, headers: { "retry-after": "1" } }) : okSelect())) as typeof fetch, waits);
  assert.deepEqual(await d.query("SELECT 1 AS n"), [{ n: 1 }]);
  assert.equal(n, 2);
  assert.deepEqual(waits, [1000]);
});

test("leitura repete uma vez em erro de rede e desiste na segunda falha", async () => {
  let n = 0;
  const d = db((async () => {
    n++;
    throw new TypeError("network");
  }) as typeof fetch);
  await assert.rejects(d.query("SELECT 1"));
  assert.equal(n, 2);
});

test("escrita nunca repete sozinha", async () => {
  let n = 0;
  const d = db((async () => (n++, new Response("", { status: 503 }))) as typeof fetch);
  await assert.rejects(d.run("UPDATE t SET a = 1"));
  await assert.rejects(d.batch([{ sql: "INSERT INTO t VALUES (1)" }]));
  assert.equal(n, 2);
});

test("cada pedido ao Turso leva timeout", async () => {
  let signal: AbortSignal | undefined;
  const d = db((async (_u: string, init: RequestInit) => ((signal = init.signal ?? undefined), okSelect())) as unknown as typeof fetch);
  await d.query("SELECT 1");
  assert.ok(signal instanceof AbortSignal);
});

test("no máximo 3 novas tentativas por conexão, para não estourar as 50 subrequisições", async () => {
  let n = 0;
  const d = db((async () => (n++, new Response("", { status: 500 }))) as typeof fetch);
  for (let i = 0; i < 6; i++) await assert.rejects(d.query("SELECT 1"));
  assert.equal(n, 6 + 3);
});

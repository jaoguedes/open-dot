// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithRetry } from "../src/api.ts";

function stub(responses: Array<Response | Error>) {
  const seen: RequestInit[] = [];
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    seen.push(init);
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return seen;
}

test("GET repete uma vez em 503 e leva timeout", async () => {
  const seen = stub([new Response("", { status: 503 }), new Response("{}", { status: 200 })]);
  const r = await fetchWithRetry("/api/x", { method: "GET" }, async () => {});
  assert.equal(r.status, 200);
  assert.equal(seen.length, 2);
  assert.ok(seen[0]!.signal instanceof AbortSignal);
});

test("GET repete em falha de rede", async () => {
  const seen = stub([new TypeError("rede"), new Response("{}", { status: 200 })]);
  assert.equal((await fetchWithRetry("/api/x", {}, async () => {})).status, 200);
  assert.equal(seen.length, 2);
});

test("POST nunca repete", async () => {
  const seen = stub([new Response("", { status: 503 })]);
  assert.equal((await fetchWithRetry("/api/x", { method: "POST" }, async () => {})).status, 503);
  assert.equal(seen.length, 1);
});

test("Retry-After é respeitado com teto de 3 s", async () => {
  stub([new Response("", { status: 429, headers: { "retry-after": "30" } }), new Response("{}", { status: 200 })]);
  const waits: number[] = [];
  await fetchWithRetry("/api/x", {}, async (ms) => void waits.push(ms));
  assert.deepEqual(waits, [3000]);
});

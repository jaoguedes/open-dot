import assert from "node:assert/strict";
import test from "node:test";
import { buildEvents, unseenCount } from "../src/events.ts";
import type { Snapshot } from "../src/api.ts";

const base = {
  owner: null,
  feed: [],
  connections: [],
  configured: {},
  routines: [],
  runs: [],
  usage: null,
  monitors: [],
  status: [],
  agents: [],
  providers: [],
  approvals: [],
  canSend: false,
  shipments: {},
} as unknown as Snapshot;

test("central lista execuções, falhas com texto humano e itens novos, mais recente primeiro, no máximo 20", () => {
  const runs = Array.from({ length: 25 }, (_, i) => ({
    id: `r${i}`,
    agentId: "correio",
    kind: "email_review",
    state: i === 24 ? "failed" : "succeeded",
    scheduledAt: null,
    late: false,
    attempt: 1,
    errorCode: i === 24 ? "subrequest_limit" : null,
    errorMessage: null,
    updatedAt: `2026-10-15T10:${String(i).padStart(2, "0")}:00Z`,
  }));
  const ev = buildEvents({
    ...base,
    runs,
    feed: [{ id: "f1", agentId: "sentinela", runId: null, kind: "site_incident", title: "Site fora", createdAt: "2026-10-15T11:00:00Z", body: {} } as never],
  } as Snapshot);
  assert.equal(ev.length, 20);
  assert.equal(ev[0]!.text, "Incidente: Site fora");
  assert.match(ev[1]!.text, /^Correio falhou\./);
  assert.equal(ev[1]!.text.includes("subrequest_limit"), false);
});

test("ponto no sino conta só o que chegou depois do visto", () => {
  const ev = [{ at: "2026-10-15T10:00:00Z" }, { at: "2026-10-15T12:00:00Z" }] as never;
  assert.equal(unseenCount(ev, null), 2);
  assert.equal(unseenCount(ev, "2026-10-15T11:00:00Z"), 1);
  assert.equal(unseenCount(ev, "2026-10-15T12:00:00Z"), 0);
});

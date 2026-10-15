import { test } from "node:test";
import assert from "node:assert/strict";
import { showSentinelaRing } from "../src/dot/ring.ts";

test("anel da Sentinela aparece no mini-Dot e no Dot grande só enquanto trabalha", () => {
  assert.equal(showSentinelaRing({ agentId: "sentinela", size: 44, semantic: "idle" }), true);
  assert.equal(showSentinelaRing({ agentId: "sentinela", size: 220, semantic: "idle" }), false);
  assert.equal(showSentinelaRing({ agentId: "sentinela", size: 220, semantic: "working" }), true);
  assert.equal(showSentinelaRing({ agentId: "correio", size: 44, semantic: "idle" }), false);
  assert.equal(showSentinelaRing({ agentId: "sentinela", size: 44, semantic: "idle", ring: false }), false);
});

// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { apiFailureMode } from "../../../apps/web/src/failure-mode.ts";
import { countsAsAgentError } from "../src/runs.ts";
import { schemaCompatible } from "../../../apps/worker/src/db/migrate.ts";

test("stale_run com 31 min deixa de ser erro; com 5 min continua", () => {
  assert.equal(countsAsAgentError({ state: "failed", errorCode: "stale_run", ageMs: 31 * 60_000 }), false);
  assert.equal(countsAsAgentError({ state: "failed", errorCode: "stale_run", ageMs: 5 * 60_000 }), true);
});

test("API 500 na primeira carga de um host público não entra na demonstração", () => {
  assert.equal(apiFailureMode("open-dot.example.workers.dev", false), "unreachable");
  assert.equal(apiFailureMode("localhost", false), "demo");
  assert.equal(apiFailureMode("open-dot.example.workers.dev", true), "keep");
});
test("schema mais novo que o código é compatível", () => {
  assert.equal(schemaCompatible("0006", "0005"), true);
  assert.equal(schemaCompatible("0004", "0005"), false);
  assert.equal(schemaCompatible(null, "0005"), false);
});

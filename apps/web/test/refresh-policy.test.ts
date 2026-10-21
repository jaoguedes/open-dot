// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { FOCUS_MIN_GAP_MS, POLL_MS, shouldRefresh } from "../src/refresh-policy.ts";

test("aba oculta nunca atualiza sozinha", () => {
  assert.equal(shouldRefresh("interval", 0, POLL_MS * 5, true), false);
  assert.equal(shouldRefresh("focus", 0, POLL_MS * 5, true), false);
  assert.equal(shouldRefresh("manual", 0, 1, true), true);
});

test("foco repetido atualiza no máximo uma vez a cada 15 s", () => {
  const t0 = 1_000_000;
  assert.equal(shouldRefresh("focus", t0, t0 + 2_000, false), false);
  assert.equal(shouldRefresh("focus", t0, t0 + FOCUS_MIN_GAP_MS - 1, false), false);
  assert.equal(shouldRefresh("focus", t0, t0 + FOCUS_MIN_GAP_MS, false), true);
  assert.equal(shouldRefresh("visible", t0, t0 + 3_000, false), false);
});

test("intervalo de 60 s só com a aba visível", () => {
  const t0 = 1_000_000;
  assert.equal(shouldRefresh("interval", t0, t0 + 30_000, false), false);
  assert.equal(shouldRefresh("interval", t0, t0 + POLL_MS, false), true);
});

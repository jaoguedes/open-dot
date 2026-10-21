// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { splashPlan } from "../src/splash-policy.ts";

test("primeira abertura da sessão mostra o oi por 1,2 s", () => {
  assert.deepEqual(splashPlan(false), { showAtStart: true, minMs: 1200, delayMs: 0 });
});

test("aberturas seguintes não esperam: splash só se a carga passar de 400 ms", () => {
  assert.deepEqual(splashPlan(true), { showAtStart: false, minMs: 0, delayMs: 400 });
});

// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { composerEnter, composerRows } from "../src/ask.ts";

const k = (o: Partial<{ key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }>) => ({ key: "Enter", shiftKey: false, isComposing: false, ...o });

test("no toque Enter quebra linha; o botão envia", () => {
  assert.equal(composerEnter(k({}), true), "newline");
});

test("no teclado Enter envia e Shift+Enter quebra", () => {
  assert.equal(composerEnter(k({}), false), "send");
  assert.equal(composerEnter(k({ shiftKey: true }), false), "newline");
});

test("Enter durante composição (acento, IME) é ignorado", () => {
  assert.equal(composerEnter(k({ isComposing: true }), false), "ignore");
  assert.equal(composerEnter(k({ keyCode: 229 }), false), "ignore");
  assert.equal(composerEnter(k({ key: "a" }), false), "ignore");
});

test("caixa cresce até 5 linhas", () => {
  assert.equal(composerRows("oi"), 1);
  assert.equal(composerRows("a\nb\nc"), 3);
  assert.equal(composerRows("1\n2\n3\n4\n5\n6\n7"), 5);
});

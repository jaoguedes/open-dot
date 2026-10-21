// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { handoffStatus } from "../src/handoff.ts";

const d = (over: Partial<{ installed: boolean; authenticated: boolean; executable: boolean }>) => ({
  id: "codex" as const,
  installed: true,
  authenticated: true,
  executable: true,
  reason: "",
  ...over,
});

test("handoff só diz que o mecanismo pode receber o pacote com Runner online, CLI, login e driver executável", () => {
  assert.equal(handoffStatus(undefined, true).tone, "off");
  assert.equal(handoffStatus(d({}), false).label, "Runner offline");
  assert.equal(handoffStatus(d({ installed: false }), true).label, "CLI não instalado");
  assert.equal(handoffStatus(d({ authenticated: false }), true).tone, "warn");
  assert.equal(handoffStatus(d({ executable: false }), true).label, "Indisponível neste Runner");
  assert.equal(handoffStatus(d({}), true).tone, "ok");
});

// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { MECHANISMS } from "../src/mechanisms.ts";

test("identidades aprovadas são mecanismos independentes de funções, sem WhatsApp ativo", () => {
  assert.deepEqual(
    MECHANISMS.map(({ name, color }) => [name, color]),
    [
      ["Codex", "#8878EE"],
      ["Claude Code", "#E99A69"],
      ["Cursor", "#69A9DE"],
    ],
  );
  assert.equal(new Set(MECHANISMS.map((m) => m.id)).size, 3);
  for (const m of MECHANISMS) assert.equal("agentId" in m, false);
});

// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

test("avaliação golden roda com ≥ 10 tarefas e se declara simulada", () => {
  assert.ok(readdirSync(new URL("../evals/golden/", import.meta.url)).filter((f) => f.endsWith(".json")).length >= 10);
  const out = execFileSync("node", ["--import", "tsx", "scripts/orchestrator/eval-golden.ts", "--print"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /\*\*Simulado\.\*\*/);
  assert.match(out, /não demonstrou superioridade de qualidade/);
});

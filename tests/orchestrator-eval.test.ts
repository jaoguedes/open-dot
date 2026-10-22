// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

test("avaliação golden roda com ≥ 16 tarefas (2 por receita) e se declara simulada", () => {
  assert.ok(readdirSync(new URL("../evals/golden/", import.meta.url)).filter((f) => f.endsWith(".json")).length >= 28);
  const out = execFileSync("node", ["--import", "tsx", "scripts/orchestrator/eval-golden.ts", "--print"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" });
  assert.match(out, /\*\*Tudo aqui é simulado\.\*\*/);
  assert.match(out, /calibração \*\*fica desligada por padrão\*\*/);
  assert.match(out, /ciclo \*\*fica desligado por padrão\*\*/);
  assert.match(out, /Agentes na ordem da receita \| 12\/12/);
  assert.match(out, /não demonstrou superioridade de qualidade/);
});

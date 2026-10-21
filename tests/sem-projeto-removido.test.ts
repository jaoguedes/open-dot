// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// Nome do projeto removido montado por partes, para este arquivo não contê-lo.
const NAME = ["c", "o", "u", "c", "o", "u"].join("");

test("nenhum arquivo versionado menciona o projeto removido", () => {
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-l", "-i", NAME, "--", ".", ":!package-lock.json"], { encoding: "utf8" });
  } catch (e) {
    // git grep sai com 1 quando não acha nada.
    if ((e as { status?: number }).status !== 1) throw e;
  }
  assert.equal(out.trim(), "");
});

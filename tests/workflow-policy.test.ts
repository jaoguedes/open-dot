// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../.github/workflows/", import.meta.url);
const workflows = readdirSync(dir).filter((f) => f.endsWith(".yml")).map((f) => ({ f, text: readFileSync(new URL(f, dir), "utf8") }));

test("actions externas fixadas por SHA completo (OD2-CLAUDE-6)", () => {
  for (const { f, text } of workflows)
    for (const m of text.matchAll(/uses:\s*([^\s#]+)/g)) {
      if (m[1]!.startsWith("./")) continue;
      assert.match(m[1]!, /@[0-9a-f]{40}$/, `${f}: ${m[1]}`);
    }
});

test("checkout não deixa o token do GitHub gravado no runner", () => {
  for (const { f, text } of workflows) {
    const checkouts = text.split("\n").filter((l) => /uses:\s*actions\/checkout@/.test(l)).length;
    assert.equal((text.match(/persist-credentials:\s*false/g) ?? []).length, checkouts, f);
  }
});

test("sem pull_request_target, permissões mínimas no topo e jobs nativos fora de PR de fork", () => {
  for (const { f, text } of workflows) {
    assert.ok(!/pull_request_target/.test(text), f);
    assert.match(text, /^permissions:\n {2}contents: read$/m, f);
  }
  const runner = workflows.find((w) => w.f === "runner-ci.yml")!.text;
  for (const job of ["native", "rust-audit"]) {
    const block = runner.split(`\n  ${job}:`)[1]!.split(/\n {2}[a-z-]+:\n/)[0]!;
    assert.match(block, /head\.repo\.full_name == github\.repository/, job);
  }
});

// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (env: Record<string, string>) => spawnSync("bash", ["scripts/release/publish.sh"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, ...env }, encoding: "utf8" });

test("script de publicação aborta sem REPO, sem SHA esperado ou com SHA divergente, antes de qualquer rede", () => {
  for (const [env, why] of [
    [{ REPO: "", EXPECTED_SHA: "x" }, /REPO/],
    [{ REPO: "jaoguedes/open-dot", EXPECTED_SHA: "" }, /EXPECTED_SHA/],
    [{ REPO: "jaoguedes/open-dot", EXPECTED_SHA: "0".repeat(40), BRANCH: "refs/heads/nao-existe" }, /não existe/],
    [{ REPO: "jaoguedes/open-dot", EXPECTED_SHA: "0".repeat(40), BRANCH: "release/v0.2" }, /ref completa/],
  ] as const) {
    const r = run(env as Record<string, string>);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ABORTADO/);
    assert.match(r.stderr, why);
  }
});

test("script envia só refs explícitas e nunca usa mirror, all ou force", () => {
  const text = spawnSync("cat", ["scripts/release/publish.sh"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" }).stdout;
  assert.ok(!/push[^\n]*(--mirror|--all|--force|\s-f\b)/.test(text));
  assert.match(text, /git push origin "\$SHA:refs\/heads\/main"/);
  assert.match(text, /git push origin "refs\/tags\/\$TAG"/);
  assert.match(text, /grep -ci 'gmail'/);
  assert.match(text, /\.data\/\|\\\.dev\\\.vars\|\\\.deploy\\\.local\\\.json/);
});

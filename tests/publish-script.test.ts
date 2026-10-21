// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("proteções toleram falha, são reaplicadas na ordem depois de tornar público e entram no resumo", () => {
  const root = new URL("..", import.meta.url).pathname;
  const text = readFileSync(new URL("../scripts/release/publish.sh", import.meta.url), "utf8");
  const block = text.split("# >>> proteções")[1]!.split("# <<< proteções")[0]!.replace(/^[^\n]*\n/, "");
  const dir = mkdtempSync(join(tmpdir(), "od-gh-"));
  // gh simulado: Dependabot e proteção da main falham enquanto o repositório é "privado".
  writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\necho "$*" >> "${dir}/calls"\n[[ -f "${dir}/public" ]] && exit 0\ncase "$*" in *vulnerability-alerts*|*branches/main/protection*) exit 1 ;; esac\n`);
  chmodSync(join(dir, "gh"), 0o755);
  const script = `set -euo pipefail\nEXECUTE=1\nREPO=dono/repo\nrun() { "$@"; }\n${block}\nfor p in $PROTECTIONS; do try_protection "$p"; done\necho ---\ntouch "${dir}/public"\nretry_failed\nsummary\n`;
  const r = spawnSync("bash", ["-c", script], { cwd: root, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const [before, after] = r.stdout.split("---\n") as [string, string];
  assert.match(before, /FALHOU: alertas e correções do Dependabot/);
  assert.match(before, /FALHOU: proteção da main/);
  assert.ok(!/FALHOU: (secret|relatório|permissões|aprovação)/.test(before), before);
  // Só as duas que falharam são repetidas, na ordem pedida.
  const calls = readFileSync(join(dir, "calls"), "utf8").trim().split("\n");
  // Antes: 6 chamadas (a segunda do Dependabot não roda quando a primeira falha); depois: 3.
  assert.equal(calls.length, 6 + 3);
  assert.match(calls[6]!, /vulnerability-alerts/);
  assert.match(calls[7]!, /automated-security-fixes/);
  assert.match(calls[8]!, /branches\/main\/protection/);
  assert.match(after, /aplicadas: secret scanning e push protection; relatório privado de vulnerabilidades; permissões do Actions; aprovação para PRs de fork; alertas e correções do Dependabot; proteção da main;/);
  assert.match(after, /falharam:  \n/);
  rmSync(dir, { recursive: true, force: true });
});

test("checks obrigatórios da proteção da main batem com os jobs de ci.yml", () => {
  const contexts = JSON.parse(readFileSync(new URL("../scripts/release/branch-protection.json", import.meta.url), "utf8")).required_status_checks.contexts as string[];
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const jobs = ci.split(/^jobs:\n/m)[1]!;
  for (const c of contexts) {
    const job = jobs.split(new RegExp(`^  ${c}:\\n`, "m"))[1];
    assert.ok(job !== undefined, `job ${c} ausente em ci.yml`);
    assert.ok(!/^ {4}name:/m.test(job!.split(/^ {2}\S/m)[0]!), `job ${c} tem name: que muda o nome do check`);
  }
  assert.deepEqual(contexts, ["check", "without-dot"]);
});

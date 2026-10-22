// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
// @ts-expect-error script .mjs sem tipos
import { latestJson } from "../scripts/release/make-latest-json.mjs";

const BASE = "https://github.com/jaoguedes/open-dot/releases/download/runner-v0.3.0";

test("latest.json só com pacotes assinados e URLs do repositório", () => {
  const out = latestJson({ "OpenDot-Runner-macos-x64.app.tar.gz": "", "OpenDot-Runner-macos-x64.app.tar.gz.sig": "c2ln\n", "OpenDot-Runner-macos-arm64.app.tar.gz": "" }, "0.3.0", BASE, "<b>notas</b>", "2026-10-22T00:00:00Z");
  assert.deepEqual(Object.keys(out.platforms), ["darwin-x86_64"], "sem .sig, sem plataforma");
  assert.equal(out.platforms["darwin-x86_64"].signature, "c2ln");
  assert.ok(out.platforms["darwin-x86_64"].url.startsWith(BASE));
  assert.throws(() => latestJson({}, "0.3.0", BASE, ""), /Nenhum pacote assinado/);
  assert.throws(() => latestJson({ "a.app.tar.gz": "", "a.app.tar.gz.sig": "x" }, "0.3.0", "https://example.com/x", ""), /fora do repositório/);
  assert.throws(() => latestJson({}, "v-lixo", BASE, ""), /Versão/);
});

test("rascunho de release falha enquanto a chave pública for o marcador; workflows continuam sem secrets", () => {
  assert.throws(() => execFileSync("node", ["scripts/release/check-updater-key.mjs"], { stdio: "pipe" }));
  const wf = readFileSync(".github/workflows/runner-release.yml", "utf8");
  assert.match(wf, /check-updater-key\.mjs/);
  assert.ok(!/\bsecrets\./.test(wf));
  const conf = JSON.parse(readFileSync("apps/runner/src-tauri/tauri.conf.json", "utf8"));
  assert.equal(conf.plugins.updater.pubkey, "[CHAVE_PUBLICA_A_DEFINIR]");
});

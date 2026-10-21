// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "../apps/worker/src/env.ts";
import { deployTarget, wranglerVarArgs } from "../scripts/lib/deploy-target.mjs";

const base = { TOKEN_KEYS: "v1:" + Buffer.alloc(32, 1).toString("base64") };

test("wrangler.jsonc versionado não aponta para nenhuma instância real (OD2-CLAUDE-02)", () => {
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const origin = text.match(/"APP_ORIGIN":\s*"([^"]*)"/)?.[1];
  assert.equal(origin, "https://open-dot.<SEU-SUBDOMINIO>.workers.dev");
  assert.match(text, /"OWNER_NAME":\s*""/);
  for (const m of text.matchAll(/[a-z0-9-]+\.([a-z0-9<>-]+)\.workers\.dev/gi)) assert.equal(m[1], "<SEU-SUBDOMINIO>");
});

test("Worker recusa origem com placeholder ou sem HTTPS fora do localhost", () => {
  assert.equal(parseEnv({ ...base, APP_ORIGIN: "https://open-dot.<SEU-SUBDOMINIO>.workers.dev" }).ok, false);
  assert.equal(parseEnv({ ...base, APP_ORIGIN: "https://open-dot.SEU-SUBDOMINIO.workers.dev" }).ok, false);
  assert.equal(parseEnv({ ...base, APP_ORIGIN: "http://open-dot.example.workers.dev" }).ok, false);
  assert.equal(parseEnv({ ...base, APP_ORIGIN: "https://open-dot.example.workers.dev/caminho" }).ok, false);
  assert.equal(parseEnv({ ...base, APP_ORIGIN: "https://open-dot.example.workers.dev" }).ok, true);
  assert.equal(parseEnv({ ...base, APP_ORIGIN: "http://localhost:8787" }).ok, true);
  assert.equal(parseEnv({ ...base, APP_ORIGIN: "http://127.0.0.1:8787" }).ok, true);
});

test("alvo de deploy vem de arquivo local ignorado ou do ambiente, nunca do repositório", () => {
  const dir = mkdtempSync(join(tmpdir(), "od-deploy-"));
  try {
    assert.throws(() => deployTarget({ root: dir, env: {} }), /deploy\.local\.json/);
    writeFileSync(join(dir, ".deploy.local.json"), JSON.stringify({ appOrigin: "https://open-dot.<SEU-SUBDOMINIO>.workers.dev" }));
    assert.throws(() => deployTarget({ root: dir, env: {} }), /placeholder|inválid/i);
    writeFileSync(join(dir, ".deploy.local.json"), JSON.stringify({ appOrigin: "https://open-dot.example.workers.dev", ownerName: "Ana" }));
    const t = deployTarget({ root: dir, env: {} });
    assert.deepEqual(t, { appOrigin: "https://open-dot.example.workers.dev", ownerName: "Ana" });
    assert.deepEqual(wranglerVarArgs(t), ["--var", "APP_ORIGIN:https://open-dot.example.workers.dev", "--var", "OWNER_NAME:Ana"]);
    assert.deepEqual(deployTarget({ root: dir, env: { OPEN_DOT_APP_ORIGIN: "https://outra.example.workers.dev" } }).appOrigin, "https://outra.example.workers.dev");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.match(readFileSync(new URL("../.gitignore", import.meta.url), "utf8"), /^\.deploy\.local\.json$/m);
});

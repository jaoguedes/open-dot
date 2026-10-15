import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { explainError, isKnownReason, sanitizeDetail, versionChanged } from "../src/errors-pt.ts";

test("dicionário: código conhecido, http e desconhecido", () => {
  assert.match(explainError("subrequest_limit").frase, /50/);
  assert.match(explainError("upstream_http_403").frase, /403/);
  assert.match(explainError("codigo_que_nao_existe").frase, /Não sei ainda/);
  assert.equal(isKnownReason("chunk_missing"), true);
  assert.equal(isKnownReason("upstream_http_404"), true);
  assert.equal(isKnownReason("nao_listado"), false);
});

test("sanitização tira segredo, e-mail e stack", () => {
  const out = sanitizeDetail("token=segredo-teste senha=abc pessoa@example.com\n at foo (bar.js:1)");
  assert.equal(out.includes("segredo-teste"), false);
  assert.equal(out.includes("pessoa@example.com"), false);
  assert.equal(out.includes("bar.js"), false);
  assert.match(out, /oculto/);
});

test("versão diferente pede aviso", () => {
  assert.equal(versionChanged("aaaabbbbcccc", "ddddeeeeffff"), true);
  assert.equal(versionChanged("aaaabbbbcccc", "aaaabbbbcccc"), false);
  assert.equal(versionChanged("", "aaaabbbbcccc"), false);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "dist" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("todo código reason do worker e do app está no dicionário", () => {
  const root = new URL("../../..", import.meta.url).pathname;
  const files = [...walk(join(root, "apps/worker/src")), ...walk(join(root, "apps/web/src"))];
  const missing = new Set<string>();
  const re = /(?:errorCode|reason)\s*:\s*["']([a-z][a-z0-9_]*)["']/g;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      const code = m[1]!;
      if (!isKnownReason(code)) missing.add(`${code} em ${file}`);
    }
  }
  assert.deepEqual([...missing], []);
});

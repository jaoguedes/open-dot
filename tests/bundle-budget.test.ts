import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { checkAppJs, initialBytes } from "../scripts/lib/bundle-budget.mjs";

test("app.js acima de 400 KB derruba o build", () => {
  assert.equal(checkAppJs(401 * 1024).ok, false);
  assert.equal(checkAppJs(400 * 1024).ok, true);
  assert.match(checkAppJs(360 * 1024).message ?? "", /meta de 350 KB/);
  assert.equal(checkAppJs(300 * 1024).message, null);
});

test("conta os chunks estáticos e ignora import() dinâmico", () => {
  const files: Record<string, string> = {
    "/d/app.js": 'import{a}from"./chunks/c1.js";import"./chunks/c2.js";const x=()=>import("./chunks/lazy.js");',
    "/d/chunks/c1.js": "x".repeat(100),
    "/d/chunks/c2.js": 'import{b}from"./c1.js";' + "y".repeat(50),
    "/d/chunks/lazy.js": "z".repeat(10_000),
  };
  const r = initialBytes("/d/app.js", (f) => files[f]!);
  assert.equal(r.files, 3);
  assert.equal(r.bytes, Buffer.byteLength(files["/d/app.js"]!) + 100 + Buffer.byteLength(files["/d/chunks/c2.js"]!));
});

test("o build aplica o orçamento", () => {
  const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /checkAppJs\(initial\.bytes\)/);
});

test("o último build de produção cabe no limite", () => {
  const f = new URL("../apps/web/dist/assets/app.js", import.meta.url);
  if (!existsSync(f) || readFileSync(f, "utf8").includes("forcar")) return; // sem build ou build de desenvolvimento
  assert.equal(checkAppJs(initialBytes(f.pathname).bytes).ok, true);
});

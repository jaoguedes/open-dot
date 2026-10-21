// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveHeaders, staticHeaders } from "../scripts/lib/static-headers.mjs";

const text = staticHeaders();

test("chunks com hash ficam um ano e imutáveis", () => {
  assert.equal(resolveHeaders(text, "/assets/chunks/chunk-ABC123.js")["cache-control"], "public, max-age=31536000, immutable");
});

test("app.js e app.css sem hash sempre revalidam", () => {
  for (const p of ["/assets/app.js", "/assets/app.css", "/assets/extract-worker.js"]) {
    assert.equal(resolveHeaders(text, p)["cache-control"], "public, max-age=0, must-revalidate", p);
  }
});

test("sons ficam um dia em cache e a CSP vale em tudo", () => {
  const h = resolveHeaders(text, "/sounds/dot-tap.mp3");
  assert.equal(h["cache-control"], "public, max-age=86400");
  assert.match(h["content-security-policy"] ?? "", /media-src 'self'/);
});

test("o build escreve o _headers a partir dessa função", () => {
  const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /writeFileSync\(join\(dist, "_headers"\), staticHeaders\(\)\)/);
});

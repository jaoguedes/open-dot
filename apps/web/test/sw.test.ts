import { test } from "node:test";
import assert from "node:assert/strict";
import { assetOrReal404 } from "../../worker/src/index.ts";
// @ts-expect-error gerador em JavaScript, sem declaração para o tsc
import { serviceWorkerSource } from "../../../scripts/lib/sw-source.mjs";

test("dois deploys trocam o cache e a navegação não é cache-first", () => {
  const a = serviceWorkerSource("aaaa1111bbbb");
  const b = serviceWorkerSource("cccc2222dddd");
  assert.match(a, /open-dot-shell-aaaa1111bbbb/);
  assert.match(b, /open-dot-shell-cccc2222dddd/);
  assert.notEqual(a, b);
  assert.match(a, /network-first/);
  assert.match(a, /stale-while-revalidate/);
  const nav = a.indexOf("isNav");
  const fetchAt = a.indexOf("await fetch(req)", nav);
  const cacheAt = a.indexOf("cache.match", fetchAt);
  assert.ok(fetchAt > nav && cacheAt > fetchAt);
});

test("asset html de um arquivo que não existe vira 404", async () => {
  const html = await assetOrReal404(new Response("<!doctype html><div id=\"root\">", { status: 200, headers: { "content-type": "text/html" } }));
  assert.equal(html.status, 404);
  const js = await assetOrReal404(new Response("export {}", { status: 200, headers: { "content-type": "text/javascript" } }));
  assert.equal(js.status, 200);
});

test("fontes, sons e arquivos do Dot inexistentes são 404, não index.html", async () => {
  const { default: worker } = await import("../../worker/src/index.ts");
  const assets = { fetch: async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }) };
  for (const p of ["/fonts/nao-existe.woff2", "/sounds/nao-existe.mp3", "/dot/nao-existe.glb", "/assets/x.js", "/chunks/y.js"]) {
    const r = await worker.fetch(new Request(`https://exemplo.invalid${p}`), { ASSETS: assets });
    assert.equal(r.status, 404, p);
  }
  const page = await worker.fetch(new Request("https://exemplo.invalid/meu-dia"), { ASSETS: assets });
  assert.equal(page.status, 200);
});

test("wrangler manda esses prefixos ao Worker antes do fallback de SPA", async () => {
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL("../../../wrangler.jsonc", import.meta.url), "utf8");
  for (const p of ["/api/*", "/assets/*", "/chunks/*", "/fonts/*", "/sounds/*", "/dot/*"]) assert.ok(text.includes(`"${p}"`), p);
});

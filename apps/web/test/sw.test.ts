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

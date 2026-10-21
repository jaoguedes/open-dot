// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toVisual } from "@open-dot/core";
import { AgentDot, MASCOT } from "../apps/web/src/mascot/placeholder/index.tsx";
import { DOT_PATHS, isDotPath } from "../scripts/lib/dot-paths.mjs";

test("Marcador descreve o estado em texto, não só em cor", () => {
  for (const semantic of ["idle", "working", "error", "waiting"] as const) {
    const html = renderToStaticMarkup(createElement(AgentDot, { visual: toVisual("codigo", semantic), accessory: "none", size: 48, reducedMotion: true }));
    assert.match(html, /role="img"/);
    assert.match(html, new RegExp(`aria-label="Marcador: ${toVisual("codigo", semantic).label}"`));
    assert.ok(!/is-moving/.test(html), "movimento reduzido respeitado");
  }
  assert.equal(MASCOT.kind, "placeholder");
});

test("Marcador fica fora das pastas do Dot e não importa código do Dot", () => {
  assert.equal(isDotPath("apps/web/src/mascot/placeholder/index.tsx"), false);
  assert.equal(isDotPath("apps/web/src/dot/DotView.tsx"), true);
  const src = readFileSync(new URL("../apps/web/src/mascot/placeholder/index.tsx", import.meta.url), "utf8");
  assert.ok(!/from\s+["'][^"']*\/dot(3d)?\//.test(src));
  assert.ok(DOT_PATHS.includes("packages/core/src/dot/"));
});

test("ícones do Marcador têm os mesmos nomes e tamanhos do app", () => {
  for (const [n, sz] of [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512], ["apple-touch-icon.png", 180], ["favicon-16.png", 16], ["favicon-32.png", 32], ["favicon-256.png", 256]] as const) {
    const png = readFileSync(new URL(`../assets/placeholder/icons/${n}`, import.meta.url));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [sz, sz], n);
  }
});

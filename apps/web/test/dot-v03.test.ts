// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toVisual } from "@open-dot/core";
import { BASE_PALETTE, DotEngine, GAZE_MAX, bodyPalette, mix } from "@open-dot/core/dot/index.ts";
import { DotView, type DotViewProps } from "../src/dot/DotView.tsx";
import { artDefs } from "../src/dot/art.ts";

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const view = (p: Partial<DotViewProps> & Pick<DotViewProps, "visual">) => renderToStaticMarkup(createElement(DotView, { accessory: "none", size: 150, reducedMotion: true, ...p }));

// Hashes gravados ANTES das mudanças do v0.3 (69c5769). Sem tint e sem reações, o Dot é byte a byte o mesmo.
const GOLDEN = {
  artDefs: "f2218f890a65cd945c611c2dd31dfda191222b17d8a244980ac725470826659c",
  idle: "6b9f928fcc43e711e2b298b6b8c7556f3aed8bd640aa60efa5843752b0ef198e",
  working: "0f2d2c163c0d8e0b1d2df97801a285f441ceaf75a9e98be84a4ba4dd0e1b8224",
  error: "ab691ae7c2a508f85ca002f3bc9e8537bf57070729914527100036d62cda4557",
  waiting: "a0fdc173a9574854da75d902e0a8df090f14d17260d70507c8a2ff8c5783f9d4",
  cap: "b7a29061b880eea947f53e3f22eb7eddf516633fdff57d0df7ab8199fb4d22f1",
  frames: "48b8c730f9e9fc0c162ee8fdbbd143d7782ac2d2573fbf805fb95a29fbcf07a2",
};

function frames(setup?: (e: DotEngine) => void): unknown[] {
  const e = new DotEngine({ seed: 7 });
  setup?.(e);
  const out: unknown[] = [];
  for (let i = 0; i < 240; i++) {
    e.step(1 / 60);
    if (i % 30 === 0) out.push(e.frame());
    if (i === 60) e.react("oi");
    if (i === 150) e.setState("working");
  }
  return out;
}

test("golden: sem tint e sem reações, desenho e motor são idênticos ao v0.2", () => {
  assert.equal(h(artDefs("od")), GOLDEN.artDefs);
  for (const sem of ["idle", "working", "error", "waiting"] as const) assert.equal(h(view({ visual: toVisual("dot", sem) })), GOLDEN[sem], sem);
  assert.equal(h(renderToStaticMarkup(createElement(DotView, { visual: toVisual("correio", "idle"), accessory: "mail_cap", size: 64, reducedMotion: false, small: true }))), GOLDEN.cap);
  assert.equal(h(JSON.stringify(frames())), GOLDEN.frames);
  assert.equal(h(JSON.stringify(frames((e) => e.setMood(null)))), GOLDEN.frames, "setMood(null) não muda nada");
});

test("tint: fórmula, determinismo e cores da referência", () => {
  assert.equal(bodyPalette(), BASE_PALETTE);
  assert.equal(mix("#000000", "#FFFFFF", 0.5), "#808080");
  // Referência aprovada (docs/design/v0.3-referencia-runner/dot-*.svg), intensidade 100.
  const ref = (file: string) => {
    const svg = readFileSync(new URL(`../../../docs/design/v0.3-referencia-runner/${file}`, import.meta.url), "utf8");
    const body = /<linearGradient id="b"[^>]*>(.*?)<\/linearGradient>/.exec(svg)![1]!;
    return { stops: [...body.matchAll(/stop-color="(#[0-9a-f]{6})"/gi)].map((m) => m[1]!.toLowerCase()), edge: /<radialGradient id="e"[^>]*><stop offset="0" stop-color="(#[0-9a-f]{6})"/i.exec(svg)![1]!.toLowerCase() };
  };
  for (const [file, color] of [["dot-codex.svg", "#A48BFF"], ["dot-claude.svg", "#FF9A55"], ["dot-cursor.svg", "#62AAFF"]] as const) {
    const p = bodyPalette({ color, intensity: 100 });
    const r = ref(file);
    assert.deepEqual(p.stops, r.stops, file);
    assert.equal(p.edge[0], r.edge, file);
    assert.equal(p.glow, color.toLowerCase());
    assert.deepEqual(bodyPalette({ color, intensity: 100 }), p, "determinístico");
  }
  const half = bodyPalette({ color: "#A48BFF", intensity: 50 });
  assert.equal(half.stops[4], mix("#BCC6F8", "#A48BFF", 0.5));
  assert.deepEqual(bodyPalette({ color: "#A48BFF", intensity: 400 }), bodyPalette({ color: "#A48BFF", intensity: 100 }), "intensidade limitada a 100");
  assert.throws(() => bodyPalette({ color: "red", intensity: 100 }));
});

test("tint muda só corpo, contorno interno e brilho; olhos, bochechas e forma intactos", () => {
  const base = view({ visual: toVisual("dot", "idle") });
  const tinted = view({ visual: toVisual("dot", "idle"), tint: { color: "#A48BFF", intensity: 100 } });
  assert.notEqual(base, tinted);
  const strip = (s: string) => s.replace(/<linearGradient id="[^"]*-eBody".*?<\/linearGradient>/, "").replace(/<radialGradient id="[^"]*-eEdge".*?<\/radialGradient>/, "");
  assert.equal(strip(base), strip(tinted));
  for (const s of [tinted]) {
    assert.ok(s.includes("#120F1E"), "olhos com a tinta original");
    assert.ok(s.includes("#FF8FB8"), "bochechas originais");
    assert.doesNotMatch(s, /mouth|boca|brow|sobrancel|balao|speech/i);
  }
});

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

test("contraste do corpo tingido contra o fundo do app (#07080C) ≥ 3:1 em todas as paradas", () => {
  const bg = lum("#07080C");
  for (const color of ["#A48BFF", "#FF9A55", "#62AAFF", "#4FE3B6", "#F28FD0"]) {
    for (const stop of bodyPalette({ color, intensity: 100 }).stops) assert.ok((lum(stop) + 0.05) / (bg + 0.05) >= 3, `${color} ${stop}`);
  }
});

test("reações: olhar limitado, rubor, gotas e pânico; movimento reduzido sem olhar nem tremor", () => {
  const e = new DotEngine({ seed: 5 });
  e.step(0.1);
  const before = e.frame();
  e.setMood({ gaze: [5, -9], heat: 0, strain: 0 });
  for (let i = 0; i < 600; i++) e.step(1 / 60);
  const looking = e.frame();
  assert.equal(e.mood!.gaze![0], 1, "olhar limitado a ±1");
  assert.ok(Math.abs(looking.eyes[0].x - before.eyes[0].x) <= GAZE_MAX[0] + 1.5);
  assert.ok(looking.eyes[0].x > before.eyes[0].x, "olha para a direita");
  assert.deepEqual(looking.sweat, [], "sem carga, sem gota");

  e.setMood({ heat: 0.8 });
  e.step(1 / 60);
  const hot = e.frame();
  assert.equal(hot.sweat!.length, 1);
  assert.ok(hot.cheeks[0].rx > before.cheeks[0].rx * 1.15 && hot.cheeks[0].ry! > 8);
  assert.equal(hot.eyes[0].glint, 0);

  e.setMood({ heat: 1, strain: 0.9 });
  assert.ok(e.shakeT > 0, "tremor curto ao entrar no pânico");
  e.step(1 / 60);
  const panic = e.frame();
  assert.equal(panic.sweat!.length, 2);
  assert.ok(panic.eyes[0].grow! > 1.1 && panic.eyes[0].glint! > 0);
  for (let i = 0; i < 120; i++) e.step(1 / 60);
  assert.equal(e.shakeX, 0, "tremor não é contínuo");

  const rm = new DotEngine({ seed: 5, reducedMotion: true });
  rm.setMood({ gaze: [1, 1], heat: 1, strain: 1 });
  rm.step(1 / 60);
  const still = rm.frame();
  assert.equal(rm.mood!.gaze, null);
  assert.equal(rm.shakeT, 0);
  assert.equal(still.sweat!.length, 2, "gotas e rubor ficam, estáticos");
  const again = (rm.step(1), rm.frame());
  assert.deepEqual(again.sweat, still.sweat);
});

test("reações: render com motivo acessível e sem elementos proibidos", () => {
  const s = view({ visual: toVisual("dot", "working"), heat: 0.8, reason: "CPU 92% há 1 min" });
  assert.match(s, /title="CPU 92% há 1 min"/);
  assert.match(s, /aria-label="[^"]*CPU 92% há 1 min"/);
  assert.match(s, /data-r="sweat0"/);
  assert.doesNotMatch(s, /mouth|boca|brow|sobrancel|balao|speech/i);
});

// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import { test } from "node:test";
import assert from "node:assert/strict";
import { toVisual } from "@open-dot/core";
import { FrameGovernor, blendMs, chooseRenderer, clampGaze, clipsFor, gazeFromPointer, validateManifest, type DotManifest } from "../src/dot3d/policy.ts";

const manifest: DotManifest = {
  assetVersion: "dot-test",
  base: "dot-base.abc123.glb",
  root: "Root_Dot",
  requiredNodes: [],
  morphs: { Eyes: [], Body: [] },
  clips: { body: ["body_idle_breathe", "body_error", "body_success", "body_touch_squash"], face: ["face_squint", "face_happy"] },
  states: {
    idle: { body: "body_idle_breathe", face: null },
    error: { body: "body_error", face: "face_squint" },
    success: { body: "body_success", face: "face_happy" },
    touch: { body: "body_touch_squash", face: null },
  },
  props: { Prop_Glasses: { file: "prop-Prop_Glasses.1.glb", anchor: "Socket_Face" } },
  fx: { Heart_Source: { file: "fx-Heart_Source.2.glb" } },
  limits: { fps: 30, maxHearts: 6, maxDpr: 1.5, gazeYawDeg: 8, gazePitchDeg: 5 },
  validation: { structural: "ok", khronos: "não executado", runtime: "pendente" },
};

const ok = { webgl: true, reducedMotion: false, contextLost: false, manifestOk: true, loadFailed: false, canvasFree: true };

test("fallback 2D: movimento reduzido, sem WebGL, contexto perdido, canvas ocupado e falha de carga", () => {
  assert.deepEqual(chooseRenderer(ok), { kind: "3d" });
  assert.deepEqual(chooseRenderer({ ...ok, reducedMotion: true }), { kind: "2d", reason: "reduced-motion" });
  assert.deepEqual(chooseRenderer({ ...ok, webgl: false }), { kind: "2d", reason: "no-webgl" });
  assert.deepEqual(chooseRenderer({ ...ok, contextLost: true }), { kind: "2d", reason: "context-lost" });
  assert.deepEqual(chooseRenderer({ ...ok, canvasFree: false }), { kind: "2d", reason: "busy" });
  assert.deepEqual(chooseRenderer({ ...ok, manifestOk: false }), { kind: "2d", reason: "manifest" });
  assert.deepEqual(chooseRenderer({ ...ok, loadFailed: true }), { kind: "2d", reason: "load-failed" });
  // Movimento reduzido vence mesmo com tudo disponível: a preferência do usuário vem antes.
  assert.equal(chooseRenderer({ ...ok, reducedMotion: true, webgl: false }).kind, "2d");
});

test("manifesto: recusa caminho fora da pasta, estado apontando para clipe inexistente e lixo", () => {
  assert.equal(validateManifest(manifest), true);
  assert.equal(validateManifest({ ...manifest, base: "../../etc/passwd.glb" }), false);
  assert.equal(validateManifest({ ...manifest, base: "https://evil.example/x.glb" }), false);
  assert.equal(validateManifest({ ...manifest, props: { X: { file: "../x.glb", anchor: "Socket_Head" } } }), false);
  assert.equal(validateManifest({ ...manifest, states: { ...manifest.states, idle: { body: "body_inexistente", face: null } } }), false);
  assert.equal(validateManifest(null), false);
  assert.equal(validateManifest("texto"), false);
});

test("estado → clipes: sem conexão usa repouso (cor faz o resto), erro combina corpo e rosto, reação não repete", () => {
  assert.deepEqual(clipsFor(toVisual("correio", "disconnected"), manifest), { body: "body_idle_breathe", face: null, loopBody: true });
  assert.deepEqual(clipsFor(toVisual("codigo", "error"), manifest), { body: "body_error", face: "face_squint", loopBody: false });
  assert.equal(clipsFor(toVisual("dot", "idle"), manifest, "touch").loopBody, false);
  // Estado ausente no manifesto cai no repouso em vez de quebrar.
  assert.equal(clipsFor(toVisual("dot", "thinking"), manifest).body, "body_idle_breathe");
});

test("blend entre 150 e 250 ms", () => {
  assert.equal(blendMs(), 200);
  assert.equal(blendMs(0), 150);
  assert.equal(blendMs(10_000), 250);
});

test("olhar limitado, inclusive com entrada inválida", () => {
  assert.deepEqual(clampGaze(40, -40, manifest.limits), { yaw: 8, pitch: -5 });
  assert.deepEqual(clampGaze(Number.NaN, Number.POSITIVE_INFINITY, manifest.limits), { yaw: 0, pitch: 0 });
  const g = gazeFromPointer(10_000, 10_000, 50, manifest.limits);
  assert.deepEqual(g, { yaw: 8, pitch: -5 });
});

test("governador: no máximo 30 fps em 1 s de rAF a 60 Hz e zero quadros em repouso", () => {
  const g = new FrameGovernor(30);
  let t = 0;
  g.keepAlive(0, 1000);
  for (let i = 0; i < 60; i++, t += 1000 / 60) g.shouldRender(t);
  assert.ok(g.rendered <= 31 && g.rendered >= 29, `renderizou ${g.rendered}`);
  // Depois do período ativo e sem pedidos, nada é desenhado nem pedido.
  t = 1050;
  const before = g.rendered;
  for (let i = 0; i < 120; i++, t += 1000 / 60) g.shouldRender(t);
  assert.equal(g.rendered, before);
  assert.equal(g.wantsLoop(t), false);
  // Um pedido explícito gera exatamente um quadro.
  g.invalidate();
  assert.equal(g.shouldRender(t + 100), true);
  assert.equal(g.shouldRender(t + 200), false);
});

test("governador pausado (janela oculta) não desenha nem com pedido ativo", () => {
  const g = new FrameGovernor(30);
  g.setPaused(true);
  g.invalidate();
  g.keepAlive(0, 10_000);
  assert.equal(g.shouldRender(100, true), false);
  g.setPaused(false);
  assert.equal(g.shouldRender(200), true);
});

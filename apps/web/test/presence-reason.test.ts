// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { islandReason } from "../src/presence.ts";

test("código do status vira frase humana na ilha", () => {
  const t = islandReason("not_connected");
  assert.ok(t && !t.includes("not_connected"), String(t));
  assert.equal(islandReason("Reconecte o Gmail"), "Reconecte o Gmail");
  assert.equal(islandReason(null), null);
});

import { toVisual } from "@open-dot/core";
import { dominantVisual } from "../src/presence.ts";

test("desempate do Dot: erro > esperando você > trabalhando > repouso", () => {
  const v = (a: Parameters<typeof toVisual>[0], s: Parameters<typeof toVisual>[1]) => toVisual(a, s);
  assert.equal(dominantVisual([v("dot", "idle"), v("noticias", "working"), v("codigo", "error")]).agentId, "codigo");
  assert.equal(dominantVisual([v("dot", "idle"), v("correio", "waiting"), v("codigo", "error")]).agentId, "codigo");
  assert.equal(dominantVisual([v("dot", "idle"), v("noticias", "working"), v("correio", "waiting")]).agentId, "correio");
  assert.equal(dominantVisual([v("dot", "idle"), v("noticias", "working")]).agentId, "noticias");
  assert.equal(dominantVisual([v("dot", "idle"), v("noticias", "idle")]).agentId, "dot");
});

import { applyDismiss } from "../src/presence.ts";

test("erro dispensado some até a próxima execução do agente", () => {
  const err = { ...toVisual("codigo", "error", "r1", "db_error"), revision: 100 };
  assert.equal(applyDismiss(err, 100).semantic, "idle");
  assert.equal(applyDismiss({ ...err, revision: 200 }, 100).semantic, "error");
  assert.equal(applyDismiss(err, undefined).semantic, "error");
  assert.equal(applyDismiss({ ...toVisual("codigo", "working"), revision: 100 }, 100).semantic, "working");
});

import { runProgress } from "../src/presence.ts";

test("progresso vem do estado real da execução, sem etapa inventada", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const at = "2026-10-15T11:59:00Z";
  assert.deepEqual(runProgress({ state: "queued", updatedAt: at }, now), { step: 1, steps: 3, label: "na fila" });
  assert.deepEqual(runProgress({ state: "running", updatedAt: at }, now), { step: 2, steps: 3, label: "executando" });
  assert.equal(runProgress({ state: "succeeded", updatedAt: at }, now), null);
  assert.equal(runProgress({ state: "running", updatedAt: "2026-10-15T11:40:00Z" }, now), null);
});

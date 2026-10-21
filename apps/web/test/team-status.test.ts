// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { toolStatus } from "../src/team-status.ts";

const t = (over = {}) => ({ id: "codex", installed: true, version: "1.0.0", loggedIn: true, authMethod: "chatgpt", possiblyPaid: false, executable: true, reason: "", ...over });

test("estado da ferramenta é dito em texto e nunca promete mais do que foi confirmado", () => {
  assert.equal(toolStatus(undefined, "suportado").label, "Não instalada");
  assert.equal(toolStatus(t({ loggedIn: false }), "suportado").label, "Instalada, sem login");
  assert.equal(toolStatus(t({ loggedIn: null }), "suportado").tone, "warn");
  assert.match(toolStatus(t({ possiblyPaid: true }), "experimental").label, /possivelmente pago/);
  assert.equal(toolStatus(t(), "indisponivel").label, "Instalada; integração indisponível");
  assert.equal(toolStatus(t({ executable: false }), "experimental").label, "Logada; driver desligado");
  assert.equal(toolStatus(t(), "suportado").label, "Pronta");
  assert.equal(toolStatus(t(), "planejado").label, "Planejada");
});

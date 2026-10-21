// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { fmtWhen, greeting, ownerTimeZone, setOwnerTimeZone } from "../src/format.ts";

const NOW = Date.parse("2026-10-15T15:00:00Z"); // qui 12:00 em São Paulo

test("item de hoje mostra só a hora", () => {
  assert.equal(fmtWhen("2026-10-15T12:30:00Z", NOW, "America/Sao_Paulo"), "09:30");
});

test("item de ontem e da semana mostram o dia", () => {
  assert.equal(fmtWhen("2026-10-14T20:00:00Z", NOW, "America/Sao_Paulo"), "ontem 17:00");
  assert.equal(fmtWhen("2026-10-12T12:30:00Z", NOW, "America/Sao_Paulo"), "seg 09:30");
});

test("item antigo mostra dia e mês", () => {
  assert.equal(fmtWhen("2026-09-30T12:30:00Z", NOW, "America/Sao_Paulo"), "30 set 09:30");
});

test("o dia vira pelo fuso do dono, não pelo do navegador", () => {
  // 02:30 UTC do dia 15 ainda é dia 14 em São Paulo, mas já é dia 15 em Lisboa.
  assert.equal(fmtWhen("2026-10-15T02:30:00Z", NOW, "America/Sao_Paulo"), "ontem 23:30");
  assert.equal(fmtWhen("2026-10-15T02:30:00Z", NOW, "Europe/Lisbon"), "03:30");
});

test("fuso do dono vale por padrão e fuso inválido é ignorado", () => {
  setOwnerTimeZone("Asia/Tokyo");
  assert.equal(ownerTimeZone(), "Asia/Tokyo");
  setOwnerTimeZone("Lua/Base");
  assert.equal(ownerTimeZone(), "Asia/Tokyo");
  assert.equal(typeof greeting(), "string");
  setOwnerTimeZone("America/Sao_Paulo");
});

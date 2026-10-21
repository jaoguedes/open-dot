// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSchema } from "../src/orchestrator/schema-check.ts";

const schema = (id: string) => JSON.parse(readFileSync(new URL(`../../../agents/${id}/schema.json`, import.meta.url), "utf8"));

test("saída válida do QA passa; campo extra, enum errado e obrigatório ausente falham", () => {
  const ok = { decisao: "reprovar", achados: [{ severidade: "critico", arquivo: "a.ts", evidencia: "x", sugestao: "y" }], criterios_cobertos: [], casos_de_teste: [], mesma_ferramenta: false };
  assert.deepEqual(checkSchema(ok, schema("qa")), []);
  assert.ok(checkSchema({ ...ok, shell: "rm" }, schema("qa")).some((e) => /não permitido/.test(e)));
  assert.ok(checkSchema({ ...ok, decisao: "talvez" }, schema("qa")).length);
  const { decisao: _d, ...missing } = ok;
  assert.ok(checkSchema(missing, schema("qa")).some((e) => /obrigatório/.test(e)));
});

test("todos os esquemas dos agentes usam só palavras-chave suportadas", () => {
  for (const id of ["produto", "pesquisa", "design", "desenvolvedor", "qa"]) {
    const errs = checkSchema({}, schema(id));
    assert.ok(!errs.some((e) => /não suportada/.test(e)), id);
  }
  assert.ok(checkSchema({}, { type: "object", $ref: "#/x" }).some((e) => /não suportada/.test(e)));
});

test("limites de texto, itens, padrão e tipos aninhados", () => {
  const s = { type: "object", properties: { url: { type: "string", pattern: "^https://" }, l: { type: "array", maxItems: 1, items: { type: "string", maxLength: 3 } } } };
  assert.equal(checkSchema({ url: "http://x", l: ["abcd", "e"] }, s).length, 3);
  assert.deepEqual(checkSchema({ url: "https://x", l: ["ab"] }, s), []);
});

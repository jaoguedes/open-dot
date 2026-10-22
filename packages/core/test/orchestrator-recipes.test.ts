// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadAgentPackage, type AgentFiles, type AgentMeta } from "../src/orchestrator/agents.ts";
import { RecipeError, loadRecipe } from "../src/orchestrator/recipes.ts";

const root = new URL("../../../", import.meta.url);
const metas: AgentMeta[] = await Promise.all(
  (JSON.parse(readFileSync(new URL("orchestrator/generated/agents.json", root), "utf8")).agentes as Array<{ files: AgentFiles }>).map(async (a) => (await loadAgentPackage(a.files)).meta),
);
const lock = JSON.parse(readFileSync(new URL("orchestrator/recipes/recipes.lock.json", root), "utf8")) as Record<string, string>;
const text = (id: string) => readFileSync(new URL(`orchestrator/recipes/${id}.json`, root), "utf8");
const mutate = (id: string, f: (r: Record<string, unknown>) => void) => {
  const r = JSON.parse(text(id));
  f(r);
  return JSON.stringify(r);
};

test("as seis receitas carregam pelo hash fixado e conferem com os agentes", async () => {
  const files = readdirSync(new URL("orchestrator/recipes/", root)).filter((f) => f.endsWith(".json") && f !== "recipes.lock.json");
  assert.equal(files.length, 6);
  for (const id of Object.keys(lock)) {
    const r = await loadRecipe(text(id), metas, lock[id]);
    assert.equal(r.id, id);
  }
  assert.equal((await loadRecipe(text("revisao-de-seguranca"), metas)).modo, "somente-leitura");
});

test("receita que pede poder é recusada inteira, em qualquer nível", async () => {
  for (const f of [
    (r: Record<string, unknown>) => (r.permissoes = ["shell"]),
    (r: Record<string, unknown>) => (r.comando = "npm test"),
    (r: Record<string, unknown>) => ((r.entradas as Array<Record<string, unknown>>)[0]!.shell = "rm -rf /"),
    (r: Record<string, unknown>) => (r.segredos = ["GITHUB_TOKEN"]),
    (r: Record<string, unknown>) => (r.hooks = { antes: "curl" }),
    (r: Record<string, unknown>) => (r.modelo = "x"),
  ])
    await assert.rejects(loadRecipe(mutate("corrigir-bug", f), metas), RecipeError);
  await assert.rejects(loadRecipe(mutate("corrigir-bug", (r) => (r.prioridade = "alta")), metas), /Unrecognized|prioridade/);
});

test("ordem, modo, agentes e hash são conferidos", async () => {
  await assert.rejects(loadRecipe(mutate("revisao-de-seguranca", (r) => ((r.papeis = ["implementador"]), (r.agentes = ["desenvolvedor"]))), metas), /somente leitura/);
  await assert.rejects(loadRecipe(mutate("corrigir-bug", (r) => ((r.papeis = ["revisor", "implementador"]), (r.agentes = ["qa", "desenvolvedor"]))), metas), /ordem/);
  await assert.rejects(loadRecipe(mutate("corrigir-bug", (r) => ((r.agentes as string[])[0] = "fantasma")), metas), /desconhecido/);
  await assert.rejects(loadRecipe(mutate("corrigir-bug", (r) => ((r.agentes as string[])[2] = "produto")), metas), RecipeError);
  await assert.rejects(loadRecipe(mutate("corrigir-bug", (r) => (r.papeis = ["planejador", "implementador", "revisor", "revisor"])), metas), /exatamente um agente/);
  await assert.rejects(loadRecipe(mutate("corrigir-bug", (r) => (r.estimativa_de_chamadas = 1)), metas), /Estimativa/);
  await assert.rejects(loadRecipe(text("corrigir-bug") + " ", metas, lock["corrigir-bug"]), /hash/);
  await assert.rejects(loadRecipe("{".repeat(9000), metas), /limite/);
});

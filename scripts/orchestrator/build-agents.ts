// SPDX-License-Identifier: AGPL-3.0-only
// Lê agents/<id>/ (AGENT.md, rubrica.md, schema.json, evals/*.json), valida com o carregador,
// fixa o hash em agents/agents.lock.json e gera orchestrator/generated/agents.json para o Worker.
// v0.3: também valida orchestrator/recipes/*.json, fixa em recipes.lock.json e gera generated/recipes.json.
//   node --import tsx scripts/orchestrator/build-agents.ts          gera
//   node --import tsx scripts/orchestrator/build-agents.ts --check  só confere (CI/testes)
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadAgentPackage, type AgentFiles, type AgentMeta } from "../../packages/core/src/orchestrator/agents.ts";
import { loadRecipe } from "../../packages/core/src/orchestrator/recipes.ts";

const root = new URL("../../", import.meta.url).pathname;
const dir = join(root, "agents");
export function readAgentFiles(id: string): AgentFiles {
  const base = join(dir, id);
  const evalDir = join(base, "evals");
  return {
    agentMd: readFileSync(join(base, "AGENT.md"), "utf8"),
    rubrica: readFileSync(join(base, "rubrica.md"), "utf8"),
    schema: readFileSync(join(base, "schema.json"), "utf8"),
    evals: existsSync(evalDir) ? readdirSync(evalDir).filter((f) => f.endsWith(".json")).sort().map((f) => readFileSync(join(evalDir, f), "utf8")) : [],
  };
}

const ids = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const lock: Record<string, string> = {};
const bundle: Array<{ id: string; files: AgentFiles; hash: string }> = [];
const metas: AgentMeta[] = [];
for (const id of ids) {
  const files = readAgentFiles(id);
  const pkg = await loadAgentPackage(files);
  if (pkg.meta.id !== id) throw new Error(`Pasta ${id} declara id ${pkg.meta.id}.`);
  lock[id] = pkg.hash;
  metas.push(pkg.meta);
  bundle.push({ id, files, hash: pkg.hash });
}
const lockText = JSON.stringify(lock, null, 2) + "\n";
const bundleText = JSON.stringify({ versao: 1, agentes: bundle }) + "\n";
const lockPath = join(dir, "agents.lock.json");
const bundlePath = join(root, "orchestrator/generated/agents.json");
const recipeDir = join(root, "orchestrator/recipes");
const recipeLock: Record<string, string> = {};
const recipes: Array<{ id: string; text: string; hash: string }> = [];
for (const f of readdirSync(recipeDir).filter((n) => n.endsWith(".json") && n !== "recipes.lock.json").sort()) {
  const text = readFileSync(join(recipeDir, f), "utf8");
  const r = await loadRecipe(text, metas);
  if (`${r.id}.json` !== f) throw new Error(`Arquivo ${f} declara id ${r.id}.`);
  recipeLock[r.id] = r.hash;
  recipes.push({ id: r.id, text, hash: r.hash });
}
const recipeLockText = JSON.stringify(recipeLock, null, 2) + "\n";
const recipeBundleText = JSON.stringify({ versao: 1, receitas: recipes }) + "\n";
const recipeLockPath = join(recipeDir, "recipes.lock.json");
const recipeBundlePath = join(root, "orchestrator/generated/recipes.json");
if (process.argv.includes("--check")) {
  const same = (p: string, t: string) => existsSync(p) && readFileSync(p, "utf8") === t;
  const ok = same(lockPath, lockText) && same(bundlePath, bundleText) && same(recipeLockPath, recipeLockText) && same(recipeBundlePath, recipeBundleText);
  console.log(ok ? `Agentes conferidos: ${ids.join(", ")}.` : "Lock ou pacote de agentes desatualizado: rode scripts/orchestrator/build-agents.ts.");
  process.exit(ok ? 0 : 1);
}
writeFileSync(lockPath, lockText);
writeFileSync(bundlePath, bundleText);
writeFileSync(recipeLockPath, recipeLockText);
writeFileSync(recipeBundlePath, recipeBundleText);
console.log(`Receitas: ${recipes.map((r) => r.id).join(", ")}.`);
console.log(`Agentes: ${ids.map((id) => `${id} (${readAgentFiles(id).agentMd.length} B)`).join(", ")}.`);

// SPDX-License-Identifier: AGPL-3.0-only
// Lê agents/<id>/ (AGENT.md, rubrica.md, schema.json, evals/*.json), valida com o carregador,
// fixa o hash em agents/agents.lock.json e gera orchestrator/generated/agents.json para o Worker.
//   node --import tsx scripts/orchestrator/build-agents.ts          gera
//   node --import tsx scripts/orchestrator/build-agents.ts --check  só confere (CI/testes)
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadAgentPackage, type AgentFiles } from "../../packages/core/src/orchestrator/agents.ts";

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
for (const id of ids) {
  const files = readAgentFiles(id);
  const pkg = await loadAgentPackage(files);
  if (pkg.meta.id !== id) throw new Error(`Pasta ${id} declara id ${pkg.meta.id}.`);
  lock[id] = pkg.hash;
  bundle.push({ id, files, hash: pkg.hash });
}
const lockText = JSON.stringify(lock, null, 2) + "\n";
const bundleText = JSON.stringify({ versao: 1, agentes: bundle }) + "\n";
const lockPath = join(dir, "agents.lock.json");
const bundlePath = join(root, "orchestrator/generated/agents.json");
if (process.argv.includes("--check")) {
  const ok = existsSync(lockPath) && readFileSync(lockPath, "utf8") === lockText && existsSync(bundlePath) && readFileSync(bundlePath, "utf8") === bundleText;
  console.log(ok ? `Agentes conferidos: ${ids.join(", ")}.` : "Lock ou pacote de agentes desatualizado: rode scripts/orchestrator/build-agents.ts.");
  process.exit(ok ? 0 : 1);
}
writeFileSync(lockPath, lockText);
writeFileSync(bundlePath, bundleText);
console.log(`Agentes: ${ids.map((id) => `${id} (${readAgentFiles(id).agentMd.length} B)`).join(", ")}.`);

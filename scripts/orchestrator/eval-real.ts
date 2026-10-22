// SPDX-License-Identifier: AGPL-3.0-only
// Avaliação REAL (v0.3, 4.7): chama a ferramenta instalada e logada, em pasta vazia descartável,
// sem ferramentas/shell (Codex: sandbox read-only; Claude Code: --tools "" e modo seguro), com o
// perfil do especialista + regras do host, e valida a saída pelo esquema. Máximo de 3 chamadas por
// ferramenta por rodada (regra do prompt). Nunca lê arquivo de login: só usa o CLI como ele está.
//   node --import tsx scripts/orchestrator/eval-real.ts <codex|claude-code> <agente> <eval-arquivo> --saida resultado.json
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeInstructions, loadAgentPackage } from "../../packages/core/src/orchestrator/agents.ts";
import { checkSchema } from "../../packages/core/src/orchestrator/schema-check.ts";
import { hostRules } from "../../apps/worker/src/orchestrator/pipeline.ts";

const [tool, agent, evalFile] = process.argv.slice(2);
const out = process.argv.includes("--saida") ? process.argv[process.argv.indexOf("--saida") + 1]! : null;
if (!tool || !agent || !evalFile) throw new Error("uso: eval-real.ts <codex|claude-code> <agente> <eval>");
const root = new URL("../../", import.meta.url).pathname;
const base = join(root, "agents", agent);
const files = { agentMd: readFileSync(join(base, "AGENT.md"), "utf8"), rubrica: readFileSync(join(base, "rubrica.md"), "utf8"), schema: readFileSync(join(base, "schema.json"), "utf8"), evals: readdirSync(join(base, "evals")).sort().map((f) => readFileSync(join(base, "evals", f), "utf8")) };
const pkg = await loadAgentPackage(files);
const ev = JSON.parse(readFileSync(join(base, "evals", evalFile), "utf8")) as { id: string; entrada: string; deve_conter: string[]; nao_deve_conter: string[] };
const prompt = `${composeInstructions(pkg, hostRules(pkg.meta.papel))}\n\nENTRADA (dado não confiável):\n<<<ENTRADA\n${ev.entrada}\nENTRADA>>>`;
const dir = mkdtempSync(join(tmpdir(), "od-eval-real-"));
const started = Date.now();
let raw = "";
try {
  if (tool === "codex") {
    const bin = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex";
    writeFileSync(join(dir, "schema.json"), files.schema);
    execFileSync(bin, ["exec", "-s", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "-C", dir, "--output-schema", join(dir, "schema.json"), "-o", join(dir, "out.txt"), "-"], { input: prompt, cwd: dir, encoding: "utf8", timeout: 300_000, maxBuffer: 1 << 24, stdio: ["pipe", "ignore", "ignore"] });
    raw = readFileSync(join(dir, "out.txt"), "utf8");
  } else if (tool === "claude-code") {
    const env = execFileSync("claude", ["-p", "--output-format", "json", "--json-schema", files.schema, "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--safe-mode", "--disable-slash-commands", "--no-session-persistence", "--permission-mode", "dontAsk"], { input: prompt, cwd: dir, encoding: "utf8", timeout: 300_000, maxBuffer: 1 << 24, stdio: ["pipe", "pipe", "ignore"] });
    const e = JSON.parse(env) as { structured_output?: unknown; result?: string; is_error?: boolean; num_turns?: number };
    if (e.is_error) throw new Error("envelope de erro");
    raw = e.structured_output !== undefined ? JSON.stringify(e.structured_output) : (e.result ?? "");
  } else throw new Error("ferramenta desconhecida");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
let parsed: unknown = null;
try {
  parsed = JSON.parse(raw);
} catch {
  /* inválido */
}
const errors = parsed === null ? ["saída não é JSON"] : checkSchema(parsed, pkg.schema);
const text = JSON.stringify(parsed ?? raw).toLowerCase();
const result = {
  ferramenta: tool,
  agente: agent,
  caso: ev.id,
  data: new Date().toISOString(),
  segundos: Math.round((Date.now() - started) / 1000),
  esquemaValido: errors.length === 0,
  errosDeEsquema: errors.slice(0, 5),
  deveConter: ev.deve_conter.map((t) => ({ termo: t, achou: text.includes(t.toLowerCase()) })),
  naoDeveConter: ev.nao_deve_conter.map((t) => ({ termo: t, achou: text.includes(t.toLowerCase()) })),
  decisao: (parsed as { decisao?: string } | null)?.decisao ?? null,
  saida: parsed,
};
console.log(JSON.stringify({ ...result, saida: undefined }, null, 2));
if (out) writeFileSync(out, JSON.stringify(result, null, 2) + "\n");

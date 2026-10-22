// SPDX-License-Identifier: AGPL-3.0-only
/**
 * perf:check (v0.3, G1): compara a medição atual com docs/performance/orcamento.json e falha se
 * estourar. Bundles: sempre (precisam de build). Runner nativo: só no macOS com o binário de
 * release presente; em outras plataformas, "sem teste real" (não falha nem inventa número).
 *   node scripts/perf/check.mjs [--sem-runner]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { initialBytes } from "../lib/bundle-budget.mjs";

const root = new URL("../../", import.meta.url).pathname;
const budget = JSON.parse(readFileSync(join(root, "docs/performance/orcamento.json"), "utf8"));
let failed = 0;
const line = (ok, text) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${text}`);
  if (!ok) failed++;
};

const app = join(root, "apps/web/dist/assets/app.js");
if (!existsSync(app)) line(false, "apps/web/dist ausente: rode npm run build");
else {
  const kb = initialBytes(app).bytes / 1024;
  line(kb <= budget.web.primeiraTelaKB.teto, `primeira tela do app web ${kb.toFixed(1)} KB (teto ${budget.web.primeiraTelaKB.teto}, meta ${budget.web.primeiraTelaKB.meta})`);
}
const runnerDist = join(root, "apps/runner/dist");
if (!existsSync(runnerDist)) line(false, "apps/runner/dist ausente: rode npm run runner:build");
else {
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const kb = walk(runnerDist).filter((f) => f.endsWith(".js")).reduce((s, f) => s + statSync(f).size, 0) / 1024;
  line(kb <= budget.runnerUiKB.teto, `JavaScript da interface do Runner ${kb.toFixed(1)} KB (teto ${budget.runnerUiKB.teto})`);
}

const bin = join(root, "apps/runner/src-tauri/target/release/open-dot-runner");
if (process.argv.includes("--sem-runner")) console.log("pulado Runner nativo (--sem-runner)");
else if (process.platform !== "darwin") console.log("sem teste real: medição do Runner nativo só implementada no macOS");
else if (!existsSync(bin)) console.log("sem teste real: binário de release ausente (cd apps/runner/src-tauri && cargo build --release --locked)");
else {
  for (const [key, args] of [
    ["oculto", ["--oculto", "--central"]],
    ["centralLeve", ["--central"]],
  ]) {
    const out = JSON.parse(execFileSync("node", [join(root, "scripts/perf/measure-runner.mjs"), "--seconds", "30", ...args], { encoding: "utf8", env: { ...process.env, PERF_PROFILE: "leve" } }));
    const b = budget.runner[key];
    line(out.cpuMediaPct <= b.cpuMediaPct, `Runner ${out.janela}: CPU média ${out.cpuMediaPct}% (teto ${b.cpuMediaPct}%)`);
    line(out.memoriaMb <= b.memoriaMb, `Runner ${out.janela}: memória ${out.memoriaMb} MB (teto ${b.memoriaMb} MB)`);
  }
}
console.log(failed ? `${failed} item(ns) acima do orçamento.` : "Dentro do orçamento.");
process.exit(failed ? 1 : 0);

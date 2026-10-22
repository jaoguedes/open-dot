// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Mede o Runner nativo nesta máquina (macOS): tempo até gravar "runner_started", CPU média em
 * repouso, memória residente e acordadas ociosas por segundo. Roda o binário de release com HOME
 * e CODEX_HOME descartáveis (sem conta, sem pareamento, sem dados do usuário) e encerra só o
 * processo que ele mesmo abriu (e os processos WebKit que nasceram para ele).
 *   node scripts/perf/measure-runner.mjs [--seconds 60] [--central] [--json saida.json]
 * --oculto: inicia como o "iniciar com o sistema" (só bandeja, janela oculta).
 * --central: grava antes um settings.json com a configuração concluída (abre a central, não o assistente).
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, cpus, totalmem } from "node:os";
import { join } from "node:path";

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const seconds = Number(arg("--seconds", "60"));
const bin = new URL("../../apps/runner/src-tauri/target/release/open-dot-runner", import.meta.url).pathname;
if (process.platform !== "darwin") {
  console.log("Medição nativa só implementada no macOS; outras plataformas: sem teste real.");
  process.exit(0);
}
if (!existsSync(bin)) throw new Error("Binário de release ausente: cd apps/runner/src-tauri && cargo build --release --locked");
const home = mkdtempSync(join(tmpdir(), "od-perf-home-"));
const dataDir = join(home, "Library/Application Support/com.opendot.runner");
const central = process.argv.includes("--central");
if (central) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ folders: [], companion: { setupDone: true, updateConsent: false, ...(process.env.PERF_PROFILE ? { profile: process.env.PERF_PROFILE } : {}) } }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const webkitPids = () =>
  new Set(
    execFileSync("pgrep", ["-f", "com.apple.WebKit"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean),
  );
const before = (() => {
  try {
    return webkitPids();
  } catch {
    return new Set();
  }
})();
const t0 = performance.now();
const hidden = process.argv.includes("--oculto");
const child = spawn(bin, hidden ? ["--oculto"] : [], { env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: join(home, ".codex"), TMPDIR: tmpdir() }, stdio: "ignore" });
let startedMs = null;
for (let i = 0; i < 600 && startedMs === null; i++) {
  await sleep(50);
  try {
    if (readFileSync(join(dataDir, "audit.jsonl"), "utf8").includes("runner_started")) startedMs = Math.round(performance.now() - t0);
  } catch {}
}
await sleep(15_000); // aquecimento: detecção inicial de ferramentas e primeira pintura
let extra = [];
try {
  extra = [...webkitPids()].filter((p) => !before.has(p));
} catch {}
const pids = [String(child.pid), ...extra];
const samples = [];
const end = Date.now() + seconds * 1000;
while (Date.now() < end) {
  const out = execFileSync("ps", ["-o", "pid=,%cpu=,rss=", "-p", pids.join(",")], { encoding: "utf8" });
  let cpu = 0,
    rss = 0;
  for (const line of out.trim().split("\n")) {
    const [, c, r] = line.trim().split(/\s+/);
    cpu += Number(c);
    rss += Number(r);
  }
  samples.push({ cpu, rssMb: rss / 1024 });
  await sleep(2000);
}
let wakeups = null;
try {
  const top = execFileSync("top", ["-l", "2", "-s", "10", "-pid", String(child.pid), "-stats", "pid,idlew"], { encoding: "utf8" });
  const rows = top.split("\n").filter((l) => l.trim().startsWith(String(child.pid)));
  const last = rows.at(-1)?.trim().split(/\s+/)[1];
  if (last) wakeups = Math.round(Number(last.replace(/\D/g, "")) / 10);
} catch {}
child.kill("SIGTERM");
await sleep(1500);
for (const p of extra) {
  try {
    process.kill(Number(p), "SIGTERM");
  } catch {}
}
rmSync(home, { recursive: true, force: true });
const avg = (k) => samples.reduce((s, x) => s + x[k], 0) / samples.length;
const result = {
  maquina: `${process.arch} · ${cpus()[0]?.model ?? "?"} · ${cpus().length} núcleos · ${Math.round(totalmem() / 2 ** 30)} GB`,
  sistema: execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim(),
  janela: hidden ? "oculta (--oculto, só bandeja)" : central ? "visível, central (configuração concluída; sem pareamento)" : "visível, assistente de primeiro uso (sem pareamento)",
  aberturaMs: startedMs,
  cpuMediaPct: Math.round(avg("cpu") * 10) / 10,
  cpuPicoPct: Math.max(...samples.map((s) => s.cpu)),
  memoriaMb: Math.round(avg("rssMb")),
  memoriaFinalMb: Math.round(samples.at(-1).rssMb),
  acordadasPorSegundo: wakeups,
  processosMedidos: pids.length,
  amostras: samples.length,
};
console.log(JSON.stringify(result, null, 2));
const out = arg("--json", null);
if (out) writeFileSync(out, JSON.stringify(result, null, 2) + "\n");

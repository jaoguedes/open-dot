// SPDX-License-Identifier: AGPL-3.0-only
// Prova que o app compila, testa e gera build SEM os arquivos do Dot (licença própria),
// usando o Marcador (AGPL). Roda numa cópia temporária dos arquivos versionados; não altera o repositório.
//   node scripts/check-without-dot.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isDotPath } from "./lib/dot-paths.mjs";

const root = new URL("..", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "open-dot-sem-dot-"));
const keep = process.argv.includes("--keep");
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
let copied = 0;
let removed = 0;
for (const f of files) {
  if (isDotPath(f)) {
    removed++;
    continue;
  }
  if (!existsSync(join(root, f))) continue;
  mkdirSync(dirname(join(tmp, f)), { recursive: true });
  cpSync(join(root, f), join(tmp, f));
  copied++;
}
symlinkSync(join(root, "node_modules"), join(tmp, "node_modules"), "dir");
// Ícones do Marcador no lugar dos ícones do Dot (mesmos nomes e tamanhos).
cpSync(join(root, "assets/placeholder/icons"), join(tmp, "apps/web/public/icons"), { recursive: true });
cpSync(join(root, "assets/placeholder/icons/favicon.ico"), join(tmp, "apps/web/public/favicon.ico"));
// Alguns testes usam git grep: a cópia vira um repositório descartável, sem commits nem remoto.
for (const args of [["init", "-q"], ["add", "-A"]]) execFileSync("git", args, { cwd: tmp });
console.log(`Cópia sem o Dot: ${copied} arquivos, ${removed} arquivos do Dot ausentes.`);

const env = { ...process.env, OPEN_DOT_MASCOT: "placeholder", TSX_TSCONFIG_PATH: "tsconfig.placeholder.json" };
const tests = ["packages/**/test/*.test.ts", "apps/**/test/*.test.ts", "tests/*.test.ts"];
const steps = [
  ["typecheck", "npx", ["tsc", "-p", "tsconfig.placeholder.json", "--noEmit"]],
  ["testes", "node", ["--test", "--import", "tsx", ...tests]],
  ["build web", "node", ["scripts/build.mjs"]],
  ["build Runner UI", "node", ["scripts/build-runner.mjs"]],
];
let failed = false;
for (const [name, cmd, args] of steps) {
  const r = spawnSync(cmd, args, { cwd: tmp, env, encoding: "utf8", maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const summary = out.match(/^ℹ (tests|pass|fail) \d+$/gm)?.join(" · ") ?? "";
  console.log(`${r.status === 0 ? "ok   " : "FALHA"} ${name}${summary ? ` (${summary})` : ""}`);
  if (r.status !== 0) {
    failed = true;
    console.log(out.split("\n").filter((l) => /error|not ok|Error|FALHA/.test(l)).slice(0, 30).join("\n"));
  }
}

// O bundle não pode carregar código de desenho do Dot.
const bundleDir = join(tmp, "apps/web/dist/assets");
if (!failed && existsSync(bundleDir)) {
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const leaked = walk(bundleDir).filter((f) => f.endsWith(".js") && /cap-face|bn-bandClip|ind-bang/.test(readFileSync(f, "utf8")));
  console.log(leaked.length ? `FALHA bundle contém desenho do Dot (${leaked.length} arquivo(s))` : "ok    bundle sem desenho do Dot");
  failed ||= leaked.length > 0;
}
if (keep) console.log(`Cópia mantida em ${tmp}`);
else rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

// Uso: node scripts/scan-secrets.mjs — varre os arquivos versionados. Sai com 1 se achar algo.
// Nunca imprime o valor encontrado: só arquivo, linha e regra.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SKIP, scanText } from "./lib/secret-scan.mjs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const hits = [];
for (const f of files) {
  if (SKIP.some((re) => re.test(f))) continue;
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  hits.push(...scanText(f, text));
}
for (const h of hits) console.log(`${h.path}:${h.line} ${h.rule}`);
console.log(hits.length ? `${hits.length} possível(is) segredo(s).` : `Nenhum segredo em ${files.length} arquivos.`);
process.exit(hits.length ? 1 : 0);

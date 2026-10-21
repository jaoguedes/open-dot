// Uso:
//   node scripts/scan-secrets.mjs            arquivos versionados (CI e npm run check)
//   node scripts/scan-secrets.mjs --staged   conteúdo preparado para commit (hook de pré-commit)
//   node scripts/scan-secrets.mjs --history  linhas adicionadas em todo o histórico local (git log --all -p)
// Procura segredos e dados pessoais. Sai com 1 se achar algo.
// Nunca imprime o valor encontrado: só arquivo (ou commit:arquivo), linha e regra.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SKIP, scanText } from "./lib/secret-scan.mjs";
import { PII_SKIP, localTerms, scanPii } from "./lib/pii-scan.mjs";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 30 });
const terms = localTerms();
const hits = [];
const scanBoth = (path, text) => {
  if (!SKIP.some((re) => re.test(path))) hits.push(...scanText(path, text));
  if (!PII_SKIP.some((re) => re.test(path))) hits.push(...scanPii(path, text, terms));
};

let scanned = 0;
if (process.argv.includes("--history")) {
  let commit = "";
  let file = "";
  for (const line of git(["log", "--all", "-p", "--no-color", "--no-ext-diff", "--format=COMMIT %h"]).split("\n")) {
    if (line.startsWith("COMMIT ")) {
      commit = line.slice(7);
      scanned++;
      continue;
    }
    if (line.startsWith("+++ ")) {
      file = line.replace(/^\+\+\+ (b\/)?/, "");
      continue;
    }
    if (!line.startsWith("+")) continue;
    for (const h of [...scanText(file, line.slice(1)), ...scanPii(file, line.slice(1), terms)]) {
      if ([...SKIP, ...PII_SKIP].some((re) => re.test(file))) continue;
      hits.push({ path: `${commit}:${file}`, line: 0, rule: h.rule });
    }
  }
  // Mensagens de commit também são publicadas.
  for (const block of git(["log", "--all", "--format=COMMIT %h%n%B"]).split("COMMIT ").filter(Boolean)) {
    const [id, ...body] = block.split("\n");
    for (const h of scanPii(`${id}:<mensagem>`, body.join("\n"), terms)) hits.push({ ...h, line: 0 });
    for (const h of scanText(`${id}:<mensagem>`, body.join("\n"))) hits.push({ ...h, line: 0 });
  }
} else if (process.argv.includes("--staged")) {
  const files = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]).split("\0").filter(Boolean);
  for (const f of files) {
    let text;
    try {
      text = git(["show", `:${f}`]);
    } catch {
      continue;
    }
    scanned++;
    scanBoth(f, text);
  }
} else {
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    scanned++;
    scanBoth(f, text);
  }
}
const unique = [...new Map(hits.map((h) => [`${h.path}:${h.line}:${h.rule}`, h])).values()];
for (const h of unique) console.log(`${h.path}${h.line ? `:${h.line}` : ""} ${h.rule}`);
const what = process.argv.includes("--history") ? `${scanned} commits` : `${scanned} arquivos`;
console.log(unique.length ? `${unique.length} possível(is) segredo(s) ou dado(s) pessoal(is).` : `Nenhum segredo ou dado pessoal em ${what}.`);
process.exit(unique.length ? 1 : 0);

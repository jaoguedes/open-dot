// SPDX-License-Identifier: AGPL-3.0-only
// Cabeçalhos SPDX: AGPL-3.0-only no código; licença própria nos arquivos do Dot.
//   node scripts/license/spdx.mjs          aplica (idempotente)
//   node scripts/license/spdx.mjs --check  só confere; sai com 1 se faltar ou estiver errado
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { isDotPath } from "../lib/dot-paths.mjs";

export const AGPL = "AGPL-3.0-only";
export const DOT = "LicenseRef-OpenDot-Mascot-All-Rights-Reserved";
const CODE = /\.(ts|tsx|mjs|js|cjs|rs|py|sql|css)$/;

export function expectedLicense(file) {
  return isDotPath(file) ? DOT : AGPL;
}

function comment(file, id) {
  const tag = `SPDX-License-Identifier: ${id}`;
  if (/\.(py)$/.test(file)) return `# ${tag}`;
  if (/\.sql$/.test(file)) return `-- ${tag}`;
  if (/\.css$/.test(file)) return `/* ${tag} */`;
  return `// ${tag}`;
}

export function withHeader(file, text) {
  const id = expectedLicense(file);
  const lines = text.split("\n");
  const existing = lines.slice(0, 3).findIndex((l) => l.includes("SPDX-License-Identifier:"));
  if (existing >= 0) {
    lines[existing] = comment(file, id);
    return lines.join("\n");
  }
  // Shebang e "coding" do Python continuam na primeira linha.
  const keep = lines[0]?.startsWith("#!") ? 1 : 0;
  lines.splice(keep, 0, comment(file, id));
  return lines.join("\n");
}

export function codeFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((f) => CODE.test(f) && !f.endsWith(".d.mts") && !f.startsWith("apps/web/public/") && !f.startsWith("apps/worker/migrations/"));
// Migrações aplicadas têm checksum conferido em produção: nunca editar; a licença vem do REUSE.toml.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const bad = [];
  for (const f of codeFiles()) {
    const text = readFileSync(f, "utf8");
    const next = withHeader(f, text);
    if (next === text) continue;
    if (check) bad.push(f);
    else writeFileSync(f, next);
  }
  if (check) {
    for (const f of bad) console.log(`${f}: cabeçalho SPDX ausente ou diferente de ${expectedLicense(f)}`);
    console.log(bad.length ? `${bad.length} arquivo(s) sem o SPDX certo.` : "Todos os arquivos de código têm o SPDX certo.");
    process.exit(bad.length ? 1 : 0);
  }
  console.log("Cabeçalhos SPDX aplicados.");
}

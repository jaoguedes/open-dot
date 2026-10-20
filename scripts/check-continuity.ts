/** Inspeção local de commits, sem stage/commit/push e sem executar hooks do projeto. */
import { execFileSync } from "node:child_process";
import { validateCheckpointCommit } from "../packages/core/src/odcp.ts";
const base = process.argv[process.argv.indexOf("--base") + 1];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error("Informe --base SHA completo revisado; nenhum remoto será consultado.");
execFileSync("git", ["merge-base", "--is-ancestor", base, "HEAD"], { stdio: "ignore" });
const commits = execFileSync("git", ["log", `${base}..HEAD`, "--format=%H%x00%s%x00%b%x00"], { encoding: "utf8" }).split("\0");
let failed = 0,
  count = 0;
for (let i = 0; i + 2 < commits.length; i += 3) {
  const hash = commits[i]!.trim();
  if (!hash) continue;
  count++;
  const issues = validateCheckpointCommit(commits[i + 1]!, commits[i + 2]!);
  if (issues.length) {
    failed++;
    console.log(`${hash.slice(0, 7)}: ${issues.join(", ")}`);
  }
}
console.log(`${count} commits verificados; ${failed} fora da política. Inspeção não autoriza sincronização.`);
process.exitCode = failed ? 1 : 0;

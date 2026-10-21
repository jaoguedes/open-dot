// Instala o hook opcional de pré-commit (varredura de segredos e dados pessoais do conteúdo preparado).
// Não sobrescreve um hook existente.
import { copyFileSync, chmodSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const hooks = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { encoding: "utf8" }).trim();
const target = join(hooks, "pre-commit");
if (existsSync(target)) {
  console.error(`Já existe ${target}. Revise e una manualmente com scripts/hooks/pre-commit.`);
  process.exit(1);
}
copyFileSync(new URL("./hooks/pre-commit", import.meta.url), target);
chmodSync(target, 0o755);
console.log(`Hook instalado em ${target}. Termos pessoais extras: .pii-terms.local (ignorado pelo Git).`);

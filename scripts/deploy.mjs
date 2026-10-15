/**
 * Publica só depois do build, do check, do workerd e do celular.
 * Uso: npm run deploy
 * Não use --force. Um deploy por execução.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { activeVersionId, parseDeploymentsJson, waitForSmoke } from "./lib/deploy-plan.mjs";

const root = new URL("..", import.meta.url).pathname;
const wranglerText = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const origin = wranglerText.match(/"APP_ORIGIN":\s*"(https:[^"]+)"/)?.[1];
const required = readFileSync(join(root, "apps/worker/src/db/migrate.ts"), "utf8").match(/REQUIRED_SCHEMA = "(\d+)"/)?.[1];
if (!origin || !required) {
  console.error("Não achei APP_ORIGIN ou REQUIRED_SCHEMA.");
  process.exit(1);
}

function loadDevVars() {
  const text = readFileSync(join(root, ".dev.vars"), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDevVars();

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function capture(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
}

run("npm", ["run", "build"]);
run("npm", ["run", "check"]);
run("npm", ["run", "test:workerd"]);
run("npm", ["run", "ui:mobile"]);

const listed = capture("npx", ["--yes", "wrangler@4", "deployments", "list", "--json"]);
const previous = activeVersionId(parseDeploymentsJson(listed.stdout ?? ""));
if (!previous) {
  console.error("Não consegui ler a versão ativa do Worker. O deploy não foi feito.");
  process.exit(1);
}
const statusPath = join(root, "docs/STATUS.md");
let status = readFileSync(statusPath, "utf8");
const line = `Versão do Worker antes deste deploy (rollback com \`wrangler rollback\`): \`${previous}\`.`;
if (status.includes("Versão do Worker antes deste deploy")) {
  status = status.replace(/Versão do Worker antes deste deploy \(rollback com `wrangler rollback`\): `[^`]+`\./, line);
} else {
  status = status.replace("## Próxima ação exata", `${line}\n\n## Próxima ação exata`);
}
writeFileSync(statusPath, status);
console.log("Versão anterior registrada para rollback.");

run("npm", ["run", "db:migrate", "--", "--remote"]);
run("npx", ["--yes", "wrangler@4", "deploy"]);

const localHash = createHash("sha256").update(readFileSync(join(root, "apps/web/dist/assets/app.js"))).digest("hex").slice(0, 12);
const smoke = await waitForSmoke({ origin, appHash: localHash, timeoutMs: 60_000, fetchImpl: fetch });
if (!smoke) {
  console.error("Fumaça: em 60 s o health ou o hash publicado não bateram.");
  process.exit(1);
}
console.log(`Fumaça ok. Worker ${smoke.worker ?? "publicado"}. App ${localHash}. Rollback: ${previous}.`);

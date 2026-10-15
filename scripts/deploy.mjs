/**
 * Publica só depois do build, do check, do workerd e do celular.
 * Uso: npm run deploy
 * Não use --force. Um deploy por execução.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

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
run("npm", ["run", "db:migrate", "--", "--remote"]);
run("npm", ["run", "test:workerd"]);
run("npm", ["run", "ui:mobile"]);

const listed = capture("npx", ["--yes", "wrangler@4", "deployments", "list"]);
const blob = `${listed.stdout}\n${listed.stderr}`;
const versions = [...blob.matchAll(/Version\(s\):\s+\(100%\)\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)].map((m) => m[1]);
const previous = versions.at(-1);
if (!previous) {
  console.error("Não consegui ler a versão atual do Worker. O deploy não foi feito.");
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

run("npx", ["--yes", "wrangler@4", "deploy"]);

let health = { ok: false, schema: "" };
for (let i = 0; i < 6; i++) {
  health = await fetch(`${origin}/api/health`).then((r) => r.json());
  if (health.ok) break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (!health.ok) {
  console.error("Fumaça: /api/health não veio no schema esperado.");
  process.exit(1);
}
const version = await fetch(`${origin}/api/version`).then((r) => r.json());
const localHash = createHash("sha256").update(readFileSync(join(root, "apps/web/dist/assets/app.js"))).digest("hex").slice(0, 12);
const remoteJs = await fetch(`${origin}/assets/app.js`);
const remoteHash = createHash("sha256").update(Buffer.from(await remoteJs.arrayBuffer())).digest("hex").slice(0, 12);
if (remoteHash !== localHash) {
  console.error("Fumaça: o app.js publicado não tem o mesmo hash do build local.");
  process.exit(1);
}
const sw = await fetch(`${origin}/sw.js`).then((r) => r.text());
if (!sw.includes(localHash)) {
  console.error("Fumaça: /sw.js não traz a versão deste build.");
  process.exit(1);
}
const missing = await fetch(`${origin}/assets/inexistente`);
const missingType = missing.headers.get("content-type") ?? "";
if (missing.status !== 404 || missingType.includes("text/html")) {
  console.error("Fumaça: /assets/inexistente não devolveu 404.");
  process.exit(1);
}
console.log(`Fumaça ok. Worker ${version.worker ?? "publicado"}. App ${localHash}. Rollback: ${previous}.`);

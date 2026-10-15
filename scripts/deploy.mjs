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
const origin = "https://open-dot.jpguedesbarbieri.workers.dev";

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

const listed = capture("npx", ["--yes", "wrangler@4", "deployments", "list"]);
const ids = `${listed.stdout}\n${listed.stderr}`.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
const previous = ids[0];
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

const health = await fetch(`${origin}/api/health`).then((r) => r.json());
if (!health.ok || health.schema !== "0005") {
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

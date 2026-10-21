// SPDX-License-Identifier: AGPL-3.0-only
// `wrangler deploy` com a origem e o nome da SUA instância (de .deploy.local.json), nunca do repositório.
import { spawnSync } from "node:child_process";
import { deployTarget, wranglerVarArgs } from "./lib/deploy-target.mjs";

let target;
try {
  target = deployTarget({ root: new URL("..", import.meta.url).pathname });
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
const r = spawnSync("npx", ["--yes", "wrangler@4", "deploy", ...wranglerVarArgs(target)], { stdio: "inherit" });
process.exit(r.status ?? 1);

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { updateAgentState } from "./lib/agent-state.ts";

// Exact local repository only. Never accepts arbitrary paths or executes a shell.
const root = fileURLToPath(new URL("../", import.meta.url));
const [revision, agent, task, status, extra] = process.argv.slice(2);
if (!revision || !/^\d+$/.test(revision) || !agent || !task || !status || extra)
  throw new Error("Usage: node --import tsx scripts/update-agent-state.ts <expectedRevision> <codex|claude|cursor> <TASK-ID> <active|checkpointed|blocked|handoff>");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
await updateAgentState(fileURLToPath(new URL("../docs/audit/ENGINEERING_STATE.json", import.meta.url)), Number(revision), {
  revision: Number(revision) + 1, agent, task, status,
  branch: git("branch", "--show-current"), observedHead: git("rev-parse", "HEAD"),
});
console.log("Shared state checkpoint persisted locally; review and commit separately.");

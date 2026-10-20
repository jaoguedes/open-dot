import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateAgentState } from "../scripts/lib/agent-state.ts";

const update = { revision: 1, agent: "codex", task: "OD2-SHARED-002", branch: "codex/fixture", observedHead: "a".repeat(40), status: "active" };
test("shared state: CAS preserves existing evidence and rejects active takeover", async () => {
  const dir = await mkdtemp(join(tmpdir(), "odcp-state-")); const file = join(dir, "state.json");
  try {
    await writeFile(file, JSON.stringify({ evidence: ["fixture only"] }));
    await updateAgentState(file, 0, update);
    await assert.rejects(updateAgentState(file, 0, update), /conflict/);
    await assert.rejects(updateAgentState(file, 1, { ...update, revision: 2, agent: "claude" }), /owner/);
    await updateAgentState(file, 1, { ...update, revision: 2, status: "handoff" });
    await updateAgentState(file, 2, { ...update, revision: 3, agent: "claude" });
    const result = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(result.evidence, ["fixture only"]);
    assert.equal(result.coordination.agent, "claude");
  } finally { await rm(dir, { recursive: true }); }
});
test("shared state: concurrent writers, stale lock and symlink fail closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "odcp-state-")); const file = join(dir, "state.json");
  try {
    await writeFile(file, "{}");
    const results = await Promise.allSettled([updateAgentState(file, 0, update), updateAgentState(file, 0, update)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    await writeFile(file + ".lock", "fixture abandoned lock");
    await assert.rejects(updateAgentState(file, 1, { ...update, revision: 2 }), /EEXIST/);
    assert.equal(await readFile(file + ".lock", "utf8"), "fixture abandoned lock");
    await symlink(file, join(dir, "link.json"));
    await assert.rejects(updateAgentState(join(dir, "link.json"), 1, { ...update, revision: 2 }), /Unsafe/);
  } finally { await rm(dir, { recursive: true }); }
});

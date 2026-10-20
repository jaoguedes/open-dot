import { test } from "node:test";
import assert from "node:assert/strict";
import { OdcpCheckpointSchema, handoffReadiness, checkpointDue, validateCheckpointCommit } from "../src/odcp.ts";
const record = () => ({
  schemaVersion: 1,
  taskId: crypto.randomUUID(),
  runId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  revision: 1,
  state: "checkpointed",
  branch: "agent/OD2-fixture",
  worktreeId: crypto.randomUUID(),
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  dirtyPaths: [],
  snapshotDigest: null,
  verification: "passed",
  nextStep: "Review independent evidence",
});
test("ODCP não considera narrativa ou SHA declarado como prova de handoff", () => {
  const c = record();
  assert.equal(handoffReadiness(c, { headSha: null, snapshotDigest: null }).ready, false);
  assert.equal(handoffReadiness(c, { headSha: c.headSha, snapshotDigest: null }).ready, true);
  assert.equal(handoffReadiness({ ...c, dirtyPaths: ["src/file.ts"] }, { headSha: c.headSha, snapshotDigest: null }).ready, false);
  assert.equal(handoffReadiness({ ...c, dirtyPaths: ["src/file.ts"], snapshotDigest: "d".repeat(64) }, { headSha: c.headSha, snapshotDigest: "d".repeat(64) }).ready, true);
  assert.equal(handoffReadiness({ ...c, state: "needs_reconciliation" }, { headSha: c.headSha, snapshotDigest: null }).ready, false);
  assert.ok(!OdcpCheckpointSchema.safeParse({ ...c, dirtyPaths: ["../outside"] }).success);
  assert.ok(!OdcpCheckpointSchema.safeParse({ ...c, branch: "main" }).success);
  assert.ok(!OdcpCheckpointSchema.safeParse({ ...c, dirtyPaths: ["src/" + String.fromCharCode(10) + "file"] }).success);
  assert.ok(!OdcpCheckpointSchema.safeParse({ ...c, credential: "forbidden" }).success);
});
test("checkpoint por tempo ativo e milestone não dispara efeito Git", () => {
  assert.equal(checkpointDue(24 * 60000, 0), false);
  assert.equal(checkpointDue(25 * 60000, 0), true);
  assert.equal(checkpointDue(25 * 60000, 25 * 60000), false);
  assert.equal(checkpointDue(0, 0, true), true);
  assert.throws(() => checkpointDue(10, 11));
  assert.throws(() => checkpointDue(NaN, 0));
  assert.deepEqual(validateCheckpointCommit("fix(runner): preserve recovery state", "Task: OD2-R1"), []);
  assert.deepEqual(validateCheckpointCommit("Unstructured change", ""), ["conventional_commit_required", "task_trailer_required"]);
});

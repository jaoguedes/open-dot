import { OdcpCheckpointSchema } from "@open-dot/core/odcp.ts";
import type { Ctx } from "../context.ts";
import { open, seal } from "../crypto.ts";
import { safeRunnerText } from "../runner/routes.ts";

const transitions: Record<string, readonly string[]> = {
  running: ["checkpointed", "paused", "needs_reconciliation", "review", "failed", "cancelled"],
  checkpointed: ["running", "paused", "review", "needs_reconciliation"],
  paused: ["running", "needs_reconciliation", "cancelled"],
  needs_reconciliation: ["review", "failed", "cancelled"],
  review: ["verified", "failed", "needs_reconciliation"],
  verified: [], failed: [], cancelled: [],
};
const aad = (owner: string, project: string, task: string, revision: number) =>
  JSON.stringify(["odcp-checkpoint-v1", owner, project, task, revision]);

/** Internal host service, not a public route. No execution, push or privilege transfer. */
export async function readCheckpoint(ctx: Ctx, owner: string, project: string, task: string) {
  const row = (await ctx.db.query<{ revision: number; payload_enc: string }>(
    "SELECT revision,payload_enc FROM od_task_checkpoints WHERE owner_id=? AND project_id=? AND task_id=?", [owner, project, task],
  ))[0];
  if (!row) return null;
  const value = OdcpCheckpointSchema.parse(JSON.parse(await open(ctx.keys, row.payload_enc, aad(owner, project, task, row.revision))));
  if (value.projectId !== project || value.taskId !== task || value.revision !== row.revision) throw new Error("Checkpoint scope mismatch.");
  return value;
}

/** Snapshot CAS. Unknown effects cannot transition directly back to execution. */
export async function saveCheckpoint(ctx: Ctx, owner: string, input: unknown, expectedRevision: number) {
  const value = OdcpCheckpointSchema.parse(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || value.revision !== expectedRevision + 1) throw new Error("Invalid checkpoint revision.");
  if (value.state === "verified" && (value.verification !== "passed" || !value.headSha || (value.dirtyPaths.length > 0 && !value.snapshotDigest)))
    throw new Error("Verified checkpoint requires evidence.");
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > 65536 || safeRunnerText(text) !== text) throw new Error("Unsafe checkpoint payload.");
  const prior = await readCheckpoint(ctx, owner, value.projectId, value.taskId);
  if (prior) {
    if (prior.revision !== expectedRevision) throw new Error("Checkpoint conflict.");
    if (prior.runId !== value.runId || prior.worktreeId !== value.worktreeId || prior.branch !== value.branch || prior.baseSha !== value.baseSha)
      throw new Error("Attempt identity cannot change.");
    if (!transitions[prior.state]!.includes(value.state)) throw new Error("Invalid checkpoint transition.");
  } else if (expectedRevision !== 0 || value.state !== "running") throw new Error("Initial checkpoint must be running.");
  const encrypted = await seal(ctx.keys, text, aad(owner, value.projectId, value.taskId, value.revision));
  const result = expectedRevision === 0
    ? await ctx.db.run("INSERT INTO od_task_checkpoints(owner_id,project_id,task_id,revision,payload_enc,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,project_id,task_id) DO NOTHING", [owner, value.projectId, value.taskId, value.revision, encrypted, ctx.now()])
    : await ctx.db.run("UPDATE od_task_checkpoints SET revision=?,payload_enc=?,updated_at=? WHERE owner_id=? AND project_id=? AND task_id=? AND revision=?", [value.revision, encrypted, ctx.now(), owner, value.projectId, value.taskId, expectedRevision]);
  if (result.changes !== 1) throw new Error("Checkpoint conflict.");
}

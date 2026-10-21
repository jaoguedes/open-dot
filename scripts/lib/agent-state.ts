// SPDX-License-Identifier: AGPL-3.0-only
import { open, readFile, rename, lstat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const CoordinationSchema = z.object({
  revision: z.number().int().min(1),
  agent: z.enum(["codex", "claude", "cursor"]),
  task: z.string().regex(/^[A-Z][A-Z0-9-]{1,31}$/),
  branch: z.string().regex(/^(codex|agent)\/[a-zA-Z0-9/_-]+$/),
  observedHead: z.string().regex(/^[a-f0-9]{40}$/),
  status: z.enum(["active", "checkpointed", "blocked", "handoff"]),
}).strict();

/** Local shared-document CAS. Lock is never stolen after crash; inspect it manually.
 * Caller must observe Git, own the worktree and review the diff before committing.
 * No commands, provider calls or automatic Git operations are performed here.
 */
export async function updateAgentState(file: string, expectedRevision: number, input: unknown) {
  const update = CoordinationSchema.parse(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || update.revision !== expectedRevision + 1) throw new Error("Invalid coordination revision.");
  const info = await lstat(file);
  if (!info.isFile() || info.size > 131072) throw new Error("Unsafe state file.");
  const lock = await open(file + ".lock", "wx", 0o600);
  const temp = join(dirname(file), `.agent-state-${randomUUID()}.tmp`);
  try {
    const latestInfo = await lstat(file);
    if (!latestInfo.isFile() || latestInfo.size > 131072) throw new Error("Unsafe state file.");
    const current = JSON.parse(await readFile(file, "utf8"));
    if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("Invalid state document.");
    const prior = current.coordination === undefined ? null : CoordinationSchema.parse(current.coordination);
    if ((prior?.revision ?? 0) !== expectedRevision) throw new Error("Coordination conflict; reread state.");
    if (prior?.status === "active" && (prior.agent !== update.agent || prior.task !== update.task || prior.branch !== update.branch))
      throw new Error("Active owner must checkpoint or hand off first.");
    const output = JSON.stringify({ ...current, coordination: update }, null, 2) + "\n";
    if (Buffer.byteLength(output) > 131072) throw new Error("State document too large.");
    const handle = await open(temp, "wx", 0o600);
    try { await handle.writeFile(output); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, file);
    const directory = await open(dirname(file), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await unlink(temp).catch((err: NodeJS.ErrnoException) => { if (err.code !== "ENOENT") throw err; });
    await lock.close();
    await unlink(file + ".lock");
  }
}

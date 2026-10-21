// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./harness.ts";
import { readCheckpoint, saveCheckpoint } from "../src/continuity/checkpoints.ts";
import { SqliteDb } from "../src/db/sqlite.ts";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations } from "../src/db/migrate.ts";
import { loadMigrations } from "../../../scripts/lib/migrations.ts";

const fixture = () => ({ schemaVersion: 1, taskId: crypto.randomUUID(), runId: crypto.randomUUID(), projectId: crypto.randomUUID(), revision: 1, state: "running", branch: "codex/fixture", worktreeId: crypto.randomUUID(), baseSha: "a".repeat(40), headSha: null, dirtyPaths: [], snapshotDigest: null, verification: "not_run", nextStep: "Inspect uncertain effects before continuing" });
test("ODCP checkpoint: encrypted owner scope, concurrent CAS and immutable attempt", async () => {
  const ctx = await makeCtx();
  try {
    await ctx.db.run("INSERT INTO od_owners(id,email,created_at) VALUES(?,?,?)", ["fixture", "fixture@example.invalid", "2026-10-20"]);
    const c = fixture(); await saveCheckpoint(ctx, "fixture", c, 0);
    assert.deepEqual(await readCheckpoint(ctx, "fixture", c.projectId, c.taskId), c);
    assert.equal(await readCheckpoint(ctx, "other", c.projectId, c.taskId), null);
    assert.equal(await readCheckpoint(ctx, "fixture", crypto.randomUUID(), c.taskId), null);
    const stored = await ctx.db.query<{ payload_enc: string }>("SELECT payload_enc FROM od_task_checkpoints");
    assert.ok(!stored[0]!.payload_enc.includes(c.nextStep));
    await assert.rejects(saveCheckpoint(ctx, "fixture", { ...c, revision: 2, runId: crypto.randomUUID(), state: "paused" }, 1), /identity/);
    const writes = await Promise.allSettled(["paused", "checkpointed"].map(state => saveCheckpoint(ctx, "fixture", { ...c, revision: 2, state }, 1)));
    assert.equal(writes.filter(r => r.status === "fulfilled").length, 1);
    await assert.rejects(saveCheckpoint(ctx, "fixture", { ...c, revision: 2, state: "paused" }, 1), /conflict/);
  } finally { ctx.db.raw.close(); }
});
test("ODCP checkpoint: clean-session reopen never repeats uncertain execution", async () => {
  const template = await makeCtx(); template.db.raw.close();
  const dir = mkdtempSync(join(tmpdir(), "odcp-reopen-")); const path = join(dir, "fixture.sqlite"); let db = new SqliteDb(path);
  try {
    await applyMigrations(db, loadMigrations());
    await db.run("INSERT INTO od_owners(id,email,created_at) VALUES(?,?,?)", ["fixture", "fixture@example.invalid", "2026-10-20"]);
    const c = fixture(); await saveCheckpoint({ ...template, db }, "fixture", c, 0);
    await saveCheckpoint({ ...template, db }, "fixture", { ...c, revision: 2, state: "needs_reconciliation" }, 1);
    db.raw.close(); db = new SqliteDb(path);
    const recovered = await readCheckpoint({ ...template, db }, "fixture", c.projectId, c.taskId);
    assert.equal(recovered?.state, "needs_reconciliation");
    await assert.rejects(saveCheckpoint({ ...template, db }, "fixture", { ...recovered, revision: 3, state: "running" }, 2), /transition/);
    await saveCheckpoint({ ...template, db }, "fixture", { ...recovered, revision: 3, state: "cancelled" }, 2);
    await assert.rejects(saveCheckpoint({ ...template, db }, "fixture", { ...recovered, revision: 4, state: "running" }, 3), /transition/);
    assert.ok(!readFileSync(path).includes(Buffer.from(c.nextStep)));
  } finally { db.raw.close(); rmSync(dir, { recursive: true }); }
});

test("ODCP checkpoint: verification cannot be asserted without Git/test evidence", async () => {
  const ctx = await makeCtx();
  try {
    await ctx.db.run("INSERT INTO od_owners(id,email,created_at) VALUES(?,?,?)", ["fixture", "fixture@example.invalid", "2026-10-20"]);
    const c = fixture(); await saveCheckpoint(ctx, "fixture", c, 0);
    await saveCheckpoint(ctx, "fixture", { ...c, revision: 2, state: "review" }, 1);
    await assert.rejects(saveCheckpoint(ctx, "fixture", { ...c, revision: 3, state: "verified" }, 2), /evidence/);
    await assert.rejects(saveCheckpoint(ctx, "fixture", { ...c, revision: 3, state: "verified", verification: "passed", headSha: "b".repeat(40), dirtyPaths: ["src/main.ts"] }, 2), /evidence/);
    await saveCheckpoint(ctx, "fixture", { ...c, revision: 3, state: "verified", verification: "passed", headSha: "b".repeat(40) }, 2);
    await assert.rejects(saveCheckpoint(ctx, "fixture", { ...c, revision: 4, state: "running" }, 3), /transition/);
  } finally { ctx.db.raw.close(); }
});

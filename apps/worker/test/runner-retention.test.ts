// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./harness.ts";
import * as repo from "../src/repo.ts";

const DAY = 86_400_000;

test("retenção apaga conteúdo de tarefas do Runner terminadas há mais de 90 dias e preserva incertas e recentes (R07)", async () => {
  const ctx = await makeCtx();
  const now = ctx.now();
  await ctx.db.run("INSERT INTO od_owners (id, google_sub, email, created_at) VALUES ('own_1','s','a@example.com','2026-01-01')");
  await ctx.db.run("INSERT INTO od_runner_devices (id, owner_id, name, token_hash, expires_at, created_at) VALUES ('dev','own_1','Mac','h',?,?)", [now + DAY, now]);
  const task = async (id: string, state: string, updated: number) => {
    await ctx.db.run("INSERT INTO od_runner_tasks (id, owner_id, device_id, project_id, mechanism, prompt_enc, state, request_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [id, "own_1", "dev", "p", "codex", "x", state, id, updated, updated]);
    await ctx.db.run("INSERT INTO od_runner_events (task_id, seq, kind, payload_enc, created_at) VALUES (?,1,'status','x',?)", [id, updated]);
    await ctx.db.run("INSERT INTO od_runner_approvals (task_id, digest, proposal_enc, decision, expires_at) VALUES (?,'d','x','approve',?)", [id, updated]);
  };
  await task("old-done", "completed", now - 91 * DAY);
  await task("old-uncertain", "uncertain", now - 200 * DAY);
  await task("recent-done", "failed", now - 10 * DAY);
  await ctx.db.run("INSERT INTO od_runner_pairings (id, code, secret_hash, token_hash, name, expires_at, created_at) VALUES ('pa','c','s','t','n',?,?)", [now - 2 * DAY, now - 2 * DAY]);
  await repo.applyRetention(ctx.db, now);
  const left = async (table: string) => (await ctx.db.query<{ task_id: string }>(`SELECT task_id FROM ${table} ORDER BY task_id`)).map((r) => r.task_id);
  assert.deepEqual(await left("od_runner_events"), ["old-uncertain", "recent-done"]);
  assert.deepEqual(await left("od_runner_approvals"), ["old-uncertain", "recent-done"]);
  assert.equal((await ctx.db.query("SELECT id FROM od_runner_tasks")).length, 3, "metadados da tarefa ficam para auditoria");
  assert.equal((await ctx.db.query("SELECT id FROM od_runner_pairings")).length, 0);
  ctx.db.raw.close();
});

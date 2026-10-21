// SPDX-License-Identifier: AGPL-3.0-only
import { EXPERT_CONTRACTS, composeExpertPrompt } from "@open-dot/core/expert-contracts.ts";
import { syncOneEngineeringMemory } from "./engineering-memory.ts";
import { z } from "zod";
import type { Ctx } from "../context.ts";
import { open, seal } from "../crypto.ts";
import { sha256Hex } from "@open-dot/core";
import { safeRunnerText } from "../runner/routes.ts";
import { RUNNER_PROTOCOL } from "../runner/protocol.ts";

const id = z.string().uuid().transform(v=>v.toLowerCase());
export const EngineeringPlanSchema = z.object({
  requestKey: id, deviceId: id, projectId: id,
  mechanism: z.literal("codex"),
  title: z.string().trim().min(1).max(160),
  consent: z.literal("schedule-isolated-approved-tasks"),
  worktreeConsent: z.literal(true),
  tasks: z.array(z.object({
    id, phase: z.number().int().min(0).max(11),
    title: z.string().trim().min(1).max(160),
    prompt: z.string().trim().min(1).max(8000),
    dependencies: z.array(id).max(11),
    expertId:z.string().refine(v=>EXPERT_CONTRACTS.some(c=>c.id===v),"Unknown expert contract.").optional(),
    acceptance: z.literal("approved-files-applied"),
  }).strict()).min(1).max(12),
  rememberResults: z.boolean().default(false),
}).strict().superRefine((p, ctx) => {
  const seen = new Set<string>(); let phase = 0;
  for (const task of p.tasks) {
    if (seen.has(task.id) || task.phase < phase || new Set(task.dependencies).size !== task.dependencies.length || task.dependencies.some(d => !seen.has(d)))
      ctx.addIssue({ code: "custom", message: "Tasks require unique IDs, ordered phases and earlier dependencies." });
    seen.add(task.id); phase = task.phase;
  }
  if (p.tasks.reduce((n, t) => n + new TextEncoder().encode(t.prompt).length, 0) > 24000)
    ctx.addIssue({ code: "custom", message: "Plan prompt budget exceeded." });
});
interface Plan { id: string; owner_id: string; device_id: string; project_id: string; mechanism: string; state: string; revision: number; memory_policy_revision:number|null }

export async function createEngineeringPlan(ctx: Ctx, owner: string, input: unknown) {
  const data = EngineeringPlanSchema.parse(input);
  const { rememberResults, ...definition } = data;
  // Preserve the existing digest contract when the new opt-in is absent/false.
  const text = JSON.stringify(rememberResults ? { ...definition, rememberResults: true } : definition);
  if (safeRunnerText(text) !== text) throw new Error("Sensitive plan refused.");
  const digest = await sha256Hex(text);
  const existing = (await ctx.db.query<{ id: string; definition_digest: string }>("SELECT id,definition_digest FROM od_engineering_plans WHERE owner_id=? AND request_key=?", [owner, data.requestKey]))[0];
  if (existing) {
    if (existing.definition_digest !== digest) throw new Error("Request key content conflict.");
    return existing.id;
  }
  const policy = rememberResults ? (await ctx.db.query<{revision:number}>("SELECT revision FROM od_project_memory_policies WHERE owner_id=? AND project_id=? AND enabled=1 AND expires_at>?",[owner,data.projectId,ctx.now()]))[0] : null;
  if(rememberResults && !policy)throw new Error("Memory consent required.");
  const planId = crypto.randomUUID();
  const title = await seal(ctx.keys, data.title, `engineering:plan:${owner}:${planId}`);
  const compiled=data.tasks.map(t=>({...t,prompt:t.expertId?composeExpertPrompt(t.prompt,t.expertId):t.prompt}));
  if(compiled.reduce((n,t)=>n+new TextEncoder().encode(t.prompt).length,0)>24000)throw new Error("Compiled plan prompt budget exceeded.");
  const payloads = await Promise.all(compiled.map(t => seal(ctx.keys, JSON.stringify({ title: t.title, prompt: t.prompt, acceptance: t.acceptance,...(t.expertId?{expertId:t.expertId,expertVersion:1}: {}) }), `engineering:task:${owner}:${t.id}`)));
  const result = await ctx.db.batch([
    { sql: `INSERT INTO od_engineering_plans(id,owner_id,device_id,project_id,mechanism,request_key,definition_digest,title_enc,state,created_at,updated_at,memory_policy_revision)
      SELECT ?,?,?,?,?,?,?,?,'active',?,?,? WHERE EXISTS(SELECT 1 FROM od_runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL AND expires_at>?)
      AND (SELECT COUNT(*) FROM od_engineering_plans WHERE owner_id=?)<20 ON CONFLICT(owner_id,request_key) DO NOTHING`,
      args: [planId, owner, data.deviceId, data.projectId, data.mechanism, data.requestKey, digest, title, ctx.now(), ctx.now(), policy?.revision??null, data.deviceId, owner, ctx.now(), owner] },
    ...data.tasks.map((t, position) => ({ sql: "INSERT INTO od_engineering_tasks(id,plan_id,position,phase,payload_enc) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM od_engineering_plans WHERE id=?)", args: [t.id, planId, position, t.phase, payloads[position]!, planId] })),
    ...data.tasks.flatMap(t => t.dependencies.map(dependency => ({ sql: "INSERT INTO od_engineering_dependencies(task_id,dependency_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM od_engineering_plans WHERE id=?)", args: [t.id, dependency, planId] }))),
  ]);
  if (!result[0]?.changes) {
    const prior = (await ctx.db.query<{ id: string; definition_digest: string }>("SELECT id,definition_digest FROM od_engineering_plans WHERE owner_id=? AND request_key=?", [owner, data.requestKey]))[0];
    if (prior?.definition_digest === digest) return prior.id;
    throw new Error("Plan unavailable, conflicting request or quota reached.");
  }
  return planId;
}

/** Bounded, restartable reconciliation. No terminal attempt is automatically retried. */
export async function reconcileEngineering(ctx: Ctx) {
  await ctx.db.batch([
    { sql: `UPDATE od_engineering_tasks SET state=(SELECT CASE
      WHEN r.state='completed' AND EXISTS(SELECT 1 FROM od_runner_events e WHERE e.task_id=r.id AND e.kind='completed')
        AND EXISTS(SELECT 1 FROM od_runner_events e WHERE e.task_id=r.id AND e.kind='files')
        AND EXISTS(SELECT 1 FROM od_runner_approvals a WHERE a.task_id=r.id AND a.decision='approve') THEN 'completed'
      WHEN r.state='completed' THEN 'uncertain' ELSE r.state END
      FROM od_engineering_attempts a JOIN od_runner_tasks r ON r.id=a.runner_task_id WHERE a.task_id=od_engineering_tasks.id)
      WHERE state='assigned' AND EXISTS(SELECT 1 FROM od_engineering_attempts a JOIN od_runner_tasks r ON r.id=a.runner_task_id
        WHERE a.task_id=od_engineering_tasks.id AND r.state IN ('completed','failed','cancelled','uncertain'))` },
    { sql: `UPDATE od_engineering_plans SET state=CASE
      WHEN EXISTS(SELECT 1 FROM od_engineering_tasks t WHERE t.plan_id=od_engineering_plans.id AND t.state='uncertain') THEN 'uncertain'
      WHEN EXISTS(SELECT 1 FROM od_engineering_tasks t WHERE t.plan_id=od_engineering_plans.id AND t.state IN ('failed','cancelled')) THEN 'blocked'
      WHEN NOT EXISTS(SELECT 1 FROM od_engineering_tasks t WHERE t.plan_id=od_engineering_plans.id AND t.state<>'completed') THEN 'completed' ELSE state END,
      revision=revision+1,updated_at=? WHERE state IN ('active','paused') AND (
      EXISTS(SELECT 1 FROM od_engineering_tasks t WHERE t.plan_id=od_engineering_plans.id AND t.state IN ('uncertain','failed','cancelled')) OR
      NOT EXISTS(SELECT 1 FROM od_engineering_tasks t WHERE t.plan_id=od_engineering_plans.id AND t.state<>'completed'))`, args: [ctx.now()] },
  ]);
  await syncOneEngineeringMemory(ctx);
}

/** Called by authenticated Runner claim, not a model. One dispatch/device, native approvals unchanged. */
export async function advanceEngineering(ctx: Ctx, deviceId: string) {
  await reconcileEngineering(ctx);
  const plans = await ctx.db.query<Plan>("SELECT * FROM od_engineering_plans WHERE device_id=? AND state='active' ORDER BY created_at,id LIMIT 20", [deviceId]);
  for (const plan of plans) {
    const d = (await ctx.db.query<{ projects: string; capabilities: string }>("SELECT projects,capabilities FROM od_runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL AND expires_at>? AND seen_at>? AND protocol_version=?", [deviceId, plan.owner_id, ctx.now(), ctx.now()-30000, RUNNER_PROTOCOL]))[0];
    if (!d || !JSON.parse(d.projects).some((p: { id: string }) => p.id === plan.project_id) || !JSON.parse(d.capabilities).some((v: { id: string; authenticated: boolean; executable: boolean }) => v.id === plan.mechanism && v.authenticated && v.executable)) continue;
    const task = (await ctx.db.query<{ id: string; payload_enc: string }>(`SELECT t.id,t.payload_enc FROM od_engineering_tasks t WHERE t.plan_id=? AND t.state='pending'
      AND NOT EXISTS(SELECT 1 FROM od_engineering_tasks x WHERE x.plan_id=t.plan_id AND (x.state='assigned' OR (x.phase<t.phase AND x.state<>'completed')))
      AND NOT EXISTS(SELECT 1 FROM od_engineering_dependencies dep JOIN od_engineering_tasks parent ON parent.id=dep.dependency_id WHERE dep.task_id=t.id AND parent.state<>'completed')
      ORDER BY t.position LIMIT 1`, [plan.id]))[0];
    if (!task) continue;
    const payload = JSON.parse(await open(ctx.keys, task.payload_enc, `engineering:task:${plan.owner_id}:${task.id}`));
    const attempt = crypto.randomUUID(), runnerTask = crypto.randomUUID(), nonce = crypto.randomUUID();
    const prompt = await seal(ctx.keys, payload.prompt, `runner:${plan.owner_id}:${runnerTask}`);
    const result = await ctx.db.batch([
      { sql: "UPDATE od_engineering_plans SET dispatch_nonce=? WHERE id=? AND revision=? AND state='active'", args: [nonce, plan.id, plan.revision] },
      { sql: `INSERT INTO od_runner_tasks(id,owner_id,device_id,project_id,mechanism,prompt_enc,state,request_key,created_at,updated_at,worktree_consent)
        SELECT ?,?,?,?,?,?,'queued',?,?,?,1 WHERE EXISTS(SELECT 1 FROM od_engineering_plans WHERE id=? AND dispatch_nonce=? AND state='active')
        AND EXISTS(SELECT 1 FROM od_engineering_tasks WHERE id=? AND state='pending')
        AND NOT EXISTS(SELECT 1 FROM od_runner_tasks WHERE device_id=? AND state IN ('queued','running','awaiting_approval','cancel_requested'))
        AND EXISTS(SELECT 1 FROM od_runner_devices WHERE id=? AND revoked_at IS NULL AND expires_at>? AND seen_at>? AND protocol_version=? AND projects=? AND capabilities=?)`,
        args: [runnerTask, plan.owner_id, deviceId, plan.project_id, plan.mechanism, prompt, attempt, ctx.now(), ctx.now(), plan.id, nonce, task.id, deviceId, deviceId, ctx.now(), ctx.now()-30000, RUNNER_PROTOCOL, d.projects, d.capabilities] },
      { sql: "INSERT INTO od_engineering_attempts(id,task_id,runner_task_id,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM od_runner_tasks WHERE id=?)", args: [attempt, task.id, runnerTask, ctx.now(), runnerTask] },
      { sql: "UPDATE od_engineering_tasks SET state='assigned' WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM od_engineering_attempts WHERE id=? AND task_id=?)", args: [task.id, attempt, task.id] },
      { sql: "UPDATE od_engineering_plans SET dispatch_nonce=NULL,revision=revision+1,updated_at=? WHERE id=? AND dispatch_nonce=?", args: [ctx.now(), plan.id, nonce] },
    ]);
    if (result[1]?.changes) return;
  }
}

export async function listEngineeringPlans(ctx: Ctx, owner: string) {
  const plans = await ctx.db.query<Plan & { title_enc: string }>("SELECT * FROM od_engineering_plans WHERE owner_id=? ORDER BY created_at DESC,id LIMIT 20", [owner]);
  return Promise.all(plans.map(async p => ({ id: p.id, projectId: p.project_id, deviceId: p.device_id, state: p.state, revision: p.revision,
    memoryRequested:p.memory_policy_revision!==null, title: await open(ctx.keys, p.title_enc, `engineering:plan:${owner}:${p.id}`),
    tasks: await Promise.all((await ctx.db.query<{ id: string; phase: number; state: string; payload_enc: string; attemptId: string | null; runnerTaskId: string | null; memory_sync_state:string; memory_recorded_revision:number|null }>(
      "SELECT t.*,a.id AS attemptId,a.runner_task_id AS runnerTaskId FROM od_engineering_tasks t LEFT JOIN od_engineering_attempts a ON a.task_id=t.id WHERE t.plan_id=? ORDER BY t.position", [p.id],
    )).map(async t => ({ id: t.id, phase: t.phase, state: t.state, attemptId: t.attemptId, runnerTaskId: t.runnerTaskId, memoryState:p.memory_policy_revision!==null?t.memory_sync_state:"not_requested", memoryRevision:t.memory_recorded_revision,
      ...await (async()=>{const payload=JSON.parse(await open(ctx.keys,t.payload_enc,`engineering:task:${owner}:${t.id}`));return {title:payload.title,...(payload.expertId?{expertId:payload.expertId,expertVersion:payload.expertVersion,qualityGate:"not-attested"}:{})};})() }))),
  })));
}

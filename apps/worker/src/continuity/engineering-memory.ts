// SPDX-License-Identifier: AGPL-3.0-only
import type { Ctx } from "../context.ts";
import { readProjectMemory, saveProjectMemory } from "./project-memory.ts";
interface Candidate { task_id:string; owner_id:string; project_id:string; policy_revision:number; runner_id:string; attempt_id:string; completed_at:number }
/** Optional factual memory, never execution authority. Bounded to one receipt/tick, three failures. */
export async function syncOneEngineeringMemory(ctx:Ctx):Promise<void> {
  const row=(await ctx.db.query<Candidate>(`SELECT t.id AS task_id,p.owner_id,p.project_id,p.memory_policy_revision AS policy_revision,
    a.runner_task_id AS runner_id,a.id AS attempt_id,r.updated_at AS completed_at
    FROM od_engineering_tasks t JOIN od_engineering_plans p ON p.id=t.plan_id JOIN od_engineering_attempts a ON a.task_id=t.id
    JOIN od_runner_tasks r ON r.id=a.runner_task_id AND r.owner_id=p.owner_id AND r.project_id=p.project_id AND r.device_id=p.device_id
    WHERE t.state='completed' AND p.memory_policy_revision IS NOT NULL AND t.memory_recorded_revision IS NULL
      AND t.memory_sync_state IN ('pending','retry_wait') AND t.memory_sync_attempts<3 AND r.state='completed' AND r.cancel_requested=0
      AND EXISTS(SELECT 1 FROM od_runner_approvals ap WHERE ap.task_id=r.id AND ap.decision='approve')
      AND EXISTS(SELECT 1 FROM od_runner_events e WHERE e.task_id=r.id AND e.kind='completed')
      AND EXISTS(SELECT 1 FROM od_runner_events e WHERE e.task_id=r.id AND e.kind='files') ORDER BY r.updated_at,t.id LIMIT 1`))[0];
  if(!row)return;
  const mark=async(state:string,revision:number|null=null)=>{
    await ctx.db.run("UPDATE od_engineering_tasks SET memory_sync_state=?,memory_recorded_revision=? WHERE id=? AND memory_recorded_revision IS NULL",[state,revision,row.task_id]);
  };
  try {
    const policy=(await ctx.db.query<{revision:number;enabled:number;expires_at:number}>("SELECT revision,enabled,expires_at FROM od_project_memory_policies WHERE owner_id=? AND project_id=?",[row.owner_id,row.project_id]))[0];
    if(!policy || policy.revision!==row.policy_revision || policy.enabled!==1 || policy.expires_at<=ctx.now()){await mark("consent_changed");return;}
    const memory={id:row.task_id,kind:"fact" as const,provenance:"external-evidence" as const,
      summary:"O Runner registrou aplicação aprovada de arquivos desta tarefa. Testes de projeto não foram executados; não comprova integração ou revisão independente.",
      sourceRefs:[`task:${row.task_id}`,`attempt:${row.attempt_id}`,`runner-task:${row.runner_id}`],observedAt:new Date(row.completed_at).toISOString(),commit:null};
    const prior=await readProjectMemory(ctx,row.owner_id,row.project_id);
    const existing=prior?.memories.find(m=>m.id===row.task_id);
    if(existing){
      if(JSON.stringify(existing)!==JSON.stringify(memory)){await mark("conflict");return;}
      await mark("recorded",prior!.revision);return;
    }
    if((prior?.memories.length??0)>=100){await mark("quota");return;}
    const revision=prior?.revision??0;
    const next=prior ? {...prior,revision:revision+1,memories:[...prior.memories,memory]} : {schemaVersion:1,scope:"memory-only",projectId:row.project_id,revision:1,memories:[memory],links:[]};
    // Consent CAS is in the SQL write itself: concurrent forget cannot resurrect a ledger.
    await saveProjectMemory(ctx,row.owner_id,next,revision,row.policy_revision);
    await mark("recorded",revision+1);
  }catch{
    // A lost response may follow a durable write. Next attempt reads the deterministic node first.
    await ctx.db.run("UPDATE od_engineering_tasks SET memory_sync_attempts=memory_sync_attempts+1,memory_sync_state=CASE WHEN memory_sync_attempts+1>=3 THEN 'blocked' ELSE 'retry_wait' END WHERE id=? AND memory_recorded_revision IS NULL",[row.task_id]);
  }
}

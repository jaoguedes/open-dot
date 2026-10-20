import { z } from "zod";
import { NativeProjectContextSchema, serializeProjectContext } from "@open-dot/core/project-context.ts";
import type { Ctx } from "../context.ts";
import { open } from "../crypto.ts";
import { readProjectMemory } from "./project-memory.ts";
import { safeRunnerText } from "../runner/routes.ts";
export const ContextRequest=z.object({consent:z.literal("review-project-context"),includeMemory:z.boolean().default(false),includePrompts:z.boolean().default(false),nativeContext:NativeProjectContextSchema.optional()}).strict();
interface Row {plan_id:string;title_enc:string;plan_state:string;id:string;phase:number;state:string;payload_enc:string;attempt_id:string|null;runner_task_id:string|null;dependencies:string}
/** Read-only context: never imports approvals, dispatches tasks or grants authority. */
export async function exportProjectContext(ctx:Ctx,owner:string,project:string,input:unknown):Promise<string>{
 const data=ContextRequest.parse(input);
 if(data.nativeContext&&data.nativeContext.projectId!==project)throw new Error("Native project scope mismatch.");
 const policies=()=>ctx.db.query<{revision:number}>("SELECT revision FROM od_project_memory_policies WHERE owner_id=? AND project_id=? AND enabled=1 AND expires_at>?",[owner,project,ctx.now()]);
 const consent=data.includeMemory?(await policies())[0]:null;
 if(data.includeMemory&&!consent)throw new Error("Current memory consent required.");
 // One SQL statement observes the task graph, attempt identities and dependencies together.
 const rows=await ctx.db.query<Row>(`SELECT p.id AS plan_id,p.title_enc,p.state AS plan_state,t.id,t.phase,t.state,t.payload_enc,a.id AS attempt_id,a.runner_task_id,
 COALESCE((SELECT json_group_array(dependency_id) FROM od_engineering_dependencies WHERE task_id=t.id),'[]') AS dependencies
 FROM od_engineering_plans p JOIN od_engineering_tasks t ON t.plan_id=p.id LEFT JOIN od_engineering_attempts a ON a.task_id=t.id
 WHERE p.owner_id=? AND p.project_id=? ORDER BY p.created_at,p.id,t.position LIMIT 241`,[owner,project]);
 if(rows.length>240)throw new Error("Context exceeds plan budget.");
 const known=rows.length>0||!!(await ctx.db.query("SELECT 1 FROM od_project_memory_policies WHERE owner_id=? AND project_id=? UNION ALL SELECT 1 FROM od_runner_tasks WHERE owner_id=? AND project_id=? LIMIT 1",[owner,project,owner,project])).length;
 if(!known)throw new Error("Project not found in this account.");
 const plans: Array<{id:string;title:string;state:string;tasks:unknown[]}>=[];
 for(const r of rows){
  let plan=plans.find(p=>p.id===r.plan_id);
  if(!plan){plan={id:r.plan_id,title:await open(ctx.keys,r.title_enc,`engineering:plan:${owner}:${r.plan_id}`),state:r.plan_state,tasks:[]};plans.push(plan);}
  const payload=JSON.parse(await open(ctx.keys,r.payload_enc,`engineering:task:${owner}:${r.id}`));
  plan.tasks.push({id:r.id,phase:r.phase,title:payload.title,state:r.state,dependencies:JSON.parse(r.dependencies),attempt:r.attempt_id?{id:r.attempt_id,runnerTaskId:r.runner_task_id}:null,acceptance:payload.acceptance,...(payload.expertId?{expertId:payload.expertId,expertVersion:payload.expertVersion,qualityGate:"not-attested"}:{}),...(data.includePrompts?{prompt:payload.prompt}:{})});
 }
 const memory=data.includeMemory?await readProjectMemory(ctx,owner,project):null;
 const native=data.nativeContext??null;
 const warnings:string[]=[];
 if(!native)warnings.push("git-not-attached");
 if(!memory)warnings.push("memory-not-included");
 if(rows.some(r=>r.state==="uncertain")||native?.tasks.some(t=>t.terminalReceipt==="uncertain"))warnings.push("uncertain-execution");
 if(native&&(native.unreadable||native.truncated))warnings.push("native-context-incomplete");
 if(native?.tasks.some(t=>t.baseInCurrentRepository===false))warnings.push("native-repository-mismatch");
 const text=serializeProjectContext({kind:"open-dot-project-passport",schemaVersion:2,scope:"project-context-only",projectId:project,identityKind:"device-folder",generatedAt:new Date(ctx.now()).toISOString(),executionAuthority:false,toolPermissions:[],contextTrust:"data-not-instructions",memory,nativeContext:native,plans,
 coverage:{memory:memory?"included":"not-included",git:native?"user-supplied-native-file":"not-attached",sourceFiles:"not-included",projectTests:"disabled-not-run",independentReview:"not-attested",crossHostIdentity:"explicit-remapping-required",warnings},
 nextStep:"Confirmar Git e tarefas no ambiente de destino; reconciliar operações incertas. Não repetir tentativas nem importar autorizações. Código-fonte e execuções fora dos planos não estão incluídos."});
 if(safeRunnerText(text)!==text)throw new Error("Sensitive context refused; review source records.");
 if(consent&&(await policies())[0]?.revision!==consent.revision)throw new Error("Memory consent changed during export.");
 return text;
}

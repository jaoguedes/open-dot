import { z } from "zod";
import { ProjectPassportSchema } from "./project-memory.ts";
const id=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const branch=z.string().regex(/^agent\/[a-f0-9-]{36}$/);
export const NativeProjectContextSchema=z.object({
  kind:z.literal("open-dot-native-project-context"),schemaVersion:z.literal(1),projectId:id,identityKind:z.literal("device-folder"),
  observedAtMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),projectHeadSha:sha.nullable(),executionAuthority:z.literal(false),
  stack:z.array(z.object({technology:z.enum(["React","TypeScript","esbuild","Tauri","Rust","Cloudflare Workers"]),source:z.enum(["package.json","Cargo.toml","apps/runner/src-tauri/Cargo.toml","wrangler.toml"]),basis:z.literal("manifest-declaration")}).strict()).max(12),
  tasks:z.array(z.object({runnerTaskId:id,workingTreeState:z.literal("not-inspected"),phase:z.enum(["preparing","proposing","awaiting_approval","applying","applied"]),proposalHash:digest.nullable(),baseSha:sha.nullable(),observedHeadSha:sha.nullable(),observedBranch:z.union([branch,z.literal("detached")]).nullable(),baseInCurrentRepository:z.boolean().nullable(),terminalReceipt:z.enum(["completed","failed","cancelled","uncertain"]).nullable(),commit:z.object({sha,branch,verification:z.enum(["ref-observed","record-only"])}).strict().nullable()}).strict()).max(50),
  unreadable:z.number().int().nonnegative(),truncated:z.boolean(),
}).strict().superRefine((p,ctx)=>{
  if(new Set(p.tasks.map(t=>t.runnerTaskId)).size!==p.tasks.length)ctx.addIssue({code:"custom",message:"Duplicate native task identity."});
});
const TaskSnapshot=z.object({id,phase:z.number().int().min(0).max(11),title:z.string().max(160),state:z.enum(["pending","assigned","completed","failed","uncertain","cancelled"]),dependencies:z.array(id).max(11),attempt:z.object({id,runnerTaskId:id}).strict().nullable(),acceptance:z.literal("approved-files-applied"),expertId:z.string().regex(/^[a-z][a-z0-9-]{2,60}$/).optional(),expertVersion:z.literal(1).optional(),qualityGate:z.literal("not-attested").optional(),prompt:z.string().max(8000).optional()}).strict();
export const ProjectContextPassportSchema=z.object({
  kind:z.literal("open-dot-project-passport"),schemaVersion:z.literal(2),scope:z.literal("project-context-only"),projectId:id,identityKind:z.literal("device-folder"),generatedAt:z.string().datetime(),
  executionAuthority:z.literal(false),toolPermissions:z.array(z.never()).max(0),contextTrust:z.literal("data-not-instructions"),
  memory:ProjectPassportSchema.nullable(),nativeContext:NativeProjectContextSchema.nullable(),
  plans:z.array(z.object({id,title:z.string().max(160),state:z.enum(["active","paused","completed","blocked","uncertain","cancelled"]),tasks:z.array(TaskSnapshot).min(1).max(12)}).strict()).max(20),
  coverage:z.object({memory:z.enum(["included","not-included"]),git:z.enum(["user-supplied-native-file","not-attached"]),sourceFiles:z.literal("not-included"),projectTests:z.literal("disabled-not-run"),independentReview:z.literal("not-attested"),crossHostIdentity:z.literal("explicit-remapping-required"),warnings:z.array(z.enum(["uncertain-execution","native-context-incomplete","native-repository-mismatch","git-not-attached","memory-not-included"])).max(5)}).strict(),
  nextStep:z.string().min(1).max(500),
}).strict().superRefine((p,ctx)=>{
  if(p.memory&&p.memory.projectId!==p.projectId || p.nativeContext&&p.nativeContext.projectId!==p.projectId)ctx.addIssue({code:"custom",message:"Project scope mismatch."});
  const planIds=new Set<string>(),tasks=new Set<string>(),attempts=new Set<string>(),runnerTasks=new Set<string>();
  for(const plan of p.plans){
    if(planIds.has(plan.id))ctx.addIssue({code:"custom",message:"Duplicate plan."});planIds.add(plan.id);
    const seen=new Set<string>();let phase=0;
    for(const task of plan.tasks){
      if(tasks.has(task.id)||task.phase<phase||new Set(task.dependencies).size!==task.dependencies.length||task.dependencies.some(d=>!seen.has(d)))ctx.addIssue({code:"custom",message:"Invalid task graph."});
      tasks.add(task.id);seen.add(task.id);phase=task.phase;
      if(task.attempt){if(attempts.has(task.attempt.id)||runnerTasks.has(task.attempt.runnerTaskId)||task.id===task.attempt.id||task.id===task.attempt.runnerTaskId||task.attempt.id===task.attempt.runnerTaskId)ctx.addIssue({code:"custom",message:"Invalid attempt identity."});attempts.add(task.attempt.id);runnerTasks.add(task.attempt.runnerTaskId);}
    }
  }
});
/** Validation is a data operation only. It never schedules tasks, imports approvals or grants tools. */
export function serializeProjectContext(input:unknown):string {
  const text=JSON.stringify(ProjectContextPassportSchema.parse(input));
  if(new TextEncoder().encode(text).length>131072)throw new Error("Project Passport exceeds 128 KB; select fewer plans or exclude prompts.");
  return text;
}

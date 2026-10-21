// SPDX-License-Identifier: AGPL-3.0-only
import { exportProjectContext } from "./project-context.ts";
import { z } from "zod";
import { ProjectPassportSchema } from "@open-dot/core/project-memory.ts";
import type { Handler } from "../app.ts";
import type { Ctx } from "../context.ts";
import { json, problem } from "../http.ts";
import { readProjectMemory, saveProjectMemory, exportProjectPassport } from "./project-memory.ts";
type Registrar=(method:string,path:string,opts:{auth:boolean;csrf?:boolean},handler:Handler)=>void;
const revision=z.number().int().min(0).max(1_000_000);
async function body(req:Request):Promise<unknown>{
 if(!req.body)throw new SyntaxError();
 const reader=req.body.getReader();const chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>65536){await reader.cancel();throw new SyntaxError();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
interface Policy {revision:number;enabled:number;expires_at:number}
async function policy(ctx:Ctx,owner:string,project:string):Promise<Policy|null>{
 return (await ctx.db.query<Policy>('SELECT revision,enabled,expires_at FROM od_project_memory_policies WHERE owner_id=? AND project_id=?',[owner,project]))[0]??null;
}
function enabled(ctx:Ctx,p:Policy|null):p is Policy{return !!p && p.enabled===1 && p.expires_at>ctx.now();}
/** Exclusão lógica de snapshots cifrados; WAL/backups não equivalem a apagamento físico seguro. */
export async function expireProjectMemory(ctx:Ctx):Promise<void>{
 await ctx.db.batch([
  {sql:'DELETE FROM od_project_ledgers WHERE EXISTS(SELECT 1 FROM od_project_memory_policies p WHERE p.owner_id=od_project_ledgers.owner_id AND p.project_id=od_project_ledgers.project_id AND (p.enabled=0 OR p.expires_at<=?))',args:[ctx.now()]},
  {sql:'UPDATE od_project_memory_policies SET enabled=0 WHERE expires_at<=? AND enabled=1',args:[ctx.now()]},
 ]);
}
export function registerProjectMemoryRoutes(route:Registrar){
 route('POST','/api/projects/:id/passport',{auth:true},async(ctx,req,p,owner)=>{
  const project=z.string().uuid().parse(p.id);
  try{return json({passport:JSON.parse(await exportProjectContext(ctx,owner!,project,await body(req))),executionAuthority:false});}
  catch{return problem(409,'context_unconfirmed','Contexto não exportado. Confira projeto, consentimento vigente, tamanho e conteúdo; nenhum privilégio foi transferido.');}
 });
 const path='/api/projects/:id/memory';
 route('GET',`${path}/policy`,{auth:true},async(ctx,_req,p,owner)=>{
  const project=z.string().uuid().parse(p.id);const stored=await policy(ctx,owner!,project);
  return json({revision:stored?.revision??0,enabled:enabled(ctx,stored),expiresAt:stored?.expires_at??null,scope:'memory-only'});
 });
 route('POST',`${path}/consent`,{auth:true},async(ctx,req,p,owner)=>{
  const project=z.string().uuid().parse(p.id);
  const data=z.object({consent:z.literal('store-project-memory'),expectedRevision:revision,retentionDays:z.number().int().min(1).max(90)}).strict().parse(await body(req));
  const op=crypto.randomUUID(),expires=ctx.now()+data.retentionDays*86400_000;
  const result=data.expectedRevision===0
   ?await ctx.db.run(`INSERT INTO od_project_memory_policies(owner_id,project_id,revision,enabled,expires_at,operation_id) SELECT ?,?,1,1,?,? WHERE (SELECT COUNT(*) FROM od_project_memory_policies WHERE owner_id=?)<20 ON CONFLICT(owner_id,project_id) DO NOTHING`,[owner!,project,expires,op,owner!])
   :(await ctx.db.batch([
     {sql:'DELETE FROM od_project_ledgers WHERE owner_id=? AND project_id=? AND EXISTS(SELECT 1 FROM od_project_memory_policies WHERE owner_id=? AND project_id=? AND revision=? AND (enabled=0 OR expires_at<=?))',args:[owner!,project,owner!,project,data.expectedRevision,ctx.now()]},
     {sql:'UPDATE od_project_memory_policies SET revision=revision+1,enabled=1,expires_at=?,operation_id=? WHERE owner_id=? AND project_id=? AND revision=?',args:[expires,op,owner!,project,data.expectedRevision]},
    ]))[1]!;
  if(result.changes!==1)return problem(409,'memory_consent_conflict','Releia a revisão de consentimento; limite de vinte projetos cadastrados.');
  return json({revision:data.expectedRevision+1,expiresAt:expires,scope:'memory-only'});
 });
 route('GET',path,{auth:true},async(ctx,_req,p,owner)=>{
  const project=z.string().uuid().parse(p.id);if(!enabled(ctx,await policy(ctx,owner!,project)))return problem(403,'memory_consent_required','Memória exige consentimento vigente para este projeto.');
  return json({passport:await readProjectMemory(ctx,owner!,project),scope:'memory-only'});
 });
 route('POST',path,{auth:true},async(ctx,req,p,owner)=>{
  const project=z.string().uuid().parse(p.id);
  const data=z.object({expectedRevision:revision,consentRevision:revision,passport:ProjectPassportSchema}).strict().parse(await body(req));
  if(data.passport.projectId!==project)return problem(400,'memory_scope','Projeto do Passport não corresponde ao destino.');
  const consent=await policy(ctx,owner!,project);if(!enabled(ctx,consent)||consent.revision!==data.consentRevision)return problem(403,'memory_consent_required','Consentimento ausente, expirado ou alterado.');
  try{await saveProjectMemory(ctx,owner!,data.passport,data.expectedRevision,data.consentRevision);}
  catch{return problem(409,'memory_write_unconfirmed','Memória não confirmada. Releia revisão/consentimento; decisões humanas e padrões de segredo não podem ser importados.');}
  return json({revision:data.passport.revision,stored:true,scope:'memory-only'});
 });
 route('POST',`${path}/export`,{auth:true},async(ctx,req,p,owner)=>{
  const project=z.string().uuid().parse(p.id);z.object({consent:z.literal('local-review')}).strict().parse(await body(req));
  if(!enabled(ctx,await policy(ctx,owner!,project)))return problem(403,'memory_consent_required','Exportação exige consentimento vigente.');
  if(!await readProjectMemory(ctx,owner!,project))return problem(404,'not_found','Memória não encontrada neste escopo.');
  return json({passport:JSON.parse(await exportProjectPassport(ctx,owner!,project,'local-review')),scope:'memory-only',executionAuthority:false});
 });
 route('POST',`${path}/forget`,{auth:true},async(ctx,req,p,owner)=>{
  const project=z.string().uuid().parse(p.id);const data=z.object({expectedConsentRevision:revision,consent:z.literal('forget-project-memory')}).strict().parse(await body(req));const op=crypto.randomUUID();
  const results=await ctx.db.batch([
   {sql:'UPDATE od_project_memory_policies SET revision=revision+1,enabled=0,expires_at=?,operation_id=? WHERE owner_id=? AND project_id=? AND revision=?',args:[ctx.now(),op,owner!,project,data.expectedConsentRevision]},
   {sql:'DELETE FROM od_project_ledgers WHERE owner_id=? AND project_id=? AND EXISTS(SELECT 1 FROM od_project_memory_policies WHERE owner_id=? AND project_id=? AND operation_id=? AND enabled=0)',args:[owner!,project,owner!,project,op]},
  ]);
  if(!results[0]?.changes)return problem(409,'memory_consent_conflict','Consentimento mudou. Nenhuma exclusão confirmada.');
  return json({forgotten:true,revision:data.expectedConsentRevision+1,physicalErasure:false});
 });
}

// SPDX-License-Identifier: AGPL-3.0-only
import { ProjectPassportSchema, serializePassport, type ProjectPassport } from "@open-dot/core/project-memory.ts";
import type { Ctx } from "../context.ts";
import { seal, open } from "../crypto.ts";
import { safeRunnerText } from "../runner/routes.ts";

/** Serviço interno; adaptador HTTP autentica dono e exige consentimento revisionado. */
export async function readProjectMemory(ctx:Ctx, owner:string, projectId:string):Promise<ProjectPassport|null> {
  const row=(await ctx.db.query<{revision:number;payload_enc:string}>("SELECT revision,payload_enc FROM od_project_ledgers WHERE owner_id=? AND project_id=?",[owner,projectId]))[0];
  if(!row)return null;
  const value=ProjectPassportSchema.parse(JSON.parse(await open(ctx.keys,row.payload_enc,`memory:${owner}:${projectId}:${row.revision}`)));
  if(value.projectId!==projectId||value.revision!==row.revision)throw new Error("Ledger incompatível com o escopo.");
  return value;
}

/** CAS de snapshot completo. Nenhum texto de um modelo pode promover a si mesmo a decisão humana. */
export async function saveProjectMemory(ctx:Ctx, owner:string, input:unknown, expectedRevision:number, consentRevision?:number):Promise<void> {
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error("Revisão inválida.");
  const text=serializePassport(input),value=ProjectPassportSchema.parse(JSON.parse(text));
  if(value.revision!==expectedRevision+1)throw new Error("Revisão não corresponde ao checkpoint esperado.");
  if(value.memories.some(m=>m.provenance==="user-approved"))throw new Error("Workflow de aprovação humana ainda não integrado; promoção bloqueada.");
  if(safeRunnerText(text)!==text)throw new Error("Padrão de segredo detectado; memória recusada.");
  const prior=await readProjectMemory(ctx,owner,value.projectId);
  if(prior?.memories.some(m=>m.provenance==="user-approved"))throw new Error("Decisão aprovada não pode ser alterada sem autorização específica.");
  const encrypted=await seal(ctx.keys,text,`memory:${owner}:${value.projectId}:${value.revision}`);
  const guard=consentRevision===undefined ? "1" : "EXISTS(SELECT 1 FROM od_project_memory_policies WHERE owner_id=? AND project_id=? AND revision=? AND enabled=1 AND expires_at>?)";
  const guardArgs=consentRevision===undefined ? [] : [owner,value.projectId,consentRevision,ctx.now()];
  const result=expectedRevision===0
    ?await ctx.db.run("INSERT INTO od_project_ledgers(owner_id,project_id,revision,payload_enc,updated_at) SELECT ?,?,?,?,? WHERE "+guard+" ON CONFLICT(owner_id,project_id) DO NOTHING",[owner,value.projectId,value.revision,encrypted,ctx.now(),...guardArgs])
    :await ctx.db.run("UPDATE od_project_ledgers SET revision=?,payload_enc=?,updated_at=? WHERE owner_id=? AND project_id=? AND revision=? AND "+guard,[value.revision,encrypted,ctx.now(),owner,value.projectId,expectedRevision,...guardArgs]);
  if(result.changes!==1)throw new Error("Conflito de revisão; releia o ledger antes de tentar novamente.");
}

/** Exporta somente para revisão local explícita; sem envio de rede ou autorização implícita. */
export async function exportProjectPassport(ctx:Ctx,owner:string,projectId:string,consent:"local-review"):Promise<string> {
  if(consent!=="local-review")throw new Error("Exportação exige consentimento local explícito.");
  const value=await readProjectMemory(ctx,owner,projectId);
  if(!value)throw new Error("Memória não encontrada neste escopo.");
  return serializePassport(value);
}

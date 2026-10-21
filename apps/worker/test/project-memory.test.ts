// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./harness.ts";
import { ProjectPassportSchema, serializePassport } from "@open-dot/core/project-memory.ts";
import { saveProjectMemory, readProjectMemory, exportProjectPassport } from "../src/continuity/project-memory.ts";
import { mkdtempSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteDb } from "../src/db/sqlite.ts";
import { applyMigrations } from "../src/db/migrate.ts";
import { loadMigrations } from "../../../scripts/lib/migrations.ts";

function fixture() {
  return {schemaVersion:1 as const,scope:"memory-only" as const,projectId:crypto.randomUUID(),revision:1,memories:[{id:crypto.randomUUID(),kind:"requirement" as const,provenance:"agent-proposed" as const,summary:"Prices require observation dates",sourceRefs:["ADR-0001"],observedAt:"2026-10-20T12:00:00Z",commit:null}],links:[]};
}
test("memória persistente: cifrada, escopada, CAS concorrente e Passport sem efeitos",async()=>{
  const ctx=await makeCtx({env:{OWNER_EMAIL:"fixture@example.invalid"}});
  try {
    for(const id of ["owner-a","owner-b"])await ctx.db.run("INSERT INTO od_owners(id,email,created_at) VALUES(?,?,?)",[id,`${id}@example.invalid`,"2026-10-20"]);
    const value=fixture();await saveProjectMemory(ctx,"owner-a",value,0);
    assert.deepEqual(await readProjectMemory(ctx,"owner-a",value.projectId),value);
    assert.equal(await readProjectMemory(ctx,"owner-b",value.projectId),null);
    assert.equal(await readProjectMemory(ctx,"owner-a",crypto.randomUUID()),null);
    const stored=await ctx.db.query<{payload_enc:string}>("SELECT payload_enc FROM od_project_ledgers");assert.ok(!stored[0]!.payload_enc.includes(value.memories[0]!.summary));
    const writes=await Promise.allSettled([saveProjectMemory(ctx,"owner-a",{...value,revision:2},1),saveProjectMemory(ctx,"owner-a",{...value,revision:2},1)]);
    assert.equal(writes.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(JSON.parse(await exportProjectPassport(ctx,"owner-a",value.projectId,"local-review")).revision,2);
    await assert.rejects(exportProjectPassport(ctx,"owner-b",value.projectId,"local-review"),/escopo/);
    await assert.rejects(saveProjectMemory(ctx,"owner-a",{...value,revision:3,memories:[{...value.memories[0],provenance:"user-approved"}]},2),/promoção bloqueada/);
    await assert.rejects(saveProjectMemory(ctx,"owner-a",{...value,revision:3,memories:[{...value.memories[0],summary:"password=synthetic-secret-value"}]},2),/segredo/);
  }finally{ctx.db.raw.close();}
});
test("Memory Graph rejeita ciclos, referências órfãs, extras e credenciais em fonte",()=>{
  const a=fixture(),b={...a.memories[0]!,id:crypto.randomUUID()};const pair={...a,memories:[...a.memories,b]};
  assert.ok(ProjectPassportSchema.safeParse({...pair,links:[{from:a.memories[0]!.id,to:b.id,relation:"requires"}]}).success);
  assert.ok(!ProjectPassportSchema.safeParse({...pair,links:[{from:a.memories[0]!.id,to:b.id,relation:"requires"},{from:b.id,to:a.memories[0]!.id,relation:"requires"}]}).success);
  assert.ok(!ProjectPassportSchema.safeParse({...a,links:[{from:a.memories[0]!.id,to:crypto.randomUUID(),relation:"supports"}]}).success);
  assert.ok(!ProjectPassportSchema.safeParse({...a,token:"not allowed"}).success);
  assert.ok(!ProjectPassportSchema.safeParse({...a,memories:[{...a.memories[0],sourceRefs:["https://user:pass@example.invalid/path"]}]}).success);
  assert.throws(()=>serializePassport({...a,memories:Array.from({length:50},()=>({...a.memories[0],id:crypto.randomUUID(),summary:"x".repeat(2000)}))}),/64 KB/);
});

test("ledger sobrevive fechamento e reabertura do SQLite em disco sem texto puro",async()=>{
  const template=await makeCtx({env:{OWNER_EMAIL:"fixture@example.invalid"}});template.db.raw.close();
  const dir=mkdtempSync(join(tmpdir(),"open-dot-memory-reopen-"));chmodSync(dir,0o700);
  const path=join(dir,"fixture.sqlite");let db=new SqliteDb(path);
  try {
    await applyMigrations(db,loadMigrations());
    await db.run("INSERT INTO od_owners(id,email,created_at) VALUES(?,?,?)",["fixture-owner","fixture@example.invalid","2026-10-20"]);
    const value=fixture();await saveProjectMemory({...template,db},"fixture-owner",value,0);
    db.raw.close();db=new SqliteDb(path);
    assert.deepEqual(await readProjectMemory({...template,db},"fixture-owner",value.projectId),value);
    assert.ok(!readFileSync(path).includes(Buffer.from(value.memories[0]!.summary)));
  }finally{try{db.raw.close();}finally{rmSync(dir,{recursive:true});}}
});

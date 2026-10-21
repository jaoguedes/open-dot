// SPDX-License-Identifier: AGPL-3.0-only
import type {SqlValue} from '../src/db/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCtx,client} from './harness.ts';
import {sha256Hex} from '@open-dot/core';
import {ProjectContextPassportSchema,serializeProjectContext} from '@open-dot/core/project-context.ts';
import {exportProjectContext} from '../src/continuity/project-context.ts';
async function setup(){
 const ctx=await makeCtx(),web=client(ctx);await web.call('POST','/api/session/dev');
 const owner=(await ctx.db.query<{id:string}>('SELECT id FROM od_owners'))[0]!.id,project=crypto.randomUUID(),device=crypto.randomUUID();
 await ctx.db.run('INSERT INTO od_runner_devices(id,owner_id,name,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',[device,owner,'Fixture',await sha256Hex('context-fixture-device'),ctx.now()+86400000,ctx.now()]);
 const task=crypto.randomUUID();
 const plan={requestKey:crypto.randomUUID(),deviceId:device,projectId:project,mechanism:'codex',title:'Context fixture',consent:'schedule-isolated-approved-tasks',worktreeConsent:true,tasks:[{id:task,phase:0,title:'Task fixture',prompt:'Source prompt excluded by default',dependencies:[],acceptance:'approved-files-applied'}]};
 await ctx.db.run('UPDATE od_runner_devices SET projects=? WHERE id=?',[JSON.stringify([{id:project,label:'Fixture'}]),device]);
 assert.equal((await web.call('POST','/api/runner/plans',plan)).status,201);
 return{ctx,web,owner,project,task,path:`/api/projects/${project}/passport`,request:{consent:'review-project-context'}};
}
test('Passport context: real SQL graph, owner/CSRF scope, explicit prompts and clean-session data-only restoration',async()=>{
 const s=await setup();try{
  assert.equal((await client(s.ctx).call('POST',s.path,s.request)).status,401);
  assert.equal((await s.web.call('POST',s.path,s.request,{'x-open-dot':'0'})).status,403);
  assert.equal((await s.web.call('POST',s.path,{})).status,409);
  assert.equal((await s.web.call('POST',`/api/projects/${crypto.randomUUID()}/passport`,s.request)).status,409);
  const r=await s.web.call('POST',s.path,s.request);assert.equal(r.status,200);const p=r.json.passport;
  assert.equal(p.plans[0].tasks[0].id,s.task);assert.equal(p.plans[0].tasks[0].prompt,undefined);assert.equal(p.executionAuthority,false);
  assert.deepEqual(p.toolPermissions,[]);assert.equal(p.nativeContext,null);assert.equal(p.coverage.projectTests,'disabled-not-run');
  const fresh=JSON.parse(serializeProjectContext(JSON.parse(JSON.stringify(p))));assert.deepEqual(fresh,p);
  assert.equal(ProjectContextPassportSchema.safeParse({...p,executionAuthority:true}).success,false);
  assert.equal(ProjectContextPassportSchema.safeParse({...p,token:'not-authorized'}).success,false);
  assert.equal(ProjectContextPassportSchema.safeParse({...p,plans:[...p.plans,...p.plans]}).success,false);
  assert.equal((await s.web.call('POST',s.path,{...s.request,includePrompts:true})).json.passport.plans[0].tasks[0].prompt,'Source prompt excluded by default');
  await assert.rejects(exportProjectContext(s.ctx,'unrelated-owner',s.project,s.request));
  assert.equal((await s.ctx.db.query('SELECT * FROM od_engineering_attempts')).length,0);
 }finally{s.ctx.db.raw.close();}
});
test('Passport context: memory opt-in, revocation race, native scope, size and no privilege import',async()=>{
 const s=await setup();try{
  assert.equal((await s.web.call('POST',s.path,{...s.request,includeMemory:true})).status,409);
  await s.web.call('POST',`/api/projects/${s.project}/memory/consent`,{consent:'store-project-memory',expectedRevision:0,retentionDays:1});
  const memory={schemaVersion:1,scope:'memory-only',projectId:s.project,revision:1,memories:[],links:[]};
  await s.web.call('POST',`/api/projects/${s.project}/memory`,{expectedRevision:0,consentRevision:1,passport:memory});
  assert.deepEqual((await s.web.call('POST',s.path,{...s.request,includeMemory:true})).json.passport.memory,memory);
  const native={kind:'open-dot-native-project-context',schemaVersion:1,projectId:s.project,identityKind:'device-folder',observedAtMs:s.ctx.now(),projectHeadSha:'a'.repeat(40),executionAuthority:false,stack:[],tasks:[],unreadable:0,truncated:false};
  assert.equal((await s.web.call('POST',s.path,{...s.request,nativeContext:native})).status,200);
  assert.equal((await s.web.call('POST',s.path,{...s.request,nativeContext:{...native,projectId:crypto.randomUUID()}})).status,409);
  assert.equal((await s.web.call('POST',s.path,{...s.request,nativeContext:{...native,executionAuthority:true}})).status,409);
  assert.equal((await s.web.call('POST',s.path,{...s.request,padding:'x'.repeat(66000)})).status,409);
  const original=s.ctx.db.query.bind(s.ctx.db);let revoked=false;
  s.ctx.db.query=async<T>(sql:string,args?:SqlValue[]):Promise<T[]>=>{const rows=await original<T>(sql,args);if(sql.startsWith('SELECT revision,payload_enc')&&!revoked){revoked=true;await s.ctx.db.run('UPDATE od_project_memory_policies SET enabled=0,revision=revision+1 WHERE owner_id=?',[s.owner]);}return rows;};
  assert.equal((await s.web.call('POST',s.path,{...s.request,includeMemory:true})).status,409);
 }finally{s.ctx.db.raw.close();}
});

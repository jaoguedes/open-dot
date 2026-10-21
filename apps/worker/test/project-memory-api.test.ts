// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCtx,client} from './harness.ts';
import {expireProjectMemory} from '../src/continuity/routes.ts';
import {upsertOwner} from '../src/repo.ts';
import {startSession} from '../src/http.ts';
async function setup(){
 const ctx=await makeCtx();const web=client(ctx);await web.call('POST','/api/session/dev');
 const project=crypto.randomUUID(),path=`/api/projects/${project}/memory`;
 const passport={schemaVersion:1,scope:'memory-only',projectId:project,revision:1,memories:[{id:crypto.randomUUID(),kind:'requirement',provenance:'agent-proposed',summary:'Require price observation dates',sourceRefs:['ADR-0001'],observedAt:'2026-10-20T12:00:00Z',commit:null}],links:[]};
 const consent=()=>web.call('POST',`${path}/consent`,{consent:'store-project-memory',expectedRevision:0,retentionDays:1});
 const save=(revision=1,consentRevision=1)=>web.call('POST',path,{passport:{...passport,revision},expectedRevision:revision-1,consentRevision});
 return{ctx,web,path,passport,consent,save};
}
test('memória HTTP: auth/CSRF, consentimento, cifragem e escopo de dono/projeto',async()=>{
 const s=await setup();try{
  assert.equal((await client(s.ctx).call('GET',s.path)).status,401);
  assert.equal((await s.web.call('GET',s.path)).status,403);assert.equal((await s.save()).status,403);
  assert.equal((await s.web.call('POST',`${s.path}/consent`,{consent:'store-project-memory',expectedRevision:0,retentionDays:1},{'x-open-dot':'0'})).status,403);
  assert.equal((await s.consent()).status,200);assert.equal((await s.save()).json.stored,true);
  assert.deepEqual((await s.web.call('GET',s.path)).json.passport,s.passport);
  assert.ok(!(await s.ctx.db.query<{payload_enc:string}>('SELECT payload_enc FROM od_project_ledgers'))[0]!.payload_enc.includes(s.passport.memories[0]!.summary));
  const owner=await upsertOwner(s.ctx.db,{sub:'memory-owner-b',email:'memory-b@example.invalid',name:null,now:s.ctx.now()});
  const b=client(s.ctx);b.setCookie((await startSession(s.ctx,new Request('http://localhost:8787'),owner)).split(';')[0]!);
  assert.equal((await b.call('GET',s.path)).status,403);
  await b.call('POST',`${s.path}/consent`,{consent:'store-project-memory',expectedRevision:0,retentionDays:1});
  assert.equal((await b.call('GET',s.path)).json.passport,null);
  assert.equal((await s.web.call('GET',`/api/projects/${crypto.randomUUID()}/memory`)).status,403);
  assert.equal((await s.web.call('POST',s.path,{passport:{...s.passport,projectId:crypto.randomUUID()},expectedRevision:0,consentRevision:1})).status,400);
 }finally{s.ctx.db.raw.close();}
});
test('memória HTTP: CAS, import/export parcial, promoção recusada e revogação transacional',async()=>{
 const s=await setup();try{
  await s.consent();await s.save();
  const concurrent=await Promise.all([s.save(2),s.save(2)]);assert.equal(concurrent.filter(r=>r.status===200).length,1);assert.equal(concurrent.filter(r=>r.status===409).length,1);
  assert.equal((await s.web.call('POST',`${s.path}/export`,{})).status,400);
  const exported=await s.web.call('POST',`${s.path}/export`,{consent:'local-review'});assert.equal(exported.json.executionAuthority,false);assert.equal(exported.json.scope,'memory-only');
  const injected={...exported.json.passport,revision:3,memories:[{...s.passport.memories[0],provenance:'user-approved'}]};
  assert.equal((await s.web.call('POST',s.path,{passport:injected,expectedRevision:2,consentRevision:1})).status,409);
  const original=s.ctx.db.run.bind(s.ctx.db);let revoked=false;
  s.ctx.db.run=async(sql,args)=>{
   if(!revoked&&sql.startsWith('UPDATE od_project_ledgers')){revoked=true;assert.equal((await s.web.call('POST',`${s.path}/forget`,{consent:'forget-project-memory',expectedConsentRevision:1})).status,200);}
   return original(sql,args);
  };
  assert.equal((await s.save(3)).status,409);assert.equal((await s.ctx.db.query('SELECT * FROM od_project_ledgers')).length,0);
  assert.equal((await s.web.call('GET',s.path)).status,403);
  assert.equal((await s.web.call('POST',`${s.path}/forget`,{consent:'forget-project-memory',expectedConsentRevision:1})).status,409);
 }finally{s.ctx.db.raw.close();}
});
test('memória HTTP: expiração/renovação não ressuscitam snapshots e import exige consentimento novo',async()=>{
 const s=await setup();try{
  await s.consent();await s.save();const exported=(await s.web.call('POST',`${s.path}/export`,{consent:'local-review'})).json.passport;
  s.ctx.clock.t+=86400_001;
  assert.equal((await s.web.call('GET',s.path)).status,403);
  assert.equal((await s.web.call('POST',`${s.path}/consent`,{consent:'store-project-memory',expectedRevision:1,retentionDays:1})).status,200);
  assert.equal((await s.web.call('GET',s.path)).json.passport,null);
  assert.equal((await s.save(1,1)).status,403);
  assert.equal((await s.web.call('POST',s.path,{passport:exported,expectedRevision:0,consentRevision:2})).status,200);
  // Nova sessão autenticada restaura Passport sem levar privilégios de execução.
  const fresh=client(s.ctx);await fresh.call('POST','/api/session/dev');assert.deepEqual((await fresh.call('GET',s.path)).json.passport,exported);
  s.ctx.clock.t+=86400_001;await expireProjectMemory(s.ctx);
  assert.equal((await s.ctx.db.query('SELECT * FROM od_project_ledgers')).length,0);
  assert.equal((await fresh.call('GET',`${s.path}/policy`)).json.enabled,false);
 }finally{s.ctx.db.raw.close();}
});
test('memória HTTP: concorrência de consentimento, limites e corpos grandes falham fechados',async()=>{
 const s=await setup();try{
  const concurrent=await Promise.all([s.consent(),s.consent()]);assert.equal(concurrent.filter(r=>r.status===200).length,1);
  assert.equal((await s.web.call('POST',`${s.path}/consent`,{consent:'store-project-memory',expectedRevision:1,retentionDays:91})).status,400);
  assert.equal((await s.web.call('POST',s.path,{passport:s.passport,expectedRevision:0,consentRevision:1,ownerId:'untrusted'})).status,400);
  assert.equal((await s.web.call('POST',s.path,{padding:'x'.repeat(66000)})).status,400);
  for(let i=0;i<19;i++)assert.equal((await s.web.call('POST',`/api/projects/${crypto.randomUUID()}/memory/consent`,{consent:'store-project-memory',expectedRevision:0,retentionDays:1})).status,200);
  assert.equal((await s.web.call('POST',`/api/projects/${crypto.randomUUID()}/memory/consent`,{consent:'store-project-memory',expectedRevision:0,retentionDays:1})).status,409);
 }finally{s.ctx.db.raw.close();}
});

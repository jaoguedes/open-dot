import assert from "node:assert/strict";
import test from "node:test";
import { client, makeCtx } from "./harness.ts";
import { tick } from "../src/jobs.ts";
import * as repo from "../src/repo.ts";

test("diagnóstico: health, última rodada do cron e falhas com texto humano, sem segredo nem e-mail", async () => {
  const ctx = await makeCtx({ env: { GROQ_API_KEY: "gsk_valor_falso_de_teste_1234567890" } }); // scan-secrets: teste
  const c = client(ctx);
  assert.equal((await c.call("GET", "/api/diagnostics")).status, 401);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const routine = (await repo.listRoutines(ctx.db, ownerId))[0]!;
  await repo.createRunForSlot(ctx.db, { ownerId, routineId: routine.id, agentId: routine.agent_id, kind: routine.kind, slotKey: "s1", scheduledAt: ctx.now(), late: false, now: ctx.now() });
  const run = await repo.runBySlot(ctx.db, ownerId, "s1");
  const claimed = await repo.claimRun(ctx.db, run!, ctx.now());
  await repo.finishRun(ctx.db, claimed!, { state: "failed", errorCode: "subrequest_limit", errorMessage: "x", now: ctx.now() });
  await tick(ctx);
  const d = await c.call("GET", "/api/diagnostics");
  assert.equal(d.status, 200);
  assert.equal(d.json.health.schema, "0015");
  assert.ok(d.json.lastTick?.at, "sem a última rodada do cron");
  assert.ok(Array.isArray(d.json.lastTick.stepErrors));
  const fail = d.json.failures.find((f: { code: string }) => f.code === "subrequest_limit");
  assert.ok(fail && fail.frase && !fail.frase.includes("subrequest_limit"));
  const text = JSON.stringify(d.json);
  for (const bad of ["gsk_", "dev@localhost", "TOKEN_KEYS", "csecret"]) assert.equal(text.includes(bad), false, bad);
});

test("exportar meus dados devolve JSON do dono sem segredos de conexão", async () => {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  await repo.insertFeed(ctx.db, ctx.keys, { ownerId, agentId: "codigo", runId: "r", kind: "ci_failure", title: "CI caiu", body: { summary: "detalhe" }, freshness: "fresh", coverage: null, now: ctx.now() });
  const r = await c.call("GET", "/api/export");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition") ?? "", /attachment; filename="open-dot-/);
  assert.equal(r.json.owner.email, "dev@localhost");
  assert.equal(r.json.feed[0].title, "CI caiu");
  assert.ok(Array.isArray(r.json.routines));
  const text = JSON.stringify(r.json);
  assert.equal(/token_enc|secret|id_hash|proposal_enc|refresh/i.test(text), false);
});

test("apagar tudo exige a frase de confirmação e apaga só o dono da sessão", async () => {
  const ctx = await makeCtx();
  const a = client(ctx);
  await a.call("POST", "/api/session/dev");
  const other = await repo.upsertOwner(ctx.db, { sub: "outro", email: "outro@example.com", name: null, now: ctx.now() });
  await repo.insertFeed(ctx.db, ctx.keys, { ownerId: other, agentId: "codigo", runId: "r", kind: "notice", title: "do outro", body: {}, freshness: "fresh", coverage: null, now: ctx.now() });
  assert.equal((await a.call("POST", "/api/account/delete", { confirm: "apagar" })).status, 400);
  const ok = await a.call("POST", "/api/account/delete", { confirm: "APAGAR TUDO" });
  assert.equal(ok.status, 200);
  assert.equal((await a.call("GET", "/api/session")).json.authenticated, false);
  const owners = await ctx.db.query<{ id: string }>("SELECT id FROM od_owners");
  assert.deepEqual(owners.map((o) => o.id), [other]);
  assert.equal((await ctx.db.query("SELECT id FROM od_feed_items WHERE owner_id = ?", [other])).length, 1);
});

test('apagar conta com dados Runner e memória respeita FK e preserva outro dono',async()=>{
 const ctx=await makeCtx();const web=client(ctx);await web.call('POST','/api/session/dev');
 const owner=(await ctx.db.query<{id:string}>('SELECT id FROM od_owners'))[0]!.id;
 const other=await repo.upsertOwner(ctx.db,{sub:'privacy-other',email:'privacy-other@example.invalid',name:null,now:ctx.now()});
 async function seed(who:string){
  const device=crypto.randomUUID(),task=crypto.randomUUID(),project=crypto.randomUUID();
  await ctx.db.batch([
   {sql:'INSERT INTO od_runner_devices(id,owner_id,name,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',args:[device,who,'Privacy fixture',crypto.randomUUID(),ctx.now()+1000,ctx.now()]},
   {sql:"INSERT INTO od_runner_tasks(id,owner_id,device_id,project_id,mechanism,prompt_enc,state,request_key,created_at,updated_at) VALUES(?,?,?,?,?,?,'uncertain',?,?,?)",args:[task,who,device,project,'codex','fixture encrypted placeholder',crypto.randomUUID(),ctx.now(),ctx.now()]},
   {sql:"INSERT INTO od_runner_events(task_id,seq,kind,payload_enc,created_at) VALUES(?,1,'status','fixture',?)",args:[task,ctx.now()]},
   {sql:"INSERT INTO od_runner_approvals(task_id,digest,proposal_enc,expires_at) VALUES(?,'fixture','fixture',?)",args:[task,ctx.now()+1000]},
   {sql:"INSERT INTO od_project_ledgers(owner_id,project_id,revision,payload_enc,updated_at) VALUES(?,?,1,'fixture',?)",args:[who,project,ctx.now()]},
   {sql:"INSERT INTO od_project_memory_policies(owner_id,project_id,revision,enabled,expires_at,operation_id) VALUES(?,?,1,1,?,'fixture')",args:[who,project,ctx.now()+1000]},
  ]);return {device,task};
 }
 try{
  await seed(owner);const kept=await seed(other);
  assert.equal((await web.call('POST','/api/account/delete',{confirm:'APAGAR TUDO'})).status,200);
  assert.deepEqual((await ctx.db.query<{id:string}>('SELECT id FROM od_runner_devices')).map(v=>v.id),[kept.device]);
  assert.deepEqual((await ctx.db.query<{task_id:string}>('SELECT task_id FROM od_runner_events')).map(v=>v.task_id),[kept.task]);
  assert.equal((await ctx.db.query('SELECT * FROM od_project_ledgers WHERE owner_id=?',[owner])).length,0);
  assert.equal((await ctx.db.query('SELECT * FROM od_project_memory_policies WHERE owner_id=?',[other])).length,1);
 }finally{ctx.db.raw.close();}
});

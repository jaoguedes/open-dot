// SPDX-License-Identifier: AGPL-3.0-only
import { readProjectMemory } from "../src/continuity/project-memory.ts";
import { startSession } from "../src/http.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteDb } from "../src/db/sqlite.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, client } from "./harness.ts";
import { EngineeringPlanSchema } from "../src/continuity/scheduler.ts";
import { sha256Hex } from "@open-dot/core";
import { seal, randomToken } from "../src/crypto.ts";

async function setup() {
  const ctx = await makeCtx(); const web = client(ctx); await web.call("POST", "/api/session/dev");
  const token = randomToken(), deviceId = crypto.randomUUID(), projectId = crypto.randomUUID();
  const owner = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  await ctx.db.run("INSERT INTO od_runner_devices(id,owner_id,name,token_hash,expires_at,created_at,seen_at,protocol_version,projects,capabilities) VALUES(?,?,?,?,?,?,?,?,?,?)", [deviceId, owner, "Fixture runner", await sha256Hex(token), ctx.now()+86400000, ctx.now(), ctx.now(), 2, JSON.stringify([{ id: projectId, label: "Fixture" }]), JSON.stringify([{ id: "codex", installed: true, authenticated: true, executable: true, reason: "Fixture only" }])]);
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  const plan = { requestKey: crypto.randomUUID(), deviceId, projectId, mechanism: "codex", title: "Fixture sequential plan", consent: "schedule-isolated-approved-tasks", worktreeConsent: true, tasks: [
    { id: a, phase: 0, title: "First", prompt: "Create first fixture file", dependencies: [], acceptance: "approved-files-applied" },
    { id: b, phase: 1, title: "Second independent worktree", prompt: "Create second fixture file", dependencies: [a], acceptance: "approved-files-applied" },
  ] };
  const headers = { authorization: `Bearer ${token}` };
  return { ctx, web, owner, deviceId, projectId, plan, headers };
}
async function claim(s: Awaited<ReturnType<typeof setup>>) { return s.web.call("POST", "/api/runner/device/claim", {}, s.headers); }
async function completeFixture(s: Awaited<ReturnType<typeof setup>>, task: string) {
  // Trusted-host receipts are fixture data, not model execution or native file writes.
  await s.ctx.db.run("INSERT INTO od_runner_approvals(task_id,digest,proposal_enc,decision,expires_at) VALUES(?,?,?,'approve',?)", [task, "a".repeat(64), await seal(s.ctx.keys, "fixture", `runner:proposal:${task}`), s.ctx.now()+60000]);
  assert.equal((await s.web.call("POST", `/api/runner/device/tasks/${task}/event`, { seq: 1, kind: "files", text: "Fixture applied file receipt" }, s.headers)).status, 200);
  assert.equal((await s.web.call("POST", `/api/runner/device/tasks/${task}/event`, { seq: 2, kind: "completed", text: "Fixture completed receipt" }, s.headers)).status, 200);
}
test("scheduler: authenticated plan reaches actual Runner claim, phases progress once with persisted receipts", async () => {
  const s = await setup();
  try {
    const created = await s.web.call("POST", "/api/runner/plans", s.plan); assert.equal(created.status, 201);
    assert.equal((await s.web.call("POST", "/api/runner/plans", s.plan)).json.id, created.json.id);
    assert.equal((await s.web.call("POST", "/api/runner/plans", { ...s.plan, title: "changed" })).status, 409);
    const claims = await Promise.all([claim(s), claim(s)]);
    assert.equal(claims.filter(r => r.json.task).length, 1);
    const first = claims.find(r => r.json.task)!.json.task;
    assert.equal(first.prompt, s.plan.tasks[0]!.prompt);
    assert.equal((await claim(s)).json.task, null);
    await completeFixture(s, first.id);
    const second = (await claim(s)).json.task; assert.ok(second); assert.equal(second.prompt, s.plan.tasks[1]!.prompt);
    await completeFixture(s, second.id);
    const result = (await s.web.call("GET", "/api/runner/plans")).json.plans[0];
    assert.equal(result.state, "completed"); assert.ok(result.tasks.every((t: { state: string }) => t.state === "completed"));
    assert.notEqual(result.tasks[0].attemptId, result.tasks[0].id); assert.notEqual(result.tasks[0].attemptId, first.id);
    assert.equal((await claim(s)).json.task, null);
    const rows = await s.ctx.db.query<{ n: number }>("SELECT COUNT(*) n FROM od_engineering_attempts"); assert.equal(rows[0]!.n, 2);
  } finally { s.ctx.db.raw.close(); }
});
test("scheduler: expired attempt fences chain, terminal result without approved files is uncertain", async () => {
  const s = await setup();
  try {
    await s.web.call("POST", "/api/runner/plans", s.plan); const first = (await claim(s)).json.task;
    s.ctx.clock.t += 31000;
    const plans = (await s.web.call("GET", "/api/runner/plans")).json.plans;
    assert.equal(plans[0].state, "uncertain"); assert.equal(plans[0].tasks[1].state, "pending");
    assert.equal((await s.web.call("POST", `/api/runner/plans/${plans[0].id}/state`, { state: "active", expectedRevision: plans[0].revision })).status, 409);
    assert.equal((await s.web.call("POST", `/api/runner/device/tasks/${first.id}/event`, { seq: 1, kind: "completed", text: "late" }, s.headers)).status, 409);
    assert.equal((await s.ctx.db.query<{ n: number }>("SELECT COUNT(*) n FROM od_engineering_attempts"))[0]!.n, 1);
  } finally { s.ctx.db.raw.close(); }
  const t = await setup();
  try {
    await t.web.call("POST", "/api/runner/plans", t.plan); const first = (await claim(t)).json.task;
    await t.web.call("POST", `/api/runner/device/tasks/${first.id}/event`, { seq: 1, kind: "completed", text: "No file proof" }, t.headers);
    assert.equal((await t.web.call("GET", "/api/runner/plans")).json.plans[0].state, "uncertain");
    assert.equal((await claim(t)).json.task, null);
  } finally { t.ctx.db.raw.close(); }
});
test("scheduler: schema rejects forward dependencies, cycles, reordered phases and privileges", () => {
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  const task = { id: a, phase: 0, title: "Fixture", prompt: "Fixture", dependencies: [b], acceptance: "approved-files-applied" };
  const plan = { requestKey: crypto.randomUUID(), deviceId: crypto.randomUUID(), projectId: crypto.randomUUID(), mechanism: "codex", title: "Fixture", consent: "schedule-isolated-approved-tasks", worktreeConsent: true, tasks: [task, { ...task, id: b, dependencies: [a] }] };
  assert.equal(EngineeringPlanSchema.safeParse(plan).success, false);
  assert.equal(EngineeringPlanSchema.safeParse({ ...plan, tasks: [{ ...task, dependencies: [], phase: 1 }, { ...task, id: b, dependencies: [], phase: 0 }] }).success, false);
  assert.equal(EngineeringPlanSchema.safeParse({ ...plan, shell: true }).success, false);
});
test("scheduler: pause, CAS, CSRF, other owner and unauthorized folders", async () => {
  const s = await setup();
  try {
    assert.equal((await client(s.ctx).call("POST", "/api/runner/plans", s.plan)).status, 401);
    assert.equal((await s.web.call("POST", "/api/runner/plans", s.plan, { "x-open-dot": "" })).status, 403);
    assert.equal((await s.web.call("POST", "/api/runner/plans", { ...s.plan, projectId: crypto.randomUUID() })).status, 403);
    const id = (await s.web.call("POST", "/api/runner/plans", s.plan)).json.id;
    assert.equal((await s.web.call("POST", `/api/runner/plans/${id}/state`, { state: "paused", expectedRevision: 1 })).status, 200);
    assert.equal((await s.web.call("POST", `/api/runner/plans/${id}/state`, { state: "active", expectedRevision: 1 })).status, 409);
    assert.equal((await claim(s)).json.task, null);
    assert.equal((await s.web.call("POST", `/api/runner/plans/${id}/state`, { state: "active", expectedRevision: 2 })).status, 200);
    assert.ok((await claim(s)).json.task);
    const encrypted = (await s.ctx.db.query<{ payload_enc: string }>("SELECT payload_enc FROM od_engineering_tasks"))[0]!.payload_enc;
    assert.ok(!encrypted.includes("Create first fixture"));
  } finally { s.ctx.db.raw.close(); }
});

test("scheduler: database reopen preserves assignment and blocks expired orphan replay", async () => {
  const s = await setup(); const dir = mkdtempSync(join(tmpdir(), "od-loop-reopen-"));
  const file = join(dir, "fixture.sqlite"); let db = s.ctx.db;
  try {
    await s.web.call("POST", "/api/runner/plans", s.plan);
    const first = (await claim(s)).json.task; assert.ok(first);
    db.raw.prepare("VACUUM INTO ?").run(file); db.raw.close(); db = new SqliteDb(file);
    const ctx = { ...s.ctx, db }; const web = client(ctx); web.setCookie(s.web.getCookie());
    const resumed = { ...s, ctx, web };
    assert.equal((await claim(resumed)).json.task, null);
    assert.equal((await web.call("GET", "/api/runner/plans")).json.plans[0].tasks[0].runnerTaskId, first.id);
    s.ctx.clock.t += 31000;
    assert.equal((await web.call("GET", "/api/runner/plans")).json.plans[0].state, "uncertain");
    assert.equal((await claim(resumed)).json.task, null);
    assert.equal((await db.query<{ n: number }>("SELECT COUNT(*) n FROM od_engineering_attempts"))[0]!.n, 1);
  } finally { db.raw.close(); rmSync(dir, { recursive: true }); }
});
test("scheduler: missing capability prevents dispatch and cross-owner control is denied", async () => {
  const s = await setup();
  try {
    const created = await s.web.call("POST", "/api/runner/plans", s.plan);
    await s.ctx.db.run("UPDATE od_runner_devices SET capabilities='[]' WHERE id=?", [s.deviceId]);
    assert.equal((await claim(s)).json.task, null);
    assert.equal((await s.ctx.db.query<{ n: number }>("SELECT COUNT(*) n FROM od_engineering_attempts"))[0]!.n, 0);
    await s.ctx.db.run("INSERT INTO od_owners(id,email,created_at) VALUES(?,?,?)", ["other-owner", "other@example.invalid", "2026-10-20"]);
    const other = client(s.ctx);
    other.setCookie((await startSession(s.ctx, new Request("http://localhost:8787"), "other-owner")).split(";")[0]!);
    assert.deepEqual((await other.call("GET", "/api/runner/plans")).json.plans, []);
    assert.equal((await other.call("POST", `/api/runner/plans/${created.json.id}/state`, { state: "paused", expectedRevision: 1 })).status, 409);
    assert.equal((await other.call("POST", "/api/runner/plans", { ...s.plan, requestKey: crypto.randomUUID(), tasks: s.plan.tasks.map(t => ({ ...t, id: crypto.randomUUID(), dependencies: [] })) })).status, 403);
  } finally { s.ctx.db.raw.close(); }
});
test("scheduler: an unavailable earlier project does not starve an eligible plan", async () => {
  const s = await setup();
  try {
    await s.web.call("POST", "/api/runner/plans", s.plan);
    const project = crypto.randomUUID();
    await s.ctx.db.run("UPDATE od_runner_devices SET projects=? WHERE id=?", [JSON.stringify([{ id: project, label: "Next fixture" }]), s.deviceId]);
    const next = { ...s.plan, requestKey: crypto.randomUUID(), projectId: project, tasks: s.plan.tasks.map(t => ({ ...t, id: crypto.randomUUID(), dependencies: [] })) };
    assert.equal((await s.web.call("POST", "/api/runner/plans", next)).status, 201);
    assert.equal((await claim(s)).json.task.projectId, project);
  } finally { s.ctx.db.raw.close(); }
});

async function consentMemory(s:Awaited<ReturnType<typeof setup>>) {
  assert.equal((await s.web.call("POST",`/api/projects/${s.projectId}/memory/consent`,{consent:"store-project-memory",expectedRevision:0,retentionDays:1})).status,200);
}
const memoryPlan=(s:Awaited<ReturnType<typeof setup>>)=>({...s.plan,rememberResults:true,tasks:[s.plan.tasks[0]]});
test("engineering memory: extra opt-in, existing consent, factual provenance and preserved requirements",async()=>{
  const s=await setup();try{
    assert.equal((await s.web.call("POST","/api/runner/plans",memoryPlan(s))).status,409);
    assert.equal((await s.ctx.db.query("SELECT id FROM od_engineering_plans")).length,0);
    await consentMemory(s);
    const requirement={id:crypto.randomUUID(),kind:"requirement",provenance:"user-provided",summary:"Prices need observation dates",sourceRefs:[],observedAt:"2026-10-20T12:00:00Z",commit:null};
    await s.web.call("POST",`/api/projects/${s.projectId}/memory`,{passport:{schemaVersion:1,scope:"memory-only",projectId:s.projectId,revision:1,memories:[requirement],links:[]},expectedRevision:0,consentRevision:1});
    assert.equal((await s.web.call("POST","/api/runner/plans",memoryPlan(s))).status,201);
    const first=(await claim(s)).json.task;await completeFixture(s,first.id);
    const plans=(await s.web.call("GET","/api/runner/plans")).json.plans;assert.equal(plans[0].tasks[0].memoryState,"recorded");
    const value=await readProjectMemory(s.ctx,s.owner,s.projectId);assert.equal(value!.revision,2);assert.equal(value!.memories.length,2);assert.deepEqual(value!.memories[0],requirement);
    const fact=value!.memories[1]!;assert.equal(fact.provenance,"external-evidence");assert.equal(fact.commit,null);assert.ok(fact.summary.includes("não foram executados"));assert.equal(fact.sourceRefs[0],`task:${s.plan.tasks[0]!.id}`);
    assert.ok(!JSON.stringify(value).includes(s.plan.tasks[0]!.prompt));
    await s.web.call("GET","/api/runner/plans");assert.equal((await readProjectMemory(s.ctx,s.owner,s.projectId))!.revision,2);
    await s.web.call("POST",`/api/projects/${s.projectId}/memory/forget`,{consent:"forget-project-memory",expectedConsentRevision:1});
    await s.web.call("GET","/api/runner/plans");assert.equal((await s.ctx.db.query("SELECT * FROM od_project_ledgers")).length,0);
  }finally{s.ctx.db.raw.close();}
});
test("engineering memory: lost receipt after durable ledger write does not duplicate facts",async()=>{
  const s=await setup();try{
    await consentMemory(s);await s.web.call("POST","/api/runner/plans",memoryPlan(s));const first=(await claim(s)).json.task;await completeFixture(s,first.id);
    const original=s.ctx.db.run.bind(s.ctx.db);let dropped=false;
    s.ctx.db.run=async(sql,args)=>{if(!dropped && sql.startsWith("UPDATE od_engineering_tasks SET memory_sync_state=") && args?.[0]==="recorded"){dropped=true;throw Error("Fixture lost receipt after ledger persisted");}return original(sql,args);};
    const firstRead=(await s.web.call("GET","/api/runner/plans")).json.plans[0];assert.equal(firstRead.tasks[0].memoryState,"retry_wait");
    assert.equal((await readProjectMemory(s.ctx,s.owner,s.projectId))!.revision,1);s.ctx.db.run=original;
    assert.equal((await s.web.call("GET","/api/runner/plans")).json.plans[0].tasks[0].memoryState,"recorded");
    const value=await readProjectMemory(s.ctx,s.owner,s.projectId);assert.equal(value!.revision,1);assert.equal(value!.memories.length,1);
  }finally{s.ctx.db.raw.close();}
});
test("engineering memory: concurrent forget prevents resurrection; retry budget cannot loop forever",async()=>{
  const s=await setup();try{
    await consentMemory(s);await s.web.call("POST","/api/runner/plans",memoryPlan(s));const first=(await claim(s)).json.task;await completeFixture(s,first.id);
    const original=s.ctx.db.run.bind(s.ctx.db);let revoked=false;
    s.ctx.db.run=async(sql,args)=>{if(!revoked && sql.startsWith("INSERT INTO od_project_ledgers")){revoked=true;assert.equal((await s.web.call("POST",`/api/projects/${s.projectId}/memory/forget`,{consent:"forget-project-memory",expectedConsentRevision:1})).status,200);}return original(sql,args);};
    await s.web.call("GET","/api/runner/plans");s.ctx.db.run=original;
    assert.equal((await s.web.call("GET","/api/runner/plans")).json.plans[0].tasks[0].memoryState,"consent_changed");
    assert.equal((await s.ctx.db.query("SELECT * FROM od_project_ledgers")).length,0);
  }finally{s.ctx.db.raw.close();}
  const t=await setup();try{
    await consentMemory(t);await t.web.call("POST","/api/runner/plans",memoryPlan(t));const first=(await claim(t)).json.task;await completeFixture(t,first.id);
    const original=t.ctx.db.run.bind(t.ctx.db);let writes=0;
    t.ctx.db.run=async(sql,args)=>{if(sql.startsWith("INSERT INTO od_project_ledgers")){writes++;throw Error("Fixture unavailable ledger");}return original(sql,args);};
    for(let n=0;n<5;n++)await t.web.call("GET","/api/runner/plans");
    const plan=(await t.web.call("GET","/api/runner/plans")).json.plans[0];assert.equal(plan.state,"completed");assert.equal(plan.tasks[0].memoryState,"blocked");assert.equal(writes,3);
  }finally{t.ctx.db.raw.close();}
});
test("engineering memory: disabled by default and task UUID aliases cannot create duplicates",async()=>{
  const s=await setup();try{
    await consentMemory(s);await s.web.call("POST","/api/runner/plans",{...s.plan,tasks:[s.plan.tasks[0]]});const first=(await claim(s)).json.task;await completeFixture(s,first.id);await s.web.call("GET","/api/runner/plans");
    assert.equal(await readProjectMemory(s.ctx,s.owner,s.projectId),null);
    assert.equal(EngineeringPlanSchema.safeParse({...s.plan,tasks:[s.plan.tasks[0],{...s.plan.tasks[0],id:s.plan.tasks[0]!.id.toUpperCase()}]}).success,false);
  }finally{s.ctx.db.raw.close();}
});

test('expert contract: persisted task reaches Runner claim with bounded quality context, not new permissions',async()=>{
 const s=await setup();try{
  const plan={...s.plan,tasks:[{...s.plan.tasks[0]!,expertId:'application-security'}]};
  assert.equal((await s.web.call('POST','/api/runner/plans',plan)).status,201);
  const dispatched=(await claim(s)).json.task;assert.ok(dispatched.prompt.includes('"expertId":"application-security"'));
  assert.ok(dispatched.prompt.includes('"executionAuthority":false'));assert.ok(dispatched.prompt.includes('"projectCommands":false'));
  await completeFixture(s,dispatched.id);
  const listed=(await s.web.call('GET','/api/runner/plans')).json.plans[0].tasks[0];
  assert.equal(listed.state,'completed');
  assert.equal(listed.expertId,'application-security');assert.equal(listed.qualityGate,'not-attested');
  const passport=(await s.web.call('POST',`/api/projects/${s.projectId}/passport`,{consent:'review-project-context'})).json.passport;
  assert.equal(passport.plans[0].tasks[0].expertVersion,1);assert.equal(passport.plans[0].tasks[0].qualityGate,'not-attested');
  assert.equal((await s.web.call('GET','/api/runner/experts')).json.executionAuthority,false);
  assert.equal((await client(s.ctx).call('GET','/api/runner/experts')).status,401);
  const invalid={...s.plan,requestKey:crypto.randomUUID(),tasks:[{...s.plan.tasks[1]!,dependencies:[],expertId:'unrestricted-shell'}]};
  assert.equal((await s.web.call('POST','/api/runner/plans',invalid)).status,400);
  const tooLarge={...invalid,tasks:[{...s.plan.tasks[1]!,dependencies:[],expertId:'qa-sdet',prompt:'x'.repeat(8000)}]};
  assert.equal((await s.web.call('POST','/api/runner/plans',tooLarge)).status,409);
  assert.equal((await s.ctx.db.query('SELECT * FROM od_engineering_plans')).length,1);
 }finally{s.ctx.db.raw.close();}
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, client } from "./harness.ts";
import { sha256Hex } from "@open-dot/core";
import { randomToken } from "../src/crypto.ts";
import { safeRunnerText } from "../src/runner/routes.ts";

async function setup() {
  const ctx = await makeCtx();
  const web = client(ctx);
  const native = client(ctx);
  assert.equal((await web.call("POST", "/api/session/dev")).status, 200);
  const token = randomToken();
  const secret = randomToken();
  const pairing = await native.call("POST", "/api/runner/pairings", { secretHash: await sha256Hex(secret), tokenHash: await sha256Hex(token), name: "Mac de teste" });
  assert.equal(pairing.status, 201);
  const approval = await web.call("POST", "/api/runner/pairings/approve", { code: pairing.json.code, name: "Mac de teste" });
  assert.equal(approval.status, 201);
  const headers = { authorization: `Bearer ${token}` };
  const projectId = crypto.randomUUID();
  const beat = {
    projects: [{ id: projectId, label: "Projeto teste" }],
    drivers: [{ id: "codex", installed: true, authenticated: true, executable: true, reason: "Adaptador falso de teste; não valida CLI" }],
  };
  return { ctx, web, native, headers, token, secret, pairing, deviceId: approval.json.deviceId as string, projectId, beat };
}
test("Runner: pareamento exige sessão, CSRF, nome exato, posse e uso único", async () => {
  const s = await setup();
  assert.equal((await s.native.call("POST", "/api/runner/pairings/approve", { code: s.pairing.json.code, name: "Mac de teste" })).status, 401);
  assert.equal((await s.web.call("POST", "/api/runner/pairings/approve", { code: s.pairing.json.code, name: "Mac de teste" })).status, 409);
  assert.equal((await s.native.call("POST", `/api/runner/pairings/${s.pairing.json.id}/status`, { secret: randomToken() })).status, 410);
  const status = await s.native.call("POST", `/api/runner/pairings/${s.pairing.json.id}/status`, { secret: s.secret });
  assert.equal(status.json.deviceId, s.deviceId);
  assert.ok(!JSON.stringify(status.json).includes(s.token));
  s.ctx.clock.t += 300_001;
  assert.equal((await s.native.call("POST", `/api/runner/pairings/${s.pairing.json.id}/status`, { secret: s.secret })).status, 410);
  s.ctx.db.raw.close();
});
test("Runner: presença expira, capacidades reais controlam envio e pasta não vem do browser", async () => {
  const s = await setup();
  const task = { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "teste", requestKey: crypto.randomUUID() };
  assert.equal((await s.web.call("POST", "/api/runner/tasks", task)).status, 409);
  assert.equal((await s.native.call("POST", "/api/runner/device/heartbeat", s.beat, s.headers)).status, 200);
  assert.equal((await s.web.call("GET", "/api/runner/devices")).json.devices[0].online, true);
  assert.equal((await s.web.call("POST", "/api/runner/tasks", { ...task, projectId: crypto.randomUUID() })).status, 403);
  assert.equal((await s.web.call("POST", "/api/runner/tasks", { ...task, path: "/etc" })).status, 400);
  await s.native.call("POST", "/api/runner/device/heartbeat", { ...s.beat, drivers: s.beat.drivers.map((d) => ({ ...d, executable: false })) }, s.headers);
  assert.equal((await s.web.call("POST", "/api/runner/tasks", task)).status, 409);
  s.ctx.clock.t += 31_000;
  assert.equal((await s.web.call("GET", "/api/runner/devices")).json.devices[0].online, false);
  s.ctx.db.raw.close();
});
test("Runner: claim concorrente único, reconexão não repete tarefa e conteúdo cifrado", async () => {
  const s = await setup();
  await s.native.call("POST", "/api/runner/device/heartbeat", s.beat, s.headers);
  const task = { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "conteúdo privado único", requestKey: crypto.randomUUID() };
  const created = await s.web.call("POST", "/api/runner/tasks", task);
  assert.equal(created.status, 201);
  assert.equal((await s.web.call("POST", "/api/runner/tasks", task)).json.id, created.json.id);
  const claims = await Promise.all([s.native.call("POST", "/api/runner/device/claim", {}, s.headers), s.native.call("POST", "/api/runner/device/claim", {}, s.headers)]);
  assert.equal(claims.filter((r) => r.json.task).length, 1);
  assert.equal(claims.find((r) => r.json.task)!.json.task.prompt, task.prompt);
  assert.equal((await s.native.call("POST", "/api/runner/device/claim", {}, s.headers)).json.task, null);
  const eventPath = `/api/runner/device/tasks/${created.json.id}/event`;
  const event = { seq: 1, kind: "message", text: "password=not-for-frontend resultado" };
  assert.equal((await s.native.call("POST", eventPath, event, s.headers)).status, 200);
  assert.equal((await s.native.call("POST", eventPath, event, s.headers)).json.duplicate, true);
  const events = await s.web.call("GET", `/api/runner/tasks/${created.json.id}/events`);
  assert.ok(!JSON.stringify(events.json).includes("not-for-frontend"));
  const rows = await s.ctx.db.query("SELECT prompt_enc FROM od_runner_tasks");
  assert.ok(!JSON.stringify(rows).includes(task.prompt));
  assert.equal((await s.native.call("POST", eventPath, { seq: 2, kind: "completed", text: "fim" }, s.headers)).status, 200);
  assert.equal((await s.native.call("POST", eventPath, { seq: 3, kind: "message", text: "após fim" }, s.headers)).status, 409);
  s.ctx.db.raw.close();
});
test("Runner: revogação invalida bearer e cancela fila; outro dispositivo não lê tarefa", async () => {
  const s = await setup();
  await s.native.call("POST", "/api/runner/device/heartbeat", s.beat, s.headers);
  const created = await s.web.call("POST", "/api/runner/tasks", { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "teste", requestKey: crypto.randomUUID() });
  const otherToken = randomToken();
  await s.ctx.db.run("INSERT INTO od_runner_devices(id,owner_id,name,token_hash,expires_at,created_at) SELECT ?,owner_id,'Outro',?,?,? FROM od_runner_devices WHERE id=?", [
    crypto.randomUUID(),
    await sha256Hex(otherToken),
    s.ctx.now() + 100000,
    s.ctx.now(),
    s.deviceId,
  ]);
  assert.equal(
    (await s.native.call("POST", `/api/runner/device/tasks/${created.json.id}/event`, { seq: 1, kind: "completed", text: "forjado" }, { authorization: `Bearer ${otherToken}` })).status,
    404,
  );
  await s.web.call("POST", `/api/runner/devices/${s.deviceId}/revoke`);
  assert.equal((await s.native.call("POST", "/api/runner/device/heartbeat", s.beat, s.headers)).status, 401);
  assert.equal((await s.native.call("POST", "/api/runner/device/claim", {}, s.headers)).status, 401);
  assert.equal((await s.web.call("GET", "/api/runner/tasks")).json.tasks[0].state, "cancelled");
  assert.equal((await s.web.call("GET", "/api/runner/devices")).json.devices.find((d: { id: string }) => d.id === s.deviceId).online, false);
  s.ctx.db.raw.close();
});
test("Runner: filtros de log não são DLP e removem formatos comuns", () => {
  const output = safeRunnerText("Bearer abc.def api_key=private-value\n-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----"); // scan-secrets: teste — PEM fictício para validar a remoção
  assert.ok(!output.includes("abc.def"));
  assert.ok(!output.includes("private-value"));
  assert.ok(!output.includes("\nprivate\n"));
});
test("Runner: isolamento por dono e CSRF também cobrem dispositivos, tarefas e eventos", async () => {
  const s = await setup();
  const { upsertOwner } = await import("../src/repo.ts");
  const { startSession } = await import("../src/http.ts");
  const second = await upsertOwner(s.ctx.db, { sub: "runner-owner-b", email: "runner-b@example.com", name: "B", now: s.ctx.now() });
  const b = client(s.ctx);
  b.setCookie((await startSession(s.ctx, new Request("http://localhost:8787/"), second)).split(";")[0]!);
  await s.native.call("POST", "/api/runner/device/heartbeat", s.beat, s.headers);
  const created = await s.web.call("POST", "/api/runner/tasks", { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "privado", requestKey: crypto.randomUUID() });
  assert.equal((await b.call("GET", "/api/runner/devices")).json.devices.length, 0);
  assert.equal((await b.call("GET", "/api/runner/tasks")).json.tasks.length, 0);
  assert.equal((await b.call("GET", `/api/runner/tasks/${created.json.id}/events`)).status, 404);
  await b.call("POST", `/api/runner/devices/${s.deviceId}/revoke`);
  assert.equal((await s.native.call("POST", "/api/runner/device/heartbeat", s.beat, s.headers)).status, 200);
  assert.equal((await s.web.call("POST", `/api/runner/devices/${s.deviceId}/revoke`, {}, { "x-open-dot": "0" })).status, 403);
  assert.equal((await s.web.call("POST", `/api/runner/tasks/${created.json.id}/cancel`, {}, { origin: "https://untrusted.example" })).status, 403);
  s.ctx.db.raw.close();
});
test("Runner: limite de corpo e pareamentos concorrentes limitam a entrada anônima", async () => {
  const ctx = await makeCtx();
  const native = client(ctx);
  assert.equal((await native.call("POST", "/api/runner/pairings", { name: "x".repeat(33000) })).status, 400);
  const responses = await Promise.all(
    Array.from({ length: 32 }, async () => native.call("POST", "/api/runner/pairings", { secretHash: await sha256Hex(randomToken()), tokenHash: await sha256Hex(randomToken()), name: "Teste" })),
  );
  assert.equal(responses.filter((r) => r.status === 201).length, 30);
  assert.equal(responses.filter((r) => r.status === 429).length, 2);
  ctx.db.raw.close();
});

test("Runner: aprovação de proposta é vinculada ao conteúdo exato, expira e só vale uma vez", async () => {
  const s=await setup();await s.native.call("POST","/api/runner/device/heartbeat",s.beat,s.headers);
  const created=await s.web.call("POST","/api/runner/tasks",{deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"propor edição",requestKey:crypto.randomUUID()});
  const taskId=created.json.id;
  await s.native.call("POST","/api/runner/device/claim",{},s.headers);
  const text=JSON.stringify({summary:"Arquivo proposto, ainda não aplicado",files:[{path:"README.md",content:"conteúdo aprovado\n",beforeHash:null}]});
  const event=await s.native.call("POST",`/api/runner/device/tasks/${taskId}/event`,{seq:1,kind:"proposal",text},s.headers);assert.equal(event.status,200);
  const hash=event.json.proposalHash;assert.equal(hash,await sha256Hex(text));
  assert.equal((await s.web.call("GET","/api/runner/tasks")).json.tasks[0].state,"awaiting_approval");
  const events=await s.web.call("GET",`/api/runner/tasks/${taskId}/events`);assert.equal(events.json.approval.hash,hash);assert.equal(events.json.approval.decision,"pending");
  assert.equal((await s.web.call("POST",`/api/runner/tasks/${taskId}/decision`,{hash:"0".repeat(64),decision:"approve"})).status,409);
  assert.equal((await s.web.call("POST",`/api/runner/tasks/${taskId}/decision`,{hash,decision:"approve"},{"x-open-dot":"0"})).status,403);
  assert.equal((await s.native.call("POST",`/api/runner/tasks/${taskId}/decision`,{hash,decision:"approve"})).status,401);
  const decisions=await Promise.all([s.web.call("POST",`/api/runner/tasks/${taskId}/decision`,{hash,decision:"approve"}),s.web.call("POST",`/api/runner/tasks/${taskId}/decision`,{hash,decision:"approve"})]);assert.equal(decisions.filter(r=>r.status===200).length,1);assert.equal(decisions.filter(r=>r.status===409).length,1);
  assert.equal((await s.web.call("GET","/api/runner/tasks")).json.tasks[0].state,"running");
  const decision=await s.native.call("GET",`/api/runner/device/tasks/${taskId}/approval`,undefined,s.headers);assert.equal(decision.json.hash,hash);assert.equal(decision.json.decision,"approve");assert.equal(decision.json.proposal.files[0].content,"conteúdo aprovado\n");
  assert.equal((await s.native.call("POST",`/api/runner/device/tasks/${taskId}/event`,{seq:2,kind:"proposal",text:text.replace("aprovado","alterado")},s.headers)).status,409);
  s.ctx.db.raw.close();
});
test("Runner: rejeição, revogação e expiração não liberam a proposta",async()=>{
  for(const mode of ["reject","revoke","expire"]){
    const s=await setup();await s.native.call("POST","/api/runner/device/heartbeat",s.beat,s.headers);
    const taskId=(await s.web.call("POST","/api/runner/tasks",{deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"teste",requestKey:crypto.randomUUID()})).json.id;
    await s.native.call("POST","/api/runner/device/claim",{},s.headers);
    const proposal=await s.native.call("POST",`/api/runner/device/tasks/${taskId}/event`,{seq:1,kind:"proposal",text:JSON.stringify({summary:"teste",files:[{path:"file.txt",content:"safe",beforeHash:null}]})},s.headers);const hash=proposal.json.proposalHash;
    if(mode==="reject"){assert.equal((await s.web.call("POST",`/api/runner/tasks/${taskId}/decision`,{hash,decision:"reject"})).status,200);assert.equal((await s.web.call("GET","/api/runner/tasks")).json.tasks[0].state,"cancelled");}
    if(mode==="revoke")await s.web.call("POST",`/api/runner/devices/${s.deviceId}/revoke`);
    if(mode==="expire")s.ctx.clock.t+=600_001;
    assert.equal((await s.web.call("POST",`/api/runner/tasks/${taskId}/decision`,{hash,decision:"approve"})).status,409);
    s.ctx.db.raw.close();
  }
});


test("recuperação lista só tarefas ativas do dispositivo, sem prompt, e libera fila após falha honesta", async () => {
  const s = await setup();
  await s.native.call("POST", "/api/runner/device/heartbeat", s.beat, s.headers);
  const create = () => s.web.call("POST", "/api/runner/tasks", {deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"private fixture context",requestKey:crypto.randomUUID()});
  await create();await create();
  assert.equal((await s.native.call("GET","/api/runner/device/active")).status,401);
  assert.deepEqual((await s.native.call("GET","/api/runner/device/active",undefined,s.headers)).json.active,[]);
  const claimed=await s.native.call("POST","/api/runner/device/claim",{},s.headers);
  const recovered=await s.native.call("GET","/api/runner/device/active",undefined,s.headers);
  assert.deepEqual(recovered.json.active,[{id:claimed.json.task.id,projectId:s.projectId,seq:0}]);
  assert.ok(!JSON.stringify(recovered.json).includes("private fixture context"));
  const other=await setup();
  assert.deepEqual((await other.native.call("GET","/api/runner/device/active",undefined,other.headers)).json.active,[]);
  assert.equal((await s.native.call("POST",`/api/runner/device/tasks/${claimed.json.task.id}/event`,{seq:1,kind:"failed",text:"Journal absent; effects unknown; no replay."},s.headers)).status,200);
  assert.deepEqual((await s.native.call("GET","/api/runner/device/active",undefined,s.headers)).json.active,[]);
  assert.ok((await s.native.call("POST","/api/runner/device/claim",{},s.headers)).json.task);
  other.ctx.db.raw.close();s.ctx.db.raw.close();
});


test("orçamento de eventos preserva uma conclusão mesmo após excesso de progresso",async()=>{
 const s=await setup();try{
  await s.native.call("POST","/api/runner/device/heartbeat",s.beat,s.headers);
  const t=await s.web.call("POST","/api/runner/tasks",{deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"budget fixture",requestKey:crypto.randomUUID()});
  await s.native.call("POST","/api/runner/device/claim",{},s.headers);
  const path=`/api/runner/device/tasks/${t.json.id}/event`;
  assert.equal((await s.native.call("POST",path,{seq:490,kind:"status",text:"bounded progress"},s.headers)).status,200);
  for(const [kind,seq]of [["status",491],["message",491],["proposal",497],["files",499],["tests",500]]as const){
   const r=await s.native.call("POST",path,{seq,kind,text:"over budget"},s.headers);assert.equal(r.status,409);assert.equal(r.json.error.code,"event_budget");
  }
  assert.equal((await s.native.call("POST",path,{seq:491,kind:"failed",text:"Progress bounded; no new effects."},s.headers)).status,200);
  assert.deepEqual((await s.native.call("GET","/api/runner/device/active",undefined,s.headers)).json.active,[]);
 }finally{s.ctx.db.raw.close();}
});

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
    protocol:{version:2,approval:"sha256-utf8-json-v1",capabilities:["exact-content-approval","uncertain-terminal","lease-fencing","event-receipts","worktree-consent","review-before-content"]},
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
  const task = { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "teste", "worktreeConsent":true,requestKey: crypto.randomUUID() };
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
  const task = { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "conteúdo privado único", "worktreeConsent":true,requestKey: crypto.randomUUID() };
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
  const created = await s.web.call("POST", "/api/runner/tasks", { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "teste", "worktreeConsent":true,requestKey: crypto.randomUUID() });
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
  const created = await s.web.call("POST", "/api/runner/tasks", { deviceId: s.deviceId, projectId: s.projectId, mechanism: "codex", prompt: "privado", "worktreeConsent":true,requestKey: crypto.randomUUID() });
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
  // Mesma origem: limite por origem (OD2-CLAUDE-03). Outras origens são cobertas em rate-limit.test.ts.
  assert.equal(responses.filter((r) => r.status === 201).length, 5);
  assert.equal(responses.filter((r) => r.status === 429).length, 27);
  ctx.db.raw.close();
});

test("Runner: aprovação de proposta é vinculada ao conteúdo exato, expira e só vale uma vez", async () => {
  const s=await setup();await s.native.call("POST","/api/runner/device/heartbeat",s.beat,s.headers);
  const created=await s.web.call("POST","/api/runner/tasks",{deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"propor edição","worktreeConsent":true,requestKey:crypto.randomUUID()});
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
    const taskId=(await s.web.call("POST","/api/runner/tasks",{deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"teste","worktreeConsent":true,requestKey:crypto.randomUUID()})).json.id;
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
  const create = () => s.web.call("POST", "/api/runner/tasks", {deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"private fixture context","worktreeConsent":true,requestKey:crypto.randomUUID()});
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
  const t=await s.web.call("POST","/api/runner/tasks",{deviceId:s.deviceId,projectId:s.projectId,mechanism:"codex",prompt:"budget fixture","worktreeConsent":true,requestKey:crypto.randomUUID()});
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

// SQLite e roteador reais; relógio controlado, executor é fixture explicitamente.
test("P0: cancelamento running é pedido, timeout vira uncertain e não repete tentativa",async()=>{
 const s=await setup();try{
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
  const create=async()=> (await s.web.call('POST','/api/runner/tasks',{deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'lifecycle fixture',"worktreeConsent":true,requestKey:crypto.randomUUID()})).json.id;
  const first=await create();s.ctx.clock.t++;const second=await create();
  assert.equal((await s.native.call('POST','/api/runner/device/claim',{},s.headers)).json.task.id,first);
  const requests=await Promise.all([s.web.call('POST',`/api/runner/tasks/${first}/cancel`,{}),s.web.call('POST',`/api/runner/tasks/${first}/cancel`,{})]);assert.ok(requests.every(r=>r.status===200));
  assert.equal((await s.web.call('GET','/api/runner/tasks')).json.tasks.find((t:{id:string})=>t.id===first).state,'cancel_requested');
  assert.equal((await s.native.call('POST','/api/runner/device/claim',{},s.headers)).json.task,null);
  s.ctx.clock.t+=31_000; // perda de rede: nenhum ACK de parada
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
  assert.equal((await s.web.call('GET','/api/runner/tasks')).json.tasks.find((t:{id:string})=>t.id===first).state,'uncertain');
  assert.equal((await s.native.call('POST',`/api/runner/device/tasks/${first}/event`,{seq:1,kind:'completed',text:'late completion'},s.headers)).status,409);
  const claims=await Promise.all([s.native.call('POST','/api/runner/device/claim',{},s.headers),s.native.call('POST','/api/runner/device/claim',{},s.headers)]);
  assert.deepEqual(claims.filter(r=>r.json.task).map(r=>r.json.task.id),[second]);
 }finally{s.ctx.db.raw.close();}
});
test("P0: ACK de parada, conclusão tardia e revogação têm semânticas distintas",async()=>{
 for(const mode of ['ack','late','revoke','lease','queued']as const){
  const s=await setup();try{
   await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
   const id=(await s.web.call('POST','/api/runner/tasks',{deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'fixture',"worktreeConsent":true,requestKey:crypto.randomUUID()})).json.id;
   if(mode!=='queued')await s.native.call('POST','/api/runner/device/claim',{},s.headers);
   if(mode==='revoke'){
    await s.web.call('POST',`/api/runner/devices/${s.deviceId}/revoke`,{});
    assert.equal((await s.native.call('POST',`/api/runner/device/tasks/${id}/event`,{seq:1,kind:'completed',text:'late'},s.headers)).status,401);
   }else if(mode==='lease'){s.ctx.clock.t+=31_000;}
   else{
    await s.web.call('POST',`/api/runner/tasks/${id}/cancel`,{});
    if(mode!=='queued')assert.equal((await s.native.call('POST',`/api/runner/device/tasks/${id}/event`,{seq:1,kind:mode==='ack'?'cancelled':'completed',text:'executor fixture stopped'},s.headers)).status,200);
   }
   assert.equal((await s.web.call('GET','/api/runner/tasks')).json.tasks[0].state,['ack','queued'].includes(mode)?'cancelled':'uncertain');
  }finally{s.ctx.db.raw.close();}
 }
});
test("P1-6: recibos duplicados exigem conteúdo idêntico e rejeitam eventos atrasados",async()=>{
 const s=await setup();try{
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
  const id=(await s.web.call('POST','/api/runner/tasks',{deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'fixture',"worktreeConsent":true,requestKey:crypto.randomUUID()})).json.id;
  await s.native.call('POST','/api/runner/device/claim',{},s.headers);
  const path=`/api/runner/device/tasks/${id}/event`;const event={seq:2,kind:'message',text:'exact fixture'};
  const raced=await Promise.all([s.native.call('POST',path,event,s.headers),s.native.call('POST',path,event,s.headers)]);
  assert.ok(raced.some(r=>r.status===200));
  assert.equal((await s.native.call('POST',path,event,s.headers)).json.duplicate,true);
  assert.equal((await s.native.call('POST',path,{...event,text:'different'},s.headers)).status,409);
  assert.equal((await s.native.call('POST',path,{...event,seq:1},s.headers)).status,409);
  assert.equal((await s.web.call('GET',`/api/runner/tasks/${id}/events`)).json.events.length,1);
  // Força mudança de estado entre a leitura do handler e seu batch, como outra transação.
  const original=s.ctx.db.batch.bind(s.ctx.db);let injected=false;
  s.ctx.db.batch=async stmts=>{if(!injected&&stmts.some(v=>v.sql.startsWith('INSERT INTO od_runner_events'))){injected=true;await s.ctx.db.run("UPDATE od_runner_tasks SET state='uncertain' WHERE id=?",[id]);}return original(stmts);};
  assert.equal((await s.native.call('POST',path,{seq:3,kind:'completed',text:'raced'},s.headers)).status,409);
  assert.equal((await s.web.call('GET',`/api/runner/tasks/${id}/events`)).json.events.length,1);
 }finally{s.ctx.db.raw.close();}
});
test("P1-3: heartbeat transport não concede compatibilidade a Runner antigo ou contrato diferente",async()=>{
 const s=await setup();try{
  const server=await s.native.call('GET','/api/runner/protocol');assert.equal(server.json.schemaReady,true);assert.equal(server.json.version,2);
  for(const protocol of [undefined,{...s.beat.protocol,version:1},{...s.beat.protocol,approval:'different-contract'},{...s.beat.protocol,capabilities:[]}]){
   const beat=await s.native.call('POST','/api/runner/device/heartbeat',{...s.beat,protocol},s.headers);
   assert.equal(beat.json.compatible,false);
   const device=(await s.web.call('GET','/api/runner/devices')).json.devices[0];assert.equal(device.online,true);assert.equal(device.compatible,false);
   assert.equal((await s.web.call('POST','/api/runner/tasks',{deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'fixture',"worktreeConsent":true,requestKey:crypto.randomUUID()})).json.error.code,'runner_incompatible');
   assert.equal((await s.native.call('POST','/api/runner/device/claim',{},s.headers)).status,409);
  }
  assert.equal((await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers)).json.compatible,true);
 }finally{s.ctx.db.raw.close();}
});
test("P1-4: revogação pelo bearer nativo invalida imediatamente a própria credencial",async()=>{
 const s=await setup();try{
  assert.equal((await s.native.call('POST','/api/runner/device/revoke',{},s.headers)).json.revoked,true);
  assert.equal((await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers)).status,401);
  assert.equal((await s.native.call('POST','/api/runner/device/revoke',{},s.headers)).status,401);
 }finally{s.ctx.db.raw.close();}
});
test("P1-1: preparação de metadados Git exige consentimento explícito antes do claim",async()=>{
 const s=await setup();try{
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
  const base={deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'fixture',requestKey:crypto.randomUUID()};
  assert.equal((await s.web.call('POST','/api/runner/tasks',base)).status,400);
  assert.equal((await s.web.call('POST','/api/runner/tasks',{...base,worktreeConsent:false})).status,400);
  assert.equal((await s.web.call('POST','/api/runner/tasks',{...base,worktreeConsent:true})).status,201);
  assert.equal((await s.native.call('POST','/api/runner/device/claim',{},s.headers)).json.task.worktreeConsent,true);
 }finally{s.ctx.db.raw.close();}
});
test("P1-5: aprovação expõe bytes originais e rejeita substituição sem conteúdo anterior verificável",async()=>{
 const s=await setup();try{
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
  const id=(await s.web.call('POST','/api/runner/tasks',{deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'fixture',worktreeConsent:true,requestKey:crypto.randomUUID()})).json.id;
  await s.native.call('POST','/api/runner/device/claim',{},s.headers);
  const before='prévio 東京\n';const proposal={summary:'Unicode exact review',files:[{path:'ação.txt',content:'novo 🟣\n\u202e',beforeHash:await sha256Hex(before)}]};
  const path=`/api/runner/device/tasks/${id}/event`;
  assert.equal((await s.native.call('POST',path,{seq:1,kind:'proposal',text:JSON.stringify(proposal)},s.headers)).status,400);
  const raw=JSON.stringify({...proposal,files:[{...proposal.files[0],beforeContent:before}]});
  assert.equal((await s.native.call('POST',path,{seq:1,kind:'proposal',text:raw},s.headers)).status,200);
  const receipt=(await s.web.call('GET',`/api/runner/tasks/${id}/events`)).json.approval;
  assert.equal(receipt.raw,raw);assert.equal(receipt.hash,await sha256Hex(raw));assert.equal(JSON.parse(receipt.raw).files[0].beforeContent,before);
 }finally{s.ctx.db.raw.close();}
});
test("P0/P2: lease tem teto, legacy saturado não prende fila e expiração bloqueia aprovação",async()=>{
 const s=await setup();try{
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
  const create=async()=> (await s.web.call('POST','/api/runner/tasks',{deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'fixture',worktreeConsent:true,requestKey:crypto.randomUUID()})).json.id;
  const id=await create();await s.native.call('POST','/api/runner/device/claim',{},s.headers);
  // Fixture representa banco legado já saturado, sem inventar recibo terminal.
  await s.ctx.db.run('INSERT INTO od_runner_events(task_id,seq,kind,payload_enc,created_at) VALUES(?,500,?,?,?)',[id,'status','legacy cipher not read in this test',s.ctx.now()]);
  await s.ctx.db.run('UPDATE od_runner_tasks SET lease_until=NULL WHERE id=?',[id]);
  await s.native.call('GET','/api/runner/device/active',undefined,s.headers);
  assert.equal((await s.web.call('GET','/api/runner/tasks')).json.tasks[0].state,'uncertain');
  assert.equal((await s.ctx.db.query<{n:number}>('SELECT COUNT(*) AS n FROM od_runner_events WHERE task_id=?',[id]))[0]!.n,1);
  const next=await create();await s.native.call('POST','/api/runner/device/claim',{},s.headers);
  const proposal=await s.native.call('POST',`/api/runner/device/tasks/${next}/event`,{seq:1,kind:'proposal',text:JSON.stringify({summary:'fixture',files:[{path:'new.txt',content:'x',beforeHash:null}]})},s.headers);
  // Heartbeat não estende indefinidamente o prazo absoluto da tentativa.
  await s.ctx.db.run('UPDATE od_runner_tasks SET attempt_deadline=? WHERE id=?',[s.ctx.now()+1000,next]);
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);s.ctx.clock.t+=1001;
  assert.equal((await s.web.call('POST',`/api/runner/tasks/${next}/decision`,{hash:proposal.json.proposalHash,decision:'approve'})).status,409);
  assert.equal((await s.web.call('GET','/api/runner/tasks')).json.tasks.find((t:{id:string})=>t.id===next).state,'uncertain');
 }finally{s.ctx.db.raw.close();}
});
test('P1-6: proposta concorrente não recebe accepted sem persistir a aprovação correspondente',async()=>{
 const s=await setup();try{
  await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers);
  const id=(await s.web.call('POST','/api/runner/tasks',{deviceId:s.deviceId,projectId:s.projectId,mechanism:'codex',prompt:'fixture',worktreeConsent:true,requestKey:crypto.randomUUID()})).json.id;
  await s.native.call('POST','/api/runner/device/claim',{},s.headers);
  const path=`/api/runner/device/tasks/${id}/event`;const text=JSON.stringify({summary:'fixture',files:[{path:'one.txt',content:'original proposal',beforeHash:null}]});
  const first=await s.native.call('POST',path,{seq:1,kind:'proposal',text},s.headers);
  await s.web.call('POST',`/api/runner/tasks/${id}/decision`,{hash:first.json.proposalHash,decision:'approve'});
  const original=s.ctx.db.query.bind(s.ctx.db);
  // Leitura stale equivalente a outra transação concluir aprovação antes do batch.
  s.ctx.db.query=async<T>(sql:string,args:import('../src/db/types.ts').SqlValue[]=[]):Promise<T[]>=>sql.startsWith('SELECT task_id FROM od_runner_approvals')?[]:original<T>(sql,args);
  const raced=await s.native.call('POST',path,{seq:2,kind:'proposal',text:text.replace('original proposal','raced proposal')},s.headers);
  assert.equal(raced.status,409);
  assert.equal((await s.web.call('GET',`/api/runner/tasks/${id}/events`)).json.events.length,1);
  assert.equal((await s.web.call('GET','/api/runner/tasks')).json.tasks[0].state,'running');
 }finally{s.ctx.db.raw.close();}
});

test('capability registry: optional discovery preserves old clients and rejects contradictory execution claims',async()=>{
 const s=await setup();try{
  assert.equal((await s.native.call('GET','/api/runner/protocol')).json.driverFeaturesVersion,1);
  assert.equal((await s.native.call('POST','/api/runner/device/heartbeat',s.beat,s.headers)).status,200);
  const features={version:1,proposalGeneration:true,approvedHostWrites:true,recovery:'approved-proposal-only',projectCommands:false,modelsDiscovered:false,evidence:'local-preflight'};
  const beat={...s.beat,drivers:[{...s.beat.drivers[0],features}]};
  assert.equal((await s.native.call('POST','/api/runner/device/heartbeat',beat,s.headers)).status,200);
  const listed=(await s.web.call('GET','/api/runner/devices')).json.devices[0];assert.deepEqual(listed.drivers[0].features,features);
  for(const bad of [
   {...beat.drivers[0],authenticated:false},
   {...beat.drivers[0],id:'claude-code'},
   {...beat.drivers[0],features:{...features,projectCommands:true}},
   {...beat.drivers[0],features:{...features,modelsDiscovered:true}},
   {...beat.drivers[0],features:{...features,version:2}},
  ])assert.equal((await s.native.call('POST','/api/runner/device/heartbeat',{...s.beat,drivers:[bad]},s.headers)).status,400);
  assert.deepEqual((await s.web.call('GET','/api/runner/devices')).json.devices[0].drivers[0].features,features);
 }finally{s.ctx.db.raw.close();}
});

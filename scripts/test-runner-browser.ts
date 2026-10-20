import { randomToken } from "../apps/worker/src/crypto.ts";
import { sha256Hex } from "@open-dot/core";
import AxeBuilder from "@axe-core/playwright";
/** Integração real: navegador Workspace -> decisão HTTP/SQLite -> executor nativo/Codex.
 * Pareamento, seleção de pasta e criação do prompt ainda feitos pelo helper nativo.
 * Não é E2E da janela/tray Tauri. Uma chamada real ChatGPT, nunca fallback de API paga.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { makeCtx } from "../apps/worker/test/harness.ts";
import { handleApi } from "../apps/worker/src/app.ts";
const ctx=await makeCtx({now:()=>Date.now()});
const dist=resolve("apps/web/dist");
assert.ok(existsSync(resolve(dist,"index.html")),"Compile a web antes do teste");
let origin="";
const mime:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json",".woff":"font/woff",".woff2":"font/woff2",".png":"image/png",".glb":"model/gltf-binary"};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url??"/",origin);
  if(!url.pathname.startsWith('/api/')){
   let file=resolve(dist,'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
   if(!existsSync(file)||statSync(file).isDirectory())file=resolve(dist,'index.html');
   res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(readFileSync(file));return;
  }
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req){size+=chunk.length;if(size>32000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  const result=await handleApi(ctx,new Request(url,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}));
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end();}
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
origin=`http://127.0.0.1:${address.port}`;ctx.env.APP_ORIGIN=origin;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1100,height:900}});const page=await context.newPage();page.setDefaultTimeout((process.argv.includes('--memory-only')||process.argv.includes('--plans-only'))?30_000:300_000);
const memoryOnly=process.argv.includes("--memory-only"), plansOnly=process.argv.includes("--plans-only");
const child=(memoryOnly||plansOnly)?null:spawn('cargo',['test','--locked','--manifest-path','apps/runner/src-tauri/Cargo.toml','executor::live_tests::real_codex_flow','--','--ignored','--nocapture'],{stdio:'inherit',env:{...process.env,OPEN_DOT_CHANNEL_TEST_ORIGIN:origin,OPEN_DOT_BROWSER_APPROVAL:'1',...(process.argv.includes('--plan-codex')?{OPEN_DOT_ENGINEERING_PLAN:'1'}:{})}});
const done=child?new Promise<number>(r=>{child.on('exit',c=>r(c??1));child.on('error',()=>r(1));}):Promise.resolve(0);
const timer=setTimeout(()=>child?.kill(),600000);
try{
 const session=await context.request.post(`${origin}/api/session/dev`,{headers:{'x-open-dot':'1'}});assert.equal(session.status(),200);
 if(plansOnly){
  const owner=(await ctx.db.query<{id:string}>('SELECT id FROM od_owners'))[0]!.id;
  const token=randomToken(), project=crypto.randomUUID(), device=crypto.randomUUID();
  await ctx.db.run('INSERT INTO od_runner_devices(id,owner_id,name,token_hash,expires_at,seen_at,projects,capabilities,created_at,protocol_version) VALUES(?,?,?,?,?,?,?,?,?,2)',[device,owner,'Plan device fixture',await sha256Hex(token),Date.now()+600000,Date.now(),JSON.stringify([{id:project,label:'Plan fixture project'}]),JSON.stringify([{id:'codex',installed:true,authenticated:true,executable:true,reason:'Fixture executor only; no model'}]),Date.now()]);
  await page.goto(`${origin}/workspace`);
  await page.getByRole('combobox',{name:/Computador/}).selectOption({label:'Plan device fixture'});
  await page.getByRole('combobox',{name:/Projeto autorizado/}).selectOption({label:'Plan fixture project'});
  const panel=page.getByRole('region',{name:'Planos sequenciais'});
  await panel.getByText('Criar plano de tarefas isoladas',{exact:true}).click();
  await panel.getByLabel('Título do plano',{exact:true}).fill('Fixture browser plan');
  await panel.getByLabel('Título da tarefa 1').fill('First fixture');
  await panel.getByLabel('Prompt da tarefa 1').fill('Create a harmless fixture document.');
  await panel.getByRole('button',{name:'Adicionar fase'}).click();
  await panel.getByLabel('Título da tarefa 2').fill('Second fixture');
  await panel.getByLabel('Prompt da tarefa 2').fill('Create a separate harmless document.');
  await panel.getByLabel(/Autorizo a sequência descrita/).check();
  await panel.getByRole('button',{name:'Agendar plano no Runner'}).click();
  await panel.getByRole('heading',{name:'Fixture browser plan · Ativo',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Pausar novas tarefas'}).click();
  await panel.getByRole('heading',{name:'Fixture browser plan · Pausado',exact:true}).waitFor();
  const headers={'authorization':`Bearer ${token}`,'x-open-dot':'1'};
  assert.equal((await (await context.request.post(`${origin}/api/runner/device/claim`,{headers,data:{}})).json()).task,null);
  await panel.getByRole('button',{name:'Retomar sequência'}).click();
  await panel.getByRole('heading',{name:'Fixture browser plan · Ativo',exact:true}).waitFor();
  const task=(await (await context.request.post(`${origin}/api/runner/device/claim`,{headers,data:{}})).json()).task;assert.ok(task);
  assert.equal(task.prompt,'Create a harmless fixture document.');
  const event=await context.request.post(`${origin}/api/runner/device/tasks/${task.id}/event`,{headers,data:{seq:1,kind:'uncertain',text:'Fixture interruption; no model or native write performed.'}});assert.equal(event.status(),200);
  await panel.getByRole('heading',{name:/Fixture browser plan.*Efeitos incertos/}).waitFor();
  await page.reload();
  await panel.getByRole('heading',{name:/Fixture browser plan.*Efeitos incertos/}).waitFor();
  assert.equal((await (await context.request.post(`${origin}/api/runner/device/claim`,{headers,data:{}})).json()).task,null);
  assert.equal((await ctx.db.query('SELECT id FROM od_engineering_attempts')).length,1);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Plan mobile overflow');
  const violations=(await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact??''));assert.deepEqual(violations.map(v=>v.id),[]);
  mkdirSync('test-results/plans',{recursive:true});await page.screenshot({path:'test-results/plans/real-plan-mobile.png',fullPage:true});
  console.log('REAL_PLAN_BROWSER_PASS: UI create, pause/resume, actual API/SQLite/claim, uncertain fence and reload. Device/executor is fixture; no model or native file write.');
 }else if(memoryOnly){
  const owner=(await ctx.db.query<{id:string}>('SELECT id FROM od_owners'))[0]!.id;
  const project=crypto.randomUUID();
  // Fixture explícita de seleção de projeto; não afirma pareamento ou executor disponível.
  await ctx.db.run('INSERT INTO od_runner_devices(id,owner_id,name,token_hash,expires_at,seen_at,projects,capabilities,created_at,protocol_version) VALUES(?,?,?,?,?,?,?,?,?,2)',[crypto.randomUUID(),owner,'Memory project fixture',crypto.randomUUID(),Date.now()+600000,Date.now(),JSON.stringify([{id:project,label:'Memory fixture project'}]),'[]',Date.now()]);
  await page.goto(`${origin}/workspace`);
  await page.getByRole('combobox',{name:/Computador/}).selectOption({label:'Memory project fixture'});
  await page.getByRole('combobox',{name:/Projeto autorizado/}).selectOption({label:'Memory fixture project'});
  console.log('MEMORY_BROWSER: project selected');
  const panel=page.getByRole('region',{name:'Memória do projeto'});
  await panel.getByRole('button',{name:'Consentir memória por 30 dias'}).click();
  console.log('MEMORY_BROWSER: consent confirmed');
  await panel.getByLabel('Informação fornecida por você (não é aprovação de execução)').fill('Use observation dates for grocery prices. '+ 'x'.repeat(180));
  await panel.getByRole('button',{name:'Salvar nota neste projeto'}).click();
  await panel.getByText('Use observation dates for grocery prices.',{exact:false}).waitFor();
  await page.reload();
  await page.getByRole('combobox',{name:/Computador/}).selectOption({label:'Memory project fixture'});
  await page.getByRole('combobox',{name:/Projeto autorizado/}).selectOption({label:'Memory fixture project'});
  await panel.getByText('Use observation dates for grocery prices.',{exact:false}).waitFor();
  await panel.getByRole('button',{name:'Revisar Passport de memória'}).click();
  await panel.getByText('Passport somente de memória · revisão local').waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Memory mobile overflow');
  const violations=(await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact??''));assert.deepEqual(violations.map(v=>v.id),[]);
  mkdirSync('test-results/memory',{recursive:true});await page.screenshot({path:'test-results/memory/real-memory-mobile.png',fullPage:true});
  await panel.getByText('Esquecer memória deste projeto' ,{exact:true}).click();
  await panel.getByRole('button',{name:'Confirmar exclusão da memória'}).click();
  await panel.getByRole('button',{name:'Consentir memória por 30 dias'}).waitFor();
  assert.equal((await ctx.db.query('SELECT * FROM od_project_ledgers')).length,0);
  console.log('REAL_MEMORY_BROWSER_PASS: authenticated UI, opt-in, encrypted SQLite, reload, memory-only export and forget. Project selector uses fixture; no provider called.');
 }else{
 await page.goto(`${origin}/workspace`);
 await page.getByRole('button',{name:/Codex.*Esperando sua aprovação/}).click();
 await page.getByRole('heading',{name:'RUNNER_RESULT.md · arquivo novo'}).waitFor();
 const expected='# Open Dot Runner\n\nReal Codex execution validated.\n';
 const tasks=await context.request.get(`${origin}/api/runner/tasks`);const list=await tasks.json();const task=list.tasks.find((t:{state:string})=>t.state==='awaiting_approval');assert.ok(task);
 const events=await (await context.request.get(`${origin}/api/runner/tasks/${task.id}/events`)).json();const proposal=JSON.parse(events.approval.raw);
 assert.deepEqual(proposal.files,[{path:'RUNNER_RESULT.md',content:expected,beforeHash:null}]);
 assert.equal(await page.getByText(expected,{exact:true}).count(),1);
 await page.getByRole('button',{name:'Aprovar estes arquivos no worktree'}).click();
 assert.equal(await done,0,'Executor nativo não confirmou conclusão');
 await page.getByRole('button',{name:/Codex.*Concluída no worktree/}).waitFor();
 console.log('REAL_BROWSER_NATIVE_APPROVAL_PASS: real Workspace, HTTP/SQLite, exact reviewed proposal, native Codex and isolated write. Native pairing/folder/prompt UI not tested.');
 }
}finally{
 clearTimeout(timer);if(child&&child.exitCode===null)child.kill();await browser.close();await new Promise<void>(r=>server.close(()=>r()));ctx.db.raw.close();
}

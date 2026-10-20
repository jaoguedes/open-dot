/** Integração real: navegador Workspace -> decisão HTTP/SQLite -> executor nativo/Codex.
 * Pareamento, seleção de pasta e criação do prompt ainda feitos pelo helper nativo.
 * Não é E2E da janela/tray Tauri. Uma chamada real ChatGPT, nunca fallback de API paga.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
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
const context=await browser.newContext({viewport:{width:1100,height:900}});const page=await context.newPage();page.setDefaultTimeout(300_000);
const child=spawn('cargo',['test','--locked','--manifest-path','apps/runner/src-tauri/Cargo.toml','executor::live_tests::real_codex_flow','--','--ignored','--nocapture'],{stdio:'inherit',env:{...process.env,OPEN_DOT_CHANNEL_TEST_ORIGIN:origin,OPEN_DOT_BROWSER_APPROVAL:'1'}});
const done=new Promise<number>(r=>{child.on('exit',c=>r(c??1));child.on('error',()=>r(1));});
const timer=setTimeout(()=>child.kill(),600000);
try{
 const session=await context.request.post(`${origin}/api/session/dev`,{headers:{'x-open-dot':'1'}});assert.equal(session.status(),200);
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
}finally{
 clearTimeout(timer);if(child.exitCode===null)child.kill();await browser.close();await new Promise<void>(r=>server.close(()=>r()));ctx.db.raw.close();
}

// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
/** Parent keys this component by project, so consent and imported context never leak across projects. */
export function ProjectContext({projectId,demo}:{projectId:string;demo:boolean}){
 const [memory,setMemory]=useState(false),[prompts,setPrompts]=useState(false),[native,setNative]=useState<unknown>(),[result,setResult]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(!projectId||demo)return null;
 async function review(){
  setBusy(true);setError('');setResult('');try{
   const r=await fetch(`/api/projects/${encodeURIComponent(projectId)}/passport`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-open-dot':'1'},body:JSON.stringify({consent:'review-project-context',includeMemory:memory,includePrompts:prompts,...(native?{nativeContext:native}:{})})});
   const data=await r.json();if(!r.ok)throw new Error(data.error?.message??'Contexto não confirmado.');
   if(data.passport?.schemaVersion!==2||data.passport?.projectId!==projectId||data.passport?.executionAuthority!==false)throw new Error('Resposta de contexto incompatível.');
   const text=JSON.stringify(data.passport);if(new TextEncoder().encode(text).length>131072)throw new Error('Contexto excedeu 128 KB.');setResult(JSON.stringify(data.passport,null,2));
  }catch(e){setError(e instanceof Error?e.message:'Exportação não confirmada.');}finally{setBusy(false);}
 }
 function download(){const url=URL.createObjectURL(new Blob([result],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='opendot-project-passport.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="card" aria-label="Passport de contexto">
  <h3>Passport de contexto</h3>
  <p>Reúna planos, tentativas e dependências para uma nova sessão. Código-fonte, tarefas fora dos planos, autorizações e credenciais não são exportados. Git e stack exigem o arquivo local do Runner; continuam sendo dados a verificar no destino.</p>
  <label><input type="checkbox" checked={memory} disabled={busy} onChange={e=>{setMemory(e.target.checked);setResult('');}}/> Incluir memória com consentimento vigente</label>
  <label><input type="checkbox" checked={prompts} disabled={busy} onChange={e=>{setPrompts(e.target.checked);setResult('');}}/> Incluir prompts dos planos (revise dados privados)</label>
  <label>Contexto local opcional, exportado pelo Runner (JSON, até 64 KB)
   <input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{
    const file=e.target.files?.[0];setNative(undefined);setResult('');setError('');if(!file)return;setBusy(true);
    void (async()=>{try{if(file.size>65536)throw new Error('Arquivo excede 64 KB.');const value=JSON.parse(await file.text());if(value.kind!=='open-dot-native-project-context'||value.schemaVersion!==1||value.executionAuthority!==false)throw new Error('Formato incompatível.');if(value.projectId!==projectId)throw new Error('O arquivo pertence a outro projeto.');setNative(value);}catch{setError('Contexto local inválido, grande demais ou de outro projeto.');}finally{setBusy(false);}})();
   }}/>
  </label>
  {native!==undefined&&<p role="status">Contexto local selecionado; validação completa no servidor.</p>}
  <p className="tiny">Anexar o arquivo envia esses metadados ao backend ao revisar. Não importa tarefas nem concede acesso; identidade de pasta requer remapeamento explícito em outro computador. Testes de projeto não foram executados.</p>
  <button className="btn" disabled={busy} onClick={()=>void review()}>Revisar Passport de contexto</button>
  {error&&<p role="alert">{error}</p>}
  {result&&<details open><summary>Conteúdo exato para transferência manual</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{result}</pre><button className="btn" onClick={download}>Baixar JSON revisado</button></details>}
 </section>;
}

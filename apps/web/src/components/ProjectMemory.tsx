import { useEffect, useState } from "react";
interface Entry {id:string;kind:string;provenance:string;summary:string;sourceRefs:string[];observedAt:string;commit:string|null}
interface Passport {schemaVersion:1;scope:"memory-only";projectId:string;revision:number;memories:Entry[];links:Array<{from:string;to:string;relation:string}>}
interface Policy {revision:number;enabled:boolean;expiresAt:number|null}
async function api<T>(project:string,suffix:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const r=await fetch(`/api/projects/${encodeURIComponent(project)}/memory${suffix}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,headers:{'x-open-dot':'1',...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json();if(!r.ok)throw new Error(data.error?.message??'Memória não confirmada. Releia antes de tentar novamente.');return data as T;
}
/** Dados deste projeto, nunca permissões de execução ou decisões humanas implícitas. */
export function ProjectMemory({projectId,demo}:{projectId:string;demo:boolean}){
 const [policy,setPolicy]=useState<Policy|null>(null),[passport,setPassport]=useState<Passport|null>(null);
 const [editing,setEditing]=useState<{entry:Entry;revision:number}|null>(null);
 const [note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[exported,setExported]=useState('');
 useEffect(()=>{setNote('');setExported('');setEditing(null);},[projectId,demo]);
 useEffect(()=>{
  setPolicy(null);setPassport(null);setError('');setExported('');
  if(!projectId||demo)return;
  const abort=new AbortController();
  void (async()=>{
   try{
    const p=await api<Policy>(projectId,'/policy',undefined,abort.signal);
    const m=p.enabled?await api<{passport:Passport|null}>(projectId,'',undefined,abort.signal):{passport:null};
    if(!abort.signal.aborted){setPassport(m.passport);setPolicy(p);}
   }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Memória indisponível.');}
  })();return()=>abort.abort();
 },[projectId,demo,refresh]);
 async function act(suffix:string,body:unknown,preserveDraft=false){
  setBusy(true);setError('');try{
   const result=await api<{passport?:Passport}>(projectId,suffix,body);
   if(suffix==='/export')setExported(JSON.stringify(result.passport,null,2));else {if((suffix===''&&!preserveDraft)||suffix==='/forget')setNote('');setEditing(null);setRefresh(v=>v+1);}
  }catch(e){setError(e instanceof Error?e.message:'Operação não confirmada.');}finally{setBusy(false);}
 }
 if(!projectId)return null;
 return <section className="card ws-project-memory" aria-label="Memória do projeto">
  <h3>Memória do projeto</h3>
  <p className="tiny">Notas cifradas deste projeto, separadas das permissões do Runner. Não concedem ferramentas ou aprovação de alterações. O Passport abaixo contém somente memória; o Passport de contexto possui seu próprio painel.</p>
  {!demo&&<button className="btn" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Atualizar memória</button>}
  {error&&<p role="alert">{error}</p>}
  {demo?<p>Demonstração: persistência desabilitada.</p>:!policy?<p role="status">{error?<button className="btn" onClick={()=>setRefresh(v=>v+1)}>Tentar reler memória</button>:'Consultando consentimento…'}</p>:!policy.enabled?<>
   <p>Guardar memória é opcional. Ao consentir, o snapshot fica disponível nesta conta por 30 dias; você pode esquecê-lo antes. Renovar após expiração começa sem restaurar dados antigos.</p>
   <button className="btn" disabled={busy} onClick={()=>void act('/consent',{consent:'store-project-memory',expectedRevision:policy.revision,retentionDays:30})}>Consentir memória por 30 dias</button>
  </>:<>
   <p className="tiny">Revisão {passport?.revision??0}. Consentimento até {new Date(policy.expiresAt!).toLocaleString('pt-BR')}. Informações externas e notas não são decisões aprovadas.</p>
   <ul>{passport?.memories.map(m=><li key={m.id}><b>{m.provenance}</b>: {m.summary} <button className="btn" disabled={busy||!!editing} onClick={()=>setEditing({entry:{...m},revision:passport.revision})}>Editar informação</button> <button className="btn" disabled={busy||!!editing} onClick={()=>void act('',{expectedRevision:passport.revision,consentRevision:policy.revision,passport:{...passport,revision:passport.revision+1,memories:passport.memories.filter(x=>x.id!==m.id),links:passport.links.filter(x=>x.from!==m.id&&x.to!==m.id)}},true)}>Excluir informação</button></li>)}</ul>
   {editing&&<form onSubmit={e=>{e.preventDefault();if(!passport||!editing.entry.summary.trim())return;void act('',{expectedRevision:editing.revision,consentRevision:policy.revision,passport:{...passport,revision:editing.revision+1,memories:passport.memories.map(m=>m.id===editing.entry.id?{...editing.entry,summary:editing.entry.summary.trim(),provenance:'user-provided',observedAt:new Date().toISOString(),commit:null}:m)}},true);}}>
    <p>Ao editar, a informação passa a ser fornecida por você; deixa de ser um recibo externo ou inferência. Uma revisão concorrente impede salvar sobre dados novos.</p>
    <label>Editar resumo da memória<textarea value={editing.entry.summary} maxLength={2000} onChange={e=>setEditing(old=>old?{...old,entry:{...old.entry,summary:e.target.value}}:null)}/></label>
    <button className="btn" disabled={busy||!editing.entry.summary.trim()}>Salvar alteração da informação</button><button type="button" className="btn" disabled={busy} onClick={()=>setEditing(null)}>Cancelar edição</button>
   </form>}
   {!passport?.memories.length&&<p>Nenhuma memória salva.</p>}
   <form onSubmit={e=>{e.preventDefault();if(!note.trim()||busy)return;const previous=passport??{schemaVersion:1,scope:'memory-only',projectId,revision:0,memories:[],links:[]};void act('',{expectedRevision:previous.revision,consentRevision:policy.revision,passport:{...previous,revision:previous.revision+1,memories:[...previous.memories,{id:crypto.randomUUID(),kind:'fact',provenance:'user-provided',summary:note.trim(),sourceRefs:[],observedAt:new Date().toISOString(),commit:null}]}});}}>
    <label htmlFor="project-memory-note">Informação fornecida por você (não é aprovação de execução)</label>
    <textarea id="project-memory-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} rows={3}/>
    <button className="btn" disabled={busy||!!editing||!note.trim()||(passport?.memories.length??0)>=100}>Salvar nota neste projeto</button>
   </form>
   <button className="btn" disabled={busy||!passport} onClick={()=>void act('/export',{consent:'local-review'})}>Revisar Passport de memória</button>
   <details><summary>Esquecer memória deste projeto</summary><p>Remove o snapshot do serviço e revoga este consentimento. Não apaga o Git nem promete apagar fisicamente WAL ou backups cifrados.</p><button className="btn" disabled={busy} onClick={()=>void act('/forget',{expectedConsentRevision:policy.revision,consent:'forget-project-memory'})}>Confirmar exclusão da memória</button></details>
  </>}
  {exported&&<details open><summary>Passport somente de memória · revisão local</summary><pre>{exported}</pre></details>}
 </section>;
}

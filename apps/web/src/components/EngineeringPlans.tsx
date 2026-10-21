// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from "react";
interface Plan { id: string; title: string; projectId: string; state: string; revision: number; tasks: Array<{ id: string; title: string; phase: number; state: string; runnerTaskId: string | null; expertId?:string;qualityGate?:string;memoryState?:string; memoryRevision?:number|null }> }
interface Expert {id:string;purpose:string;acceptanceCriteria:string[];independentReviewRequired:boolean}
interface DraftTask {id:string;title:string;prompt:string;expertId?:string}
const states: Record<string, string> = { active: "Ativo", paused: "Pausado", completed: "Concluído com recibos", blocked: "Bloqueado", uncertain: "Efeitos incertos · revisão necessária", pending: "Pendente", assigned: "Reservada no Runner", failed: "Falhou", cancelled: "Cancelada" };
async function call(path: string, body?: unknown) {
  const response = await fetch(`/api/runner/plans${path}`, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", headers: { "x-open-dot": "1", ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Plano não confirmado. Consulte o estado antes de reenviar.");
  if (body === undefined && !Array.isArray(result.plans)) throw new Error("Resposta de planos incompatível. Atualize o servidor.");
  return result;
}
export function EngineeringPlans({ deviceId, projectId, ready, demo, selectTask }: { deviceId: string; projectId: string; ready: boolean; demo: boolean; selectTask: (id: string) => void }) {
  const [plans, setPlans] = useState<Plan[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [title, setTitle] = useState(""), [consent, setConsent] = useState(false);
  const [connectionError,setConnectionError]=useState("");
  const [rememberResults,setRememberResults]=useState(false);
  const [tasks, setTasks] = useState<DraftTask[]>([{ id: crypto.randomUUID(), title: "", prompt: "" }]);
  useEffect(()=>{setConsent(false);setRememberResults(false);},[deviceId,projectId]);
  const [experts,setExperts]=useState<Expert[]>([]);
  useEffect(()=>{
    if(demo)return;const abort=new AbortController();
    void fetch('/api/runner/experts',{credentials:'same-origin',cache:'no-store',signal:abort.signal}).then(async r=>{const v=await r.json();if(!r.ok||v.version!==1||!Array.isArray(v.experts))return;if(!abort.signal.aborted)setExperts(v.experts);}).catch(()=>{});
    return()=>abort.abort();
  },[demo]);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (demo) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { if (!document.hidden) { const result = await call(""); if (active) {setPlans(result.plans);setConnectionError("");} } }
      catch { if (active) setConnectionError("Sem confirmação dos planos. Estado exibido pode estar desatualizado."); }
      finally { if (active) timer = setTimeout(() => void refresh(), 5000); }
    }
    void refresh(); return () => { active = false; clearTimeout(timer); };
  }, [demo]);
  async function submit() {
    setBusy(true); setError("");
    const definition = { rememberResults, deviceId, projectId, mechanism: "codex", title, worktreeConsent: true, consent: "schedule-isolated-approved-tasks", tasks: tasks.map((t, index) => ({ ...t, phase: index, dependencies: index ? [tasks[index-1]!.id] : [], acceptance: "approved-files-applied" })) };
    const fingerprint = JSON.stringify(definition);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await call("", { ...definition, requestKey: pending.current.key });
      pending.current = null; setPlans((await call("")).plans); setTitle(""); setTasks([{ id: crypto.randomUUID(), title: "", prompt: "" }]); setConsent(false); setRememberResults(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Não confirmado. Consulte os planos antes de reenviar."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Planos sequenciais" className="ws-executions">
    <h3>Planos sequenciais do Runner</h3>
    <p className="tiny">Cada tarefa executa uma vez e exige aprovação exata dos arquivos. Fases avançam após recibos de aplicação; não comprovam testes de projeto ou revisão independente. Cada tarefa tem worktree separado: alterações anteriores não são integradas automaticamente.</p>
    <details><summary>Criar plano de tarefas isoladas</summary>
      <form onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label>Título do plano<input aria-label="Título do plano" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} /></label>
        {tasks.map((t, i) => <fieldset key={t.id}><legend>Fase {i+1}</legend>
          <label>Título da tarefa {i+1}<input value={t.title} maxLength={160} onChange={e => setTasks(old => old.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))} /></label>
          <label>Perfil de qualidade da tarefa {i+1}<select value={t.expertId??""} onChange={e=>setTasks(old=>old.map(x=>x.id===t.id?{...x,expertId:e.target.value||undefined}:x))}><option value="">Sem perfil especializado</option>{experts.map(expert=><option key={expert.id} value={expert.id}>{expert.purpose}</option>)}</select></label>
          {t.expertId&&<p className="tiny">{experts.find(e=>e.id===t.expertId)?.acceptanceCriteria.join(' ')} Evidências e revisão não atestadas; o perfil não concede ferramentas nem habilita testes de projeto.</p>}
          <label>Prompt da tarefa {i+1}<textarea value={t.prompt} rows={3} maxLength={8000} onChange={e => setTasks(old => old.map(x => x.id === t.id ? { ...x, prompt: e.target.value } : x))} /></label>
        </fieldset>)}
        <button type="button" className="btn" disabled={busy || tasks.length >= 12} onClick={() => setTasks(old => [...old, { id: crypto.randomUUID(), title: "", prompt: "" }])}>Adicionar fase</button>
        <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Autorizo a sequência descrita, uma tentativa Codex por tarefa e seus worktrees/metadados Git. Vou aprovar cada conteúdo. Não autorizo shell, integração, commit ou push.</label>
        <label><input type="checkbox" checked={rememberResults} onChange={e=>setRememberResults(e.target.checked)} /> Registrar recibos factuais na memória já consentida deste projeto, sem prompts ou conteúdo dos arquivos. A memória não autoriza ferramentas.</label>
        <button className="btn primary" disabled={demo || busy || !ready || !projectId || !consent || !title.trim() || tasks.some(t => !t.title.trim() || !t.prompt.trim())}>Agendar plano no Runner</button>
      </form>
    </details>
    {connectionError && <p role="status">{connectionError}</p>}
    {error && <p role="alert">{error}</p>}
    {plans.filter(p => !projectId || p.projectId === projectId).map(p => <article key={p.id}>
      <h4>{p.title} · {states[p.state] || p.state}</h4>
      {["active", "paused"].includes(p.state) && <button className="btn" disabled={busy} onClick={() => {
        setBusy(true); setError(""); void call(`/${p.id}/state`, { expectedRevision: p.revision, state: p.state === "active" ? "paused" : "active" }).then(async () => setPlans((await call("")).plans)).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
      }}>{p.state === "active" ? "Pausar novas tarefas" : "Retomar sequência"}</button>}
      <ol>{p.tasks.map(t => <li key={t.id}>Fase {t.phase+1}: {t.title} · {states[t.state] || t.state}{t.expertId?` · perfil ${t.expertId}, qualidade não atestada`:""}{t.memoryRevision ? ` · registrado na memória, revisão ${t.memoryRevision}` : ["blocked","consent_changed","conflict","quota"].includes(t.memoryState??"") ? " · memória não registrada; revise consentimento/limites" : ""} {t.runnerTaskId && <button className="btn" onClick={() => selectTask(t.runnerTaskId!)}>Acompanhar tarefa</button>}</li>)}</ol>
    </article>)}
  </section>;
}

// SPDX-License-Identifier: AGPL-3.0-only
/** Agent Workspace (v0.3): pergunte ao Dot, veja os agentes de verdade e o que espera você. */
import { useEffect, useState } from "react";
import { approvalQueue, toVisual } from "@open-dot/core";
import { AgentDot } from "@open-dot/mascot";
import { useApp } from "../store.tsx";
import { askDot, type SavedAnswer } from "../ask.ts";
import { AnswerView } from "../components/AnswerView.tsx";
import { readWorkspace, saveWorkspace, type WorkspaceNotes } from "../workspace-notes.ts";
import { projectLabel, STATE_LABEL, useRunner, type RunnerDevice, type MechanismId } from "../runner-data.ts";
import { Chip, DemoChip, MonoLabel, agentColor, agentName } from "../components/ui.tsx";
import { DEMO_RECIPES } from "../demo.ts";
import "../workspace.css";
import "../screens.css";

interface RecipeChip {
  id: string;
  nome: string;
}

/** Estado de cada ferramenta pelo diagnóstico real do Runner; sem Runner, diz isso. */
export function toolState(devices: RunnerDevice[], id: MechanismId): { texto: string; pronto: boolean } {
  if (id === "cursor") return { texto: "Indisponível nesta versão", pronto: false };
  const d = devices.flatMap((x) => (x.revoked ? [] : x.drivers)).filter((x) => x.id === id);
  if (!devices.length) return { texto: "Sem computador pareado", pronto: false };
  if (d.some((x) => x.installed && x.authenticated && x.executable)) return { texto: "Pronto", pronto: true };
  if (id === "claude-code" && d.some((x) => x.installed)) return { texto: "Desligado (ative quando quiser)", pronto: false };
  if (d.some((x) => x.installed && !x.authenticated)) return { texto: "Sem login confirmado", pronto: false };
  return { texto: "Não instalado", pronto: false };
}

export function AgentWorkspace() {
  const app = useApp();
  const demo = app.mode === "demo";
  const runner = useRunner(demo, { detailFor: 6 });
  const [selected, setSelected] = useState<MechanismId | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<SavedAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(readWorkspace);
  const [task, setTask] = useState("");
  const [saved, setSaved] = useState(true);
  const [recipes, setRecipes] = useState<RecipeChip[]>([]);
  useEffect(() => {
    if (demo) return setRecipes([...DEMO_RECIPES]);
    const abort = new AbortController();
    fetch("/api/orchestrator/recipes", { credentials: "same-origin", cache: "no-store", signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { receitas: RecipeChip[] } | null) => d && setRecipes(d.receitas.map((x) => ({ id: x.id, nome: x.nome }))))
      .catch(() => undefined);
    return () => abort.abort();
  }, [demo]);
  const snap = app.snap;
  const queue = approvalQueue(snap?.approvals ?? [], Date.now());
  const pendingRunner = runner.tasks.filter((t) => runner.details[t.id]?.approval?.decision === "pending" && t.state === "awaiting_approval");
  function update(next: WorkspaceNotes) {
    setNotes(next);
    setSaved(saveWorkspace(next));
  }
  async function send() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await askDot(q, demo ? snap : null);
      setMessages((old) => [...old, { question: q, ...result }]);
      setQuestion("");
    } catch {
      setError("Não consegui consultar o Dot. Sua pergunta continua aqui para tentar novamente.");
    } finally {
      setBusy(false);
    }
  }
  const tint = selected ? agentColor(selected) : null;
  return (
    <section className="screen workspace-v3" aria-labelledby="ws-title">
      <header className="screen-head-v3">
        <MonoLabel>SEU CONTEXTO. UM COMPANHEIRO.</MonoLabel>
        {demo && <DemoChip />}
      </header>
      <section className="hero-v3">
        <div>
          <h1 id="ws-title">Agent Workspace</h1>
          <p>Pense com o Dot, monte a equipe certa com as ferramentas que você já tem e acompanhe o que pede a sua decisão.</p>
        </div>
        <AgentDot visual={app.visualFor("dot")} accessory="none" ring={false} size={190} reducedMotion={app.reducedMotion} interactive followPointer label={selected ? `Dot com a cor de ${agentName(selected)}` : "Dot"} {...(tint ? { tint: { color: tint, intensity: 100 } } : {})} />
      </section>
      <form
        className="ask-v3 card-v3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="ws-question">Pergunte ao Dot…</label>
        <div className="ask-row">
          <textarea id="ws-question" value={question} maxLength={2000} rows={2} onChange={(e) => setQuestion(e.target.value)} placeholder="O que precisa de mim hoje?" />
          <button type="submit" className="btn primary v3" disabled={busy || !question.trim()}>
            {busy ? "Consultando…" : "Perguntar"}
          </button>
        </div>
        {!!recipes.length && (
          <div className="chips-row" role="group" aria-label="Receitas (abrem a Equipe para confirmar)">
            {recipes.map((r) => (
              <Chip key={r.id} onClick={() => app.navigate(`/equipe?receita=${encodeURIComponent(r.id)}`)}>
                {r.nome}
              </Chip>
            ))}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <p className="tiny">A conversa consulta o Open Dot; não executa nada no computador. Receitas só abrem a Equipe: nada roda sem a sua confirmação.</p>
      </form>
      {!!messages.length && (
        <div className="ws-messages" role="log" aria-label="Conversa com o Dot" aria-live="polite">
          {messages.map((m, i) => (
            <AnswerView key={i} answer={m} />
          ))}
        </div>
      )}
      <h2 className="screen-section">Seus agentes</h2>
      <div className="agent-cards">
        {(["codex", "claude-code", "cursor"] as MechanismId[]).map((id) => {
          const st = toolState(runner.devices, id);
          const color = agentColor(id)!;
          return (
            <button key={id} type="button" className="card-v3 agent-card" aria-pressed={selected === id} onClick={() => setSelected((s) => (s === id ? null : id))}>
              <AgentDot visual={toVisual("dot", st.pronto ? "idle" : "disconnected")} accessory="none" size={64} animate={false} reducedMotion={app.reducedMotion} label={`Dot de ${agentName(id)}`} tint={{ color, intensity: 100 }} />
              <span className="grow">
                <b>{agentName(id)}</b>
                <span className="sub">{runner.status === "carregando" ? "Conferindo…" : st.texto}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="tiny">Status vindo do diagnóstico do Runner no seu computador{demo ? " (aqui, de exemplo)" : ""}. Escolher um agente só muda a cor do Dot.</p>
      <div className="panels-3">
        <section className="card-v3" aria-labelledby="p-tasks">
          <h2 id="p-tasks">Tarefas do Runner</h2>
          {runner.tasks.length ? (
            <ul className="plain-list">
              {runner.tasks.slice(0, 4).map((t) => (
                <li key={t.id}>
                  <b>{agentName(t.mechanism)}</b> · {STATE_LABEL[t.state] ?? t.state}
                  <div className="sub">{projectLabel(runner.devices, t.projectId)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta">{runner.status === "erro" ? "Não consegui ler as tarefas agora." : "Nenhuma tarefa do Runner ainda."}</p>
          )}
          <button className="btn v3" type="button" onClick={() => app.navigate("/runner")}>
            Abrir o Runner
          </button>
        </section>
        <section className="card-v3" aria-labelledby="p-mem">
          <h2 id="p-mem">Memória do projeto</h2>
          <p className="meta">Contexto e decisões salvos com o seu consentimento, por projeto. Você revisa, edita e apaga.</p>
          <button className="btn v3" type="button" onClick={() => app.navigate("/memoria")}>
            Abrir memória
          </button>
        </section>
        <section className="card-v3" aria-labelledby="p-appr">
          <h2 id="p-appr">Aprovações pendentes</h2>
          <p className="meta">
            {pendingRunner.length} do Runner · {queue.total} de rotinas
          </p>
          <div className="row-actions">
            <button className="btn v3" type="button" disabled={!pendingRunner.length} onClick={() => app.navigate("/aprovacoes")}>
              Revisar no Runner
            </button>
            {queue.visible[0] && (
              <button className="btn v3" type="button" onClick={() => app.navigate(`/aprovacao/${encodeURIComponent(queue.visible[0]!.id)}`)}>
                Revisar rotina
              </button>
            )}
          </div>
        </section>
      </div>
      <details className="card-v3 ws-notes">
        <summary>Notas e tarefas deste navegador</summary>
        <p className="tiny">Não são enviadas aos agentes nem sincronizadas.</p>
        <label htmlFor="ws-project">Contexto do projeto</label>
        <textarea id="ws-project" rows={4} maxLength={4000} value={notes.project} onChange={(e) => update({ ...notes, project: e.target.value })} />
        {!saved && <p role="status">Armazenamento indisponível; notas só nesta sessão.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!task.trim() || notes.tasks.length >= 50) return;
            update({ ...notes, tasks: [...notes.tasks, { id: crypto.randomUUID(), text: task.trim(), done: false }] });
            setTask("");
          }}
        >
          <label htmlFor="ws-task">Próxima tarefa</label>
          <input id="ws-task" maxLength={300} value={task} onChange={(e) => setTask(e.target.value)} />
          <button className="btn" disabled={!task.trim() || notes.tasks.length >= 50}>
            Adicionar tarefa local
          </button>
        </form>
        {notes.tasks.map((t) => (
          <div className="ws-task" key={t.id}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => update({ ...notes, tasks: notes.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })} />
              {t.text}
            </label>
            <button className="btn ghost" aria-label={`Excluir tarefa ${t.text}`} onClick={() => update({ ...notes, tasks: notes.tasks.filter((x) => x.id !== t.id) })}>
              ×
            </button>
          </div>
        ))}
      </details>
    </section>
  );
}

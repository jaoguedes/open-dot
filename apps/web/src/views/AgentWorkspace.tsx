// SPDX-License-Identifier: AGPL-3.0-only
import { RunnerWorkspace } from "../components/RunnerWorkspace.tsx";
import { WorkspaceSummary } from "../components/WorkspaceSummary.tsx";
import { useState } from "react";
import { AGENTS, agentsInPlace, approvalQueue, type AgentId } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { AgentDot } from "@open-dot/mascot";
import { askDot, type SavedAnswer } from "../ask.ts";
import { AnswerView } from "../components/AnswerView.tsx";
import { fmtDateTime, RUN_LABEL } from "../format.ts";
import { readWorkspace, saveWorkspace, type WorkspaceNotes } from "../workspace-notes.ts";
import "../workspace.css";
import "../screens.css";

export function AgentWorkspace() {
  const app = useApp();
  const [agent, setAgent] = useState<AgentId>("dot");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<SavedAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(readWorkspace);
  const [task, setTask] = useState("");
  const [saved, setSaved] = useState(true);
  const snap = app.snap;
  const runs = (snap?.runs ?? []).filter((r) => agent === "dot" || r.agentId === agent).slice(0, 8);
  const queue = approvalQueue(snap?.approvals ?? [], Date.now());
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
      const result = await askDot(q, app.mode === "demo" ? snap : null);
      setMessages((old) => [...old, { question: q, ...result }]);
      setQuestion("");
    } catch {
      setError("Não consegui consultar o Dot. Sua pergunta continua aqui para tentar novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="agent-workspace">
      <header className="ws-heading">
        <div>
          <p className="ws-eyebrow">SEU CONTEXTO. UM COMPANHEIRO.</p>
          <h1>Agent Workspace</h1>
          <p className="meta">Um espaço para pensar com o Dot e acompanhar seus agentes.</p>
        </div>
        <button className="btn" onClick={() => app.navigate("/runner")}>
          Gerenciar Runner
        </button>
      </header>
      <div className="ws-layout">
        <div className="ws-conversation">
          <div className="ws-host">
            <AgentDot visual={app.visualFor("dot")} accessory="none" ring={false} size={240} reducedMotion={app.reducedMotion} interactive />
            <div>
              <label className="tiny">
                Contexto do Dot{" "}
                <select aria-label="Contexto do Dot" value={agent} onChange={(e) => setAgent(e.target.value as AgentId)}>
                  {(["dot", ...agentsInPlace("list")] as AgentId[]).map((id) => (
                    <option key={id} value={id}>
                      {AGENTS[id].name}
                    </option>
                  ))}
                </select>
              </label>
              <h2>Vamos cuidar do que importa.</h2>
              <p className="meta">{agent === "dot" ? "Pergunte sobre os dados já disponíveis no Open Dot." : "O Dot reúne o contexto. Abra o agente para revisar seus resultados e conexões."}</p>
              {agent !== "dot" && (
                <button className="btn" onClick={() => app.navigate(`/agente/${agent}`)}>
                  Abrir {AGENTS[agent].name}
                </button>
              )}
            </div>
          </div>
          <WorkspaceSummary demo={app.mode === "demo"} approvals={queue.total} navigate={app.navigate} />
          <RunnerWorkspace demo={app.mode === "demo"} />
          <div className="ws-messages" role="log" aria-label="Conversa com o Dot" aria-live="polite">
            {!messages.length && <p className="meta">O que pede sua atenção hoje? A conversa consulta o Open Dot; não executa comandos no computador. O histórico fica só nesta tela.</p>}
            {messages.map((m, i) => (
              <AnswerView key={i} answer={m} />
            ))}
          </div>
          <form
            className="ws-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="ws-question">Pergunte ao Dot</label>
            <textarea id="ws-question" value={question} maxLength={2000} rows={3} onChange={(e) => setQuestion(e.target.value)} placeholder="O que precisa de mim hoje?" />
            <button type="submit" className="btn primary" disabled={busy || !question.trim()}>
              {busy ? "Consultando…" : "Consultar o Dot"}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
          <section className="card">
            <h2>Execuções recentes</h2>
            <p className="tiny">Rotinas do Open Dot · {app.mode === "demo" ? "exemplos" : "dados do servidor"}. Não são execuções do Runner.</p>
            {runs.length ? (
              <ul className="list">
                {runs.map((r) => (
                  <li key={r.id}>
                    <b>{AGENTS[r.agentId].name}</b> · {RUN_LABEL[r.state] ?? "Estado não reconhecido"}
                    <p className="tiny">
                      {fmtDateTime(r.updatedAt)}
                      {r.errorMessage ? ` · ${r.errorMessage}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Nenhuma execução disponível para este agente.</p>
            )}
          </section>
        </div>
        <aside className="ws-context">
          <section className="card">
            <h2>Seu projeto</h2>
            <p className="tiny">Notas e tarefas deste navegador. Não são enviadas aos agentes nem sincronizadas.</p>
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
          </section>
          <section className="card">
            <h2>Esperando você</h2>
            {queue.total ? (
              queue.visible.map((a) => (
                <button key={a.id} className="btn" onClick={() => app.navigate(`/aprovacao/${encodeURIComponent(a.id)}`)}>
                  Revisar {a.proposal?.service ?? "ação"}
                </button>
              ))
            ) : (
              <p className="meta">Nenhuma aprovação pendente.</p>
            )}
            <p className="tiny">A decisão continua vinculada ao conteúdo exato. Aprovar não habilita um driver local.</p>
          </section>
        </aside>
      </div>
    </section>
  );
}

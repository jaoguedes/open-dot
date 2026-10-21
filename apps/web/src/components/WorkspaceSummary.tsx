// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { Icon } from "./Icons.tsx";

const ACTIVE = new Set(["queued", "running", "awaiting_approval", "cancel_requested"]);

/** Três atalhos do Workspace com números reais; sem dado, diz que não há dado. */
export function WorkspaceSummary({ demo, approvals, navigate }: { demo: boolean; approvals: number; navigate: (p: string) => void }) {
  const [tasks, setTasks] = useState<{ active: number; uncertain: number } | null>(null);
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    fetch("/api/runner/tasks", { credentials: "same-origin", cache: "no-store", signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tasks: Array<{ state: string }> } | null) => {
        if (d) setTasks({ active: d.tasks.filter((t) => ACTIVE.has(t.state)).length, uncertain: d.tasks.filter((t) => t.state === "uncertain").length });
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [demo]);
  const runnerLine = demo ? "Demonstração: sem Runner real" : !tasks ? "Sem dados do Runner" : `${tasks.active} em andamento${tasks.uncertain ? ` · ${tasks.uncertain} incerta(s) para revisar` : ""}`;
  const cards = [
    { title: "Tarefas do Runner", line: runnerLine, path: "/runner", icon: "code" as const, action: "Ver no Runner" },
    { title: "Memória do projeto", line: "Contexto e pacotes de continuidade por projeto", path: "/memoria", icon: "file" as const, action: "Abrir memória" },
    { title: "Aprovações pendentes", line: approvals ? `${approvals} esperando o seu OK` : "Nada esperando aprovação", path: "/meu-dia", icon: "check" as const, action: "Revisar" },
  ];
  return (
    <div className="ws-summary" role="list" aria-label="Resumo do Workspace">
      {cards.map((c) => (
        <article key={c.title} className="card ws-summary-card" role="listitem">
          <Icon name={c.icon} size={20} />
          <h3>{c.title}</h3>
          <p className="meta">{c.line}</p>
          <a
            href={c.path}
            className="btn ghost"
            onClick={(e) => {
              e.preventDefault();
              navigate(c.path);
            }}
          >
            {c.action}
          </a>
        </article>
      ))}
    </div>
  );
}

import { useState } from "react";
import { AGENTS, type AgentId } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { DigestBlock, FeedRow } from "../components/FeedViews.tsx";
import { fmtDay } from "../format.ts";

/** Meu dia: todos os resultados, agrupados por dia, filtráveis por agente. */
export function MyDay() {
  const app = useApp();
  const [filter, setFilter] = useState<AgentId | "all">("all");
  const items = (app.snap?.feed ?? []).filter((f) => filter === "all" || f.agentId === filter);
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const k = fmtDay(it.createdAt);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const agents: Array<AgentId | "all"> = ["all", "correio", "codigo", "sentinela"];
  return (
    <>
      <h1>Meu dia</h1>
      <p className="meta" style={{ margin: "4px 0 16px" }}>
        O que aconteceu, por que importa, quando foi observado e de onde veio.
      </p>
      <div className="tabs" role="tablist" aria-label="Filtrar por agente">
        {agents.map((a) => (
          <button key={a} role="tab" aria-selected={filter === a} onClick={() => setFilter(a)}>
            {a === "all" ? "Todos" : AGENTS[a].name}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="state" style={{ marginTop: 24 }}>
          <h2>Nenhum resultado {filter === "all" ? "ainda" : `do ${AGENTS[filter].name}`}.</h2>
          <p>Resultados aparecem aqui depois das rotinas. Nada é marcado como concluído sem confirmação real.</p>
        </div>
      ) : (
        [...groups.entries()].map(([day, list]) => (
          <section key={day} style={{ marginTop: 24 }}>
            <div className="day-sep">{day}</div>
            {list.map((it) =>
              it.kind === "email_digest" ? (
                <div key={it.id} style={{ marginBottom: 24 }}>
                  <DigestBlock item={it} showIntro={false} />
                </div>
              ) : (
                <ul key={it.id} className="list">
                  <FeedRow item={it} />
                </ul>
              ),
            )}
          </section>
        ))
      )}
    </>
  );
}

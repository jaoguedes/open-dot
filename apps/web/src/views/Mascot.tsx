import { useState } from "react";
import { AGENTS, toVisual, type AgentId, type SemanticState } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { AgentDot } from "../dot/AgentDot.tsx";

const STATES: Array<{ id: SemanticState; label: string }> = [
  { id: "idle", label: "Em repouso" },
  { id: "thinking", label: "Pensando" },
  { id: "working", label: "Trabalhando" },
  { id: "waiting", label: "Esperando seu OK" },
  { id: "question", label: "Perguntando" },
  { id: "success", label: "Concluído" },
  { id: "error", label: "Com erro" },
  { id: "disconnected", label: "Sem conexão" },
  { id: "sleep", label: "Dormindo" },
];

export function Mascot() {
  const app = useApp();
  const [agent, setAgent] = useState<AgentId>("dot");
  const [state, setState] = useState<SemanticState>("idle");
  const [signal, setSignal] = useState(0);
  const [note, setNote] = useState("");
  const visual = toVisual(agent, state);

  return (
    <>
      <h1>Mascote & aparência</h1>
      <p className="meta" style={{ margin: "4px 0 16px" }}>
        Motor em código (superelipse). Toque, três toques (tonto) e carinho. O GLB/three.js fica atrás de DOT_RENDERER=glb e não carrega neste caminho.
      </p>

      <section className="card" aria-label="Prévia do Dot" style={{ display: "grid", placeItems: "center", gap: 16, padding: 24, background: "var(--hero), var(--bg)" }}>
        <AgentDot
          visual={visual}
          accessory={app.accessoryFor(agent)}
          size={220}
          reducedMotion={app.reducedMotion}
          interactive
          affectionSignal={signal}
          onAffection={(r) => setNote(r === "ok" ? "" : r === "suppressed" ? "Carinho não aparece durante erro, aprovação ou desconexão." : r === "cooldown" ? "Aguarde um instante." : "")}
          ring={agent === "sentinela" && (state === "working" || state === "thinking")}
        />
        <div style={{ textAlign: "center" }}>
          <h2>{AGENTS[agent].name}</h2>
          <p className="meta">{visual.label}</p>
        </div>
        <div className="row-actions" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => setSignal((n) => n + 1)}>
            Fazer carinho
          </button>
        </div>
        {note && (
          <p role="status" className="tiny">
            {note}
          </p>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
        <fieldset className="card">
          <legend className="tiny">Agente (cor e acessório)</legend>
          {(["dot", "correio", "codigo", "sentinela"] as AgentId[]).map((a) => (
            <label key={a} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
              <input type="radio" name="agent" checked={agent === a} onChange={() => setAgent(a)} /> {AGENTS[a].name}
            </label>
          ))}
        </fieldset>
        <fieldset className="card">
          <legend className="tiny">Estado (prioridade: erro &gt; aprovação &gt; conexão &gt; execução)</legend>
          {STATES.map((s) => (
            <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
              <input type="radio" name="state" checked={state === s.id} onChange={() => setState(s.id)} /> {s.label}
            </label>
          ))}
        </fieldset>
      </div>

      <section className="card" style={{ marginTop: 16 }} aria-label="Preferências">
        <h2>Preferências</h2>
        <div className="switch">
          <label htmlFor="pf-theme">Tema</label>
          <select id="pf-theme" value={app.prefs.theme} onChange={(e) => app.setPrefs({ theme: e.target.value as "system" })}>
            <option value="system">Do sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </div>
        <div className="switch">
          <label htmlFor="pf-motion">Movimento</label>
          <select id="pf-motion" value={app.prefs.motion} onChange={(e) => app.setPrefs({ motion: e.target.value as "system" })}>
            <option value="system">Seguir o sistema</option>
            <option value="reduced">Reduzido</option>
            <option value="full">Completo</option>
          </select>
        </div>
        <div className="switch">
          <label htmlFor="pf-tr">Reduzir transparência</label>
          <input id="pf-tr" type="checkbox" checked={app.prefs.transparency === "reduced"} onChange={(e) => app.setPrefs({ transparency: e.target.checked ? "reduced" : "system" })} />
        </div>
        <div className="switch">
          <label htmlFor="pf-acc">Mostrar acessórios dos agentes</label>
          <input id="pf-acc" type="checkbox" checked={app.prefs.accessories} onChange={(e) => app.setPrefs({ accessories: e.target.checked })} />
        </div>
        <p className="tiny" style={{ marginTop: 8 }}>
          Preferências ficam neste navegador. Sem boca e sem sobrancelhas. O tracinho só aparece durante a absorção.
        </p>
      </section>
    </>
  );
}

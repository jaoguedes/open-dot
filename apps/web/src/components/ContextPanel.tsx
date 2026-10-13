import type { AgentId } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { Dot2D } from "./Dot2D.tsx";
import { Icon } from "./Icons.tsx";
import { fmtTime, RUN_LABEL } from "../format.ts";

export function ContextPanel({ open, onClose, agentId }: { open: boolean; onClose: () => void; agentId: AgentId }) {
  const app = useApp();
  const snap = app.snap;
  const visual = app.visualFor(agentId);
  const routine = snap?.routines.find((r) => r.kind === "email_review");
  const todayRuns = (snap?.runs ?? []).filter((r) => r.kind === "email_review").slice(0, 2);
  const gmail = snap?.connections.find((c) => c.provider === "gmail" && c.status !== "disabled");
  const demo = app.mode === "demo";
  return (
    <aside className={`context ${open ? "open" : ""}`} aria-label="Contexto">
      {open && (
        <button className="icon-btn" aria-label="Fechar contexto" onClick={onClose} style={{ alignSelf: "flex-end" }}>
          <Icon name="x" />
        </button>
      )}
      <div className="ctx-dot">
        <Dot2D visual={visual} accessory={app.accessoryFor(agentId)} size={130} animate reducedMotion={app.reducedMotion} interactive showBadge />
        <h2 style={{ marginTop: 8 }}>{visual.semantic === "idle" ? "Tudo no seu tempo." : visual.label}</h2>
        <p className="meta">{visual.reason ?? "Eu organizo. Você decide."}</p>
      </div>
      <section className="ctx-section">
        <h2>Rotina de hoje</h2>
        {routine ? (
          <ul className="timeline">
            {routine.times.map((t) => {
              const run = todayRuns.find((r) => r.scheduledAt && fmtTime(r.scheduledAt) === t);
              return (
                <li key={t}>
                  <span className={`ring ${run?.state === "succeeded" ? "done" : ""}`} aria-hidden="true" />
                  <span>
                    {t} · Revisão de e-mail
                    <div className="tiny">{run ? `${RUN_LABEL[run.state] ?? run.state}${demo ? " · exemplo" : ""}` : "Próxima revisão"}</div>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="meta">Sem rotina ativa.</p>
        )}
        <a href="/rotinas" className="btn ghost" style={{ marginTop: 8, paddingLeft: 0 }} onClick={(e) => (e.preventDefault(), app.navigate("/rotinas"))}>
          Ajustar rotina <Icon name="arrow" size={14} />
        </a>
      </section>
      <section className="ctx-section">
        <h2>Contexto disponível</h2>
        <dl className="kv">
          <dt>E-mail</dt>
          <dd>{demo ? "20 mensagens de exemplo" : gmail ? (gmail.status === "connected" ? gmail.accountLabel : "precisa reconectar") : "não conectado"}</dd>
          <dt>Sites</dt>
          <dd>{demo ? "exemplo · simulação" : snap?.monitors.length ? `${snap.monitors.length} cadastrado(s)` : "nenhum"}</dd>
          <dt>GitHub</dt>
          <dd>{snap?.configured.github ? "webhook ativo" : "não configurado"}</dd>
        </dl>
      </section>
      <section className="ctx-section">
        <h2>Você mantém o controle</h2>
        <p className="meta">Enviar, arquivar ou alterar algo sempre passa pela sua aprovação do conteúdo exato.</p>
      </section>
    </aside>
  );
}

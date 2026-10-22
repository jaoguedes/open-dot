// SPDX-License-Identifier: AGPL-3.0-only
/** Painel da bandeja (v0.3, C1): resumo real e atalhos. Aprovar nunca acontece aqui. */
import { toVisual } from "@open-dot/core";
import { AgentDot } from "@open-dot/mascot";
import { errorText, invoke } from "./bridge.ts";
import { connectionLine, semanticOf } from "./Central.tsx";
import { PROFILE_LABEL, pct, type RunnerData } from "./state.ts";

export function Panel({ data, reduced }: { data: RunnerData; reduced: boolean }) {
  const conn = connectionLine(data);
  const s = data.health?.sample;
  const waiting = data.diagnostics?.activeTask?.phase === "awaiting_approval";
  const paused = Boolean(data.companion?.settings.queuePaused);
  return (
    <main className="panel" aria-label="Painel do Runner">
      <header className="row-v3">
        <AgentDot visual={toVisual("dot", semanticOf(data))} accessory="none" size={60} reducedMotion={reduced} heat={data.mood.heat} strain={data.mood.strain} {...(data.mood.reason ? { reason: data.mood.reason } : {})} label="Dot" />
        <div className="grow">
          <b>{conn.title}</b>
          <div className={conn.ok ? "plus sub" : "sub"}>{conn.detail}</div>
        </div>
      </header>
      <div className="row-v3">
        <div className="grow">
          <b>{data.diagnostics?.activeTask ? (waiting ? "Proposta esperando você" : "Tarefa em andamento") : "Nenhuma tarefa agora"}</b>
          <div className="sub">{data.companion?.paused ?? "A aprovação acontece na tela de revisão."}</div>
        </div>
        <button className="btn v3" type="button" disabled={!data.diagnostics?.channel?.paired} onClick={() => void invoke("open_review").catch((e) => data.setError(errorText(e, "Não consegui abrir.")))}>
          Revisar
        </button>
      </div>
      <div className="row-v3">
        <div className="grow">
          <b>{data.mood.reason ?? "Computador tranquilo"}</b>
          <div className="sub">
            CPU {pct(s?.cpu)} · memória {pct(s?.memory)}
            {s?.battery ? ` · bateria ${pct(s.battery.percent)}` : ""}
          </div>
        </div>
      </div>
      <p className="sub">
        Versão {data.companion?.version ?? "—"} · Perfil {data.companion ? PROFILE_LABEL[data.companion.effective] : "—"}
      </p>
      {data.error && <p role="alert">{data.error}</p>}
      <div className="row-actions">
        <button className="btn primary v3" type="button" onClick={() => void invoke("main_show")}>
          Abrir Runner
        </button>
        <button className="btn v3" type="button" disabled={!data.companion} onClick={() => void data.save({ queuePaused: !paused })}>
          {paused ? "Retomar fila" : "Pausar fila"}
        </button>
      </div>
      <p className="tiny">Para sair do Runner, use o menu do ícone na barra (clique direito).</p>
    </main>
  );
}

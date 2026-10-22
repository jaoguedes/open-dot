// SPDX-License-Identifier: AGPL-3.0-only
/** Central do Runner (v0.3): estado real dos computadores pareados, aprovações, tarefas e eventos. */
import { useMemo } from "react";
import { toVisual } from "@open-dot/core";
import { fileDiffs, parseProposal, totals } from "@open-dot/core/approval-view.ts";
import { AgentDot } from "@open-dot/mascot";
import { useApp } from "../store.tsx";
import { RunnerWorkspace } from "../components/RunnerWorkspace.tsx";
import { decide, projectLabel, STATE_LABEL, useRunner, type RunnerTask } from "../runner-data.ts";
import { AgentDisc, DemoChip, MonoLabel, agentColor, agentName } from "../components/ui.tsx";
import { fmtDateTime } from "../format.ts";
import "../workspace.css";
import "../screens.css";

export function Runner() {
  const app = useApp();
  const demo = app.mode === "demo";
  const r = useRunner(demo);
  const pending = r.tasks.filter((t) => t.state === "awaiting_approval" && r.details[t.id]?.approval?.decision === "pending");
  const running = r.tasks.filter((t) => t.state === "running" || t.state === "cancel_requested");
  const queued = r.tasks.filter((t) => t.state === "queued");
  const online = r.devices.filter((d) => d.online && !d.revoked);
  const active = running[0] ?? pending[0] ?? null;
  const tint = active ? agentColor(active.mechanism) : null;
  const sem = r.status === "erro" ? "error" : pending.length ? "waiting" : running.length ? "working" : r.devices.length && !online.length ? "disconnected" : "idle";
  const title = r.status === "carregando" ? "Conferindo o Runner…" : !r.devices.length ? "Nenhum computador pareado" : online.length ? "Runner conectado" : "Runner sem confirmação recente";
  return (
    <section className="screen runner-v3" aria-labelledby="runner-title">
      <header className="screen-head-v3">
        <MonoLabel>CENTRAL DO RUNNER</MonoLabel>
        {demo && <DemoChip />}
      </header>
      <section className="hero-v3 hero-compact">
        <div>
          <h1 id="runner-title">{title}</h1>
          <p>
            {online.length
              ? `Heartbeat confirmado em ${online.length === 1 ? "1 computador" : `${online.length} computadores`}. O Dot trabalha aí, com as ferramentas que você já tem; nada sai sem a sua aprovação.`
              : r.devices.length
                ? "O servidor não recebeu sinal recente do Runner. Abra o aplicativo no computador para ele voltar."
                : "Instale o Runner no computador e conecte com um código de uso único, mais abaixo."}
          </p>
        </div>
        <AgentDot visual={toVisual("dot", sem)} accessory="none" size={150} reducedMotion={app.reducedMotion} label="Dot do Runner" {...(tint ? { tint: { color: tint, intensity: 100 } } : {})} />
      </section>
      {r.status === "erro" && (
        <p role="alert">
          Não consegui falar com o servidor: {r.error}{" "}
          <button className="btn ghost" type="button" onClick={r.refresh}>
            Tentar de novo
          </button>
        </p>
      )}
      {r.status === "offline" && <p role="status">Você está offline. Os números abaixo podem estar desatualizados.</p>}
      <div className="metrics-v3" role="list" aria-label="Resumo">
        {(
          [
            [running.length, "Em andamento"],
            [pending.length, "Aguardando você"],
            [queued.length, "Na fila"],
            [online.length, "Computadores online"],
          ] as const
        ).map(([n, label]) => (
          <div key={label} className="card-v3 metric-v3" role="listitem">
            <b className={label === "Aguardando você" && n ? "plus" : undefined}>{r.status === "carregando" ? "—" : n}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="runner-cols">
        <section className="card-v3" aria-labelledby="rn-pend">
          <h2 id="rn-pend">Aprovações pendentes</h2>
          {!pending.length && <p className="meta">Nada esperando você agora.</p>}
          {pending.map((t) => (
            <PendingRow key={t.id} task={t} raw={r.details[t.id]!.approval!.raw} hash={r.details[t.id]!.approval!.hash} label={projectLabel(r.devices, t.projectId)} demo={demo} go={app.navigate} onDone={r.refresh} />
          ))}
          <p className="tiny">Aprovar acontece na tela de revisão, com o diff e o hash completos.</p>
        </section>
        <section className="card-v3" aria-labelledby="rn-live">
          <h2 id="rn-live">Execução em tempo real</h2>
          {running.length ? (
            running.map((t) => (
              <div key={t.id} className="row-v3">
                <AgentDisc id={t.mechanism} size={32} />
                <div className="grow">
                  <b>
                    {agentName(t.mechanism)} · {projectLabel(r.devices, t.projectId)}
                  </b>
                  <div className="sub">{(r.details[t.id]?.events.at(-1)?.text ?? STATE_LABEL[t.state] ?? t.state).slice(0, 160)}</div>
                </div>
              </div>
            ))
          ) : (
            <p className="meta">Nenhuma tarefa rodando.</p>
          )}
        </section>
      </div>
      <div className="runner-cols">
        <section className="card-v3" aria-labelledby="rn-time">
          <h2 id="rn-time">Linha do tempo</h2>
          {r.tasks.length ? (
            <ol className="timeline-v3">
              {r.tasks.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <b>{STATE_LABEL[t.state] ?? t.state}</b> · {agentName(t.mechanism)} · {projectLabel(r.devices, t.projectId)} · {fmtDateTime(new Date(t.updatedAt).toISOString())}
                </li>
              ))}
            </ol>
          ) : (
            <p className="meta">Nenhuma tarefa ainda.</p>
          )}
        </section>
        <section className="card-v3" aria-labelledby="rn-proj">
          <h2 id="rn-proj">Estado do projeto</h2>
          {r.devices.length ? (
            r.devices.map((d) => (
              <div key={d.id} className="stack-6">
                <b>{d.name}</b> <span className="sub">· {d.revoked ? "revogado" : d.online ? "heartbeat confirmado" : "sem confirmação recente"}</span>
                <div className="sub">Pastas autorizadas: {d.projects.length ? d.projects.map((p) => p.label).join(", ") : "nenhuma"}</div>
                <div className="sub">
                  Ferramentas: {d.drivers.map((x) => `${agentName(x.id)} ${x.installed ? (x.authenticated ? (x.executable ? "pronta" : "bloqueada") : "sem login") : "não instalada"}`).join(" · ") || "sem diagnóstico"}
                </div>
              </div>
            ))
          ) : (
            <p className="meta">Sem computador pareado.</p>
          )}
          <button className="btn v3" type="button" disabled aria-describedby="rn-editor">
            Abrir no editor
          </button>
          <p className="tiny" id="rn-editor">
            Disponível só no Runner desktop: o navegador não abre pastas do seu computador.
          </p>
        </section>
      </div>
      <details className="card-v3 runner-advanced">
        <summary>Parear um computador e enviar uma tarefa</summary>
        <RunnerWorkspace demo={demo} />
      </details>
    </section>
  );
}

function PendingRow({ task, raw, hash, label, demo, go, onDone }: { task: RunnerTask; raw: string; hash: string; label: string; demo: boolean; go: (p: string) => void; onDone: () => void }) {
  const t = useMemo(() => {
    const p = parseProposal(raw);
    return p ? { ...totals(fileDiffs(p)), summary: p.summary } : null;
  }, [raw]);
  const review = () => go(`/aprovacoes?tarefa=${encodeURIComponent(task.id)}`);
  return (
    <div className="row-v3">
      <AgentDisc id={task.mechanism} size={36} />
      <div className="grow">
        <b>{t?.summary.slice(0, 70) ?? "Proposta"}</b>
        <div className="sub">
          {label} · branch <code>agent/{task.id.slice(0, 8)}</code>
          {t && (
            <>
              {" "}
              · <span className="plus">+{t.adicionadas}</span> <span className="minus">−{t.removidas}</span>
            </>
          )}
        </div>
      </div>
      <div className="row-actions">
        <button className="btn v3" type="button" onClick={review}>
          Revisar
        </button>
        <button className="btn v3 danger" type="button" disabled={demo} onClick={() => void decide(task.id, hash, "reject").then(onDone, () => onDone())}>
          Rejeitar
        </button>
        <button className="btn approve v3" type="button" onClick={review} aria-label="Aprovar (abre a revisão com o diff e o hash)">
          Aprovar…
        </button>
      </div>
    </div>
  );
}

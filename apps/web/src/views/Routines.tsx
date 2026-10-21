// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { AGENTS } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { api, ApiError, type Routine } from "../api.ts";
import { Icon } from "../components/Icons.tsx";
import { fmtDateTime, fmtTime, RUN_LABEL } from "../format.ts";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function weekDates(): Date[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function Routines() {
  const app = useApp();
  const [tab, setTab] = useState<"semana" | "lista">("semana");
  const routines = app.snap?.routines ?? [];
  const runs = app.snap?.runs ?? [];
  const times = [...new Set(routines.filter((r) => r.enabled).flatMap((r) => r.times))].sort();
  const dates = weekDates();
  return (
    <>
      <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <h1>Uma rotina. Menos ruído.</h1>
          <p className="meta" style={{ marginTop: 4 }}>
            {routines[0]?.timeZone ?? "America/Sao_Paulo"} · roda na nuvem, com seu computador desligado.
          </p>
        </div>
        <div className="tabs" role="tablist" aria-label="Visualização">
          <button role="tab" aria-selected={tab === "semana"} onClick={() => setTab("semana")}>
            Semana
          </button>
          <button role="tab" aria-selected={tab === "lista"} onClick={() => setTab("lista")}>
            Lista
          </button>
        </div>
      </div>

      {routines.length === 0 ? (
        <div className="state" style={{ marginTop: 24 }}>
          <h2>Nenhuma rotina ainda.</h2>
          <p>A revisão de e-mail das 08h e 17h é criada quando você entra ou conecta o Gmail.</p>
        </div>
      ) : tab === "semana" ? (
        <div className="table-scroll" style={{ marginTop: 24 }}>
          <div className="week" role="table" aria-label="Agenda da semana">
            <div className="h" role="columnheader" />
            {dates.map((d, i) => (
              <div key={i} className="h" role="columnheader">
                {DAYS[i]}
                <b>{d.getDate()}</b>
              </div>
            ))}
            {times.map((t) => (
              <Row key={t} time={t} routines={routines} dates={dates} />
            ))}
          </div>
          <p className="tiny" style={{ marginTop: 8 }}>
            Revisões: {times.join(" e ")}. {app.mode === "demo" ? "Prévia de agenda — não está executando." : "Executadas pelo agendador remoto a cada 5 minutos."}
          </p>
        </div>
      ) : (
        <ul className="list" style={{ marginTop: 24 }}>
          {routines.map((r) => (
            <li key={r.id} className="item">
              <span className="icon">
                <Icon name="clock" />
              </span>
              <div>
                <h3>
                  {AGENTS[r.agentId].name} · revisão de e-mail {!r.enabled && <span className="chip">Pausada</span>}
                </h3>
                <p>
                  {r.times.join(", ")} · {r.timeZone} · próxima: {r.nextRunAt ? fmtDateTime(r.nextRunAt) : "—"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {routines.map((r) => (
        <RoutineEditor key={r.id} r={r} />
      ))}

      <h2 style={{ marginTop: 32 }}>Execuções recentes</h2>
      {runs.length === 0 ? (
        <p className="meta" style={{ marginTop: 8 }}>
          Nenhuma execução ainda.
        </p>
      ) : (
        <ul className="list" style={{ marginTop: 8 }}>
          {runs.slice(0, 10).map((r) => (
            <li key={r.id} className="mail">
              <span>
                {AGENTS[r.agentId]?.name ?? r.agentId} · {r.scheduledAt ? fmtDateTime(r.scheduledAt) : "—"}
                {r.late && " (atrasada)"}
              </span>
              <span className={`chip ${r.state === "failed" || r.state === "uncertain" ? "err" : r.state === "succeeded" ? "ok" : r.state === "waiting_quota" ? "warn" : ""}`}>
                {RUN_LABEL[r.state] ?? r.state}
              </span>
              {r.errorMessage && <span className="why">{r.errorMessage}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Row({ time, routines, dates }: { time: string; routines: Routine[]; dates: Date[] }) {
  return (
    <>
      <div role="rowheader" className="tiny">
        {time}
      </div>
      {dates.map((d, i) => {
        const r = routines.find((x) => x.enabled && x.times.includes(time) && (!x.weekdays.length || x.weekdays.includes(d.getDay())));
        return (
          <div key={i} role="cell">
            {r && (
              <div className="slot">
                <b>{AGENTS[r.agentId].name}</b>
                {time}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function RoutineEditor({ r }: { r: Routine }) {
  const app = useApp();
  const [times, setTimes] = useState(r.times);
  const [enabled, setEnabled] = useState(r.enabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const demo = app.mode === "demo";
  const save = async () => {
    try {
      const res = await api.updateRoutine(r.id, { times, timeZone: r.timeZone, enabled });
      setMsg({ ok: true, text: `Salvo.${res.cancelledFutureRuns ? ` ${res.cancelledFutureRuns} execução futura foi cancelada.` : ""}` });
      await app.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Não consegui salvar." });
    }
  };
  const runNow = async () => {
    try {
      const res = await api.runNow(r.id);
      setMsg({ ok: true, text: res.note });
      await app.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Não consegui agendar." });
    }
  };
  return (
    <section className="card" style={{ marginTop: 24 }} aria-labelledby={`ed-${r.id}`}>
      <h2 id={`ed-${r.id}`}>Ajustar horários · {AGENTS[r.agentId].name}</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
        {times.map((t, i) => (
          <label key={i} className="field">
            Revisão {i + 1}
            <input type="time" value={t} disabled={demo} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
        <label className="field" style={{ justifyContent: "end" }}>
          <span>
            <input type="checkbox" checked={enabled} disabled={demo} onChange={(e) => setEnabled(e.target.checked)} /> Ativa
          </span>
        </label>
      </div>
      <div className="row-actions">
        <button className="btn primary" onClick={() => void save()} disabled={demo}>
          Salvar
        </button>
        <button className="btn" onClick={() => void runNow()} disabled={demo}>
          Rodar agora
        </button>
        {demo && <span className="tiny">Indisponível na demonstração.</span>}
        {msg && (
          <span role="status" className={`chip wrap ${msg.ok ? "ok" : "err"}`}>
            {msg.text}
          </span>
        )}
      </div>
      <p className="tiny" style={{ marginTop: 8 }}>
        Próxima: {r.nextRunAt ? `${fmtTime(r.nextRunAt)} (${fmtDateTime(r.nextRunAt)})` : "—"}. Mudar o horário cancela execuções futuras que ainda não começaram.
      </p>
    </section>
  );
}

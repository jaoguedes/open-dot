// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { MECHANISMS } from "@open-dot/core/mechanisms.ts";
import { useApp } from "../store.tsx";
import { MechanismLabel } from "../components/Mechanisms.tsx";
import { ProjectContext } from "../components/ProjectContext.tsx";
import { ProjectMemory } from "../components/ProjectMemory.tsx";
import { handoffStatus } from "../handoff.ts";
import "../screens.css";

import type { Driver } from "../handoff.ts";
interface Device {
  id: string;
  name: string;
  online: boolean;
  revoked: boolean;
  projects: Array<{ id: string; label: string }>;
  drivers: Driver[];
}

/** Memória e handoff: dados do projeto, nunca permissão de execução. */
export function Memory() {
  const app = useApp();
  const demo = app.mode === "demo";
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState("");
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    fetch("/api/runner/devices", { credentials: "same-origin", cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message ?? "Runner indisponível.");
        setDevices((data.devices as Device[]).filter((d) => !d.revoked));
      })
      .catch((e: unknown) => {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Runner indisponível.");
      });
    return () => abort.abort();
  }, [demo]);
  const projects = devices.flatMap((d) => d.projects.map((p) => ({ ...p, device: d })));
  const current = projects.find((p) => `${p.device.id}:${p.id}` === selection) ?? projects[0];
  return (
    <section className="screen" aria-labelledby="memory-title">
      <header className="screen-head">
        <p className="ws-eyebrow">PROJETO / MEMÓRIA</p>
        <h1 id="memory-title">Memória e handoff</h1>
        <p className="meta">Contexto do projeto, decisões e pacotes de continuidade para o próximo agente ler. Memória é dado: não concede ferramentas nem aprova alterações.</p>
      </header>
      {demo && (
        <article className="card stack-10">
          <p className="chip m-0">Demonstração: os projetos aparecem quando um Runner real estiver pareado. Nada aqui está conectado.</p>
          <button className="btn" onClick={() => app.navigate("/runner")}>
            Ver o Runner
          </button>
        </article>
      )}
      {error && <p role="alert">{error}</p>}
      {!demo && !error && projects.length === 0 && (
        <article className="card stack-10">
          <h2>Nenhum projeto autorizado</h2>
          <p className="meta">Pareie um computador e autorize uma pasta no Runner. A memória fica separada por projeto e exige consentimento.</p>
          <button className="btn" onClick={() => app.navigate("/runner")}>
            Abrir Runner
          </button>
        </article>
      )}
      {current && (
        <>
          <article className="card screen-project">
            <div>
              <h2>{current.label}</h2>
              <p className="tiny">
                No computador {current.device.name} · {current.device.online ? "online" : "offline"}
              </p>
            </div>
            {projects.length > 1 && (
              <label className="tiny">
                Projeto{" "}
                <select value={`${current.device.id}:${current.id}`} onChange={(e) => setSelection(e.target.value)}>
                  {projects.map((p) => (
                    <option key={`${p.device.id}:${p.id}`} value={`${p.device.id}:${p.id}`}>
                      {p.label} · {p.device.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </article>
          <div className="screen-grid">
            <ProjectMemory projectId={current.id} demo={demo} />
            <ProjectContext projectId={current.id} demo={demo} />
          </div>
          <article className="card stack-10" aria-labelledby="handoff-title">
            <h2 id="handoff-title">Handoff para agentes</h2>
            <p className="meta">
              O pacote de continuidade (Passport, estado do Git, tarefas e operações incertas) é exportado acima e lido pelo próximo agente. Credenciais nunca entram no pacote e efeitos incertos não
              são repetidos.
            </p>
            <ul className="screen-list">
              {MECHANISMS.map((m) => {
                const s = handoffStatus(
                  current.device.drivers.find((d) => d.id === m.id),
                  current.device.online,
                );
                return (
                  <li key={m.id} className="row-between">
                    <MechanismLabel id={m.id} />
                    <span className={`status-pill ${s.tone}`}>{s.label}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        </>
      )}
    </section>
  );
}

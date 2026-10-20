import { useEffect, useRef, useState } from "react";
import { MECHANISMS, type MechanismId } from "@open-dot/core/mechanisms.ts";
import { MechanismLabel } from "./Mechanisms.tsx";
interface Driver {
  id: MechanismId;
  installed: boolean;
  authenticated: boolean;
  executable: boolean;
  reason: string;
}
interface Device {
  id: string;
  name: string;
  online: boolean;
  revoked: boolean;
  projects: Array<{ id: string; label: string }>;
  drivers: Driver[];
}
interface Task {
  id: string;
  deviceId: string;
  mechanism: MechanismId;
  state: string;
  cancelRequested: number;
  updatedAt: number;
}
interface Approval {
  hash: string;
  decision: "pending" | "approve" | "reject" | "expired";
  expiresAt: number;
}
interface Event {
  seq: number;
  kind: string;
  text: string;
}
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`/api/runner/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { "x-open-dot": "1", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : "Runner indisponível. Confira sua sessão e a versão do servidor.");
  return data as T;
}
export function RunnerWorkspace({ demo }: { demo: boolean }) {
  const [devices, setDevices] = useState<Device[]>([]),
    [tasks, setTasks] = useState<Task[]>([]);
  const [deviceId, setDeviceId] = useState(""),
    [projectId, setProjectId] = useState(""),
    [mechanism, setMechanism] = useState<MechanismId>("codex");
  const [prompt, setPrompt] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [events, setEvents] = useState<Event[]>([]),
    [revision, setRevision] = useState(0);
  const device = devices.find((d) => d.id === deviceId);
  const ready = device?.online && device.drivers.some((d) => d.id === mechanism && d.authenticated && d.executable) && device.projects.some((p) => p.id === projectId);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (document.hidden) {
        timer = setTimeout(() => void refresh(), 5000);
        return;
      }
      try {
        const d = await request<{ devices: Device[] }>("devices", undefined, controller.signal);
        const t = await request<{ tasks: Task[] }>("tasks", undefined, controller.signal);
        if (controller.signal.aborted) return;
        setDevices(d.devices);
        setTasks(t.tasks);
        setConnectionError("");
        if (selected) {
          const e = await request<{ events: Event[]; approval?: Approval | null }>(`tasks/${encodeURIComponent(selected)}/events`, undefined, controller.signal);
          if (!controller.signal.aborted) {
            setEvents(e.events);
            setApproval(e.approval ?? null);
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setDevices((old) => old.map((d) => ({ ...d, online: false })));
          setConnectionError("Sem confirmação do servidor. Disponibilidade e eventos podem estar desatualizados.");
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 5000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [demo, selected, revision]);
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ id?: string }>(path, body);
      setRevision((r) => r + 1);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação não confirmada.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ws-runner card" aria-label="Execução no Runner">
      <div>
        <h2>Projetos e execuções</h2>
        <p className="meta">O Dot acompanha o trabalho. O computador pareado confirma presença, pastas e mecanismos disponíveis.</p>
      </div>
      <details>
        <summary>Parear um computador</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate("pairings/approve", { code: code.trim(), name: name.trim() }).then((r) => {
              if (r) {
                setCode("");
                setName("");
              }
            });
          }}
        >
          <p className="tiny">Gere o código no Runner desktop. Confira o nome e o endereço do Open Dot nos dois lados. Nunca informe senha, chave de API ou token aqui.</p>
          <label htmlFor="pair-code">Código exibido pelo Runner</label>
          <input id="pair-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={16} autoComplete="off" />
          <label htmlFor="pair-name">Nome exato exibido pelo Runner</label>
          <input id="pair-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
          <button className="btn" disabled={demo || busy || code.trim().length !== 16 || !name.trim()}>
            Confirmar dispositivo
          </button>
        </form>
      </details>
      <div className="ws-device-list">
        {devices.map((d) => (
          <div key={d.id}>
            <b>{d.name}</b> · {d.revoked ? "Revogado" : d.online ? "Heartbeat confirmado" : "Sem confirmação recente"}
            <button className="btn ghost" disabled={busy || d.revoked || demo} onClick={() => void mutate(`devices/${encodeURIComponent(d.id)}/revoke`, {})}>
              Revogar {d.name}
            </button>
          </div>
        ))}
      </div>
      <form
        className="ws-runner-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || busy) return;
          const fingerprint = JSON.stringify({ deviceId, projectId, mechanism, prompt });
          if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() };
          void mutate("tasks", { deviceId, projectId, mechanism, prompt, requestKey: pending.current.key }).then((r) => {
            if (r?.id) {
              pending.current = null;
              setSelected(r.id);
              setPrompt("");
            }
          });
        }}
      >
        <div className="ws-project-select">
          <label>
            Computador
            <select
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                setProjectId("");
              }}
            >
              <option value="">Selecione um Runner</option>
              {devices
                .filter((d) => !d.revoked)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.online ? "" : " · offline"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Projeto autorizado
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!device?.online}>
              <option value="">Autorize uma pasta no Runner</option>
              {device?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mechanism-grid">
          {MECHANISMS.map((m) => {
            const d = device?.drivers.find((d) => d.id === m.id);
            return (
              <article className="mechanism-card" data-mechanism={m.id} key={m.id}>
                <label>
                  <input type="radio" name="runner-mechanism" value={m.id} checked={mechanism === m.id} onChange={() => setMechanism(m.id)} />
                  <MechanismLabel id={m.id} />
                </label>
                <p>
                  {d
                    ? `${d.installed ? (d.authenticated ? "Autenticado" : "Login não confirmado") : "Não instalado"} · ${d.executable ? "Driver habilitado" : "Execução bloqueada"}`
                    : "Sem diagnóstico de Runner selecionado"}
                </p>
                {d && <p className="tiny">{d.reason}</p>}
              </article>
            );
          })}
        </div>
        <label htmlFor="runner-prompt">Tarefa para o mecanismo</label>
        <textarea id="runner-prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={8000} placeholder="Descreva a tarefa e o resultado esperado." />
        <p className="tiny">
          Modo inicial do Codex: propõe até oito arquivos e 8 KB de conteúdo. Você revisa os conteúdos antes da aplicação no worktree isolado. Shell e testes de projeto estão desabilitados; Claude
          Code e Cursor continuam sem execução disponível.
        </p>
        <button className="btn primary" disabled={demo || busy || !ready || !prompt.trim()}>
          Enviar ao Runner
        </button>
      </form>
      {demo && <p className="tiny">Demonstração: pareamento e envio desabilitados.</p>}
      {connectionError && <p role="status">{connectionError}</p>}
      {error && <p role="alert">{error}</p>}
      {!!tasks.length && (
        <div className="ws-executions">
          <h3>Tarefas do Runner</h3>
          {tasks.map((t) => (
            <div key={t.id}>
              <button
                className="btn"
                aria-pressed={selected === t.id}
                onClick={() => {
                  setEvents([]);
                  setApproval(null);
                  setSelected(t.id);
                }}
              >
                <MechanismLabel id={t.mechanism} />
                {{ queued: "Na fila", running: "Em execução", awaiting_approval: "Esperando sua aprovação", completed: "Concluída no worktree", failed: "Falhou", cancelled: "Cancelada", cancel_requested: "Aguardando confirmação de parada", uncertain: "Efeitos incertos · revisão necessária" }[t.state] ??
                  t.state}
                {t.cancelRequested ? " · interrupção solicitada" : ""}
              </button>
              {["queued", "running", "awaiting_approval"].includes(t.state) && (
                <button className="btn ghost" disabled={busy || !!t.cancelRequested} onClick={() => void mutate(`tasks/${encodeURIComponent(t.id)}/cancel`, {})}>
                  Interromper tarefa
                </button>
              )}
            </div>
          ))}
          <div className="ws-runner-events" role="log" aria-label="Eventos do Runner">
            {events.map((e) => (
              <article key={e.seq}>
                <b>{e.kind}</b>
                {e.kind === "proposal" ? <ProposalView text={e.text} /> : <pre>{e.text}</pre>}
              </article>
            ))}
          </div>
          {approval && (
            <section className="ws-approval card" aria-label="Aprovação de arquivos">
              <h3>Revisar os arquivos propostos</h3>
              <p>Leia o conteúdo completo acima. Aprovar vale apenas para esta proposta, na pasta isolada. Não concede shell, rede, commit, push ou acesso a outros caminhos.</p>
              {approval.decision === "pending" ? (
                <>
                  <p className="tiny">Válida até {new Date(approval.expiresAt).toLocaleTimeString("pt-BR")}. Os arquivos originais do seu projeto não são alterados.</p>
                  <button
                    className="btn primary"
                    disabled={demo || busy || Date.now() >= approval.expiresAt || !devices.some((d) => d.id === tasks.find((t) => t.id === selected)?.deviceId && d.online)}
                    onClick={() => void mutate(`tasks/${encodeURIComponent(selected)}/decision`, { hash: approval.hash, decision: "approve" })}
                  >
                    Aprovar estes arquivos no worktree
                  </button>
                  <button
                    className="btn"
                    disabled={demo || busy || Date.now() >= approval.expiresAt}
                    onClick={() => void mutate(`tasks/${encodeURIComponent(selected)}/decision`, { hash: approval.hash, decision: "reject" })}
                  >
                    Rejeitar proposta
                  </button>
                </>
              ) : (
                <p role="status">
                  {approval.decision === "approve" ? "Proposta aprovada. Aguarde a confirmação de aplicação do Runner." : approval.decision === "reject" ? "Proposta rejeitada." : "Proposta expirada."}
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function ProposalView({ text }: { text: string }) {
  try {
    const p = JSON.parse(text) as { summary: string; files: Array<{ path: string; content: string; beforeHash: string | null }> };
    return (
      <div>
        <p>{p.summary}</p>
        {p.files.map((f) => (
          <section key={f.path}>
            <h4>
              {f.path} · {f.beforeHash ? "substituição do conteúdo" : "arquivo novo"}
            </h4>
            <pre>{f.content}</pre>
          </section>
        ))}
      </div>
    );
  } catch {
    return <pre>{text}</pre>;
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
/** Central do Runner (v0.3, C5): abas com estado real; o assistente só aparece no primeiro uso. */
import { useState, type ReactNode } from "react";
import { toVisual } from "@open-dot/core";
import { AgentDot } from "@open-dot/mascot";
import { Mechanisms } from "../../web/src/components/Mechanisms.tsx";
import { errorText, invoke } from "./bridge.ts";
import { PROFILE_LABEL, gb, mb, pct, type RunnerData } from "./state.ts";

type Tab = "hoje" | "tarefas" | "aprovacoes" | "ferramentas" | "saude" | "processos" | "atualizacoes" | "ajustes";
const TABS: Array<[Tab, string, string]> = [
  ["hoje", "Hoje", "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"],
  ["tarefas", "Tarefas", "M10 6h10M10 12h10M10 18h10M3.5 4.5h3v3h-3zM3.5 10.5h3v3h-3zM3.5 16.5h3v3h-3z"],
  ["aprovacoes", "Aprovações", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l2.7 2.7L16 9.5"],
  ["ferramentas", "Ferramentas", "M5.5 4.5h13A2.5 2.5 0 0 1 21 7v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7a2.5 2.5 0 0 1 2.5-2.5ZM7 10l3 2.5L7 15M12.5 15H17"],
  ["saude", "Saúde", "M3 12h4l2.5-6 4 12 2.5-6H21"],
  ["processos", "Processos", "M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"],
  ["atualizacoes", "Atualizações", "M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"],
  ["ajustes", "Ajustes", "M4 7h9M17 7h3M4 17h3M11 17h9M15 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
];

function Ico({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function semanticOf(d: RunnerData): "idle" | "working" | "waiting" | "error" | "disconnected" {
  if (d.error) return "error";
  if (d.diagnostics?.activeTask?.phase === "awaiting_approval") return "waiting";
  if (d.diagnostics?.activeTask) return "working";
  if (d.diagnostics && !d.diagnostics.channel?.online) return "disconnected";
  return "idle";
}

export function connectionLine(d: RunnerData): { title: string; detail: string; ok: boolean } {
  const ch = d.diagnostics?.channel;
  if (!d.diagnostics) return { title: "Conferindo o Runner…", detail: "", ok: false };
  if (!ch?.paired) return { title: "Sem conexão com o Open Dot", detail: "Pareie em Ajustes para receber tarefas.", ok: false };
  if (ch.online) return { title: "Conectado e pronto", detail: "Canal com o Open Dot confirmado.", ok: true };
  return { title: "Sem confirmação de rede", detail: ch.message || "O servidor não respondeu ao último contato.", ok: false };
}

export function Central({ data, reduced, onRedoSetup }: { data: RunnerData; reduced: boolean; onRedoSetup: () => void }) {
  const [tab, setTab] = useState<Tab>("hoje");
  const c = data.companion;
  const conn = connectionLine(data);
  return (
    <div className="central">
      <nav className="central-rail" aria-label="Seções do Runner">
        <AgentDot visual={toVisual("dot", semanticOf(data))} accessory="none" size={48} animate={false} reducedMotion={reduced} label="Open Dot Runner" />
        {TABS.map(([id, label, d]) => (
          <button key={id} type="button" className="central-tab" aria-label={label} title={label} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
            <Ico d={d} />
            {id === "aprovacoes" && data.diagnostics?.activeTask?.phase === "awaiting_approval" && <span className="badge-dot" aria-hidden="true" />}
          </button>
        ))}
      </nav>
      <main className="central-main" id="conteudo">
        <div className="central-head">
          <span className="mono-label">{TABS.find((t) => t[0] === tab)![1].toUpperCase()}</span>
          {c && <span className="chip-v3">Perfil: {PROFILE_LABEL[c.effective]}</span>}
        </div>
        {data.error && (
          <p role="alert" className="runner-error">
            {data.error}
          </p>
        )}
        {c?.paused && (
          <p role="status" className="banner-v3">
            Fila pausada. {c.paused} A tarefa em andamento não é cancelada.{" "}
            {c.settings.queuePaused && (
              <button className="btn v3" type="button" onClick={() => void data.save({ queuePaused: false })}>
                Retomar
              </button>
            )}
          </p>
        )}
        {tab === "hoje" && <Today data={data} reduced={reduced} conn={conn} go={setTab} />}
        {tab === "tarefas" && <Tasks data={data} />}
        {tab === "aprovacoes" && <Approvals data={data} />}
        {tab === "ferramentas" && <Tools />}
        {tab === "saude" && <Health data={data} reduced={reduced} />}
        {tab === "processos" && <Processes data={data} />}
        {tab === "atualizacoes" && <Updates data={data} />}
        {tab === "ajustes" && <Settings data={data} onRedoSetup={onRedoSetup} />}
      </main>
    </div>
  );
}

function Card({ title, children, wide }: { title?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card-v3${wide ? " wide" : ""}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

function ConsentCard({ data }: { data: RunnerData }) {
  return (
    <Card title="Avisos de versão nova">
      <p>
        Quer ser avisado de novas versões? O Runner consulta os lançamentos públicos no GitHub algumas vezes por dia. <b>Nenhum dado seu é enviado.</b>
      </p>
      <div className="row-actions">
        <button className="btn approve v3" type="button" onClick={() => void data.save({ updateConsent: true })}>
          Sim, avisar
        </button>
        <button className="btn v3" type="button" onClick={() => void data.save({ updateConsent: false })}>
          Agora não
        </button>
      </div>
      <p className="tiny">Sem resposta, o Runner não faz nenhuma consulta pela internet.</p>
    </Card>
  );
}

function Today({ data, reduced, conn, go }: { data: RunnerData; reduced: boolean; conn: ReturnType<typeof connectionLine>; go: (t: Tab) => void }) {
  const d = data.diagnostics;
  const s = data.health?.sample;
  const waiting = d?.activeTask?.phase === "awaiting_approval";
  return (
    <>
      <section className="hero-v3 hero-compact">
        <div>
          <h1>{conn.title}</h1>
          <p>O Dot trabalha aqui, no seu computador, com as ferramentas que você já tem. Nada sai daqui sem a sua aprovação.</p>
          {conn.detail && <p className={conn.ok ? "plus" : "sub"}>{conn.detail}</p>}
        </div>
        <AgentDot
          visual={toVisual("dot", semanticOf(data))}
          accessory="none"
          size={150}
          reducedMotion={reduced}
          followPointer
          heat={data.mood.heat}
          strain={data.mood.strain}
          {...(data.mood.reason ? { reason: data.mood.reason } : {})}
          label="Dot"
        />
      </section>
      {data.companion && data.companion.settings.updateConsent === null && <ConsentCard data={data} />}
      <div className="metrics-v3">
        <div className="card-v3 metric-v3">
          <b>{d?.activeTask && !waiting ? 1 : 0}</b>
          <span>Em andamento</span>
        </div>
        <div className="card-v3 metric-v3">
          <b className={waiting ? "plus" : undefined}>{waiting ? 1 : 0}</b>
          <span>Aguardando você</span>
        </div>
        <div className="card-v3 metric-v3">
          <b>{d?.folders.length ?? "—"}</b>
          <span>Pastas autorizadas</span>
        </div>
        <div className="card-v3 metric-v3">
          <b>{data.processes.length}</b>
          <span>Processos do Runner</span>
        </div>
      </div>
      <div className="grid-v3">
        <Card title="Em andamento">
          {d?.activeTask ? (
            <p>
              Tarefa <code>{d.activeTask.id.slice(0, 8)}</code> · fase {d.activeTask.phase}
              {waiting ? " · esperando a sua aprovação no Open Dot" : ""}
            </p>
          ) : (
            <p className="meta">Nenhuma tarefa agora.</p>
          )}
          {waiting && (
            <button className="btn v3" type="button" onClick={() => go("aprovacoes")}>
              Revisar
            </button>
          )}
        </Card>
        <Card title="Saúde do computador">
          <p>
            Processador <b>{pct(s?.cpu)}</b> · memória <b>{pct(s?.memory)}</b>
            {s?.battery ? (
              <>
                {" "}
                · bateria <b>{pct(s.battery.percent)}</b>
                {s.battery.charging ? " carregando" : ""}
              </>
            ) : null}
          </p>
          {data.mood.reason && <p className="sub">{data.mood.reason}</p>}
          <button className="btn v3" type="button" onClick={() => go("saude")}>
            Ver saúde
          </button>
        </Card>
        <Card title="Versão">
          <p>
            <b>{data.companion?.version ?? d?.version ?? "—"}</b>
          </p>
          <button className="btn v3" type="button" onClick={() => go("atualizacoes")}>
            Atualizações
          </button>
        </Card>
      </div>
    </>
  );
}

function Tasks({ data }: { data: RunnerData }) {
  const cp = data.diagnostics?.checkpoints;
  return (
    <Card title="Tarefas e checkpoints" wide>
      <p className="meta">A fila fica no seu Open Dot; aqui você vê a tarefa ativa e os checkpoints preservados neste computador.</p>
      {data.diagnostics?.activeTask ? (
        <p>
          Ativa: <code>{data.diagnostics.activeTask.id}</code> · fase {data.diagnostics.activeTask.phase}
          {data.diagnostics.activeTask.resumable ? " · pode ser retomada" : ""}
        </p>
      ) : (
        <p className="meta">Nenhuma tarefa ativa.</p>
      )}
      {cp ? (
        <ul className="plain-list">
          {cp.items.map((x) => (
            <li key={x.task}>
              <code>{x.task.slice(0, 8)}</code> · fase {x.phase} · {x.terminalReceipt ? `Recibo confirmado: ${x.terminalReceipt}` : "Sem recibo terminal confirmado"}
            </li>
          ))}
          {!cp.items.length && <li className="meta">Nenhum checkpoint legível.</li>}
        </ul>
      ) : (
        <p className="meta">Sem diagnóstico ainda.</p>
      )}
      <p className="tiny">A revisão de commit local continua em Ajustes → Refazer configuração → Conclusão.</p>
    </Card>
  );
}

function Approvals({ data }: { data: RunnerData }) {
  const waiting = data.diagnostics?.activeTask?.phase === "awaiting_approval";
  return (
    <Card title="Aprovações" wide>
      <p>{waiting ? "Há uma proposta esperando a sua decisão." : "Nada esperando você agora."}</p>
      <p className="meta">Aprovar acontece na tela de revisão do Open Dot, com o diff e o hash completos. O Runner nunca aprova sozinho e este painel não tem botão de aprovar.</p>
      <button className="btn primary v3" type="button" disabled={!data.diagnostics?.channel?.paired} onClick={() => void invoke("open_review").catch((e) => data.setError(errorText(e, "Não consegui abrir.")))}>
        Revisar aprovações no navegador
      </button>
    </Card>
  );
}

function Tools() {
  return (
    <Card title="Ferramentas detectadas" wide>
      <p className="meta">O Runner só pergunta ao próprio CLI se está instalado e logado; nunca lê arquivos de login.</p>
      <Mechanisms />
    </Card>
  );
}

function Health({ data, reduced }: { data: RunnerData; reduced: boolean }) {
  const s = data.health?.sample;
  const c = data.companion;
  const rules = c?.settings.protection;
  const setRule = (patch: Record<string, unknown>) => rules && void data.save({ protection: { ...rules, ...patch } });
  return (
    <>
      <section className="hero-v3 hero-compact">
        <AgentDot visual={toVisual("dot", "idle")} accessory="none" size={130} reducedMotion={reduced} heat={data.mood.heat} strain={data.mood.strain} {...(data.mood.reason ? { reason: data.mood.reason } : {})} label="Dot" />
        <div>
          <h1>{data.mood.state.level === "panico" ? "A máquina está no limite." : data.mood.state.level === "calor" ? "Está esquentando por aqui." : "Computador tranquilo."}</h1>
          <p>{data.mood.reason ?? "O Dot reage ao que a máquina mede de verdade. Passe o mouse no Dot para ver o motivo."}</p>
        </div>
      </section>
      <div className="metrics-v3">
        <div className="card-v3 metric-v3">
          <span>Processador</span>
          <b>{pct(s?.cpu)}</b>
        </div>
        <div className="card-v3 metric-v3">
          <span>Memória</span>
          <b>{pct(s?.memory)}</b>
        </div>
        <div className="card-v3 metric-v3">
          <span>Disco livre</span>
          <b>{gb(s?.diskFreeGb)}</b>
        </div>
        <div className="card-v3 metric-v3">
          <span>Bateria</span>
          <b>{s?.battery ? pct(s.battery.percent) : "indisponível"}</b>
          {s?.battery && <span className="sub">{s.battery.charging ? "Carregando" : s.battery.onAc ? "Na tomada" : "Na bateria"}</span>}
        </div>
      </div>
      <p className="tiny">
        Limitação térmica: {typeof s?.cpuSpeedLimit === "number" ? (s.cpuSpeedLimit < 100 ? `CPU limitada a ${s.cpuSpeedLimit}%` : "nenhuma") : "indisponível"} · Temperatura: {typeof s?.temperatureC === "number" ? `${Math.round(s.temperatureC)} °C` : "indisponível"}.
      </p>
      <div className="grid-v3">
        <Card title="Perfil de desempenho">
          <div className="seg" role="radiogroup" aria-label="Perfil de desempenho">
            {(["leve", "equilibrado", "maximo"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={c?.effective === p} className="chip-v3" disabled={!c} onClick={() => void data.save({ profile: p })}>
                {PROFILE_LABEL[p]}
              </button>
            ))}
          </div>
          {c && (
            <p className="sub">
              Sugerido: {PROFILE_LABEL[c.suggested]} ({c.suggestedReason}). Agora: {c.knobs.concurrency} tarefa por vez, consulta de {c.knobs.pollMinMs / 1000} a {c.knobs.pollMaxMs / 1000} s, Dot a {c.knobs.uiFps} qps, prioridade baixa
              nos processos.
            </p>
          )}
          <label className="row-between">
            <span>Perfil Leve na bateria</span>
            <input type="checkbox" checked={c?.settings.lightOnBattery ?? true} disabled={!c} onChange={(e) => void data.save({ lightOnBattery: e.target.checked })} />
          </label>
        </Card>
        <Card title="Proteção do trabalho">
          <p className="sub">Pausa só a fila (nunca encerra programas) e retoma sozinha quando normaliza. Tudo desligado por padrão.</p>
          <label className="row-between">
            <span>
              Pausar se esquentar (CPU acima de {rules?.hotCpu ?? 92}% por {rules?.hotSecs ?? 60} s)
            </span>
            <input type="checkbox" checked={rules?.pauseHot ?? false} disabled={!rules} onChange={(e) => setRule({ pauseHot: e.target.checked })} />
          </label>
          <label className="row-between">
            <span>Pausar com bateria abaixo de {rules?.batteryMin ?? 20}% sem carregador</span>
            <input type="checkbox" checked={rules?.pauseBattery ?? false} disabled={!rules} onChange={(e) => setRule({ pauseBattery: e.target.checked })} />
          </label>
          <label className="row-between">
            <span>Pausar com memória acima de {rules?.memoryMax ?? 90}%</span>
            <input type="checkbox" checked={rules?.pauseMemory ?? false} disabled={!rules} onChange={(e) => setRule({ pauseMemory: e.target.checked })} />
          </label>
        </Card>
      </div>
    </>
  );
}

function Processes({ data }: { data: RunnerData }) {
  const [busy, setBusy] = useState(false);
  const stopped = data.processes.filter((p) => p.group === "parado");
  const inUse = data.processes.filter((p) => p.group === "em_uso");
  async function end(pids: number[]) {
    if (!pids.length) return;
    if (!window.confirm(`Encerrar ${pids.length === 1 ? "este processo" : `estes ${pids.length} processos`} iniciados pelo Runner?`)) return;
    setBusy(true);
    let freed = 0;
    for (const pid of pids) {
      try {
        await invoke("process_terminate", { pid, confirm: "encerrar-processo-do-runner" });
        freed += data.processes.find((p) => p.pid === pid)?.memoryBytes ?? 0;
      } catch (e) {
        data.setError(errorText(e, "Encerramento não confirmado."));
      }
    }
    setBusy(false);
    data.refresh();
    window.alert(freed ? `Liberado (medido antes do encerramento): ${mb(freed)}.` : "Nada a liberar.");
  }
  return (
    <>
      <section className="hero-v3 hero-compact">
        <div>
          <h1>O que o Runner deixou rodando</h1>
          <p>Só aparecem aqui programas que as tarefas do Runner iniciaram. O Runner nunca encerra programas que ele não abriu.</p>
        </div>
        <button className="btn primary v3" type="button" disabled={busy || !stopped.length} onClick={() => void end(stopped.map((p) => p.pid))}>
          Liberar recursos
        </button>
      </section>
      <Card title={`Parados${stopped.length ? ` · ${mb(stopped.reduce((s, p) => s + p.memoryBytes, 0))}` : ""}`} wide>
        {stopped.length ? (
          stopped.map((p) => (
            <div key={p.pid} className="row-v3">
              <div className="grow">
                <b>{p.label}</b>
                <div className="sub">{p.why}</div>
              </div>
              <span className="hash">{mb(p.memoryBytes)}</span>
              <button className="btn v3" type="button" disabled={busy} onClick={() => void end([p.pid])}>
                Encerrar
              </button>
            </div>
          ))
        ) : (
          <p className="meta">Nada parado. Nesta versão, cada ferramenta é encerrada ao fim da tarefa.</p>
        )}
      </Card>
      <Card title="Em uso" wide>
        {inUse.length ? (
          inUse.map((p) => (
            <div key={p.pid} className="row-v3">
              <div className="grow">
                <b>{p.label}</b>
                <div className="sub">
                  {p.why} · há {Math.round(p.uptimeS / 60)} min
                </div>
              </div>
              <span className="hash">{mb(p.memoryBytes)}</span>
              <span className="chip-v3">Protegido</span>
            </div>
          ))
        ) : (
          <p className="meta">Nenhum processo do Runner rodando agora.</p>
        )}
      </Card>
      <Card wide>
        <p className="sub">{data.processNote}</p>
        <label className="row-between">
          <span>Limpeza automática (só processos do Runner parados há mais de {data.companion?.settings.cleanupHours ?? 8} h)</span>
          <input type="checkbox" checked={data.companion?.settings.autoCleanup ?? false} disabled={!data.companion} onChange={(e) => void data.save({ autoCleanup: e.target.checked })} />
        </label>
      </Card>
    </>
  );
}

type UpdState = { phase: "parado" | "verificando" | "disponivel" | "atual" | "instalando" | "erro"; version?: string; notes?: string; error?: string };

function Updates({ data }: { data: RunnerData }) {
  const [st, setSt] = useState<UpdState>({ phase: "parado" });
  const [notes, setNotes] = useState(false);
  const c = data.companion;
  async function check() {
    setSt({ phase: "verificando" });
    try {
      const r = await invoke<{ available: boolean; version: string; notes?: string }>("update_check");
      setSt(r.available ? { phase: "disponivel", version: r.version, notes: r.notes ?? "" } : { phase: "atual", version: r.version });
    } catch (e) {
      setSt({ phase: "erro", error: errorText(e, "Não consegui verificar.") });
    }
  }
  async function install() {
    setSt((s) => ({ ...s, phase: "instalando" }));
    try {
      await invoke("update_install");
    } catch (e) {
      setSt({ phase: "erro", error: errorText(e, "Nada foi instalado.") });
    }
  }
  return (
    <>
      {c?.settings.updateConsent === null && <ConsentCard data={data} />}
      <section className="hero-v3 hero-compact">
        <div>
          <h1>
            {st.phase === "disponivel"
              ? `Há uma versão nova: ${st.version}`
              : st.phase === "atual"
                ? "Você está na versão mais recente"
                : st.phase === "verificando"
                  ? "Verificando…"
                  : st.phase === "instalando"
                    ? "Verificando a assinatura e baixando…"
                    : `Versão ${c?.version ?? "—"}`}
          </h1>
          <p>A atualização é conferida pela assinatura antes de instalar, nunca volta para uma versão mais antiga, espera a tarefa em andamento terminar e não apaga suas pastas, ajustes nem consentimentos.</p>
          {st.phase === "erro" && <p role="alert">{st.error}</p>}
          <div className="row-actions">
            {st.phase === "disponivel" ? (
              <>
                <button className="btn primary v3" type="button" onClick={() => void install()}>
                  Atualizar agora
                </button>
                <button className="btn v3" type="button" aria-expanded={notes} onClick={() => setNotes((v) => !v)}>
                  O que mudou
                </button>
                <button className="btn v3" type="button" onClick={() => setSt({ phase: "parado" })}>
                  Depois
                </button>
              </>
            ) : (
              <button className="btn v3" type="button" disabled={!c?.settings.updateConsent || st.phase === "verificando" || st.phase === "instalando"} onClick={() => void check()}>
                Verificar atualização
              </button>
            )}
          </div>
          {notes && st.notes !== undefined && <pre className="diff-v3 notes">{st.notes || "Sem notas."}</pre>}
        </div>
      </section>
      {c && !c.updateKeyReady && <p className="tiny">Esta compilação ainda não tem a chave pública de atualização: as novas versões precisam ser baixadas na página de lançamentos.</p>}
      <Card title="Primeiro uso no Mac" wide>
        <p className="sub">
          O instalador ainda não é assinado pela Apple, então o macOS pode pedir para abrir em Ajustes do Sistema → Privacidade e Segurança → “Abrir mesmo assim”. Isso acontece uma vez. A assinatura das atualizações é outra: é
          a que o Runner confere.
        </p>
      </Card>
      <p className="tiny">Atualização real de ponta a ponta: sem teste real até existirem duas versões publicadas.</p>
    </>
  );
}

function Settings({ data, onRedoSetup }: { data: RunnerData; onRedoSetup: () => void }) {
  const c = data.companion?.settings;
  const d = data.diagnostics;
  const toggle = (key: keyof NonNullable<typeof c>, label: string, note?: string) => (
    <label className="row-between">
      <span>
        {label}
        {note && <span className="sub"> · {note}</span>}
      </span>
      <input type="checkbox" checked={Boolean(c?.[key])} disabled={!c} onChange={(e) => void data.save({ [key]: e.target.checked })} />
    </label>
  );
  return (
    <>
      <Card title="Pastas permitidas" wide>
        {d?.folders.length ? (
          <ul className="plain-list">
            {d.folders.map((f, i) => (
              <li key={f} className="row-v3">
                <span className="grow hash">{f}</span>
                <button className="btn v3" type="button" onClick={() => void invoke("revoke_folder", { index: i }).then(data.refresh, (e) => data.setError(errorText(e, "Não consegui revogar.")))}>
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">Nenhuma pasta autorizada.</p>
        )}
        <button className="btn v3" type="button" onClick={() => void invoke("choose_folder").then(data.refresh, (e) => data.setError(errorText(e, "Não consegui abrir o seletor.")))}>
          Escolher pasta
        </button>
      </Card>
      <Card title="Comportamento" wide>
        {toggle("showInDock", "Mostrar no Dock", "desligado = só na barra de menus (macOS)")}
        {toggle("autostart", "Iniciar com o computador", "desligado por padrão")}
        {toggle("notifications", "Notificações do sistema", "aprovação pendente, sem trechos de código ou e-mail")}
        {toggle("queuePaused", "Pausar a fila")}
        <p className="tiny">Fechar a janela mantém o Runner na bandeja. Para encerrar, use “Sair do Runner” no ícone da bandeja.</p>
      </Card>
      <Card title="Conexão" wide>
        <p>{d?.channel?.message || (d?.paired ? "Pareado." : "Sem vínculo.")}</p>
        <button className="btn v3" type="button" onClick={onRedoSetup}>
          Refazer configuração
        </button>
        <p className="tiny">Pareamento por código de uso único, confirmado no Open Dot da sua conta. O token fica no cofre do sistema.</p>
      </Card>
    </>
  );
}

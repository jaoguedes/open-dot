// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { useApp } from "../store.tsx";
import { DEMO_EQUIPE } from "../demo.ts";
import { toolStatus, type ToolSnap } from "../team-status.ts";
import "../team.css";

interface CatalogTool {
  id: string;
  nome: string;
  estado: string;
  comoConfigurar: string[];
}
interface Quota {
  usadasHoje: number;
  limiteDia: number | null;
  origemLimite: string;
  esgotadaAte: number | null;
}
interface Candidate {
  tool: string;
  pontuacao: number | null;
  excluida: string | null;
  fatores: string[];
}
interface Step {
  agente: string;
  papel: string;
  ferramenta: string | null;
  motivo: string;
  candidatas: Candidate[];
}
interface Team {
  passos: Step[];
  modoUmaFerramenta: boolean;
  estimativa: Record<string, number>;
  avisos: string[];
  pronta: boolean;
  perfil: { tipos: string[]; risco: string; sinais: string[] };
}
interface Device {
  id: string;
  name: string;
  online: boolean;
  revoked: boolean;
  projects: Array<{ id: string; label: string }>;
}
interface Pipeline {
  id: string;
  state: string;
  reason: string | null;
  ideia: string;
  passos: Array<{ agente: string; papel: string; ferramenta: string; estado: string; erros: string[] }>;
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "x-open-dot": "1", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : "Não consegui falar com o servidor.");
  return data as T;
}

const AGENT_NAMES: Record<string, string> = { produto: "Produto", pesquisa: "Pesquisa", design: "Design", desenvolvedor: "Desenvolvedor", qa: "QA" };
const ROLE_NAMES: Record<string, string> = { planejador: "planeja (só lê)", implementador: "propõe arquivos (você aprova)", revisor: "revisa (só lê)" };

/** Equipe: o que o Dot detectou, como configurar o resto e quem faria cada papel, com o motivo. */
export function Team() {
  const app = useApp();
  const demo = app.mode === "demo";
  const [catalog, setCatalog] = useState<CatalogTool[]>([]);
  const [snaps, setSnaps] = useState<Array<{ deviceId: string; name: string; snapshot: { tools: ToolSnap[] } }>>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [quotas, setQuotas] = useState<Record<string, Quota>>({});
  const [idea, setIdea] = useState("");
  const [team, setTeam] = useState<Team | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (demo) return;
    void (async () => {
      try {
        const [t, s, d, p] = await Promise.all([
          call<{ catalog: { ferramentas: CatalogTool[] }; devices: typeof snaps }>("/api/orchestrator/tools"),
          call<{ claudeCode: boolean; quotas: Record<string, Quota> }>("/api/orchestrator/settings"),
          call<{ devices: Device[] }>("/api/runner/devices"),
          call<{ pipelines: Pipeline[] }>("/api/orchestrator/pipelines"),
        ]);
        setCatalog(t.catalog.ferramentas);
        setSnaps(t.devices);
        setOptIn(s.claudeCode);
        setQuotas(s.quotas);
        const live = d.devices.filter((x) => !x.revoked);
        setDevices(live);
        setDeviceId((cur) => cur || live[0]?.id || "");
        setPipelines(p.pipelines);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Não consegui carregar a equipe.");
      }
    })();
  }, [demo, refresh]);

  const snap = snaps.find((s) => s.deviceId === deviceId)?.snapshot ?? snaps[0]?.snapshot;
  const device = devices.find((d) => d.id === deviceId);

  async function toggleClaude(next: boolean) {
    if (demo) return setMsg("Demonstração: nada é salvo.");
    if (next && !window.confirm("O uso programático do Claude Code consome o crédito programático do seu plano. Mantenha o uso extra desligado na sua conta. Ativar?")) return;
    try {
      const r = await call<{ claudeCode: boolean }>("/api/orchestrator/settings", "PUT", next ? { claudeCode: true, aviso: "uso-programatico-consome-credito-do-plano" } : { claudeCode: false });
      setOptIn(r.claudeCode);
      setMsg(r.claudeCode ? "Claude Code ativado para a equipe. O Runner também precisa do opt-in local para executá-lo." : "Claude Code desligado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não consegui salvar.");
    }
  }

  async function assemble(nextOverrides = overrides) {
    if (demo) return setMsg("Demonstração: veja a equipe de exemplo abaixo.");
    setBusy(true);
    setMsg("");
    try {
      const r = await call<{ team: Team }>("/api/orchestrator/team", "POST", { ideia: idea, deviceId, ...(Object.keys(nextOverrides).length ? { overrides: nextOverrides } : {}) });
      setTeam(r.team);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não consegui montar a equipe.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (demo || !team) return;
    setBusy(true);
    try {
      const r = await call<{ executa: string }>("/api/orchestrator/pipelines", "POST", {
        ideia: idea,
        deviceId,
        projectId,
        worktreeConsent: true,
        confirmacao: "rodar-equipe-em-sequencia",
        ...(Object.keys(overrides).length ? { overrides } : {}),
      });
      setMsg(`Equipe enfileirada: ${r.executa}. Propostas de arquivos ainda esperam a sua aprovação no Workspace.`);
      setConfirm(false);
      setRefresh((v) => v + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não consegui iniciar.");
    } finally {
      setBusy(false);
    }
  }

  const tools = demo
    ? DEMO_EQUIPE.ferramentas.map((f) => ({
        cat: { id: f.id, nome: f.nome, estado: f.estado, comoConfigurar: [] as string[] },
        snap: {
          id: f.id,
          installed: f.instalada,
          version: f.versao,
          loggedIn: f.logada,
          authMethod: f.metodo,
          possiblyPaid: f.possivelmentePago,
          executable: f.executavel,
          reason: "exemplo",
        } as ToolSnap,
      }))
    : catalog.map((c) => ({ cat: c, snap: snap?.tools.find((t) => t.id === c.id) }));

  return (
    <section className="team" aria-labelledby="team-title">
      <header>
        <p className="ws-eyebrow">ORQUESTRADOR v0.2</p>
        <h1 id="team-title">Equipe</h1>
        <p className="meta">
          O Dot usa as ferramentas de IA que você já instalou e entrou, no seu computador. Nunca lê nem guarda login delas. Cada passo roda em sequência e arquivos só mudam depois da sua aprovação.
        </p>
      </header>
      {demo && <p className="chip">Demonstração: ferramentas e equipe fictícias. Nada foi detectado num computador real.</p>}
      {msg && (
        <p role="status" className="chip">
          {msg}
        </p>
      )}

      <h2>Ferramentas</h2>
      {!demo && !snap && <p className="meta">Sem diagnóstico ainda: abra o Runner pareado. A detecção roda no computador, não no navegador.</p>}
      <div className="team-tools">
        {tools.map(({ cat, snap: t }) => {
          const st = toolStatus(t, cat.estado);
          const q = quotas[cat.id];
          return (
            <article key={cat.id} className="card team-tool" aria-label={`${cat.nome}: ${st.label}`}>
              <h3>{cat.nome}</h3>
              <span className={`team-pill ${st.tone}`}>{st.label}</span>
              <ul className="team-facts">
                <li>Versão: {t?.version ?? "—"}</li>
                <li>Login: {t?.loggedIn === true ? `sim (${t.authMethod ?? "método não informado"})` : t?.loggedIn === false ? "não" : "desconhecido"}</li>
                <li>Cota hoje: {q ? (q.limiteDia === null ? `${q.usadasHoje} usadas · limite desconhecido` : `${q.usadasHoje}/${q.limiteDia} (${q.origemLimite})`) : "—"}</li>
              </ul>
              {cat.comoConfigurar.length > 0 && (
                <details>
                  <summary>Como configurar</summary>
                  <ul>
                    {cat.comoConfigurar.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>

      <article className="card stack-10">
        <h2 className="m-0">Claude Code (opcional)</h2>
        <p className="meta m-0">
          Desligado por padrão. O uso programático consome o crédito programático do seu plano; mantenha o uso extra desligado. Login por chave de API é tratado como possivelmente pago e nunca é usado
          por padrão.
        </p>
        <label className="row-between">
          <span>Usar Claude Code na equipe</span>
          <input type="checkbox" checked={optIn} onChange={(e) => void toggleClaude(e.target.checked)} aria-describedby="claude-note" />
        </label>
        <p id="claude-note" className="tiny m-0">
          Estado: {optIn ? "ativado nesta conta" : "desligado"}.
        </p>
      </article>

      <article className="card stack-10" aria-labelledby="assemble-title">
        <h2 id="assemble-title" className="m-0">
          Montar equipe
        </h2>
        <label htmlFor="team-idea">Sua ideia</label>
        <textarea id="team-idea" rows={3} maxLength={2000} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ex.: um app para lembrar de regar as plantas" />
        {!demo && (
          <>
            <label htmlFor="team-device">Computador</label>
            <select id="team-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {devices.length === 0 && <option value="">Nenhum Runner pareado</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.online ? "online" : "offline"}
                </option>
              ))}
            </select>
          </>
        )}
        <button className="btn primary" type="button" disabled={busy || (!demo && (idea.trim().length < 3 || !deviceId))} onClick={() => void assemble()}>
          Propor equipe
        </button>
      </article>

      {(demo || team) && (
        <article className="card stack-10" aria-labelledby="team-result">
          <h2 id="team-result" className="m-0">
            Equipe proposta{demo ? " (exemplo)" : ""}
          </h2>
          {team && (
            <p className="meta m-0">
              Perfil: {team.perfil.tipos.join(" + ")} · risco {team.perfil.risco}. Estimativa:{" "}
              {Object.entries(team.estimativa)
                .map(([k, v]) => `${v} chamada(s) de ${k}`)
                .join(", ") || "—"}
              .
            </p>
          )}
          {(demo ? DEMO_EQUIPE.avisos : (team?.avisos ?? [])).map((a) => (
            <p key={a} className="chip m-0" role="note">
              {a}
            </p>
          ))}
          <ol className="team-steps">
            {(demo ? DEMO_EQUIPE.passos.map((p) => ({ ...p, candidatas: [] as Candidate[] })) : (team?.passos ?? [])).map((p) => (
              <li key={p.agente} className="card team-step">
                <h3>
                  {AGENT_NAMES[p.agente] ?? p.agente} · {ROLE_NAMES[p.papel] ?? p.papel}
                </h3>
                <p className="m-0">
                  Ferramenta: <b>{p.ferramenta ?? "nenhuma"}</b>
                </p>
                <p className="tiny m-0">Por quê: {p.motivo}</p>
                {p.candidatas.length > 0 && (
                  <>
                    <details>
                      <summary>Candidatas e exclusões</summary>
                      <ul>
                        {p.candidatas.map((c) => (
                          <li key={c.tool}>
                            {c.tool}: {c.excluida ? `excluída — ${c.excluida}` : `pontuação ${c.pontuacao} (${c.fatores.join("; ")})`}
                          </li>
                        ))}
                      </ul>
                    </details>
                    {p.candidatas.some((c) => !c.excluida) && (
                      <label className="tiny">
                        Trocar ferramenta{" "}
                        <select
                          value={overrides[p.agente] ?? ""}
                          onChange={(e) => {
                            const next = { ...overrides };
                            if (e.target.value) next[p.agente] = e.target.value;
                            else delete next[p.agente];
                            setOverrides(next);
                            void assemble(next);
                          }}
                        >
                          <option value="">Automática</option>
                          {p.candidatas
                            .filter((c) => !c.excluida)
                            .map((c) => (
                              <option key={c.tool} value={c.tool}>
                                {c.tool}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
          {team?.pronta && device && (
            <div className="stack-10">
              <label htmlFor="team-project">Projeto autorizado no Runner</label>
              <select id="team-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Escolha um projeto</option>
                {device.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <label className="row-between">
                <span>Rodar os passos em sequência, num worktree isolado; arquivos só mudam após minha aprovação</span>
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              </label>
              <button className="btn primary" type="button" disabled={busy || !confirm || !projectId} onClick={() => void run()}>
                Rodar equipe
              </button>
            </div>
          )}
        </article>
      )}

      {!demo && pipelines.length > 0 && (
        <article className="card stack-10" aria-labelledby="pipelines-title">
          <h2 id="pipelines-title" className="m-0">
            Equipes recentes
          </h2>
          {pipelines.map((p) => (
            <details key={p.id}>
              <summary>
                {p.ideia.slice(0, 60)} · {p.state}
              </summary>
              {p.reason && <p className="tiny">{p.reason}</p>}
              <ul>
                {p.passos.map((s) => (
                  <li key={s.agente}>
                    {AGENT_NAMES[s.agente] ?? s.agente} ({s.ferramenta}): {s.estado}
                    {s.erros.length ? ` — ${s.erros.join("; ")}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </article>
      )}
    </section>
  );
}

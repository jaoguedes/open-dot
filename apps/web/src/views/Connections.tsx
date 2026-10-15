import { useEffect, useState } from "react";
import { explainError, providerCards, runFictitiousProviderTest, type ProviderCard } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { api, ApiError, type Diagnostics, type SessionView } from "../api.ts";
import { Icon } from "../components/Icons.tsx";
import { fmtDateTime } from "../format.ts";

/** Conexões: estado real de cada integração. Nunca mostra "conectado" sem confirmação do servidor. */
export function Connections() {
  const app = useApp();
  const demo = app.mode === "demo";
  const cfg = app.snap?.configured;
  const gmail = app.snap?.connections.find((c) => c.provider === "gmail" && c.status !== "disabled");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("ok") === "gmail") return { ok: true, text: "Gmail conectado em modo leitura. A primeira revisão roda no próximo ciclo (até 5 min)." };
    if (p.get("ok") === "gsc") return { ok: true, text: "Search Console conectado em modo leitura (webmasters.readonly)." };
    const err = p.get("erro");
    const map: Record<string, string> = {
      permissao_gmail_negada: "O Google não concedeu a permissão de leitura do Gmail. Nada foi conectado.",
      permissao_gsc_negada: "O Google não concedeu a permissão de leitura do Search Console. Nada foi conectado.",
      sem_refresh_token: "O Google não enviou um token de renovação. Remova o acesso em myaccount.google.com/permissions e conecte de novo.",
      sessao_trocada: "A sessão mudou durante a conexão. Tente de novo.",
      callback_invalido: "O retorno do Google veio incompleto. Nada foi conectado. Tente de novo.",
      sem_id_token: "O Google não confirmou a conta. Nada foi conectado. Tente de novo.",
      estado_expirado: "A conexão demorou demais e expirou. Tente de novo.",
      consentimento_negado: "A permissão foi negada no Google. Nada foi conectado.",
    };
    return err && map[err] ? { ok: false, text: map[err] } : null;
  });
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (!p.has("ok") && !p.has("erro")) return;
    p.delete("ok");
    p.delete("erro");
    const q = p.toString();
    history.replaceState(history.state, "", location.pathname + (q ? `?${q}` : "") + location.hash);
  }, []);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await api.startGmail();
      location.assign(url);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Não consegui iniciar a conexão." });
      setBusy(false);
    }
  };
  const [confirming, setConfirming] = useState(false);
  const disconnect = async (id: string) => {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    setBusy(true);
    try {
      const r = await api.disconnect(id);
      setMsg({ ok: true, text: r.revokedAtProvider ? "Gmail desconectado e acesso revogado no Google." : "Gmail desconectado aqui. Confirme a revogação em myaccount.google.com/permissions." });
      await app.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Não consegui desconectar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Conexões</h1>
      <p className="meta intro-gap">Cada serviço tem consentimento próprio e permissões mínimas. Escritas exigem sua aprovação do conteúdo exato.</p>
      {msg && (
        <p role="status" className={`banner ${msg.ok ? "ok" : "err"} ws-normal wrap-anywhere mb-16`}>
          {msg.text}
        </p>
      )}

      <section className="card" aria-labelledby="c-gmail">
        <div className="card-top">
          <Icon name="mail" size={14} /> Correio · Gmail
          <span className={`chip ${gmail?.status === "connected" ? "ok" : gmail?.status === "reauth_required" ? "err" : ""}`}>
            {demo ? "Não conectado (demonstração)" : gmail?.status === "connected" ? "Conectado · leitura" : gmail?.status === "reauth_required" ? "Precisa reconectar" : "Não conectado"}
          </span>
        </div>
        <h3 id="c-gmail">{gmail?.accountLabel ?? "Sua conta Gmail"}</h3>
        <p>
          Permissão: <b>gmail.readonly</b> (somente leitura). Lê remetente, assunto e trecho curto; não lê anexos, não envia, não apaga, não arquiva.
          {gmail?.lastSyncAt && <> Última sincronização: {fmtDateTime(gmail.lastSyncAt)}.</>}
          {gmail?.lastError && <> Último erro: {gmail.lastError}</>}
        </p>
        <div className="row-actions">
          {!gmail || gmail.status === "reauth_required" ? (
            <button className="btn primary" disabled={demo || busy || !cfg?.google} onClick={() => void connect()}>
              {gmail ? "Reconectar Gmail" : "Conectar Gmail"}
            </button>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={() => void disconnect(gmail.id)}>
                {confirming ? "Confirmar: desconectar e revogar" : "Desconectar"}
              </button>
              {confirming && (
                <button className="btn ghost" onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
              )}
            </>
          )}
          {!demo && !cfg?.google && <span className="tiny">Falta configurar o cliente OAuth do Google (docs/ACOES_DO_JOAO.md).</span>}
          {demo && <span className="tiny">Indisponível na demonstração.</span>}
        </div>
      </section>

      <Monitors />

      <section className="card mt-16" aria-labelledby="c-gh">
        <div className="card-top">
          <Icon name="code" size={14} /> Código · GitHub
          <span className={`chip ${cfg?.github ? "info" : ""}`}>{cfg?.github ? "Webhook configurado no servidor" : "Não configurado"}</span>
        </div>
        <h3 id="c-gh">GitHub App privada, só repositórios escolhidos</h3>
        <p>Leitura de PRs, issues, workflows e checks. Sem merge, push ou alteração de configurações. Configuração no GitHub feita por você (docs/ACOES_DO_JOAO.md).</p>
      </section>

      <section className="card mt-16" aria-labelledby="c-vc">
        <div className="card-top">
          <Icon name="layers" size={14} /> Sentinela · Vercel
          <span className={`chip ${cfg?.vercel ? "info" : ""}`}>{cfg?.vercel ? "Token configurado no servidor" : "Não configurado"}</span>
        </div>
        <h3 id="c-vc">Deployments do seu projeto (leitura)</h3>
        <p>Consulta a cada ~15 min. Sem redeploy ou rollback automático. Webhooks de conta da Vercel são Pro/Enterprise; aqui usamos consulta periódica.</p>
      </section>

      <PacoteCard />
      <ExtraAgents demo={demo} cfgGoogle={Boolean(cfg?.google)} />

      <Providers demo={demo} />

      <Sessions demo={demo} />

      <DiagnosticsCard demo={demo} />

      <MyDataCard demo={demo} />
    </>
  );
}

/** Aparelhos com sessão aberta e "Sair de todos". O token nunca aparece. */
function Sessions({ demo }: { demo: boolean }) {
  const [list, setList] = useState<SessionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    api
      .sessions()
      .then((r) => alive && setList(r.sessions))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Não consegui listar as sessões."));
    return () => {
      alive = false;
    };
  }, [demo]);
  const logoutAll = async () => {
    if (!confirming) return setConfirming(true);
    setBusy(true);
    try {
      await api.logoutAll();
      location.assign("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não consegui encerrar as sessões.");
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <section className="card section-gap" aria-labelledby="c-sessions">
      <div className="card-top">
        <Icon name="layers" size={14} /> Sessões
      </div>
      <h3 id="c-sessions">Aparelhos conectados</h3>
      {demo ? (
        <p>Indisponível na demonstração.</p>
      ) : error ? (
        <p className="banner err">{error}</p>
      ) : list === null ? (
        <p className="meta">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="meta">Nenhuma sessão aberta.</p>
      ) : (
        <ul className="plain-list">
          {list.map((s) => (
            <li key={s.id}>
              {s.device}
              {s.current && <span className="chip ok chip-gap">Este aparelho</span>}
              <span className="tiny block">Entrou em {fmtDateTime(s.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {!demo && (
        <div className="row-actions">
          <button className="btn" type="button" disabled={busy} onClick={() => void logoutAll()}>
            {confirming ? "Confirmar: sair de todos" : "Sair de todos os aparelhos"}
          </button>
          {confirming && (
            <button className="btn ghost" type="button" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Monitors() {
  const app = useApp();
  const demo = app.mode === "demo";
  const list = app.snap?.monitors ?? [];
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const add = async () => {
    try {
      await api.addMonitor(url.trim(), label.trim() || new URL(url).hostname);
      setUrl("");
      setLabel("");
      setMsg({ ok: true, text: "Site cadastrado. A primeira verificação roda no próximo ciclo." });
      await app.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Endereço inválido." });
    }
  };
  return (
    <section className="card mt-16" aria-labelledby="c-mon">
      <div className="card-top">
        <Icon name="globe" size={14} /> Sentinela · Sites
        <span className="chip">{list.length}/3</span>
      </div>
      <h3 id="c-mon">Verificação HTTP a cada 5 minutos</h3>
      <p>Só HTTPS, só os endereços que você cadastrar. Alerta depois de 3 falhas seguidas. Uma origem de medição não representa todos os visitantes.</p>
      {list.length > 0 && (
        <ul className="list mb-12">
          {list.map((m) => (
            <li key={m.id} className="mail">
              <span className="subj">{m.label}</span>
              <span className={`chip ${m.incident.open ? (m.incident.kind === "slow" ? "warn" : "err") : m.lastCheckAt ? "ok" : ""}`}>
                {m.incident.open ? (m.incident.kind === "slow" ? "Lento" : "Com problema") : m.lastCheckAt ? "Respondendo" : "Aguardando 1ª verificação"}
              </span>
              <span className="why">
                {m.url} · última verificação {fmtDateTime(m.lastCheckAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="row-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="field flex-2-220">
          Endereço (https://)
          <input type="url" required placeholder="https://seusite.vercel.app" value={url} onChange={(e) => setUrl(e.target.value)} disabled={demo || list.length >= 3} />
        </label>
        <label className="field flex-1-140">
          Nome
          <input type="text" placeholder="Meu site" value={label} onChange={(e) => setLabel(e.target.value)} disabled={demo || list.length >= 3} maxLength={60} />
        </label>
        <button className="btn primary self-end" type="submit" disabled={demo || list.length >= 3}>
          Cadastrar
        </button>
      </form>
      {demo && <p className="tiny mt-8">Indisponível na demonstração.</p>}
      {msg && (
        <p role="status" className={`chip ${msg.ok ? "ok" : "err"} mt-8 ws-normal`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

function ExtraAgents({ demo, cfgGoogle }: { demo: boolean; cfgGoogle: boolean }) {
  const app = useApp();
  const cards = app.snap?.agents ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const test = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.testAgent(id);
      const extra = formatAgentTest(r);
      setMsg({ id, ok: true, text: extra });
      await app.refresh();
    } catch (e) {
      setMsg({ id, ok: false, text: e instanceof ApiError ? e.message : "Não consegui testar." });
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (id: string, enabled: boolean) => {
    setBusy(id);
    try {
      if (enabled) await api.disableAgent(id);
      else await api.enableAgent(id);
      await app.refresh();
    } catch (e) {
      setMsg({ id, ok: false, text: e instanceof ApiError ? e.message : "Não consegui alterar o agente." });
    } finally {
      setBusy(null);
    }
  };
  const connectGsc = async () => {
    setBusy("gsc");
    try {
      const { url } = await api.startGsc();
      location.assign(url);
    } catch (e) {
      setMsg({ id: "marketing", ok: false, text: e instanceof ApiError ? e.message : "Não consegui iniciar o Search Console." });
      setBusy(null);
    }
  };

  return (
    <>
      {cards.map((a) => (
        <section key={a.id} className="card mt-16" aria-labelledby={`c-${a.id}`}>
          <div className="card-top">
            {a.name}
            <span className={`chip ${!a.enabled ? "" : a.lastError ? "warn" : a.lastTestAt ? "ok" : ""}`}>
              {demo ? "Demonstração (fictício)" : !a.enabled ? "Desativado" : a.lastError ? "Fontes com falha" : a.lastTestAt ? "Testado" : "Aguardando teste"}
            </span>
          </div>
          <h3 id={`c-${a.id}`}>{a.name}</h3>
          <p>{a.description}</p>
          <SourceFailures raw={a.lastError} />
          {a.sources.length > 0 && (
            <ul className="list mb-12">
              {a.sources.map((s) => (
                <li key={s.id} className="mail">
                  <span className="subj">{s.label}</span>
                  <span className="why">{s.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {a.quotes?.map((q) => (
            <p key={q.symbol} className="tiny">
              {q.symbol}: {q.price} ({q.changePct == null ? "sem variação" : `${q.changePct.toFixed(1)}%`}) · {q.source}
              {q.stale ? " · desatualizado" : ""} · {q.disclaimer}
            </p>
          ))}
          {a.missing.length > 0 && (
            <p className="meta">
              {a.missing.map((m) => (
                <span className="block" key={m}>
                  {m}
                </span>
              ))}
            </p>
          )}
          <p className="tiny">{a.note}</p>
          {a.lastTestAt && <p className="tiny">Último teste: {fmtDateTime(a.lastTestAt)}</p>}
          <div className="row-actions">
            <button className="btn primary" disabled={demo || busy === a.id || !a.enabled} onClick={() => void test(a.id)}>
              Testar
            </button>
            <button className="btn" disabled={demo || busy === a.id} onClick={() => void toggle(a.id, a.enabled)}>
              {a.enabled ? "Desativar" : "Ativar"}
            </button>
            {a.id === "marketing" && !demo && (
              <button className="btn" disabled={busy === "gsc" || !cfgGoogle} onClick={() => void connectGsc()}>
                Conectar Search Console
              </button>
            )}
            {demo && <span className="tiny">Indisponível na demonstração.</span>}
          </div>
          {msg?.id === a.id && (
            <p role="status" className={`chip ${msg.ok ? "ok" : "err"} mt-8 ws-normal`}>
              {msg.text}
            </p>
          )}
        </section>
      ))}
    </>
  );
}

function providerChip(p: ProviderCard, demo: boolean, cfgAi: boolean, cfgPrivate: boolean) {
  if (demo) return { cls: "", text: "Demonstração (fictício)" };
  if (!p.enabled) return { cls: "", text: p.billing === "paid" ? "Desligado · não é franquia gratuita" : "Desligado" };
  if (!cfgAi && p.id === "groq") return { cls: "", text: "Chave ausente · resumo por regras" };
  if (p.id === "groq" && cfgAi) return { cls: "info" as const, text: cfgPrivate ? "Teste OK · ZDR confirmado (não é aprovação de privacidade extra)" : "Teste OK · só dados não privados" };
  return { cls: "", text: "Aguardando teste" };
}

function Providers({ demo }: { demo: boolean }) {
  const app = useApp();
  const cfg = app.snap?.configured;
  const usage = app.snap?.usage;
  const raw = app.snap?.providers?.length
    ? app.snap.providers
    : providerCards({ groqConfigured: Boolean(cfg?.ai), groqPrivate: Boolean(cfg?.aiPrivate), calls: usage?.calls, callLimit: usage?.limits.calls });
  const list = raw.map((p) => (p.id === "groq" && usage ? { ...p, quota: { calls: usage.calls, limit: usage.limits.calls } } : p));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [cred, setCred] = useState<string | null>(null);

  const test = async (id: string) => {
    setBusy(id);
    try {
      const r = demo ? runFictitiousProviderTest(id) : await api.testProvider(id);
      if (!r.ok) {
        setMsg({ id, ok: false, text: "reason" in r ? r.reason : "Não consegui testar." });
        return;
      }
      setMsg({ id, ok: true, text: `${r.note} Classificação do exemplo: ${r.result.category}.` });
    } catch (e) {
      setMsg({ id, ok: false, text: e instanceof ApiError ? e.message : "Não consegui testar." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h2 className="section-h2">Provedores de IA</h2>
      <p className="meta mb-12">Sem IA, o feed mostra fontes, assuntos e a classificação por regras, com “Resumo por IA pendente”. Nenhuma rota paga. A chave nunca é digitada aqui.</p>
      {list.map((p) => {
        const chip = providerChip(p, demo, Boolean(cfg?.ai), Boolean(cfg?.aiPrivate));
        const exhausted = p.quota && p.quota.calls >= p.quota.limit;
        return (
          <section key={p.id} className="card mt-12" aria-labelledby={`p-${p.id}`}>
            <div className="card-top">
              {p.label}
              <span className={`chip ${chip.cls}`}>{chip.text}</span>
            </div>
            <h3 id={`p-${p.id}`}>{p.label}</h3>
            <p>
              {p.models.length ? `Modelos: ${p.models.join(", ")}. ` : null}
              Franquia: {p.billing === "free_tier" ? "camada gratuita" : p.billing === "paid" ? "paga (desligada)" : "encerrada"}. Classes: {p.allowedData.join(", ")}
              {p.neverPrivate ? " · nunca recebe dado privado" : ""}.
            </p>
            {p.quota && (
              <p className="tiny">
                Consumo do dia: {p.quota.calls}/{p.quota.limit} chamadas
                {exhausted ? " · cota esgotada: a tarefa fica pendente e o resumo por regras continua." : ""}.
              </p>
            )}
            <p className="tiny">{p.note}</p>
            <div className="row-actions">
              <button className="btn primary" disabled={busy === p.id || !p.enabled} onClick={() => void test(p.id)}>
                Testar com exemplo fictício
              </button>
              <button
                className="btn"
                disabled={!p.enabled}
                onClick={() => setMsg({ id: p.id, ok: true, text: "Desativar o Groq: remova GROQ_API_KEY pelo npm run setup:cloud. A chave não é apagada daqui." })}
              >
                Desativar
              </button>
              <button className="btn" onClick={() => setCred(p.id)}>
                Trocar credencial
              </button>
            </div>
            {cred === p.id && (
              <p className="meta mt-8">
                A chave não é digitada no app nem exibida. No terminal: <code>npm run setup:cloud</code> (docs/ACOES_DO_JOAO.md, grupo F).
              </p>
            )}
            {msg?.id === p.id && (
              <p role="status" className={`chip ${msg.ok ? "ok" : "err"} mt-8 ws-normal`}>
                {msg.text}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

function formatAgentTest(r: { failures?: unknown; missing?: string[]; note?: string }): string {
  if (Array.isArray(r.failures) && r.failures.length) {
    return r.failures
      .map((f) => {
        if (typeof f === "string") return f;
        if (f && typeof f === "object" && "source" in f) {
          const row = f as { source?: unknown; reason?: unknown };
          const source = typeof row.source === "string" ? row.source : "Fonte";
          const reason = typeof row.reason === "string" ? row.reason : "unknown";
          return `${source}: ${explainError(reason).frase}`;
        }
        return "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  if (r.missing?.length) return r.missing.join(" · ");
  return r.note ?? "Teste concluído.";
}

function SourceFailures({ raw }: { raw: string | null }) {
  if (!raw) return null;
  const rows = raw.split(" ").flatMap((part) => {
    const i = part.lastIndexOf(":");
    if (i <= 0) return [];
    const source = part.slice(0, i);
    const reason = part.slice(i + 1);
    return [{ source, ...explainError(reason) }];
  });
  if (!rows.length) return null;
  return (
    <ul className="list" aria-label="Fontes que falharam">
      {rows.map((r) => (
        <li key={`${r.source}-${r.code}`}>
          <span className="subj">
            {r.source}: {r.frase}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PacoteCard() {
  const app = useApp();
  const state = app.snap?.configured.trackingState ?? "desligado";
  const calls = app.snap?.shipments.tracking.calls ?? 0;
  const limit = app.snap?.shipments.tracking.limit ?? 1000;
  const label = state === "ligado" ? "Ligado" : state === "sem_chave" ? "Sem chave" : state === "termos" ? "Termos não confirmados" : "Desligado";
  return (
    <section className="card mt-16" aria-labelledby="c-pacote">
      <div className="card-top">
        Entregas · PacoteVício
        <span className={`chip ${state === "ligado" ? "ok" : ""}`}>{app.mode === "demo" ? "Desligado (demonstração)" : label}</span>
      </div>
      <h3 id="c-pacote">Rastreio automático</h3>
      <p className="meta">
        Consultas neste mês: {calls} de {limit}. O app para em 900. Nada é comprado daqui.
      </p>
    </section>
  );
}

/** Conexões > Diagnóstico (F4): só autenticado. O relatório copiado não leva segredo nem e-mail. */
function DiagnosticsCard({ demo }: { demo: boolean }) {
  const [d, setD] = useState<Diagnostics | null>(null);
  const [version, setVersion] = useState<{ app: string; worker: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = async () => {
    setError(null);
    try {
      const [diag, v] = await Promise.all([api.diagnostics(), api.version().catch(() => null)]);
      setD(diag);
      setVersion(v);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não consegui ler o diagnóstico.");
    }
  };
  const report = () => {
    if (!d) return "";
    const lines = [
      `Open Dot · diagnóstico · ${d.time}`,
      `Saúde: ${d.health.ok ? "ok" : "com problema"} · schema ${d.health.schema ?? "?"} (exige ${d.health.requiredSchema}) · ${d.health.env}`,
      `Versão: app ${version?.app ?? "?"} · worker ${version?.worker ?? "?"}`,
      `Integrações configuradas: ${Object.entries(d.health.configured)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
        .join(", ") || "nenhuma"}`,
      d.lastTick ? `Última rodada do cron: ${d.lastTick.at} · ${d.lastTick.runs} execuções · ${d.lastTick.subrequests} subrequisições${d.lastTick.stepErrors.length ? ` · passos com erro: ${d.lastTick.stepErrors.map((x) => `${x.step}:${x.reason}`).join(", ")}` : ""}` : "Última rodada do cron: sem registro",
      ...d.failures.map((f) => `Falha ${f.at} · ${f.agentId} · ${f.code}: ${f.frase}`),
    ];
    return lines.join("\n");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
    } catch {
      setError("Não consegui copiar. Selecione o texto abaixo.");
    }
  };
  return (
    <section className="card section-gap" aria-labelledby="c-diag">
      <div className="card-top">
        <Icon name="alert" size={14} /> Diagnóstico
      </div>
      <h3 id="c-diag">Saúde do Open Dot</h3>
      {demo ? (
        <p>Indisponível na demonstração.</p>
      ) : !d ? (
        <>
          {error && <p className="banner err">{error}</p>}
          <div className="row-actions">
            <button className="btn" type="button" onClick={() => void load()}>
              Ver diagnóstico
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="plain-list">
            <li>
              Saúde: <b>{d.health.ok ? "ok" : "com problema"}</b> · schema {d.health.schema ?? "?"} (exige {d.health.requiredSchema})
            </li>
            <li>
              Versão: app <span className="mono">{version?.app ?? "?"}</span> · worker <span className="mono">{version?.worker?.slice(0, 8) ?? "?"}</span>
            </li>
            <li>{d.lastTick ? `Última rodada do cron: ${fmtDateTime(d.lastTick.at)} · ${d.lastTick.runs} execuções${d.lastTick.stepErrors.length ? ` · ${d.lastTick.stepErrors.length} passo(s) com erro` : ""}` : "Última rodada do cron: sem registro ainda."}</li>
          </ul>
          {d.failures.length > 0 ? (
            <ul className="plain-list">
              {d.failures.map((f) => (
                <li key={f.runId}>
                  <span className="tiny mono">{fmtDateTime(f.at)} · {f.code}</span>
                  <span className="block">{f.frase}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta">Nenhuma execução com falha nas últimas 30.</p>
          )}
          <div className="row-actions">
            <button className="btn" type="button" onClick={() => void copy()}>
              {copied ? "Relatório copiado" : "Copiar relatório"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void load()}>
              Atualizar
            </button>
          </div>
          {error && <p className="banner err">{error}</p>}
        </>
      )}
    </section>
  );
}

/** Meus dados (F6): exportar em JSON e apagar tudo, com confirmação dupla. */
function MyDataCard({ demo }: { demo: boolean }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const erase = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      location.assign("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não consegui apagar. Nada foi apagado.");
      setBusy(false);
    }
  };
  return (
    <section className="card section-gap" aria-labelledby="c-dados">
      <div className="card-top">
        <Icon name="layers" size={14} /> Meus dados
      </div>
      <h3 id="c-dados">Exportar ou apagar</h3>
      {demo ? (
        <p>Indisponível na demonstração.</p>
      ) : (
        <>
          <p>O arquivo traz tudo o que o Open Dot guarda sobre você, já legível. Tokens de acesso ficam de fora.</p>
          <div className="row-actions">
            <a className="btn" href="/api/export" download>
              Exportar meus dados (JSON)
            </a>
            {step === 0 && (
              <button className="btn" type="button" onClick={() => setStep(1)}>
                Apagar tudo…
              </button>
            )}
          </div>
          {step === 1 && (
            <div className="stack-10 mt-12">
              <p className="err-text">Isso apaga resumos, rotinas, conexões, encomendas e o histórico, e tira o acesso ao Gmail. Não dá para desfazer.</p>
              <label htmlFor="erase-confirm">Digite APAGAR TUDO para confirmar</label>
              <input id="erase-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              <div className="row-actions">
                <button className="btn" type="button" disabled={busy || typed !== "APAGAR TUDO"} onClick={() => void erase()}>
                  Apagar tudo agora
                </button>
                <button className="btn ghost" type="button" onClick={() => (setStep(0), setTyped(""))}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {error && <p className="banner err">{error}</p>}
        </>
      )}
    </section>
  );
}

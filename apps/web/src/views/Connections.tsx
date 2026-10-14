import { useState } from "react";
import { providerCards, runFictitiousProviderTest, type ProviderCard } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { api, ApiError } from "../api.ts";
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
    };
    return err && map[err] ? { ok: false, text: map[err] } : null;
  });
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
      <p className="meta" style={{ margin: "4px 0 16px" }}>
        Cada serviço tem consentimento próprio e permissões mínimas. Escritas exigem sua aprovação do conteúdo exato.
      </p>
      {msg && (
        <p role="status" className={`chip ${msg.ok ? "ok" : "err"}`} style={{ whiteSpace: "normal", marginBottom: 16 }}>
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

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="c-gh">
        <div className="card-top">
          <Icon name="code" size={14} /> Código · GitHub
          <span className={`chip ${cfg?.github ? "info" : ""}`}>{cfg?.github ? "Webhook configurado no servidor" : "Não configurado"}</span>
        </div>
        <h3 id="c-gh">GitHub App privada, só repositórios escolhidos</h3>
        <p>Leitura de PRs, issues, workflows e checks. Sem merge, push ou alteração de configurações. Configuração no GitHub feita por você (docs/ACOES_DO_JOAO.md).</p>
      </section>

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="c-vc">
        <div className="card-top">
          <Icon name="layers" size={14} /> Sentinela · Vercel
          <span className={`chip ${cfg?.vercel ? "info" : ""}`}>{cfg?.vercel ? "Token configurado no servidor" : "Não configurado"}</span>
        </div>
        <h3 id="c-vc">Deployments do seu projeto (leitura)</h3>
        <p>Consulta a cada ~15 min. Sem redeploy ou rollback automático. Webhooks de conta da Vercel são Pro/Enterprise; aqui usamos consulta periódica.</p>
      </section>

      <ExtraAgents demo={demo} cfgGoogle={Boolean(cfg?.google)} />

      <Providers demo={demo} />
    </>
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
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="c-mon">
      <div className="card-top">
        <Icon name="globe" size={14} /> Sentinela · Sites
        <span className="chip">{list.length}/3</span>
      </div>
      <h3 id="c-mon">Verificação HTTP a cada 5 minutos</h3>
      <p>Só HTTPS, só os endereços que você cadastrar. Alerta depois de 3 falhas seguidas. Uma origem de medição não representa todos os visitantes.</p>
      {list.length > 0 && (
        <ul className="list" style={{ marginBottom: 12 }}>
          {list.map((m) => (
            <li key={m.id} className="mail">
              <span className="subj">{m.label}</span>
              <span className={`chip ${m.incident.open ? "err" : m.lastCheckAt ? "ok" : ""}`}>{m.incident.open ? "Com problema" : m.lastCheckAt ? "Respondendo" : "Aguardando 1ª verificação"}</span>
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
        <label className="field" style={{ flex: "2 1 220px" }}>
          Endereço (https://)
          <input type="url" required placeholder="https://seusite.vercel.app" value={url} onChange={(e) => setUrl(e.target.value)} disabled={demo || list.length >= 3} />
        </label>
        <label className="field" style={{ flex: "1 1 140px" }}>
          Nome
          <input type="text" placeholder="Meu site" value={label} onChange={(e) => setLabel(e.target.value)} disabled={demo || list.length >= 3} maxLength={60} />
        </label>
        <button className="btn primary" type="submit" disabled={demo || list.length >= 3} style={{ alignSelf: "end" }}>
          Cadastrar
        </button>
      </form>
      {demo && <p className="tiny" style={{ marginTop: 8 }}>Indisponível na demonstração.</p>}
      {msg && (
        <p role="status" className={`chip ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 8, whiteSpace: "normal" }}>
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
      const extra = r.failures?.length ? r.failures.join(" ") : r.missing?.length ? r.missing.join(" ") : r.note ?? "Teste concluído.";
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
        <section key={a.id} className="card" style={{ marginTop: 16 }} aria-labelledby={`c-${a.id}`}>
          <div className="card-top">
            {a.name}
            <span className={`chip ${!a.enabled ? "" : a.lastError ? "warn" : a.lastTestAt ? "ok" : ""}`}>
              {demo ? "Demonstração (fictício)" : !a.enabled ? "Desativado" : a.lastError ? "Falha parcial" : a.lastTestAt ? "Testado" : "Aguardando teste"}
            </span>
          </div>
          <h3 id={`c-${a.id}`}>{a.name}</h3>
          <p>{a.description}</p>
          {a.sources.length > 0 && (
            <ul className="list" style={{ marginBottom: 12 }}>
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
                <span key={m} style={{ display: "block" }}>
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
            <p role="status" className={`chip ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 8, whiteSpace: "normal" }}>
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
  const raw =
    app.snap?.providers?.length
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
      <h2 style={{ margin: "28px 0 8px", fontSize: 17 }}>Provedores de IA</h2>
      <p className="meta" style={{ marginBottom: 12 }}>
        Sem IA, o feed mostra fontes, assuntos e a classificação por regras, com “Resumo por IA pendente”. Nenhuma rota paga. A chave nunca é digitada aqui.
      </p>
      {list.map((p) => {
        const chip = providerChip(p, demo, Boolean(cfg?.ai), Boolean(cfg?.aiPrivate));
        const exhausted = p.quota && p.quota.calls >= p.quota.limit;
        return (
          <section key={p.id} className="card" style={{ marginTop: 12 }} aria-labelledby={`p-${p.id}`}>
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
              <p className="meta" style={{ marginTop: 8 }}>
                A chave não é digitada no app nem exibida. No terminal: <code>npm run setup:cloud</code> (docs/ACOES_DO_JOAO.md, grupo F).
              </p>
            )}
            {msg?.id === p.id && (
              <p role="status" className={`chip ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 8, whiteSpace: "normal" }}>
                {msg.text}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

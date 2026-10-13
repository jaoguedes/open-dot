import { useState } from "react";
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
    const err = p.get("erro");
    const map: Record<string, string> = {
      permissao_gmail_negada: "O Google não concedeu a permissão de leitura do Gmail. Nada foi conectado.",
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

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="c-ai">
        <div className="card-top">
          <Icon name="sparkle" size={14} /> IA remota
          <span className={`chip ${cfg?.ai ? "info" : ""}`}>{cfg?.ai ? (cfg.aiPrivate ? "Groq · dados privados liberados (ZDR confirmado)" : "Groq · só dados não privados") : "Não configurada"}</span>
        </div>
        <h3 id="c-ai">Sem IA, os resumos continuam por regras</h3>
        <p>E-mails só vão para um provedor com retenção zero confirmada por você. Sem fallback pago. Ao acabar a cota diária, a IA pausa e o resumo por regras continua.</p>
      </section>
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

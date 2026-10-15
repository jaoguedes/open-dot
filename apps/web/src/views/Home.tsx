import { AGENTS, TOOL_KIND, toVisual, type AgentId } from "@open-dot/core";
import { useState } from "react";
import { useApp } from "../store.tsx";
import { ApiError, api, type AskAnswer } from "../api.ts";
import { demoAsk } from "../demo.ts";
import { DigestBlock, FeedRow } from "../components/FeedViews.tsx";
import { Icon } from "../components/Icons.tsx";
import { AgentDot } from "../dot/AgentDot.tsx";
import { AbsorbPanel } from "../components/AbsorbPanel.tsx";
import { DotTrouble } from "../components/DotTrouble.tsx";
import { fmtTime, greeting } from "../format.ts";

/** Conversa do agente: resumo curto, ações pendentes e perguntas com fontes. */
export function Home({ agentId }: { agentId: AgentId }) {
  const app = useApp();
  const snap = app.snap;
  const feed = (snap?.feed ?? []).filter((f) => agentId === "dot" || f.agentId === agentId);
  const digest = feed.find((f) => f.kind === "email_digest");
  const others = feed.filter((f) => f !== digest).slice(0, 6);
  const name = snap?.owner?.name?.split(" ")[0];
  const today = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      <div className="day-sep">Hoje, {today}</div>
      {agentId !== "dot" && <AgentAbout agentId={agentId} />}
      {app.visualFor(agentId).semantic === "error" && (
        <DotTrouble info={{ code: app.visualFor(agentId).reason && /^[a-z0-9_]+$/.test(app.visualFor(agentId).reason ?? "") ? app.visualFor(agentId).reason! : "unknown", route: app.path }} reducedMotion={app.reducedMotion} onRetry={() => void app.refresh()} />
      )}
      <AgentActions agentId={agentId} />
      <div className="msg-head">
        <AgentDot visual={app.visualFor(agentId)} accessory={app.accessoryFor(agentId)} size={22} animate={false} reducedMotion={app.reducedMotion} />
        <b>{AGENTS[agentId].name}</b>
        {digest && <span>{fmtTime(digest.createdAt)}</span>}
      </div>
      {agentId === "dot" && <h1 style={{ marginBottom: 8 }}>{greeting()}{name ? `, ${name}` : ""}.</h1>}
      {agentId === "dot" && snap && <AbsorbPanel />}

      {!snap ? (
        <Loading />
      ) : feed.length === 0 ? (
        <EmptyState agentId={agentId} />
      ) : (
        <>
          {digest && <DigestBlock item={digest} showIntro={agentId === "dot"} />}
          {others.length > 0 && (
            <ul className="list" style={{ marginTop: 24 }} aria-label="Outros resultados">
              {others.map((f) => (
                <FeedRow key={f.id} item={f} />
              ))}
            </ul>
          )}
          <p className="sources">
            {app.mode === "demo" ? "Fontes de exemplo: E1–E5 · " : ""}Cada item mostra fonte, horário e cobertura. Enviar, arquivar ou alterar algo sempre passa pela sua aprovação.
          </p>
        </>
      )}
      <Composer />
    </>
  );
}

function AgentActions({ agentId }: { agentId: AgentId }) {
  const app = useApp();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (app.mode === "demo") return null;
  if (agentId === "correio") {
    const gmail = app.snap?.connections.some((c) => c.provider === "gmail" && c.status === "connected");
    if (!gmail) return null;
    return (
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button
          className="btn primary"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setNote(null);
            app.setActivity(toVisual("correio", "working", null, "Lendo e-mails. Nada é enviado."));
            void api.reviewNow().then(
              async (r) => {
                app.setActivity(toVisual("correio", "success"));
                setNote(r.note);
                app.announce(r.note);
                await app.refresh();
                window.setTimeout(() => app.setActivity(null), 2500);
              },
              (e: unknown) => {
                app.setActivity(null);
                const msg = e instanceof ApiError ? e.message : "Não consegui revisar agora.";
                setNote(msg);
                app.announce(msg);
              },
            ).finally(() => setBusy(false));
          }}
        >
          Revisar agora
        </button>
        {note && <p className="meta" role="status">{note}</p>}
      </div>
    );
  }
  if (agentId === "sentinela") {
    return (
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setNote(null);
            void api.watchSelf().then(
              async (r) => {
                const msg = r.created ? "O Open Dot entrou na vigilância." : "O Open Dot já estava na vigilância.";
                setNote(msg);
                app.announce(msg);
                await app.refresh();
              },
              (e: unknown) => {
                const msg = e instanceof ApiError && e.status === 409 ? "Limite de 3 sites. Remova um para vigiar o Open Dot." : "Não consegui cadastrar o monitor.";
                setNote(msg);
                app.announce(msg);
              },
            ).finally(() => setBusy(false));
          }}
        >
          Vigiar o próprio Open Dot
        </button>
        {note && <p className="meta" role="status">{note}</p>}
      </div>
    );
  }
  return null;
}

function AgentAbout({ agentId }: { agentId: AgentId }) {
  const p = AGENTS[agentId];
  const note = ABOUT[agentId];
  return (
    <div className="tiny" style={{ margin: "0 0 12px" }}>
      <a href={`#sobre-${agentId}`} onClick={(e) => {
        e.preventDefault();
        const el = document.getElementById(`sobre-${agentId}`);
        if (el instanceof HTMLDetailsElement) el.open = !el.open;
      }}>
        Sobre o agente e permissões
      </a>
      <details id={`sobre-${agentId}`}>
        <summary className="sr-only">Sobre o agente e permissões</summary>
        <span className="meta">{p.description} {note}</span>
        <ul className="list meta">
          {p.tools.map((t) => (
            <li key={t}>
              {t} — {TOOL_KIND[t] === "read" ? "leitura" : t === "feed.publish" ? "publica no seu feed privado" : "escrita: só com sua aprovação do conteúdo exato"}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const ABOUT: Partial<Record<AgentId, string>> = {
  noticias: "Só RSS da allowlist. Sem paywall. Um tema pede pelo menos dois veículos.",
  correio: "Gmail só leitura. O resumo não guarda o corpo da mensagem.",
  entregas: "O código sai do assunto e do trecho já lido. A consulta automática fica desligada até a chave e os termos.",
};

function EmptyState({ agentId }: { agentId: AgentId }) {
  const app = useApp();
  const copy = EMPTY[agentId] ?? ["Nada por aqui ainda.", "O resultado aparece quando a rotina terminar."];
  return (
    <div className="state" style={{ marginTop: 16 }}>
      <p>{copy[0]}</p>
      <p>{copy[1]}</p>
      <button className="btn primary" onClick={() => app.navigate("/conexoes")}>
        Abrir conexões
      </button>
    </div>
  );
}

const EMPTY: Partial<Record<AgentId, [string, string]>> = {
  correio: ["O Correio ainda não tem revisão.", "Conecte o Gmail em modo leitura."],
  dot: ["O Correio ainda não tem revisão.", "Conecte o Gmail em modo leitura."],
  sentinela: ["Nenhum site na Sentinela.", "Cadastre até três endereços https."],
  codigo: ["O Código ainda não lê repositório.", "A conexão é só leitura."],
  noticias: ["Notícias ainda sem leitura.", "O teste fica em Conexões."],
  mercado: ["Mercado ainda sem cotação.", "Cripto e câmbio não precisam de chave."],
  marketing: ["Marketing ainda sem rascunho.", "Nada é publicado daqui."],
  entregas: ["Nenhuma encomenda na lista.", "O rastreio automático pode estar desligado."],
};

function Loading() {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      <div className="skeleton" style={{ width: "80%" }} />
      <div className="skeleton" style={{ width: "60%" }} />
      <div className="skeleton" style={{ height: 96 }} />
      <span className="sr-only">Carregando resultados…</span>
    </div>
  );
}

function Composer() {
  const app = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<(AskAnswer & { question: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const question = q.trim();
    if (question.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = app.mode === "demo" && app.snap ? demoAsk(question, app.snap) : await api.ask(question);
      setAnswer({ ...r, question });
      setQ("");
      app.announce(r.answer);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "offline" ? "Sem conexão. Sua pergunta não foi enviada." : "Não consegui responder agora. Nada foi alterado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {answer && (
        <section className="answer" aria-live="polite">
          <div className="tiny">Você perguntou: {answer.question}</div>
          <p style={{ margin: "6px 0" }}>{answer.answer}</p>
          {answer.sources.length > 0 && (
            <ul className="list meta">
              {answer.sources.map((s) => (
                <li key={s.id}>
                  {s.href ? (
                    <a href={s.href} target="_blank" rel="noreferrer noopener">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}{" "}
                  — {s.detail}
                </li>
              ))}
            </ul>
          )}
          {answer.note && <div className="tiny">{answer.note}</div>}
        </section>
      )}
      {error && (
        <p role="alert" className="chip err" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="sr-only" htmlFor="ask">
          Pergunte ao Dot
        </label>
        <textarea
          id="ask"
          rows={1}
          placeholder="Pergunte sobre suas revisões…"
          value={q}
          maxLength={500}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button className="icon-btn" type="submit" aria-label="Enviar pergunta" disabled={busy || q.trim().length < 2} style={{ background: "var(--text)", color: "var(--bg)" }}>
          <Icon name="send" />
        </button>
        <span className="tiny" style={{ gridColumn: "1 / -1", paddingLeft: 8 }}>
          {busy ? "Procurando nas suas revisões…" : "Respostas usam só o que está no seu feed e citam a fonte."}
        </span>
      </form>
    </>
  );
}

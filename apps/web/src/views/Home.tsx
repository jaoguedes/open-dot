import { useState } from "react";
import { AGENTS, TOOL_KIND, type AgentId } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { api, ApiError, type AskAnswer } from "../api.ts";
import { demoAsk } from "../demo.ts";
import { DigestBlock, FeedRow } from "../components/FeedViews.tsx";
import { Icon } from "../components/Icons.tsx";
import { Dot2D } from "../components/Dot2D.tsx";
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
      <div className="msg-head">
        <Dot2D visual={app.visualFor(agentId)} accessory={app.accessoryFor(agentId)} size={22} animate={false} reducedMotion />
        <b>{AGENTS[agentId].name}</b>
        {digest && <span>{fmtTime(digest.createdAt)}</span>}
      </div>
      {agentId === "dot" && <h1 style={{ marginBottom: 8 }}>{greeting()}{name ? `, ${name}` : ""}.</h1>}

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

function AgentAbout({ agentId }: { agentId: AgentId }) {
  const p = AGENTS[agentId];
  return (
    <details className="card" style={{ marginBottom: 24 }}>
      <summary>Sobre o agente e permissões</summary>
      <p className="meta" style={{ marginTop: 8 }}>{p.description}</p>
      <ul className="list meta">
        {p.tools.map((t) => (
          <li key={t}>
            {t} — {TOOL_KIND[t] === "read" ? "leitura" : t === "feed.publish" ? "publica no seu feed privado" : "escrita: só com sua aprovação do conteúdo exato"}
          </li>
        ))}
      </ul>
    </details>
  );
}

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

function EmptyState({ agentId }: { agentId: AgentId }) {
  const app = useApp();
  const gmail = app.snap?.connections.find((c) => c.provider === "gmail" && c.status !== "disabled");
  const next = app.snap?.routines.find((r) => r.kind === "email_review")?.nextRunAt;
  let title = "Nada por aqui ainda.";
  let text = "Quando seus agentes terminarem uma rotina, o resultado aparece aqui com fonte e horário.";
  let action: { label: string; path: string } | null = null;
  if ((agentId === "dot" || agentId === "correio") && !gmail) {
    title = "Conecte seu Gmail para a primeira revisão.";
    text = "O Correio começa só com leitura. Ele não envia, apaga nem arquiva nada.";
    action = { label: "Conectar Gmail", path: "/conexoes" };
  } else if (agentId === "sentinela") {
    title = "Nenhum site cadastrado.";
    text = "Cadastre até três sites seus para verificações a cada 5 minutos.";
    action = { label: "Cadastrar site", path: "/conexoes" };
  } else if (agentId === "codigo") {
    title = "GitHub ainda não conectado.";
    text = "O Código lê PRs, issues e workflows dos repositórios que você escolher no GitHub App.";
    action = { label: "Ver conexões", path: "/conexoes" };
  } else if (next) {
    text = `Próxima revisão: ${fmtTime(next)}.`;
  }
  return (
    <div className="state" style={{ marginTop: 16 }}>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="btn primary" onClick={() => app.navigate(action.path)}>
          {action.label}
        </button>
      )}
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

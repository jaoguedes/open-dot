import { AGENTS, TOOL_KIND, toVisual, type AgentId } from "@open-dot/core";
import { lazy, Suspense, useRef, useState } from "react";

const AbsorbPanel = lazy(() => import("../components/AbsorbPanel.tsx").then((m) => ({ default: m.AbsorbPanel })));
import { askDot, composerEnter, composerRows, isTouchPrimary, readLastAnswer, saveLastAnswer, type SavedAnswer } from "../ask.ts";
import { AnswerView } from "../components/AnswerView.tsx";
import { sound } from "../sound.ts";
import { useApp } from "../store.tsx";
import { ApiError, api } from "../api.ts";
import { DigestBlock, FeedRow } from "../components/FeedViews.tsx";
import { Icon } from "../components/Icons.tsx";
import { AgentDot } from "../dot/AgentDot.tsx";
import { DotTrouble } from "../components/DotTrouble.tsx";
import { fmtWhen, greeting, ownerTimeZone } from "../format.ts";

/** Conversa do agente: resumo curto, ações pendentes e perguntas com fontes. */
export function Home({ agentId }: { agentId: AgentId }) {
  const app = useApp();
  const snap = app.snap;
  const feed = (snap?.feed ?? []).filter((f) => agentId === "dot" || f.agentId === agentId);
  const digest = feed.find((f) => f.kind === "email_digest");
  const others = feed.filter((f) => f !== digest).slice(0, 6);
  const name = snap?.owner?.name?.split(" ")[0];
  const today = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: ownerTimeZone() }).format(new Date());

  return (
    <>
      <div className="day-sep">Hoje, {today}</div>
      {agentId !== "dot" && <AgentAbout agentId={agentId} />}
      {app.visualFor(agentId).semantic === "error" && (
        <DotTrouble info={{ code: app.visualFor(agentId).reason && /^[a-z0-9_]+$/.test(app.visualFor(agentId).reason ?? "") ? app.visualFor(agentId).reason! : "unknown", route: app.path }} reducedMotion={app.reducedMotion} onRetry={() => void app.refresh()} onDismiss={() => (app.dismissError(agentId), app.announce("Erro dispensado até a próxima execução."))} />
      )}
      <AgentActions agentId={agentId} />
      <div className="msg-head">
        <AgentDot visual={app.visualFor(agentId)} accessory={app.accessoryFor(agentId)} size={22} animate={false} reducedMotion={app.reducedMotion} />
        <b>{AGENTS[agentId].name}</b>
        {digest && <span>{fmtWhen(digest.createdAt)}</span>}
      </div>
      {agentId === "dot" && <h1 className="mb-8">{greeting()}{name ? `, ${name}` : ""}.</h1>}
      {agentId === "dot" && snap && (
        <Suspense fallback={null}>
          <AbsorbPanel />
        </Suspense>
      )}

      {!snap ? (
        <Loading />
      ) : feed.length === 0 ? (
        <EmptyState agentId={agentId} />
      ) : (
        <>
          {digest && <DigestBlock item={digest} showIntro={agentId === "dot"} />}
          {others.length > 0 && (
            <ul className="list mt-24" aria-label="Outros resultados">
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
      <div className="row-actions mb-16">
        <button
          className="btn primary"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setNote(null);
            app.setActivity(toVisual("correio", "working", null, "Lendo e-mails. Nada é enviado."));
            sound.play("dot-think");
            void api.reviewNow().then(
              async (r) => {
                app.setActivity(toVisual("correio", "success"));
                if (r.ok) sound.play("dot-done");
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
      <div className="row-actions mb-16">
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
    <div className="tiny m-0 mb-12">
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
    <div className="state mt-16">
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
    <div className="col-10 mt-16" role="status" aria-live="polite">
      <div className="skeleton w-80" />
      <div className="skeleton w-60" />
      <div className="skeleton h-96" />
      <span className="sr-only">Carregando resultados…</span>
    </div>
  );
}

function Composer() {
  const app = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<SavedAnswer | null>(readLastAnswer);
  const [error, setError] = useState<string | null>(null);
  const touch = useRef(isTouchPrimary()).current;

  const submit = async () => {
    const question = q.trim();
    if (question.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      sound.play("dot-send");
      const r = await askDot(question, app.mode === "demo" ? app.snap : null);
      const saved = { ...r, question };
      sound.play("dot-receive");
      setAnswer(saved);
      saveLastAnswer(saved);
      setQ("");
      app.announce(r.answer);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "offline" ? "Sem conexão. Sua pergunta não foi enviada." : "Não consegui responder agora. Nada foi alterado.");
    } finally {
      setBusy(false);
    }
  };
  const clear = () => {
    setAnswer(null);
    saveLastAnswer(null);
  };

  return (
    <>
      {answer && <AnswerView answer={answer} onClear={clear} />}
      {error && (
        <p role="alert" className="chip err section-gap">
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
          rows={composerRows(q)}
          placeholder="Pergunte sobre suas revisões…"
          value={q}
          maxLength={500}
          enterKeyHint={touch ? "enter" : "send"}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            const action = composerEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode }, touch);
            if (action === "send") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button className="icon-btn send-btn" type="submit" aria-label="Enviar pergunta" disabled={busy || q.trim().length < 2}>
          <Icon name="send" />
        </button>
        <span className="tiny composer-hint">
          {busy ? "Procurando nas suas revisões…" : touch ? "Toque na seta para enviar. Respostas citam a fonte." : "Enter envia, Shift+Enter quebra a linha. Respostas citam a fonte."}
        </span>
      </form>
    </>
  );
}

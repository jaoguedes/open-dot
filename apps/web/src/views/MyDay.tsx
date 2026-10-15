import { useRef, useState } from "react";
import { AGENTS, agentsInPlace, approvalQueue, type AgentId } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { AgentDot } from "../dot/AgentDot.tsx";
import { fmtTime, fmtWhen, greeting, needYouLine } from "../format.ts";
import { agentConnected, agentPresence, dominantVisual, type ConnectionFacts } from "../presence.ts";
import type { ApprovalView, FeedEntry } from "../api.ts";
import { ApiError, api } from "../api.ts";
import { GmailOpen } from "../components/GmailOpen.tsx";

type Filter = "all" | "need" | "sources";

function isNeed(it: FeedEntry): boolean {
  if (it.kind === "ci_failure" || it.kind === "site_incident" || it.kind === "quote_alert") return true;
  if (it.kind === "email_digest") return (it.body.itens?.length ?? it.body.counts?.important ?? 0) > 0;
  return false;
}

/** Meu dia — tela 01: saudação real, 3 cartões, feed e laterais. */
export function MyDay() {
  const app = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const snap = app.snap;
  const name = snap?.owner?.name?.split(" ")[0];
  const digest = snap?.feed.find((f) => f.kind === "email_digest");
  const items = (snap?.feed ?? []).filter((f) => f.kind !== "notice");
  const shown = items.filter((it) => (filter === "all" ? true : filter === "need" ? isNeed(it) : Boolean(it.body.href) || it.kind === "email_digest" || it.kind === "news_digest"));
  const mailNeed = digest && digest.state !== "done" && digest.state !== "snoozed" ? (digest.body.itens?.length ?? digest.body.counts?.important ?? 0) : 0;
  const otherNeed = items.filter((it) => it.kind !== "email_digest" && isNeed(it) && it.state !== "done" && it.state !== "snoozed").length;
  const need = mailNeed + otherNeed;
  const reviewed = digest?.body.total ?? 0;
  const monitors = snap?.monitors ?? [];
  const up = monitors.filter((m) => !m.incident?.open).length;
  const lastCheck = monitors.map((m) => m.lastCheckAt).filter(Boolean).sort().at(-1);
  const gmail = snap?.connections.find((c) => c.provider === "gmail" && c.status !== "disabled");
  // Só erro, "esperando você" e trabalho mudam o humor do Dot grande; o desempate é o da ilha.
  const visual = dominantVisual([app.visualFor("dot"), ...agentsInPlace("mood").map((a) => app.visualFor(a)).filter((v) => v.semantic === "error" || v.semantic === "waiting" || v.semantic === "working")]);
  const nextRoutines = (snap?.routines ?? []).filter((r) => r.enabled).slice(0, 3);
  const apQueue = approvalQueue(snap?.approvals ?? [], Date.now());

  return (
    <>
      <section className="hero" aria-label="Saudação">
        <div className="hero-copy">
          <h1>
            {greeting()}
            {name ? `, ${name}` : ""}.
          </h1>
          <p className="serif">{needYouLine(need)}</p>
          {digest && (
            <p className="meta">
              {digest.body.abertura ?? digest.body.headline} {monitors.length ? `${up}/${monitors.length} sites no ar.` : ""}
            </p>
          )}
        </div>
        <div className="hero-dot">
          <AgentDot visual={visual} accessory={app.accessoryFor(visual.agentId)} size={280} reducedMotion={app.reducedMotion} interactive antennaPulse={visual.agentId === "noticias" && items.some((f) => f.kind === "news_digest" && f.freshness === "fresh")} />
        </div>
      </section>

      <section className="agent-pills" aria-label="Agentes">
        {agentsInPlace("pills").map((a) => {
          const facts: ConnectionFacts = {
            demo: app.mode === "demo",
            gmail: Boolean(gmail && gmail.status === "connected"),
            github: Boolean(snap?.configured.github || snap?.configured.githubApp),
            vercel: Boolean(snap?.configured.vercel),
            gsc: Boolean(snap?.connections.some((c) => c.provider === "gsc" && c.status === "connected")),
            monitors: monitors.length,
            shipments: snap?.shipments.shipments.length ?? 0,
            tracking: Boolean(snap?.configured.tracking || snap?.shipments.tracking.enabled),
            disabled: {},
          };
          const pr = agentPresence(a, app.visualFor(a), snap?.feed ?? [], monitors, {
            connected: agentConnected(a, facts),
            pendingShipments: snap?.shipments.shipments.filter((s) => s.needsCarrier).length ?? 0,
          });
          return (
            <button key={a} type="button" className={`agent-pill ${pr.tone === "off" ? "is-off" : ""} ${pr.tone === "working" || pr.tone === "need" ? "on" : ""}`} onClick={() => app.navigate(`/agente/${a}`)} aria-label={pr.tone === "off" ? `${AGENTS[a].name}, não conectado` : AGENTS[a].name}>
              <span className={`agent-dot-status ${pr.dotClass}`} aria-hidden="true" />
              {AGENTS[a].name}
              {pr.tone === "working" ? " · lendo" : ""}
            </button>
          );
        })}
      </section>

      <section className="stats" aria-label="Resumo de hoje">
        <article className="stat mail">
          <span className="glow" aria-hidden="true" />
          <span className="lbl">E-mails revisados</span>
          <span className="num">{reviewed || "—"}</span>
          <span className="sub">{app.mode === "demo" ? "exemplo · Gmail só leitura" : "Gmail só leitura"}</span>
        </article>
        <article className="stat need">
          <span className="glow" aria-hidden="true" />
          <span className="lbl">Precisam de você</span>
          <span className="num">{need}</span>
          <span className="sub">{need ? `${need} ${need === 1 ? "item pede" : "itens pedem"} atenção` : "Nada pendente"}</span>
        </article>
        <article className="stat site">
          <span className="glow" aria-hidden="true" />
          <span className="lbl">Sites no ar</span>
          <span className="num">{monitors.length ? `${up}/${monitors.length}` : "—"}</span>
          <span className="sub">{lastCheck ? `última verificação ${fmtTime(lastCheck)}` : app.mode === "demo" ? "exemplo" : "Nenhum site cadastrado"}</span>
        </article>
      </section>

      <div className="day-grid">
        <section className="day-feed" aria-labelledby="h-feed">
          <div className="feed-toolbar">
            <h2 id="h-feed">Recentes</h2>
            <FilterTabs value={filter} onChange={setFilter} />
          </div>
          {apQueue.total > 0 && <ApprovalQueueCard queue={apQueue} />}
          <div role="tabpanel" id="feed-panel" aria-labelledby={`tab-${filter}`}>
          {!snap ? (
            <p className="meta">Carregando o dia…</p>
          ) : shown.length === 0 ? (
            <div className="state">
              {!gmail && app.mode !== "demo" ? (
                <>
                  <h2>Conecte seu Gmail para a primeira revisão.</h2>
                  <p>O Correio começa só com leitura. Ele não envia, apaga nem arquiva nada.</p>
                  <button className="btn primary" onClick={() => app.navigate("/conexoes")}>
                    Conectar Gmail
                  </button>
                </>
              ) : (
                <>
                  <h2>Nada neste filtro.</h2>
                  <p>Resultados aparecem depois das rotinas. Nada é marcado como concluído sem confirmação real.</p>
                </>
              )}
            </div>
          ) : (
            shown.map((it) => (
              <article key={it.id} className={`feed-card ${isNeed(it) ? "need" : ""}`}>
                <div className="feed-kicker">
                  {AGENTS[it.agentId].name} · {fmtWhen(it.createdAt)}
                  {isNeed(it) && it.kind !== "ci_failure" && <span className="chip warn chip-push">Precisa de você</span>}
                  {it.kind === "ci_failure" && <span className="chip err chip-push">Falhou</span>}
                </div>
                <FeedCardBody item={it} />
                {isNeed(it) && it.state !== "done" && it.state !== "snoozed" && app.mode === "live" && <FeedActions id={it.id} />}
              </article>
            ))
          )}
          {snap && app.feedHasMore && <MoreFeed />}
          </div>
        </section>
        <aside className="day-aside">
          <div className="card">
            <div className="aside-h">Próximas rotinas</div>
            {nextRoutines.length === 0 ? (
              <p className="meta">Nenhuma rotina cadastrada.</p>
            ) : (
              nextRoutines.map((r) => (
                <div className="row-between gap-8 fs-14" key={r.id}>
                  <span>{r.kind === "email_review" ? "Revisão de e-mail" : r.kind === "news_review" ? "O mundo hoje" : r.kind}</span>
                  <span className="mono text-2c">{r.nextRunAt ? fmtTime(r.nextRunAt) : r.times[0]}</span>
                </div>
              ))
            )}
          </div>
          {app.mode === "demo" && <span className="tiny">Dados de exemplo.</span>}
        </aside>
      </div>
    </>
  );
}

function FeedCardBody({ item }: { item: FeedEntry }) {
  const app = useApp();
  if (item.kind === "email_digest" && item.body.itens?.length) {
    return (
      <>
        {item.body.itens.map((it) => (
          <article className="stack-4 mt-8" key={it.origem}>
            <div className="tiny">{it.categoria} · {fmtWhen(it.quando)}</div>
            <div className="feed-title">{it.de ?? "Remetente"} — {it.titulo}</div>
            <p className="meta m-0">{it.o_que_aconteceu}</p>
            <p className="m-0">{it.o_que_fazer}</p>
            <div className="row-actions">
              <GmailOpen gmailId={it.origem} rfc822={it.rfc822} demo={app.mode === "demo"} />
            </div>
          </article>
        ))}
      </>
    );
  }
  const title = item.kind === "email_digest" ? (item.body.top?.[0]?.subject ?? item.body.abertura ?? item.title) : item.title;
  const text = item.kind === "email_digest" ? (item.body.top?.[0]?.reason ?? item.body.headline) : (item.body.summary ?? item.body.headline);
  const href = item.body.top?.[0]?.href ?? item.body.itens?.[0]?.href;
  const gmailOk = Boolean(href?.startsWith("https://mail.google.com/"));
  return (
    <>
      <div className="feed-title">{title}</div>
      {text && <p className="meta m-0">{text}</p>}
      {item.body.disclaimer && <p className="tiny">{item.body.disclaimer}</p>}
      {item.body.correlation && <p className="meta m-0">{item.body.correlation}</p>}
      {item.kind === "email_digest" && (
        <div className="row-actions">
          {app.mode !== "demo" && gmailOk ? (
            <a className="btn" href={href} target="_blank" rel="noreferrer noopener">
              Abrir no Gmail
            </a>
          ) : (
            <span className="btn" aria-disabled="true" title={app.mode === "demo" ? "Demonstração: sem conta conectada" : undefined}>
              Abrir no Gmail
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** Feito / Adiar: um clique por vez; falha vira aviso no cartão (o Dot de erro vem do api.ts). */
function FeedActions({ id }: { id: string }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (kind: "done" | "snooze") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "done") await api.feedDone(id);
      else await api.feedSnooze(id);
      app.announce(kind === "done" ? "Marcado como feito." : "Adiado até amanhã às 8h.");
      await app.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não consegui salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row-actions">
      <button className="btn" type="button" disabled={busy} onClick={() => void act("done")}>
        Feito
      </button>
      <button className="btn ghost" type="button" disabled={busy} onClick={() => void act("snooze")}>
        Adiar
      </button>
      {error && (
        <p className="tiny err-text" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

const FILTERS: ReadonlyArray<readonly [Filter, string]> = [
  ["all", "Tudo"],
  ["need", "Precisa de você"],
  ["sources", "Com link"],
];

/** Abas do filtro: setas ←/→, Home e End movem e selecionam (padrão WAI-ARIA, foco itinerante). */
function FilterTabs({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = FILTERS.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(FILTERS[next]![0]);
    refs.current[next]?.focus();
  };
  return (
    <div className="seg" role="tablist" aria-label="Filtrar o feed">
      {FILTERS.map(([id, label], i) => (
        <button
          key={id}
          ref={(el) => void (refs.current[i] = el)}
          id={`tab-${id}`}
          role="tab"
          type="button"
          aria-selected={value === id}
          aria-controls="feed-panel"
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MoreFeed() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const more = async () => {
    setBusy(true);
    setError(null);
    try {
      await app.loadMoreFeed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não consegui carregar mais.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row-actions feed-more">
      <button className="btn" type="button" disabled={busy} onClick={() => void more()}>
        {busy ? "Carregando…" : "Mostrar mais"}
      </button>
      {error && <p className="tiny err-text" role="status">{error}</p>}
    </div>
  );
}

/** Fila de aprovações (E2): uma por vez, ordem de chegada, até 5 visíveis e "mais N". */
function ApprovalQueueCard({ queue }: { queue: ReturnType<typeof approvalQueue<ApprovalView>> }) {
  const app = useApp();
  const first = queue.visible[0]!;
  return (
    <section className="card need approval-queue mb-12" aria-labelledby="h-fila">
      <div className="feed-kicker">
        Aprovações <span className="chip warn chip-push">{queue.total === 1 ? "1 esperando" : `${queue.total} esperando`}</span>
      </div>
      <h3 id="h-fila" className="feed-title">{queue.total === 1 ? "Uma ação espera seu OK." : `${queue.total} ações esperam seu OK.`}</h3>
      <ol className="queue-list">
        {queue.visible.map((a, i) => (
          <li key={a.id}>
            <a href={`/aprovacao/${encodeURIComponent(a.id)}`} onClick={(e) => (e.preventDefault(), app.navigate(`/aprovacao/${encodeURIComponent(a.id)}`))}>
              {i + 1}. {String(a.proposal?.payload.subject ?? a.proposal?.consequence ?? "Aprovação")}
            </a>
          </li>
        ))}
      </ol>
      {queue.more > 0 && <p className="tiny">e mais {queue.more}</p>}
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={() => app.navigate(`/aprovacao/${encodeURIComponent(first.id)}`)}>
          Revisar resposta (1 de {queue.total})
        </button>
      </div>
    </section>
  );
}

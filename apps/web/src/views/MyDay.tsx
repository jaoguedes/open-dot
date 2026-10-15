import { useState } from "react";
import { AGENTS, type AgentId } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { AgentDot } from "../dot/AgentDot.tsx";
import { fmtTime, greeting, needYouLine } from "../format.ts";
import { agentConnected, agentPresence, type ConnectionFacts } from "../presence.ts";
import type { FeedEntry } from "../api.ts";
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
  const visual = (() => {
    let best = app.visualFor("dot");
    for (const a of ["correio", "codigo", "sentinela", "noticias", "mercado", "marketing"] as AgentId[]) {
      const v = app.visualFor(a);
      if (v.semantic === "error" || v.semantic === "waiting") return v;
      if (v.semantic === "working") best = v;
    }
    return best;
  })();
  const nextRoutines = (snap?.routines ?? []).filter((r) => r.enabled).slice(0, 3);
  const pendingAp = snap?.approvals.find((a) => a.status === "pending")?.id;

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
        {(["correio", "codigo", "sentinela", "noticias", "mercado", "marketing", "entregas"] as AgentId[]).map((a) => {
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
            <h2 id="h-feed">Hoje</h2>
            <div className="seg" role="tablist" aria-label="Filtrar o feed">
              {([["all", "Tudo"], ["need", "Precisa de você"], ["sources", "Fontes"]] as const).map(([id, lab]) => (
                <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
                  {lab}
                </button>
              ))}
            </div>
          </div>
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
                  {AGENTS[it.agentId].name} · {fmtTime(it.createdAt)}
                  {isNeed(it) && it.kind !== "ci_failure" && <span className="chip warn chip-push">Precisa de você</span>}
                  {it.kind === "ci_failure" && <span className="chip err chip-push">Falhou</span>}
                </div>
                <FeedCardBody item={it} pendingAp={pendingAp} />
                {isNeed(it) && it.state !== "done" && it.state !== "snoozed" && app.mode === "live" && <FeedActions id={it.id} />}
              </article>
            ))
          )}
        </section>
        <aside className="day-aside">
          <div className="card">
            <div className="aside-h">Próximas rotinas</div>
            {nextRoutines.length === 0 ? (
              <p className="meta">Nenhuma rotina cadastrada.</p>
            ) : (
              nextRoutines.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                  <span>{r.kind === "email_review" ? "Revisão de e-mail" : r.kind === "news_review" ? "O mundo hoje" : r.kind}</span>
                  <span className="mono" style={{ color: "var(--text-2)" }}>{r.nextRunAt ? fmtTime(r.nextRunAt) : r.times[0]}</span>
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

function FeedCardBody({ item, pendingAp }: { item: FeedEntry; pendingAp?: string }) {
  const app = useApp();
  if (item.kind === "email_digest" && item.body.itens?.length) {
    return (
      <>
        {item.body.itens.map((it) => (
          <article key={it.origem} style={{ display: "grid", gap: 4, marginTop: 8 }}>
            <div className="tiny">{it.categoria} · {fmtTime(it.quando)}</div>
            <div className="feed-title">{it.de ?? "Remetente"} — {it.titulo}</div>
            <p className="meta" style={{ margin: 0 }}>{it.o_que_aconteceu}</p>
            <p style={{ margin: 0 }}>{it.o_que_fazer}</p>
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
      {text && <p className="meta" style={{ margin: 0 }}>{text}</p>}
      {item.body.disclaimer && <p className="tiny">{item.body.disclaimer}</p>}
      {item.body.correlation && <p className="meta" style={{ margin: 0 }}>{item.body.correlation}</p>}
      {item.kind === "email_digest" && (
        <div className="row-actions">
          {pendingAp && (
            <button type="button" className="btn primary" onClick={() => app.navigate(`/aprovacao/${pendingAp}`)}>
              Revisar resposta
            </button>
          )}
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

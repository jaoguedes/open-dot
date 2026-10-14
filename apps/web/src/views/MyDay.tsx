import { useState } from "react";
import { AGENTS, type AgentId } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { FeedRow } from "../components/FeedViews.tsx";
import { AgentDot } from "../dot/AgentDot.tsx";
import { fmtTime, greeting, needYouLine } from "../format.ts";
import type { FeedEntry } from "../api.ts";

type Filter = "all" | "need" | "sources";

function isNeed(it: FeedEntry): boolean {
  if (it.kind === "ci_failure" || it.kind === "site_incident" || it.kind === "quote_alert") return true;
  if (it.kind === "email_digest") return (it.body.counts?.important ?? 0) > 0;
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
  const need = digest?.body.counts?.important ?? items.filter(isNeed).length;
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
  const sources = digest?.body.top?.slice(0, 3) ?? [];

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
              Revisei {reviewed} {reviewed === 1 ? "mensagem" : "mensagens"}
              {app.mode === "demo" ? " do exemplo" : ""} desde a última revisão. {digest.body.counts?.important ?? 0} merecem atenção
              {monitors.length ? `, ${up}/${monitors.length} sites no ar` : ""}.
            </p>
          )}
        </div>
        <div className="hero-dot">
          <AgentDot visual={visual} accessory={app.accessoryFor(visual.agentId)} size={280} reducedMotion={app.reducedMotion} interactive antennaPulse={visual.agentId === "noticias" && items.some((f) => f.kind === "news_digest" && f.freshness === "fresh")} />
        </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
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
                  {isNeed(it) && it.kind !== "ci_failure" && <span className="chip warn" style={{ marginLeft: "auto" }}>Precisa de você</span>}
                  {it.kind === "ci_failure" && <span className="chip err" style={{ marginLeft: "auto" }}>Falhou</span>}
                </div>
                {it.kind === "email_digest" ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{it.body.top?.[0]?.subject ?? it.title}</div>
                    <p className="meta" style={{ margin: 0 }}>{it.body.top?.[0]?.reason ?? it.body.headline}</p>
                  </>
                ) : (
                  <FeedRow item={it} />
                )}
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
          <div className="card">
            <div className="aside-h">Fontes do resumo</div>
            {sources.length === 0 ? (
              <p className="meta">As fontes aparecem quando houver revisão.</p>
            ) : (
              sources.map((s) => (
                <div key={s.messageId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.subject}</span>
                  <span className="mono" style={{ color: "var(--text-3)" }}>Gmail</span>
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

import { SourcePill } from "./SourcePill.tsx";
import { gmailWebHref } from "@open-dot/connectors/gmail.ts";
import { AGENTS } from "@open-dot/core";
import type { FeedEntry } from "../api.ts";
import { Icon, type IconName } from "./Icons.tsx";
import { fmtDateTime, fmtTime, fmtWhen, senderName } from "../format.ts";
import { useApp } from "../store.tsx";
import { GmailOpen } from "./GmailOpen.tsx";

const ICON: Record<FeedEntry["kind"], IconName> = {
  email_digest: "mail",
  site_incident: "globe",
  ci_failure: "code",
  deploy: "layers",
  notice: "alert",
  file_organized: "file",
  news_digest: "globe",
  quote_alert: "layers",
  marketing_ideas: "sparkle",
  shipment: "layers",
};

export function FreshnessChip({ f }: { f: FeedEntry["freshness"] }) {
  if (f === "fresh") return null;
  return <span className={`chip ${f === "partial" ? "warn" : ""}`}>{f === "partial" ? "Cobertura parcial" : "Desatualizado"}</span>;
}

function MailLink({ href, children }: { href: string; children: React.ReactNode }) {
  const app = useApp();
  if (app.mode === "demo" || !href.startsWith("https://mail.google.com/")) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children} <Icon name="external" size={13} />
    </a>
  );
}

/** Resumo de e-mail: resultado primeiro, evidência depois, detalhes técnicos por último. */
export function DigestBlock({ item, showIntro }: { item: FeedEntry; showIntro: boolean }) {
  const app = useApp();
  const b = item.body;
  if (b.itens) {
    return (
      <section aria-labelledby={`h-${item.id}`}>
        <h2 id={`h-${item.id}`}>{item.title}</h2>
        <p className="lead">{b.abertura ?? b.headline}</p>
        {b.itens.map((it) => (
          <article key={it.origem} className="card mt-12">
            <div className="card-top">{it.categoria} · {fmtWhen(it.quando)}</div>
            <h3>{it.de ?? "Remetente"}</h3>
            <SourcePill agentId="correio" origin={it.de ?? "Remetente"} href={it.href ?? gmailWebHref(it.origem, it.rfc822)} />
            <p>{it.titulo}</p>
            <p className="meta">{it.o_que_aconteceu}</p>
            <p>{it.o_que_fazer}</p>
            {it.sensivel && <p className="tiny">Confira o original.</p>}
            <div className="row-actions">
              <GmailOpen gmailId={it.origem} rfc822={it.rfc822} demo={app.mode === "demo"} />
            </div>
          </article>
        ))}
        {(b.sem_acao?.length || b.ruido?.contagem) ? (
          <details className="mt-12">
            <summary>
              {b.sem_acao?.length ? `Sem ação (${b.sem_acao.length})` : ""}
              {b.sem_acao?.length && b.ruido?.contagem ? " · " : ""}
              {b.ruido?.contagem ? `Promoções e newsletters: ${b.ruido.contagem}` : ""}
            </summary>
          </details>
        ) : null}
        {b.anexos && <p className="tiny">{b.anexos}</p>}
      </section>
    );
  }
  const first = b.top?.[0];
  const others = b.top?.slice(1) ?? [];
  const isDemo = app.mode === "demo";
  return (
    <section aria-labelledby={`h-${item.id}`}>
      <h2 id={`h-${item.id}`} style={showIntro ? { fontSize: 17 } : undefined}>
        {item.title}
      </h2>
      <p className="lead">
        {b.total === 0 ? (
          "Nenhuma mensagem nova nesta janela."
        ) : (
          <>
            Revisei {b.total} {b.total === 1 ? "mensagem" : "mensagens"}
            {isDemo ? " do exemplo" : ""}. <b>{b.counts?.important ?? 0} {b.counts?.important === 1 ? "merece" : "merecem"} sua atenção</b>, {b.counts?.review ?? 0} para revisar e {b.counts?.low ?? 0} podem esperar.
          </>
        )}
      </p>
      {first && (
        <div className="card action">
          <div className="card-top">
            <Icon name="mail" size={14} /> Correio <span className="chip warn">Precisa de você</span>
          </div>
          <h3>{first.subject}</h3>
          <p>
            {senderName(first.from)} · {first.reason} · {fmtWhen(first.receivedAt)}
          </p>
          <div className="row-actions">
            {isDemo ? (
              <span className="btn primary" aria-disabled="true" title="Demonstração: sem conta conectada">
                Abrir e-mail (exemplo)
              </span>
            ) : (
              <a className="btn primary" href={first.href} target="_blank" rel="noreferrer noopener">
                Abrir e-mail <Icon name="external" size={15} />
              </a>
            )}
          </div>
        </div>
      )}
      {(others.length > 0 || (b.rest?.length ?? 0) > 0) && (
        <details className="mt-12">
          <summary>Ver outras {others.length + (b.rest?.length ?? 0)}</summary>
          <ul className="list">
            {[...others, ...(b.rest ?? [])].map((m) => (
              <li key={m.messageId} className="mail">
                <span className="subj">
                  <MailLink href={m.href}>{m.subject}</MailLink>
                </span>
                <span className={`chip ${m.category === "important" ? "warn" : ""}`}>{m.category === "important" ? "Importante" : m.category === "review" ? "Revisar" : "Pode esperar"}</span>
                <span className="why">
                  {senderName(m.from)} · {m.reason}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="coverage">
        {item.coverage && (
          <>
            <span>
              {item.coverage.analyzed} analisadas{item.coverage.available !== null && item.coverage.available !== item.coverage.analyzed ? ` de ${item.coverage.available}` : ""}
            </span>
            <span>Sincronizado até {fmtTime(item.coverage.syncedUntil)}</span>
            <span>Lido: {item.coverage.fieldsRead.join(", ")}</span>
            {item.coverage.partial && <span className="text-warn">{item.coverage.partialReason}</span>}
          </>
        )}
        <span>{b.aiUsed ? "Classificado com IA" : b.aiNote ?? "Classificado por regras"}</span>
        <span>Nenhum e-mail foi alterado.</span>
      </div>
    </section>
  );
}

export function FeedRow({ item }: { item: FeedEntry }) {
  const app = useApp();
  const b = item.body;
  return (
    <li className="item">
      <span className="icon">
        <Icon name={ICON[item.kind]} />
      </span>
      <div>
        <h3>
          {item.title} <FreshnessChip f={item.freshness} />
        </h3>
        <p>{b.summary ?? b.headline}</p>
        {b.disclaimer && <p className="tiny">{b.disclaimer}</p>}
        {item.kind === "news_digest" && b.worldToday && (
          <ul className="list mt-8">
            {b.worldToday.flatMap((s) =>
              s.items.map((n) => (
                <li key={n.link} className="mail">
                  <span className="subj">
                    {app.mode === "demo" ? (
                      n.title
                    ) : (
                      <a href={n.link} target="_blank" rel="noreferrer noopener">
                        {n.title} <Icon name="external" size={12} />
                      </a>
                    )}
                  </span>
                  <span className="why">
                    <SourcePill agentId="noticias" origin={n.outlet} href={n.link} /> {s.theme}
                  </span>
                </li>
              )),
            )}
          </ul>
        )}
        {b.politics?.map((c) => (
          <p key={c.topic} className="tiny">
            {c.notice ?? c.eachSide.map((s) => `${s.outlet}: ${s.title}`).join(" · ")}
          </p>
        ))}
        {b.drafts?.map((d, i) => (
          <p key={i} className="tiny">
            {d.text}
          </p>
        ))}
        {b.correlation && <p>{b.correlation}</p>}
        <div className="tiny row-wrap-12">
          <span>
            {AGENTS[item.agentId]?.name ?? item.agentId} · {fmtDateTime(item.createdAt)}
          </span>
          {b.href && app.mode !== "demo" && (b.href.startsWith("https://") ? (
            <a href={b.href} target="_blank" rel="noreferrer noopener">
              Ver fonte <Icon name="external" size={12} />
            </a>
          ) : null)}
          {item.body.actions?.some((a) => a.kind === "reconnect") && (
            <a href="/conexoes" onClick={(e) => (e.preventDefault(), app.navigate("/conexoes"))}>
              Reconectar
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

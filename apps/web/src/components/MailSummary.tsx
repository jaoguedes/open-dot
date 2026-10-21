// SPDX-License-Identifier: AGPL-3.0-only
import { gmailWebHref } from "@open-dot/connectors/gmail.ts";
import { SourcePill } from "./SourcePill.tsx";
import type { FeedEntry } from "../api.ts";
import { fmtWhen } from "../format.ts";
import { GmailOpen } from "./GmailOpen.tsx";
import { TriageButtons } from "./TriageButtons.tsx";
import { useApp } from "../store.tsx";

type MailItem = NonNullable<FeedEntry["body"]["itens"]>[number];
const REASONS: Record<string, string> = {
  pagamento: "A mensagem envolve um pagamento; confira valor e prazo no original.",
  seguranca: "Pode envolver o acesso à sua conta. Confira o remetente no original.",
  prazo: "Existe um prazo que merece sua revisão.",
  pessoa: "Uma conversa pode precisar da sua atenção.",
  resposta: "Pode haver uma resposta pendente.",
  encomenda: "Há uma atualização relacionada a uma entrega.",
};
export function MailSummary({ item }: { item: MailItem }) {
  const app = useApp();
  return (
    <article className="card mail-summary stack-4 mt-12">
      <div className="card-top">
        <span className="chip">{item.categoria}</span> · {fmtWhen(item.quando)}
      </div>
      <h3 className="feed-title">{item.titulo}</h3>
      <p className="tiny">{item.de ?? "Remetente disponível no original"}</p>
      <SourcePill agentId="correio" origin={item.de ?? "Remetente"} href={item.href ?? gmailWebHref(item.origem, item.rfc822)} />
      <dl>
        <dt>O que aconteceu</dt>
        <dd>{item.o_que_aconteceu}</dd>
        <dt>Por que importa</dt>
        <dd>{REASONS[item.categoria] ?? "O resumo destacou esta mensagem para revisão. Confira o contexto no original."}</dd>
        <dt>O que fazer agora</dt>
        <dd>{item.o_que_fazer}</dd>
      </dl>
      <p className="tiny">Orientação por categoria · rascunho não preparado.</p>
      {item.sensivel && <p className="tiny">Mensagem sensível: confira o original.</p>}
      <div className="row-actions">
        <GmailOpen gmailId={item.origem} rfc822={item.rfc822} demo={app.mode === "demo"} />
      </div>
      <TriageButtons messageId={item.origem} categoria={item.categoria} />
    </article>
  );
}

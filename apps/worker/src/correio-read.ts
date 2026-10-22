// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Correio e Notícias (v0.3): rota SÓ DE LEITURA sobre os metadados que o Worker já guarda
 * cifrados (remetente, assunto, trecho curto, rótulos). Não chama o Gmail, não escreve no banco,
 * não envia nada a modelo. O texto da mensagem volta como dado; filtros usam só rótulos.
 */
import { z } from "zod";
import { MAIL_FILTERS, daySummary, matches, plainText, type MailRow } from "@open-dot/core/correio-view.ts";
import { gmailWebHref } from "@open-dot/connectors/gmail.ts";
import type { Handler } from "./app.ts";
import { open } from "./crypto.ts";
import { json } from "./http.ts";

type Registrar = (method: string, path: string, opts: { auth: boolean; csrf?: boolean }, handler: Handler) => void;

export function registerCorreioRead(route: Registrar) {
  route("GET", "/api/correio/mensagens", { auth: true }, async (ctx, req, _p, owner) => {
    const filtro = z.enum(MAIL_FILTERS).catch("todas").parse(new URL(req.url).searchParams.get("filtro") ?? "todas");
    const conn = (await ctx.db.query<{ id: string; status: string }>("SELECT id,status FROM od_connections WHERE owner_id=? AND provider='gmail' AND status!='disabled' ORDER BY created_at DESC LIMIT 1", [owner!]))[0];
    if (!conn) return json({ conectado: false, filtro, mensagens: [], resumo: null, escopo: "gmail.readonly" });
    const rows = await ctx.db.query<{ message_id: string; thread_id: string; from_enc: string; subject_enc: string; snippet_enc: string | null; received_at: string; labels: string; list_unsub: number; bulk: number; category: string | null; rfc822_id: string | null }>(
      "SELECT message_id,thread_id,from_enc,subject_enc,snippet_enc,received_at,labels,list_unsub,bulk,category,rfc822_id FROM od_email_messages WHERE owner_id=? ORDER BY received_at DESC LIMIT 100",
      [owner!],
    );
    const all: MailRow[] = [];
    for (const r of rows) {
      const aad = `msg:${owner}:${r.message_id}`;
      all.push({
        id: r.message_id,
        threadId: r.thread_id,
        from: plainText(await open(ctx.keys, r.from_enc, aad), 200),
        subject: plainText(await open(ctx.keys, r.subject_enc, aad), 300),
        snippet: r.snippet_enc ? plainText(await open(ctx.keys, r.snippet_enc, aad), 300) : "",
        receivedAt: r.received_at,
        labels: (JSON.parse(r.labels) as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20),
        listUnsubscribe: r.list_unsub === 1,
        bulk: r.bulk === 1,
        category: r.category === "important" || r.category === "review" || r.category === "low" ? r.category : null,
        href: gmailWebHref(r.message_id, r.rfc822_id),
      });
    }
    return json({
      conectado: conn.status === "connected",
      estado: conn.status,
      filtro,
      escopo: "gmail.readonly",
      resumo: daySummary(all, new Date(ctx.now())),
      mensagens: all.filter((m) => matches(m, filtro)).slice(0, 50),
    });
  });
}

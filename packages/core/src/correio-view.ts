// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Correio e Notícias (v0.3, só leitura). Tudo aqui é determinístico e sem modelo: filtros, contagens
 * e o resumo do dia. O texto do e-mail (remetente, assunto, trecho) é DADO não confiável: só é
 * exibido como texto e nunca decide filtro, permissão, ferramenta ou roteamento (os filtros usam
 * só rótulos do provedor e marcas de lista).
 */
export interface MailRow {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  labels: string[];
  listUnsubscribe: boolean;
  bulk: boolean;
  category: "important" | "review" | "low" | null;
  href: string | null;
}

export const MAIL_FILTERS = ["todas", "nao_lidas", "importantes", "newsletters"] as const;
export type MailFilter = (typeof MAIL_FILTERS)[number];
export const FILTER_LABEL: Record<MailFilter, string> = { todas: "Todas", nao_lidas: "Não lidas", importantes: "Importantes", newsletters: "Newsletters" };

export function isNewsletter(m: Pick<MailRow, "labels" | "listUnsubscribe" | "bulk">): boolean {
  return m.listUnsubscribe || m.bulk || m.labels.includes("CATEGORY_PROMOTIONS") || m.labels.includes("CATEGORY_UPDATES") || m.labels.includes("CATEGORY_FORUMS");
}

export function matches(m: MailRow, f: MailFilter): boolean {
  if (f === "nao_lidas") return m.labels.includes("UNREAD");
  if (f === "importantes") return m.category === "important" || m.labels.includes("IMPORTANT");
  if (f === "newsletters") return isNewsletter(m);
  return true;
}

/** Texto seguro para exibir: sem caracteres de controle nem marcação, uma linha, tamanho limitado. */
export function plainText(s: string, max = 300): string {
  return s
    .replace(/<[^>]{0,200}>/g, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function senderLabel(from: string): string {
  const name = from.split("<")[0]?.trim().replace(/^"|"$/g, "") ?? "";
  if (name && !name.includes("@")) return plainText(name, 80);
  const addr = /<([^>]+)>/.exec(from)?.[1] ?? from;
  return plainText(addr, 80) || "Remetente";
}

export interface DaySummary {
  total: number;
  porFiltro: Record<MailFilter, number>;
  linhas: string[];
  remetentesFrequentes: Array<{ nome: string; quantidade: number }>;
}

/** Resumo do dia por contagem (sem modelo). Mesma entrada = mesmo texto. */
export function daySummary(rows: MailRow[], now: Date): DaySummary {
  const dayAgo = now.getTime() - 86_400_000;
  const today = rows.filter((r) => Date.parse(r.receivedAt) >= dayAgo);
  const porFiltro = Object.fromEntries(MAIL_FILTERS.map((f) => [f, today.filter((r) => matches(r, f)).length])) as Record<MailFilter, number>;
  const counts = new Map<string, number>();
  for (const r of today) counts.set(senderLabel(r.from), (counts.get(senderLabel(r.from)) ?? 0) + 1);
  const remetentesFrequentes = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([nome, quantidade]) => ({ nome, quantidade }));
  const p = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const linhas = !today.length
    ? ["Nenhuma mensagem nas últimas 24 horas."]
    : [
        `${p(today.length, "mensagem", "mensagens")} nas últimas 24 horas.`,
        `${p(porFiltro.nao_lidas, "não lida", "não lidas")} · ${p(porFiltro.importantes, "importante", "importantes")} · ${p(porFiltro.newsletters, "newsletter ou aviso em massa", "newsletters ou avisos em massa")}.`,
        ...(remetentesFrequentes.length ? [`Quem mais escreveu: ${remetentesFrequentes.map((r) => `${r.nome} (${r.quantidade})`).join(", ")}.`] : []),
      ];
  return { total: today.length, porFiltro, linhas, remetentesFrequentes };
}

/**
 * O que iria para uma análise por modelo, se o dono aprovar: SÓ remetente, assunto e trecho, em
 * texto puro. O hash cobre exatamente esse conteúdo.
 */
export function analysisPayload(m: MailRow): { remetente: string; assunto: string; trecho: string } {
  return { remetente: senderLabel(m.from), assunto: plainText(m.subject, 200), trecho: plainText(m.snippet, 300) };
}

export async function payloadHash(p: unknown): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(p)));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

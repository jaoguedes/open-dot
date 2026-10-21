// SPDX-License-Identifier: AGPL-3.0-only
import type { Coverage } from "./types.ts";

/**
 * Triagem determinística de e-mail. Funciona sem IA e é o fallback quando a IA
 * estiver indisponível, sem cota ou sem permissão para o tipo de dado.
 * Usa apenas metadados e o trecho curto fornecido pelo provedor (snippet).
 */

export type EmailCategory = "important" | "review" | "low";

export interface EmailMeta {
  id: string; // ID da mensagem no provedor
  threadId: string;
  from: string; // "Nome <email>"
  to: string;
  subject: string;
  snippet: string;
  receivedAt: string; // ISO
  labels: string[];
  listUnsubscribe: boolean;
  precedenceBulk: boolean;
  /** Message-Id RFC822, quando o Gmail mandou o cabeçalho. Sem isso o link usa #all. */
  rfc822Id?: string | null;
}

export interface PersonalRules {
  prioritySenders: string[]; // e-mails ou domínios ("@empresa.com")
  mutedSenders: string[];
  importantKeywords: string[];
}

export interface Triage {
  messageId: string;
  category: EmailCategory;
  /** Motivo explícito e verificável. */
  reason: string;
  by: "rules" | "ai";
}

export const DEFAULT_RULES: PersonalRules = {
  prioritySenders: [],
  mutedSenders: [],
  importantKeywords: [
    "prazo",
    "vencimento",
    "urgente",
    "confirme",
    "confirmação",
    "entrevista",
    "boleto",
    "fatura",
    "pagamento",
    "matrícula",
    "prova",
    "segurança",
    "código de verificação",
    "acesso suspeito",
    "deadline",
    "invoice",
  ],
};

export function senderAddress(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m?.[1] ?? from).trim().toLowerCase();
}

function matchesSender(addr: string, patterns: string[]): string | null {
  for (const p of patterns) {
    const q = p.trim().toLowerCase();
    if (!q) continue;
    if (q.startsWith("@") ? addr.endsWith(q) : addr === q) return p;
  }
  return null;
}

export function triageByRules(m: EmailMeta, rules: PersonalRules = DEFAULT_RULES): Triage {
  const addr = senderAddress(m.from);
  const text = `${m.subject} ${m.snippet}`.toLowerCase();
  const muted = matchesSender(addr, rules.mutedSenders);
  if (muted) return { messageId: m.id, category: "low", reason: `Remetente silenciado por você (${muted}).`, by: "rules" };
  const prio = matchesSender(addr, rules.prioritySenders);
  if (prio) return { messageId: m.id, category: "important", reason: `Remetente prioritário (${prio}).`, by: "rules" };
  const kw = rules.importantKeywords.find((k) => text.includes(k.toLowerCase()));
  const bulk = m.listUnsubscribe || m.precedenceBulk || m.labels.includes("CATEGORY_PROMOTIONS") || m.labels.includes("CATEGORY_SOCIAL");
  if (kw && !bulk) return { messageId: m.id, category: "important", reason: `Menciona “${kw}”.`, by: "rules" };
  if (bulk) {
    return {
      messageId: m.id,
      category: kw ? "review" : "low",
      reason: kw ? `Lista ou newsletter, mas menciona “${kw}”.` : "Lista, newsletter ou promoção.",
      by: "rules",
    };
  }
  if (/no-?reply|nao-?responda|notifications?@|mailer-daemon/.test(addr)) {
    return { messageId: m.id, category: "low", reason: "Aviso automático sem pedido de ação.", by: "rules" };
  }
  if (/\?/.test(m.subject) || /\b(pode|poderia|consegue|você|vc)\b.*\?/.test(text)) {
    return { messageId: m.id, category: "important", reason: "Mensagem direta com pergunta para você.", by: "rules" };
  }
  return { messageId: m.id, category: "review", reason: "Mensagem direta sem sinal de urgência.", by: "rules" };
}

export interface DigestItem {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  reason: string;
  receivedAt: string;
  category: EmailCategory;
}

export interface EmailDigest {
  title: string;
  headline: string;
  counts: Record<EmailCategory, number>;
  total: number;
  top: DigestItem[];
  rest: DigestItem[];
  coverage: Coverage;
  aiUsed: boolean;
  aiNote: string | null;
}

/** Monta o resumo: as categorias sempre somam o total efetivamente revisado. */
export function buildDigest(input: {
  slotLabel: string; // "08h"
  messages: EmailMeta[];
  triage: Triage[];
  syncedUntil: string | null;
  available: number | null;
  partialReason?: string;
  aiUsed: boolean;
  aiNote?: string | null;
}): EmailDigest {
  const byId = new Map(input.messages.map((m) => [m.id, m]));
  const items: DigestItem[] = [];
  for (const t of input.triage) {
    const m = byId.get(t.messageId);
    if (!m) continue; // triagem sem mensagem correspondente é descartada
    items.push({ messageId: m.id, threadId: m.threadId, from: m.from, subject: m.subject || "(sem assunto)", reason: t.reason, receivedAt: m.receivedAt, category: t.category });
  }
  const order: Record<EmailCategory, number> = { important: 0, review: 1, low: 2 };
  items.sort((a, b) => order[a.category] - order[b.category] || b.receivedAt.localeCompare(a.receivedAt));
  const counts: Record<EmailCategory, number> = { important: 0, review: 0, low: 0 };
  for (const i of items) counts[i.category]++;
  const total = items.length;
  const top = items.filter((i) => i.category === "important").slice(0, 3);
  const topIds = new Set(top.map((t) => t.messageId));
  const rest = items.filter((i) => !topIds.has(i.messageId));
  const partial = Boolean(input.partialReason) || (input.available !== null && input.available > total);
  const headline =
    total === 0
      ? "Nenhuma mensagem nova nesta janela."
      : `${total} ${total === 1 ? "mensagem analisada" : "mensagens analisadas"} • ${counts.important} ${counts.important === 1 ? "precisa" : "precisam"} de atenção`;
  return {
    title: `Sua revisão das ${input.slotLabel}`,
    headline,
    counts,
    total,
    top,
    rest,
    coverage: {
      analyzed: total,
      available: input.available,
      syncedUntil: input.syncedUntil,
      fieldsRead: ["remetente", "assunto", "trecho curto do provedor", "rótulos"],
      partial,
      ...(partial ? { partialReason: input.partialReason ?? "Nem todas as mensagens da janela foram analisadas." } : {}),
    },
    aiUsed: input.aiUsed,
    aiNote: input.aiNote ?? null,
  };
}

/** Valida a saída JSON da IA: só aceita IDs conhecidos e categorias válidas. */
export function parseAiTriage(raw: string, knownIds: ReadonlySet<string>): { ok: Triage[]; rejected: number } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: [], rejected: 1 };
  }
  const list = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown })?.items) ? (data as { items: unknown[] }).items : [];
  const ok: Triage[] = [];
  let rejected = 0;
  for (const it of list) {
    const o = it as { id?: unknown; category?: unknown; reason?: unknown };
    if (typeof o.id !== "string" || !knownIds.has(o.id)) {
      rejected++;
      continue;
    }
    if (o.category !== "important" && o.category !== "review" && o.category !== "low") {
      rejected++;
      continue;
    }
    const reason = typeof o.reason === "string" ? o.reason.slice(0, 200) : "";
    if (!reason) {
      rejected++;
      continue;
    }
    ok.push({ messageId: o.id, category: o.category, reason, by: "ai" });
  }
  return { ok, rejected };
}

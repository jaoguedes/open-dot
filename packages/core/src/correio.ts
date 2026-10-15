import type { EmailMeta } from "./email.ts";
import { detectInText } from "./tracking.ts";

/** Resumo do Correio. Regras fixas; a IA só entra se o JSON validar e não inventar id. */

export const CORREIO_CATEGORIAS = ["seguranca", "pagamento", "prazo", "encomenda", "resposta", "outro"] as const;
export type CorreioCategoria = (typeof CORREIO_CATEGORIAS)[number];

export interface CorreioItem {
  categoria: CorreioCategoria;
  titulo: string;
  quando: string;
  o_que_aconteceu: string;
  o_que_fazer: string;
  origem: string;
  sensivel: boolean;
  rfc822?: string | null;
}

export interface CorreioResumo {
  abertura: string;
  itens: CorreioItem[];
  sem_acao: string[];
  ruido: { contagem: number };
  anexos: "Anexos não são lidos.";
}

const VERB = /^(Confira|Pague|Veja|Responda|Acompanhe|Abra|Guarde)\b/;

function senderName(from: string): string {
  const name = from.split("<")[0]?.trim().replace(/^"|"$/g, "") ?? "";
  if (!name || name.includes("@")) return "Remetente";
  return name.slice(0, 80);
}

/** Tira link, código de login e número de cartão antes de mostrar ou enviar ao modelo. */
export function redactMail(input: string): string {
  return input
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b\d{13,19}\b/g, "")
    .replace(/\b\d{5,8}\b/g, "")
    .replace(/\b[A-Z0-9]{24,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function correioForModel(m: Pick<EmailMeta, "from" | "subject" | "snippet">): string {
  const clip = (s: string) => redactMail(s).slice(0, 180);
  return `De: ${clip(senderName(m.from))}\nAssunto: ${clip(m.subject)}\nTrecho: ${clip(m.snippet)}`;
}

function textOf(m: Pick<EmailMeta, "subject" | "snippet">): string {
  return `${m.subject}\n${m.snippet}`.toLowerCase();
}

function item(m: EmailMeta, categoria: CorreioCategoria, aconteceu: string, fazer: string, sensivel: boolean): CorreioItem {
  const fazerOk = VERB.test(fazer) ? fazer : `Confira ${fazer.charAt(0).toLowerCase()}${fazer.slice(1)}`;
  return {
    categoria,
    titulo: redactMail(m.subject).slice(0, 120) || "Mensagem",
    quando: m.receivedAt,
    o_que_aconteceu: aconteceu,
    o_que_fazer: sensivel ? "Confira o original." : fazerOk,
    origem: m.id,
    sensivel,
    ...(m.rfc822Id ? { rfc822: m.rfc822Id } : {}),
  };
}

function classify(m: EmailMeta): CorreioItem | "ruido" | "sem_acao" {
  const t = textOf(m);
  const bulk = m.listUnsubscribe || m.precedenceBulk || m.labels.includes("CATEGORY_PROMOTIONS") || m.labels.includes("CATEGORY_SOCIAL");
  if (/mfa|2fa|duas etapas|dois fatores|verifica(c|ç)(a|ã)o em duas/.test(t) && /desativ|alterad|removid|disabled|turned off|mudou/.test(t)) {
    return item(m, "seguranca", "A verificação em duas etapas mudou.", "Confira o original.", true);
  }
  if (/login suspeito|acesso suspeito|novo login|tentativa de acesso|sign-in attempt|senha alterada/.test(t)) {
    return item(m, "seguranca", "Chegou um aviso de acesso.", "Confira o original.", true);
  }
  if (/falha no pagamento|pagamento recusado|pagamento falhou|não foi possível cobrar|nao foi possivel cobrar|payment failed|cartão recusado|cartao recusado/.test(t)) {
    return item(m, "pagamento", "Um pagamento não passou.", "Confira a cobrança no serviço.", true);
  }
  if (/boleto|fatura|cobran[cç]a|invoice|d[eé]bito/.test(t)) {
    return item(m, "pagamento", "Chegou uma cobrança.", "Veja o valor no original.", true);
  }
  if (/prazo|vence|vencimento|deadline|até dia|ate dia|amanhã às|amanha as|hoje às|hoje as/.test(t)) {
    return item(m, "prazo", "Há um prazo nesta mensagem.", "Veja a data no original.", false);
  }
  if (detectInText(`${m.subject}\n${m.snippet}`).length) {
    return item(m, "encomenda", "Um código de rastreio chegou.", "Acompanhe em Entregas.", false);
  }
  if (bulk) return "ruido";
  if (/\?/.test(m.subject) || /\b(pode|poderia|consegue)\b/.test(t)) {
    return item(m, "resposta", `${senderName(m.from)} fez uma pergunta.`, "Responda se fizer sentido.", false);
  }
  if (/no-?reply|nao-?responda|notifications?@|mailer-daemon/.test(m.from.toLowerCase())) return "sem_acao";
  return "sem_acao";
}

export function buildCorreioResumo(messages: EmailMeta[]): CorreioResumo {
  const itens: CorreioItem[] = [];
  const sem_acao: string[] = [];
  let ruido = 0;
  for (const m of messages) {
    const c = classify(m);
    if (c === "ruido") ruido++;
    else if (c === "sem_acao") sem_acao.push(m.id);
    else itens.push(c);
  }
  itens.sort((a, b) => CORREIO_CATEGORIAS.indexOf(a.categoria) - CORREIO_CATEGORIAS.indexOf(b.categoria) || a.quando.localeCompare(b.quando));
  const n = itens.length;
  return {
    abertura: n === 0 ? "Tudo calmo por aqui." : n === 1 ? "1 coisa pede você." : `${n} coisas pedem você.`,
    itens,
    sem_acao,
    ruido: { contagem: ruido },
    anexos: "Anexos não são lidos.",
  };
}

export function resumoHasSecret(resumo: CorreioResumo): boolean {
  const raw = JSON.stringify(resumo);
  return /\b\d{5,8}\b/.test(raw) || /\b\d{13,19}\b/.test(raw) || /https?:\/\//.test(raw) || /@/.test(raw);
}

/** Aceita JSON da IA só com ids conhecidos, categorias válidas e sem código de login. */
export function parseCorreioAi(raw: string, known: ReadonlySet<string>): CorreioResumo | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const o = data as { abertura?: unknown; itens?: unknown; sem_acao?: unknown; ruido?: unknown };
  if (!Array.isArray(o.itens)) return null;
  const itens: CorreioItem[] = [];
  for (const it of o.itens) {
    if (!it || typeof it !== "object") return null;
    const row = it as Partial<CorreioItem>;
    if (typeof row.origem !== "string" || !known.has(row.origem)) return null;
    if (!CORREIO_CATEGORIAS.includes(row.categoria as CorreioCategoria)) return null;
    if (typeof row.titulo !== "string" || typeof row.o_que_aconteceu !== "string" || typeof row.o_que_fazer !== "string") return null;
    if (!VERB.test(row.o_que_fazer)) return null;
    const clean: CorreioItem = {
      categoria: row.categoria as CorreioCategoria,
      titulo: redactMail(row.titulo).slice(0, 120),
      quando: typeof row.quando === "string" ? row.quando.slice(0, 40) : "",
      o_que_aconteceu: redactMail(row.o_que_aconteceu).slice(0, 180),
      o_que_fazer: redactMail(row.o_que_fazer).slice(0, 180),
      origem: row.origem,
      sensivel: Boolean(row.sensivel),
    };
    itens.push(clean);
  }
  const resumo: CorreioResumo = {
    abertura: typeof o.abertura === "string" ? redactMail(o.abertura).slice(0, 80) : buildCorreioResumo([]).abertura,
    itens,
    sem_acao: Array.isArray(o.sem_acao) ? o.sem_acao.filter((id): id is string => typeof id === "string" && known.has(id)) : [],
    ruido: { contagem: typeof (o.ruido as { contagem?: unknown })?.contagem === "number" ? Math.max(0, Math.floor((o.ruido as { contagem: number }).contagem)) : 0 },
    anexos: "Anexos não são lidos.",
  };
  if (resumoHasSecret(resumo)) return null;
  if (itens.length === 0) resumo.abertura = "Tudo calmo por aqui.";
  else if (itens.length === 1) resumo.abertura = "1 coisa pede você.";
  else resumo.abertura = `${itens.length} coisas pedem você.`;
  return resumo;
}

// SPDX-License-Identifier: AGPL-3.0-only
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

/** Palavras que, perto de 4 a 8 dígitos, indicam código de acesso. */
const CODE_WORDS = "c(ó|o)digo|codigo|verifica(c|ç)(ã|a)o|token|senha|code|otp|pin|entrar|acesso|login";
const LOGIN_CODE = new RegExp(`((?:${CODE_WORDS})[^0-9\\n]{0,30})\\b\\d{4,8}\\b|\\b\\d{4,8}\\b(?=[^0-9\\n]{0,20}(?:${CODE_WORDS}))`, "gi");
/** 13 a 19 dígitos, juntos ou em grupos separados por espaço ou hífen (cartão). */
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const EMAIL_ADDR = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Tira link, código de login (4 a 8 dígitos perto de "código", "senha", "entrar"…) e
 * cartão antes de mostrar ou enviar ao modelo. Valor em R$, CEP e número de pedido ficam.
 */
export function redactMail(input: string): string {
  return input
    .replace(/https?:\/\/\S+/gi, "")
    .replace(CARD, "")
    .replace(LOGIN_CODE, (_m, before: string | undefined) => (before ? `${before}[código]` : "[código]"))
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

export interface CorreioOptions {
  /** Domínios de confiança vindos de fora do lote (ex.: o dono marcou "Era importante"). */
  trusted?: ReadonlySet<string>;
  /** Domínios silenciados pelo dono ("Não importa" 2×): viram ruído. */
  silenced?: ReadonlySet<string>;
}

/** Domínio do remetente em minúsculas ("Banco <a@b.c>" → "b.c"). */
export function senderDomain(from: string): string | null {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from);
  return m ? m[1]!.toLowerCase() : null;
}

function isBulk(m: EmailMeta): boolean {
  return m.listUnsubscribe || m.precedenceBulk || m.labels.includes("CATEGORY_PROMOTIONS") || m.labels.includes("CATEGORY_SOCIAL");
}

const SEC_ANY = /novo login|login suspeito|acesso suspeito|tentativa de acesso|sign-in attempt|senha (foi )?(alterada|redefinida)|altera(c|ç)(a|ã)o da senha|password (was )?changed|atividade (incomum|suspeita)|novo dispositivo|pin (foi )?(redefinido|alterado)|conta (foi )?bloqueada/;
const SEC_STRONG = /login suspeito|acesso suspeito|tentativa de acesso|sign-in attempt|novo login (a partir|em |de um dispositivo|no )|senha (foi )?(alterada|redefinida)|password (was )?changed|atividade (incomum|suspeita)|novo dispositivo (entrou|acessou|conectado)|pin (foi )?(redefinido|alterado)|conta (foi )?bloqueada/;
const MFA_OFF = /(mfa|2fa|duas etapas|dois fatores|verifica(c|ç)(a|ã)o em duas).*(desativ|alterad|removid|disabled|turned off|mudou)|(desativ|removid).*(mfa|2fa|duas etapas|dois fatores)/;
const PAY_FAIL = /falha no pagamento|pagamento recusado|pagamento falhou|n(ã|a)o foi poss(í|i)vel (cobrar|processar o pagamento)|n(ã|a)o conseguimos processar o pagamento|payment failed|couldn'?t process your payment|cart(ã|a)o (foi )?recusado|suspens[ao] por falta de pagamento|falta de pagamento/;
const PAY_STRONG = new RegExp(`${PAY_FAIL.source}|em atraso|vencid[oa]|fatura (vence|fechou|fechada)|vence (hoje|amanh(ã|a))`);
const PAY_ANY = /boleto|fatura|cobran(c|ç)a|invoice|d(é|e)bito|mensalidade|parcela|anuidade/;
const PRAZO = /prazo|vence|vencimento|deadline|at(é|e) dia|amanh(ã|a) (à|a)s|hoje (à|a)s|expira em \d+ (dias?|semanas?)|agendad[oa]|consulta (confirmada|marcada)|antes de \d{1,2}\/\d{1,2}|(dia|em) \d{1,2}\/\d{1,2} (à|a)s/;
const AUTOMATED = /no-?reply|n(a|ã)o-?responda|naoresponda|notifications?@|notificacoes@|mailer-daemon|billing@|cobranca@|financeiro@|faturas?@|invoice@|news(letter)?@|promo|ofertas@|marketing@/;

function asksSomething(m: EmailMeta, t: string): boolean {
  return /\?/.test(m.subject) || /\?/.test(m.snippet) || /\b(pode|poderia|consegue|vai)\b.*\?|\b(pode|poderia|consegue)\b/.test(t);
}

function classify(m: EmailMeta, trusted: ReadonlySet<string>, opts: CorreioOptions): CorreioItem | "ruido" | "sem_acao" {
  const t = textOf(m);
  const domain = senderDomain(m.from);
  if (domain && opts.silenced?.has(domain)) return "ruido";
  const bulk = isBulk(m);
  // Em massa só passa com sinal forte ou remetente de confiança (domínio visto fora de massa).
  const trustedSender = Boolean(domain && trusted.has(domain));
  const allow = (strong: boolean) => !bulk || strong || trustedSender;

  if (MFA_OFF.test(t) && allow(true)) return item(m, "seguranca", "A verificação em duas etapas mudou.", "Confira o original.", true);
  if (SEC_ANY.test(t) && allow(SEC_STRONG.test(t))) return item(m, "seguranca", "Chegou um aviso de acesso.", "Confira o original.", true);
  if (PAY_FAIL.test(t) && allow(true)) return item(m, "pagamento", "Um pagamento não passou.", "Confira a cobrança no serviço.", true);
  const person = !bulk && !AUTOMATED.test(m.from.toLowerCase());
  // Pergunta de uma pessoa vem antes de "cobrança": "Pode me explicar a fatura?" é resposta.
  if (person && asksSomething(m, t) && !PAY_STRONG.test(t)) return item(m, "resposta", `${senderName(m.from)} fez uma pergunta.`, "Responda se fizer sentido.", false);
  if (PAY_ANY.test(t) && allow(PAY_STRONG.test(t))) return item(m, "pagamento", "Chegou uma cobrança.", "Veja o valor no original.", true);
  if (!bulk && PRAZO.test(t)) return item(m, "prazo", "Há um prazo nesta mensagem.", "Veja a data no original.", false);
  // Código de rastreio é sinal forte mesmo em mensagem de loja com descadastro.
  if (detectInText(`${m.subject}\n${m.snippet}`).length) return item(m, "encomenda", "Um código de rastreio chegou.", "Acompanhe em Entregas.", false);
  if (bulk) return "ruido";
  return "sem_acao";
}

/** Domínios de confiança do lote: remetentes que mandaram alguma mensagem que não é em massa. */
function trustedDomains(messages: EmailMeta[], extra?: ReadonlySet<string>): Set<string> {
  const out = new Set<string>(extra ?? []);
  for (const m of messages) {
    const d = senderDomain(m.from);
    if (d && !isBulk(m)) out.add(d);
  }
  return out;
}

/** Uma conversa vira um item: a mensagem mais recente, com quantas outras há. */
function latestPerThread(messages: EmailMeta[]): Array<{ m: EmailMeta; more: number }> {
  const byThread = new Map<string, EmailMeta[]>();
  for (const m of messages) {
    const key = m.threadId || m.id;
    const list = byThread.get(key) ?? [];
    list.push(m);
    byThread.set(key, list);
  }
  return [...byThread.values()].map((list) => {
    list.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { m: list[0]!, more: list.length - 1 };
  });
}

/** Destino de cada mensagem (categoria, "ruido" ou "sem_acao"). Usado pela avaliação. */
export function classifyBatch(messages: EmailMeta[], opts: CorreioOptions = {}): Map<string, string> {
  const trusted = trustedDomains(messages, opts.trusted);
  const out = new Map<string, string>();
  for (const m of messages) {
    const c = classify(m, trusted, opts);
    out.set(m.id, typeof c === "string" ? c : c.categoria);
  }
  return out;
}

export function buildCorreioResumo(messages: EmailMeta[], opts: CorreioOptions = {}): CorreioResumo {
  const trusted = trustedDomains(messages, opts.trusted);
  const itens: CorreioItem[] = [];
  const sem_acao: string[] = [];
  let ruido = 0;
  for (const { m, more } of latestPerThread(messages)) {
    const c = classify(m, trusted, opts);
    if (c === "ruido") ruido++;
    else if (c === "sem_acao") sem_acao.push(m.id);
    else itens.push(more > 0 ? { ...c, titulo: `${c.titulo} (+${more} na conversa)`.slice(0, 140) } : c);
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

/** Na resposta da IA, só o realmente sensível derruba o JSON: link, e-mail completo, cartão, código de login. */
export function resumoHasSecret(resumo: CorreioResumo): boolean {
  const raw = JSON.stringify(resumo);
  LOGIN_CODE.lastIndex = 0;
  CARD.lastIndex = 0;
  return /https?:\/\//.test(raw) || EMAIL_ADDR.test(raw) || CARD.test(raw) || LOGIN_CODE.test(raw);
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

// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Detecção de códigos de rastreio, sem IA e sem rede.
 *
 * Os formatos e os dígitos verificadores seguem o projeto
 * trycom/tracking_number_data (MIT), fork de jkeen/tracking_number_data.
 * Atribuição também em NOTICE.
 *
 * Formatos brasileiros sem especificação publicada (Jadlog, Loggi e afins)
 * não são adivinhados: o usuário escolhe a transportadora.
 */

export const TRACKING_MONTHLY_LIMIT = 1000;
export const TRACKING_MONTHLY_STOP = 900;
export const TRACKING_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const TRACKING_BATCH = 2;

export const PACOTEVICIO_ATTRIBUTION = {
  label: "Rastreamento por PacoteVício",
  href: "https://pacotevicio.dev",
} as const;

/** Transportadoras que o plano cobre. A API detecta o código sozinha. */
export const PACOTEVICIO_COVERS = ["correios", "aliexpress", "anjun", "jt", "total", "shopee"] as const;

/** Provedores pagos: registrados e desligados. Sem cliente HTTP. */
export const DISABLED_TRACKING_PROVIDERS = [
  { id: "ship24", name: "Ship24", reason: "API paga. Fica desligada." },
  { id: "seurastreio", name: "Seu Rastreio", reason: "API paga. Fica desligada." },
] as const;

export type CarrierId = "correios" | "ups" | "fedex" | "usps" | "dhl" | "ontrac" | "amazon" | "s10" | "jadlog" | "loggi" | "total" | "shopee" | "jt" | "aliexpress" | "anjun";

export const CARRIER_LABEL: Record<CarrierId, string> = {
  correios: "Correios",
  ups: "UPS",
  fedex: "FedEx",
  usps: "USPS",
  dhl: "DHL",
  ontrac: "OnTrac",
  amazon: "Amazon",
  s10: "Correio internacional (S10)",
  jadlog: "Jadlog",
  loggi: "Loggi",
  total: "Total Express",
  shopee: "Shopee",
  jt: "J&T Express",
  aliexpress: "AliExpress",
  anjun: "Anjun Express",
};

export const MANUAL_CARRIERS: CarrierId[] = ["correios", "ups", "fedex", "usps", "dhl", "ontrac", "amazon", "jadlog", "loggi", "total", "shopee", "jt", "aliexpress", "anjun"];

const S10_WEIGHTS = [8, 6, 4, 2, 3, 5, 9, 7];

/** Dígito S10/UPU. Resto 10 vira 0; resto 11 vira 5. */
export function s10CheckDigit(serial8: string): number {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(serial8[i]) * S10_WEIGHTS[i]!;
  const check = 11 - (sum % 11);
  if (check === 10) return 0;
  if (check === 11) return 5;
  return check;
}

function upsChar(c: string): number {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  return (code - 63) % 10;
}

/**
 * UPS mod 10. O prefixo "1Z" fica de fora; os 15 caracteres seguintes alternam
 * ×1 e ×2. O 18º caractere é o verificador (tracking_number_data / UPS).
 */
export function upsCheckDigit(code18: string): number {
  const body = code18.slice(2, 17);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += upsChar(body[i]!) * (i % 2 === 0 ? 1 : 2);
  return (10 - (sum % 10)) % 10;
}

export type Confidence = "high" | "medium" | "low";

export interface TrackingCandidate {
  code: string;
  carrier: CarrierId;
  confidence: Confidence;
  /** false quando o formato tem verificador e ele não fecha. */
  checksum: "valid" | "invalid" | "none";
}

export interface CarrierDecision {
  kind: "match" | "choose" | "unknown";
  candidates: TrackingCandidate[];
}

function compact(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

export function normalizeTrackingCode(raw: string): string {
  return compact(raw);
}

function s10Candidate(code: string): TrackingCandidate | null {
  const m = /^([A-Z]{2})(\d{8})(\d)([A-Z]{2})$/.exec(code);
  if (!m) return null;
  const expected = s10CheckDigit(m[2]!);
  const ok = expected === Number(m[3]);
  const carrier: CarrierId = m[4] === "BR" ? "correios" : "s10";
  return { code, carrier, confidence: ok ? "high" : "low", checksum: ok ? "valid" : "invalid" };
}

function upsCandidate(code: string): TrackingCandidate | null {
  if (!/^1Z[A-Z0-9]{16}$/.test(code)) return null;
  const ok = upsCheckDigit(code) === Number(code[17]);
  return { code, carrier: "ups", confidence: ok ? "high" : "low", checksum: ok ? "valid" : "invalid" };
}

function pushUnique(out: TrackingCandidate[], c: TrackingCandidate | null) {
  if (!c) return;
  if (out.some((x) => x.carrier === c.carrier && x.code === c.code)) return;
  out.push(c);
}

/** Classifica um único código já isolado. Não olha o texto ao redor. */
export function detectCode(raw: string): TrackingCandidate[] {
  const code = compact(raw);
  if (code.length < 10 || code.length > 40) return [];
  const out: TrackingCandidate[] = [];
  pushUnique(out, s10Candidate(code));
  pushUnique(out, upsCandidate(code));
  if (/^TBA\d{12}$/.test(code)) out.push({ code, carrier: "amazon", confidence: "high", checksum: "none" });
  if (/^[CD]\d{14}$/.test(code)) out.push({ code, carrier: "ontrac", confidence: "high", checksum: "none" });
  if (/^96\d{20}$/.test(code)) out.push({ code, carrier: "fedex", confidence: "high", checksum: "none" });
  if (/^(94|93|92|91)\d{18,32}$/.test(code)) out.push({ code, carrier: "usps", confidence: "high", checksum: "none" });
  if (/^(\d{12}|\d{15}|\d{20}|\d{22})$/.test(code) && !out.some((c) => c.carrier === "fedex")) {
    out.push({ code, carrier: "fedex", confidence: "medium", checksum: "none" });
  }
  if (/^\d{10}$/.test(code)) out.push({ code, carrier: "dhl", confidence: "medium", checksum: "none" });
  if (/^JD\d{10,22}$/.test(code)) out.push({ code, carrier: "dhl", confidence: "high", checksum: "none" });
  if (/^GM\d{16,20}$/.test(code) && !out.some((c) => c.carrier === "dhl")) {
    out.push({ code, carrier: "dhl", confidence: "high", checksum: "none" });
  }
  return out;
}

function near(text: string, index: number, word: RegExp): boolean {
  const slice = text.slice(Math.max(0, index - 48), index + 48);
  return word.test(slice);
}

const TEXT_PATTERNS: RegExp[] = [
  /\b([A-Z]{2}(?:\s*\d){9}(?:\s*[A-Z]){2})\b/gi,
  /\b(1\s*Z(?:\s*[A-Z0-9]){16})\b/gi,
  /\b(TBA(?:\s*\d){12})\b/gi,
  /\b([CD](?:\s*\d){14})\b/gi,
  /\b(96(?:\s*\d){20})\b/gi,
  /\b((?:94|93|92|91)(?:\s*\d){18,32})\b/gi,
  /\b(JD(?:\s*\d){10,22})\b/gi,
  /\b(GM(?:\s*\d){16,20})\b/gi,
];

/**
 * Varre assunto ou trecho. Códigos só numéricos e sem palavra da transportadora
 * por perto não viram candidato: pedido, telefone e CNPJ se parecem com rastreio.
 */
export function detectInText(text: string): TrackingCandidate[] {
  const found: TrackingCandidate[] = [];
  const seen = new Set<string>();
  for (const re of TEXT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const code = compact(m[0]);
      if (seen.has(code)) continue;
      seen.add(code);
      for (const c of detectCode(code)) {
        if (c.confidence === "high" || c.checksum === "invalid") pushUnique(found, c);
      }
    }
  }
  for (const m of text.matchAll(/\b(\d{10,22})\b/g)) {
    const code = m[0];
    const at = m.index ?? 0;
    if (seen.has(code)) continue;
    for (const c of detectCode(code)) {
      if (c.confidence === "high") continue;
      const hinted = (c.carrier === "fedex" && near(text, at, /fedex/i)) || (c.carrier === "dhl" && near(text, at, /\bdhl\b/i)) || (c.carrier === "usps" && near(text, at, /\busps\b/i));
      if (hinted) pushUnique(found, c);
    }
  }
  return found;
}

/** Confiança alta e única segue sozinha. O resto pede a escolha da pessoa. */
export function decideCarrier(candidates: TrackingCandidate[]): CarrierDecision {
  const viable = candidates.filter((c) => c.checksum !== "invalid");
  const high = viable.filter((c) => c.confidence === "high");
  const carriers = new Set(high.map((c) => c.carrier));
  if (high.length >= 1 && carriers.size === 1) return { kind: "match", candidates: high };
  if (viable.length === 0 && candidates.length === 0) return { kind: "unknown", candidates: [] };
  return { kind: "choose", candidates: viable.length ? viable : candidates };
}

export function isCarrierId(v: string): v is CarrierId {
  return Object.prototype.hasOwnProperty.call(CARRIER_LABEL, v);
}

export function pacotevicioCovers(carrier: string | null): boolean {
  if (!carrier) return true;
  return (PACOTEVICIO_COVERS as readonly string[]).includes(carrier);
}

/** Página pública da transportadora. Não chama API não oficial. */
export function carrierPage(carrier: string, code: string): string | null {
  const c = encodeURIComponent(code);
  switch (carrier) {
    case "correios":
      return "https://rastreamento.correios.com.br/app/index.php";
    case "s10":
      return null;
    case "ups":
      return `https://www.ups.com/track?tracknum=${c}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${c}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${c}`;
    case "dhl":
      return `https://www.dhl.com/br-pt/home/rastreamento.html?tracking-id=${c}`;
    case "ontrac":
      return `https://www.ontrac.com/tracking/?number=${c}`;
    case "amazon":
      return `https://track.amazon.com/tracking/${c}`;
    case "jadlog":
      return "https://www.jadlog.com.br/tracking";
    case "loggi":
      return "https://www.loggi.com/rastreador/";
    case "total":
      return "https://totalexpress.com.br/";
    case "shopee":
      return "https://shopee.com.br/";
    case "jt":
      return "https://www.jtexpress.com.br/trajectoryQuery";
    case "aliexpress":
      return "https://www.aliexpress.com/";
    default:
      return null;
  }
}

/** Nome da loja ou do remetente, sem e-mail, telefone ou CNPJ. */
export function shopLabel(from: string): string | null {
  const named = /^\s*"?([^"<]{1,80}?)"?\s*</.exec(from);
  const raw = (named?.[1] ?? "").replace(/\s+/g, " ").trim();
  if (!raw || raw.length < 2) return null;
  if (/@/.test(raw) || /\d{8,}/.test(raw)) return null;
  if (/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(raw)) return null;
  if (/\+?\d[\d\s().-]{8,}\d/.test(raw)) return null;
  return raw.slice(0, 80);
}

export interface TrackingGate {
  enabled: boolean;
  providerId: "pacotevicio" | null;
  reason: string;
}

export function trackingGate(env: { PACOTEVICIO_API_KEY?: string; PACOTEVICIO_TERMS_CONFIRMED?: string }): TrackingGate {
  const key = Boolean(env.PACOTEVICIO_API_KEY);
  const terms = env.PACOTEVICIO_TERMS_CONFIRMED === "true";
  if (key && terms) return { enabled: true, providerId: "pacotevicio", reason: "" };
  if (!key && !terms) {
    return { enabled: false, providerId: null, reason: "Rastreio automático desligado. Falta a chave do PacoteVício e a confirmação dos termos." };
  }
  if (!key) return { enabled: false, providerId: null, reason: "Rastreio automático desligado. Falta a chave do PacoteVício." };
  return { enabled: false, providerId: null, reason: "Rastreio automático desligado. Falta confirmar os termos do PacoteVício." };
}

const STATUS_PT: Record<string, string> = {
  collected: "Coletado",
  posted: "Postado",
  in_transit: "Em trânsito",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  exception: "Com exceção",
  returned: "Devolvido",
  customs: "Na alfândega",
  pending: "Aguardando atualização",
  unknown: "Sem atualização",
};

export function statusLabel(status: string, fallback?: string | null): string {
  const key = status.toLowerCase();
  return STATUS_PT[key] ?? (fallback?.trim().slice(0, 80) || "Atualização");
}

export function isDeliveredStatus(status: string): boolean {
  return status.toLowerCase() === "delivered";
}

export interface TrackingEvent {
  at: string;
  status: string;
  label: string;
  attribution: boolean;
}

/** Nome mostrado na saudação. O padrão vem da configuração (OWNER_NAME) até a pessoa salvar outro. */
export function displayNameFor(email: string, stored: string | null | undefined, custom: boolean, fallback = ""): string {
  const name = (stored ?? "").trim();
  if (name === "Desenvolvimento local" && !custom) return name;
  if (custom && name && !name.includes("@") && name.toLowerCase() !== email.toLowerCase()) return name.slice(0, 40);
  return fallback.trim().slice(0, 40);
}

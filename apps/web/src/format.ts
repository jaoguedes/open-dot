// SPDX-License-Identifier: AGPL-3.0-only
const DEFAULT_TZ = "America/Sao_Paulo";
let TZ = DEFAULT_TZ;

function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fuso do dono (vem do servidor). Todas as datas da tela usam este por padrão (D8). */
export function setOwnerTimeZone(tz: string | null | undefined): void {
  if (tz && validTz(tz)) TZ = tz;
}

export function ownerTimeZone(): string {
  return TZ;
}

export function fmtTime(iso: string | null | undefined, tz = TZ): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

export function fmtDay(iso: string, tz = TZ): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined, tz = TZ): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

export function fmtHeaderStamp(tz = TZ): string {
  const d = new Date();
  const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: tz }).format(d).replace(".", "").slice(0, 3).toUpperCase();
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: tz }).format(d);
  const mo = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: tz }).format(d).replace(".", "").slice(0, 3).toUpperCase();
  return `${wd} · ${day} ${mo} · ${fmtTime(d.toISOString(), tz)}`;
}

export function needYouLine(n: number): string {
  if (n <= 0) return "Tudo calmo por aqui.";
  const w = ["", "Uma", "Duas", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];
  if (n === 1) return "Uma coisa pede você.";
  return `${w[n] ?? String(n)} coisas pedem você.`;
}

export function greeting(tz = TZ): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function senderName(from: string): string {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(from);
  return (m?.[1] ?? from).trim();
}

export const RUN_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Executando",
  waiting_approval: "Esperando seu OK",
  waiting_quota: "Aguardando cota",
  retry_scheduled: "Nova tentativa agendada",
  succeeded: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
  uncertain: "Resultado incerto",
};

function dayKey(t: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(new Date(t));
}

/**
 * Hora para o feed (D3): hoje "09:30"; ontem "ontem 17:00"; até 6 dias "seg 09:30";
 * antes disso "30 set 09:30". O dia é contado no fuso do dono.
 */
export function fmtWhen(iso: string | null | undefined, now = Date.now(), tz = TZ): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const hm = fmtTime(iso, tz);
  const days = Math.round((Date.parse(dayKey(now, tz)) - Date.parse(dayKey(t, tz))) / 86_400_000);
  if (days === 0) return hm;
  if (days === 1) return `ontem ${hm}`;
  if (days === -1) return `amanhã ${hm}`;
  if (days > 1 && days < 7) {
    const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: tz }).format(new Date(t)).replace(".", "").slice(0, 3).toLowerCase();
    return `${wd} ${hm}`;
  }
  const dm = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: tz }).format(new Date(t)).replace(".", "").replace(" de ", " ");
  return `${dm} ${hm}`;
}

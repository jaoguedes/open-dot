const TZ = "America/Sao_Paulo";

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

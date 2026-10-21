// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Agenda por horário local + fuso IANA (capítulo 05 e Anexo A).
 * Guarda horário local e fuso; converte cada slot em instante UTC na hora de rodar.
 */

export interface LocalDateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Partes locais de um instante no fuso. */
export function localParts(ts: number, tz: string) {
  const parts = Object.fromEntries(
    dtf(tz)
      .formatToParts(new Date(ts))
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Deslocamento do fuso (ms) no instante dado: local - UTC. */
export function tzOffsetMs(ts: number, tz: string): number {
  const p = localParts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/**
 * Converte data/hora local em instante UTC.
 * Horário inexistente (salto de horário de verão) avança para o primeiro instante válido;
 * horário repetido usa a primeira ocorrência.
 */
export function zonedTimeToUtc(date: LocalDateParts, hhmm: string, tz: string): number {
  const [h, m] = parseHHMM(hhmm);
  const naive = Date.UTC(date.year, date.month - 1, date.day, h, m);
  const off1 = tzOffsetMs(naive, tz);
  let guess = naive - off1;
  const off2 = tzOffsetMs(guess, tz);
  if (off2 !== off1) guess = naive - off2;
  const back = localParts(guess, tz);
  if (back.hour !== h || back.minute !== m) {
    // Lacuna: usa o instante antes do salto + diferença.
    guess = naive - Math.min(off1, off2);
  }
  // Primeira ocorrência em sobreposição.
  const earlier = guess - 3600_000;
  const pe = localParts(earlier, tz);
  if (pe.hour === h && pe.minute === m && pe.day === date.day) guess = earlier;
  return guess;
}

export function parseHHMM(hhmm: string): [number, number] {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Horário inválido: ${hhmm}`);
  return [Number(m[1]), Number(m[2])];
}

function addDays(d: LocalDateParts, n: number): LocalDateParts {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function fmtDate(d: LocalDateParts): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export interface RoutineSpec {
  routineId: string;
  ownerId: string;
  /** Horários locais "HH:MM". */
  times: string[];
  timeZone: string;
  /** 0=domingo..6=sábado; vazio = todos os dias. */
  weekdays?: number[];
}

export interface Slot {
  /** Chave única: dono + rotina + data local + horário local. */
  key: string;
  scheduledAt: number;
  localDate: string;
  localTime: string;
}

/** Todos os slots com instante em (from, to]. */
export function slotsBetween(spec: RoutineSpec, fromTs: number, toTs: number): Slot[] {
  const out: Slot[] = [];
  const start = localParts(fromTs, spec.timeZone);
  let day: LocalDateParts = addDays({ year: start.year, month: start.month, day: start.day }, -1);
  const end = localParts(toTs, spec.timeZone);
  const endDay = addDays({ year: end.year, month: end.month, day: end.day }, 1);
  const times = [...spec.times].sort();
  for (let guard = 0; guard < 400 && fmtDate(day) <= fmtDate(endDay); guard++) {
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    if (!spec.weekdays?.length || spec.weekdays.includes(weekday)) {
      for (const t of times) {
        const at = zonedTimeToUtc(day, t, spec.timeZone);
        if (at > fromTs && at <= toTs) {
          out.push({ key: `${spec.ownerId}:${spec.routineId}:${fmtDate(day)}T${t}`, scheduledAt: at, localDate: fmtDate(day), localTime: t });
        }
      }
    }
    day = addDays(day, 1);
  }
  return out.sort((a, b) => a.scheduledAt - b.scheduledAt);
}

export interface DuePlan {
  /** Slots a criar agora (no máximo um quando houve parada longa). */
  create: Array<Slot & { late: boolean }>;
  /** Slots antigos que foram resumidos num único digest de recuperação. */
  skipped: number;
}

/**
 * Decide o que criar num tique do cron.
 * - Slots dentro da tolerância: cria normalmente.
 * - Slots perdidos além da tolerância: cria apenas o mais recente, rotulado como atrasado.
 */
export function planDue(spec: RoutineSpec, lastProcessedTs: number, now: number, toleranceMs = 10 * 60_000): DuePlan {
  const due = slotsBetween(spec, lastProcessedTs, now);
  if (!due.length) return { create: [], skipped: 0 };
  const onTime = due.filter((s) => now - s.scheduledAt <= toleranceMs);
  const late = due.filter((s) => now - s.scheduledAt > toleranceMs);
  if (onTime.length) return { create: onTime.map((s) => ({ ...s, late: false })), skipped: late.length };
  const last = late[late.length - 1]!;
  return { create: [{ ...last, late: true }], skipped: late.length - 1 };
}

export function nextSlot(spec: RoutineSpec, after: number): Slot | null {
  return slotsBetween(spec, after, after + 8 * 86_400_000)[0] ?? null;
}

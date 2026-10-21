// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Cota por ferramenta: contador do dia, limite informado pelo usuário ou aprendido por erro.
 * Nunca lê credenciais nem consulta o fabricante; desconhecido continua desconhecido.
 */
export interface QuotaState {
  dia: string;
  usadasHoje: number;
  limiteDia: number | null;
  origemLimite: "usuario" | "aprendido" | "fabricante" | "desconhecido";
  esgotadaAte: number | null;
}

export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

export function freshQuota(now: number, limite: number | null = null): QuotaState {
  return { dia: dayKey(now), usadasHoje: 0, limiteDia: limite, origemLimite: limite === null ? "desconhecido" : "fabricante", esgotadaAte: null };
}

/** Vira o dia: zera o contador e mantém o limite conhecido. */
export function rollover(q: QuotaState, now: number): QuotaState {
  const esgotadaAte = q.esgotadaAte !== null && q.esgotadaAte > now ? q.esgotadaAte : null;
  return q.dia === dayKey(now) ? { ...q, esgotadaAte } : { ...q, dia: dayKey(now), usadasHoje: 0, esgotadaAte };
}

export function isExhausted(q: QuotaState, now: number): boolean {
  const r = rollover(q, now);
  return r.esgotadaAte !== null || (r.limiteDia !== null && r.usadasHoje >= r.limiteDia);
}

/** Fator de folga (0..1]; cota desconhecida é neutra (1) e aparece como “desconhecida” na explicação. */
export function slack(q: QuotaState, now: number, minimo: number): number {
  const r = rollover(q, now);
  if (r.limiteDia === null) return 1;
  return Math.max(minimo, 1 - r.usadasHoje / Math.max(1, r.limiteDia));
}

export function recordCalls(q: QuotaState, now: number, calls: number): QuotaState {
  const r = rollover(q, now);
  return { ...r, usadasHoje: r.usadasHoje + Math.max(0, calls) };
}

/**
 * Erro “limite atingido”: marca esgotada até a renovação informada (ou o próximo dia) e aprende
 * um limite diário a partir do que já foi usado. Plano melhor ⇒ o limite aprendido sobe sozinho.
 */
export function recordLimitError(q: QuotaState, now: number, renovaEm: number | null): QuotaState {
  const r = rollover(q, now);
  const nextDay = Date.parse(`${dayKey(now)}T00:00:00Z`) + 86_400_000;
  const learned = r.origemLimite === "usuario" ? r.limiteDia : Math.max(1, r.usadasHoje);
  return { ...r, limiteDia: learned, origemLimite: r.origemLimite === "usuario" ? "usuario" : "aprendido", esgotadaAte: renovaEm && renovaEm > now ? renovaEm : nextDay };
}

/** Uso acima do limite aprendido prova que o limite real é maior. */
export function raiseLearned(q: QuotaState): QuotaState {
  return q.origemLimite === "aprendido" && q.limiteDia !== null && q.usadasHoje > q.limiteDia ? { ...q, limiteDia: q.usadasHoje } : q;
}

export function setUserLimit(q: QuotaState, limite: number | null): QuotaState {
  return { ...q, limiteDia: limite, origemLimite: limite === null ? "desconhecido" : "usuario" };
}

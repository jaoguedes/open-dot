// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Paralelismo SÓ LEITURA (v0.3, 4.6), atrás da chave `ORCH_PARALLEL_READONLY` e da preferência do
 * dono, ambos desligados. Só papéis que leem (planejador de pesquisa e revisores), no máximo 2 ao
 * mesmo tempo, nunca implementador nem Corretor em paralelo, respeitando cota por ferramenta.
 * Cada ramo é validado pelo esquema do seu agente ANTES de qualquer fusão; um ramo inválido
 * invalida o lote inteiro (nada é fundido). Estado: SIMULADO (o Runner executa uma tarefa por vez).
 */
import type { QuotaState } from "./quota.ts";
import { isExhausted } from "./quota.ts";
import { checkSchema } from "./schema-check.ts";

export interface PlanStep {
  agente: string;
  papel: "planejador" | "implementador" | "revisor" | "corretor";
  ferramenta: string;
}
export const MAX_PARALLEL = 2;

export function parallelFlag(env: Record<string, string | undefined>, ownerPref: boolean): boolean {
  return env.ORCH_PARALLEL_READONLY === "1" && ownerPref;
}

function remaining(q: QuotaState | undefined, now: number): number {
  if (!q) return Infinity;
  if (isExhausted(q, now)) return 0;
  return q.limiteDia === null ? Infinity : Math.max(0, q.limiteDia - q.usadasHoje);
}

/**
 * Agrupa passos em lotes. Junta só: revisores consecutivos (leem a mesma proposta) e a Pesquisa
 * com o planejador logo antes dela (as duas leem só a ideia). O resto continua em sequência.
 */
export function planBatches(steps: PlanStep[], opts: { enabled: boolean; quotas?: Record<string, QuotaState>; now?: number }): PlanStep[][] {
  if (!opts.enabled) return steps.map((s) => [s]);
  const out: PlanStep[][] = [];
  for (const s of steps) {
    const last = out.at(-1);
    const prev = last?.at(-1);
    const pair =
      last &&
      prev &&
      last.length < MAX_PARALLEL &&
      ((s.papel === "revisor" && prev.papel === "revisor") || (s.agente === "pesquisa" && s.papel === "planejador" && prev.papel === "planejador" && last.length === 1));
    if (pair) {
      const sameTool = last!.filter((x) => x.ferramenta === s.ferramenta).length + 1;
      if (remaining(opts.quotas?.[s.ferramenta], opts.now ?? Date.now()) >= sameTool) {
        last!.push(s);
        continue;
      }
    }
    out.push([s]);
  }
  return out;
}

/** Valida cada ramo pelo esquema do seu agente; só funde se TODOS passarem. */
export function mergeBranches(branches: Array<{ agente: string; saida: unknown; schema: Record<string, unknown> }>): { ok: true; saidas: Array<{ agente: string; saida: unknown }> } | { ok: false; erros: string[] } {
  const erros = branches.flatMap((b) => checkSchema(b.saida, b.schema).map((e) => `${b.agente}: ${e}`));
  if (erros.length) return { ok: false, erros: erros.slice(0, 10) };
  return { ok: true, saidas: branches.map((b) => ({ agente: b.agente, saida: b.saida })) };
}

/** Estimativa mostrada antes: chamadas não mudam; o paralelismo só reduz o número de lotes. */
export function parallelEstimate(steps: PlanStep[], batches: PlanStep[][]): { chamadas: number; lotes: number; economizaEsperas: number } {
  return { chamadas: steps.length, lotes: batches.length, economizaEsperas: steps.length - batches.length };
}

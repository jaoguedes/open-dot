// SPDX-License-Identifier: AGPL-3.0-only
import { classifyBatch, CORREIO_CATEGORIAS } from "./correio.ts";
import type { EmailMeta } from "./email.ts";

/** Avaliação do resumo do Correio contra um conjunto rotulado (G). Pura, para teste e script. */
export type GoldLabel = (typeof CORREIO_CATEGORIAS)[number] | "ruido" | "sem_acao";
export interface GoldEmail extends EmailMeta {
  expected: GoldLabel;
  importante: boolean;
  nota?: string;
}

export interface Metrics {
  n: number;
  perLabel: Record<string, { precision: number; recall: number; tp: number; fp: number; fn: number }>;
  needYou: { precision: number; recall: number };
  securityPaymentRecall: number;
  errors: Array<{ id: string; expected: string; got: string; nota?: string }>;
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);

/**
 * Cada conversa conta uma vez: vale o rótulo da mensagem mais recente, que é a que o
 * resumo mostra (as outras ficam em "+N na conversa").
 */
export function evaluateCorreio(gold: GoldEmail[]): Metrics {
  const got = classifyBatch(gold);
  const latest = new Map<string, GoldEmail>();
  for (const g of gold) {
    const cur = latest.get(g.threadId);
    if (!cur || g.receivedAt > cur.receivedAt) latest.set(g.threadId, g);
  }
  const units = [...latest.values()];
  const labels = [...CORREIO_CATEGORIAS, "ruido", "sem_acao"];
  const perLabel: Metrics["perLabel"] = {};
  for (const l of labels) {
    const tp = units.filter((u) => u.expected === l && got.get(u.id) === l).length;
    const fp = units.filter((u) => u.expected !== l && got.get(u.id) === l).length;
    const fn = units.filter((u) => u.expected === l && got.get(u.id) !== l).length;
    perLabel[l] = { precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), tp, fp, fn };
  }
  const isNeed = (l: string | undefined) => l !== undefined && l !== "ruido" && l !== "sem_acao" && l !== "agrupado";
  const needTp = units.filter((u) => u.importante && isNeed(got.get(u.id))).length;
  const needPred = units.filter((u) => isNeed(got.get(u.id))).length;
  const needExp = units.filter((u) => u.importante).length;
  const sp = units.filter((u) => u.expected === "seguranca" || u.expected === "pagamento");
  return {
    n: units.length,
    perLabel,
    needYou: { precision: ratio(needTp, needPred), recall: ratio(needTp, needExp) },
    securityPaymentRecall: ratio(sp.filter((u) => got.get(u.id) === u.expected).length, sp.length),
    errors: units.filter((u) => got.get(u.id) !== u.expected).map((u) => ({ id: u.id, expected: u.expected, got: got.get(u.id) ?? "?", ...(u.nota ? { nota: u.nota } : {}) })),
  };
}

export const CORREIO_THRESHOLDS = { needYouPrecision: 0.9, securityPaymentRecall: 0.95 } as const;

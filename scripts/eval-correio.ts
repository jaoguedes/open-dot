/**
 * Avalia o resumo do Correio (só regras, sem IA) no conjunto sintético rotulado.
 * Uso: npm run eval:correio (também roda no npm run check e na CI).
 * Falha se a precisão de "precisa de você" < 90% ou a revocação de segurança+pagamento < 95%.
 *
 * ATENÇÃO: isto é um teste de regressão, NÃO uma medida de qualidade. Os 85 e-mails de
 * correio-gold.json foram escritos e ajustados junto com as regras; 100% aqui não diz
 * nada sobre e-mail de verdade. A medida real exige o conjunto cego de
 * packages/core/test/fixtures/correio-holdout/ (ainda vazio).
 */
import { readFileSync } from "node:fs";
import { CORREIO_THRESHOLDS, evaluateCorreio, type GoldEmail } from "../packages/core/src/correio-eval.ts";

const gold = (JSON.parse(readFileSync(new URL("../packages/core/test/fixtures/correio-gold.json", import.meta.url), "utf8")) as { emails: GoldEmail[] }).emails;
const m = evaluateCorreio(gold);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Correio · ${gold.length} e-mails sintéticos · ${m.n} conversas`);
console.log("rótulo        precisão  revocação   (acertos/falsos/perdidos)");
for (const [l, r] of Object.entries(m.perLabel)) console.log(`${l.padEnd(12)}  ${pct(r.precision).padStart(7)}   ${pct(r.recall).padStart(7)}   (${r.tp}/${r.fp}/${r.fn})`);
console.log(`precisa de você: precisão ${pct(m.needYou.precision)} · revocação ${pct(m.needYou.recall)}`);
console.log(`segurança + pagamento: revocação ${pct(m.securityPaymentRecall)}`);
if (m.errors.length) {
  console.log("\nerros:");
  for (const e of m.errors) console.log(`  ${e.id}: esperado ${e.expected}, veio ${e.got}${e.nota ? ` (${e.nota})` : ""}`);
}
const ok = m.needYou.precision >= CORREIO_THRESHOLDS.needYouPrecision && m.securityPaymentRecall >= CORREIO_THRESHOLDS.securityPaymentRecall;
console.log(ok ? "\neval:correio ok (regressão; não é medida real: o conjunto foi ajustado junto com as regras)" : "\neval:correio REPROVADO");
process.exit(ok ? 0 : 1);

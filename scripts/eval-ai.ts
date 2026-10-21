// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Avaliação da camada de IA. Padrão: provedor falso.
 * Conta Groq real só quando o João pedir (nunca nesta sessão autônoma).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { runFakeEval } from "../packages/core/src/ai/eval.ts";

const report = runFakeEval();
mkdirSync("test-results/eval-ai", { recursive: true });
writeFileSync("test-results/eval-ai/fake-v1.json", JSON.stringify(report, null, 2));
console.log(
  `eval-ai fake v1: n=${report.totals.n} recall_imp=${(report.recallImportant * 100).toFixed(1)}% json=${(report.jsonValid * 100).toFixed(1)}% unauthorized=${report.unauthorized} secrets=${report.secretsInPayload} paid=${report.paidRoute}`,
);
if (report.recallImportant < 0.95 || report.jsonValid < 0.99 || report.unauthorized || report.secretsInPayload || report.paidRoute) {
  process.exit(1);
}

// SPDX-License-Identifier: AGPL-3.0-only
/** Simulações sintéticas da calibração (rotuladas: SIMULADO, nenhuma chamada real). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CALIBRATION, EMPTY_CALIBRATION, calibrate, calibrationFactor, explainKey, type CalibrationState, type MeasuredOutcome } from "../src/orchestrator/calibration.ts";
import { seeded as mulberry32 } from "../src/orchestrator/prng.ts";

function world(p: number, n: number, seed: number, tool: MeasuredOutcome["tool"] = "codex"): MeasuredOutcome[] {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => ({ role: "implementador", tool, tipo: "pwa", outcome: r() < p ? "aprovado" : "reprovado" }) as MeasuredOutcome);
}

function cycles(history: MeasuredOutcome[], times: number): CalibrationState[] {
  const out: CalibrationState[] = [];
  let s = EMPTY_CALIBRATION;
  for (let i = 0; i < times; i++) out.push((s = calibrate(history, s).state));
  return out;
}

test("SIMULADO: abaixo da amostra mínima nada muda", () => {
  const s = calibrate(world(1, DEFAULT_CALIBRATION.minAmostras - 1, 1)).state;
  assert.equal(calibrationFactor(s, "implementador", "codex", "pwa").fator, 1);
  assert.match(calibrate(world(1, 3, 1)).decisoes.map((d) => d.motivo).join(), /amostra insuficiente|^$/);
});

test("SIMULADO: converge para o alvo encolhido, sem passar dele e sem oscilar", () => {
  const hist = world(0.9, 60, 2);
  const states = cycles(hist, 20);
  const key = "implementador|codex|pwa";
  const series = states.map((s) => s.fatores[key] ?? 1);
  const alvo = states.at(-1)!.detalhes[key]!.alvo;
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i]! >= series[i - 1]!, "monótono (sem oscilação)");
    assert.ok(Math.abs(series[i]! - series[i - 1]!) <= DEFAULT_CALIBRATION.tetoPorCiclo + 1e-9, "respeita o teto por ciclo");
  }
  assert.equal(series.at(-1), alvo, "chega ao alvo");
  assert.ok(alvo <= DEFAULT_CALIBRATION.teto && alvo > 1);
  assert.ok(alvo < 1 + DEFAULT_CALIBRATION.amplitude * 0.8 * 2, "encolhido: menos que a taxa bruta");
});

test("SIMULADO: estável com resultados que alternam; limites de piso e teto", () => {
  const alt: MeasuredOutcome[] = Array.from({ length: 40 }, (_, i) => ({ role: "revisor", tool: "claude-code", tipo: "api", outcome: i % 2 ? "aprovado" : "reprovado" }));
  const series = cycles(alt, 15).map((s) => calibrationFactor(s, "revisor", "claude-code", "api").fator);
  assert.ok(series.every((f) => Math.abs(f - 1) < 1e-9), `meio a meio fica neutro: ${series}`);
  const bad = cycles(world(0, 500, 3), 40).at(-1)!;
  const k = "implementador|codex|pwa";
  assert.equal(bad.fatores[k], bad.detalhes[k]!.alvo);
  assert.ok(bad.fatores[k]! >= DEFAULT_CALIBRATION.piso && bad.fatores[k]! < 0.76, "perto do piso, nunca abaixo");
  const good = cycles(world(1, 500, 4), 40).at(-1)!;
  assert.ok(good.fatores[k]! <= DEFAULT_CALIBRATION.teto && good.fatores[k]! > 1.24, "perto do teto, nunca acima");
});

test("SIMULADO: determinística, cota pesa contra e o porquê traz os números", () => {
  const h = [...world(0.8, 20, 5), ...Array.from({ length: 10 }, () => ({ role: "implementador", tool: "codex", tipo: "pwa", outcome: "cota" }) as MeasuredOutcome)];
  assert.deepEqual(calibrate(h), calibrate(h));
  const shuffled = [...h].reverse();
  assert.deepEqual(calibrate(shuffled).state, calibrate(h).state, "ordem do histórico não importa");
  const withQuota = calibrate(h).state.detalhes["implementador|codex|pwa"]!;
  const noQuota = calibrate(world(0.8, 20, 5)).state.detalhes["implementador|codex|pwa"]!;
  assert.ok(withQuota.alvo < noQuota.alvo);
  assert.match(explainKey(calibrate(h).state, "implementador|codex|pwa"), /aprovadas.*cota.*taxa encolhida.*alvo/);
  const reset = calibrate([], EMPTY_CALIBRATION).state;
  assert.deepEqual(reset.fatores, {}, "zerar = sem fatores");
});

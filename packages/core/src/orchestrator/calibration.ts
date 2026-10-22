// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Calibração adaptativa (parte G, v0.3). Conservadora e explicável: usa só resultados medidos
 * nesta instalação, por (papel, ferramenta, tipo de projeto). Regras:
 *  - nenhuma mudança antes de `minAmostras` resultados válidos para a chave;
 *  - taxa encolhida em direção ao neutro (0,5) com pseudocontagem `encolhimento`;
 *  - fator limitado a [piso, teto] e variação máxima de `tetoPorCiclo` por ciclo (sem oscilação);
 *  - cota esgotada pesa contra, mas não conta como qualidade;
 *  - determinística (chaves ordenadas, sem relógio nem aleatoriedade);
 *  - só multiplica a pontuação de ferramentas JÁ elegíveis: nunca sobrepõe restrição dura nem a
 *    escolha manual do usuário (isso fica no seletor).
 * Desligada por padrão; "zerar" volta tudo a 1.
 */
import type { Role } from "./agents.ts";
import { TOOL_IDS, type ToolId } from "./catalog.ts";
import type { ProjectType } from "./profile.ts";

export type OutcomeKind = "aprovado" | "reprovado" | "concluido" | "falhou" | "cota" | "saida_invalida";
export interface MeasuredOutcome {
  role: Role;
  tool: ToolId;
  tipo: ProjectType | "qualquer";
  outcome: OutcomeKind;
}

export interface CalibrationConfig {
  minAmostras: number;
  encolhimento: number;
  amplitude: number;
  tetoPorCiclo: number;
  piso: number;
  teto: number;
  pesoCota: number;
}

export const DEFAULT_CALIBRATION: CalibrationConfig = { minAmostras: 8, encolhimento: 8, amplitude: 0.25, tetoPorCiclo: 0.05, piso: 0.75, teto: 1.25, pesoCota: 0.3 };

export interface KeyDetail {
  n: number;
  aprovadas: number;
  cota: number;
  taxaEncolhida: number;
  alvo: number;
}
export interface CalibrationState {
  versao: 1;
  ciclo: number;
  fatores: Record<string, number>;
  detalhes: Record<string, KeyDetail>;
}

export const EMPTY_CALIBRATION: CalibrationState = { versao: 1, ciclo: 0, fatores: {}, detalhes: {} };

export function calibrationKey(role: Role, tool: ToolId, tipo: ProjectType | "qualquer"): string {
  return `${role}|${tool}|${tipo}`;
}

const GOOD: ReadonlySet<OutcomeKind> = new Set(["aprovado", "concluido"]);
const BAD: ReadonlySet<OutcomeKind> = new Set(["reprovado", "falhou", "saida_invalida"]);
const round = (v: number) => Math.round(v * 1000) / 1000;

export interface CalibrationDecision {
  chave: string;
  antes: number;
  depois: number;
  motivo: string;
}

/** Um ciclo de calibração. Pura e determinística: mesmo histórico e estado = mesmo resultado. */
export function calibrate(outcomes: MeasuredOutcome[], prev: CalibrationState = EMPTY_CALIBRATION, cfg: CalibrationConfig = DEFAULT_CALIBRATION): { state: CalibrationState; decisoes: CalibrationDecision[] } {
  const buckets = new Map<string, { n: number; good: number; cota: number }>();
  for (const o of outcomes) {
    if (!TOOL_IDS.includes(o.tool)) continue;
    for (const tipo of o.tipo === "qualquer" ? (["qualquer"] as const) : ([o.tipo, "qualquer"] as const)) {
      const k = calibrationKey(o.role, o.tool, tipo);
      const b = buckets.get(k) ?? { n: 0, good: 0, cota: 0 };
      if (o.outcome === "cota") b.cota++;
      else if (GOOD.has(o.outcome)) {
        b.n++;
        b.good++;
      } else if (BAD.has(o.outcome)) b.n++;
      buckets.set(k, b);
    }
  }
  const fatores: Record<string, number> = {};
  const detalhes: Record<string, KeyDetail> = {};
  const decisoes: CalibrationDecision[] = [];
  const keys = [...new Set([...buckets.keys(), ...Object.keys(prev.fatores)])].sort();
  for (const k of keys) {
    const b = buckets.get(k) ?? { n: 0, good: 0, cota: 0 };
    const antes = prev.fatores[k] ?? 1;
    const p = (b.good + 0.5 * cfg.encolhimento) / (b.n + cfg.encolhimento);
    const cotaRate = b.n + b.cota ? b.cota / (b.n + b.cota) : 0;
    const alvoBruto = (1 + cfg.amplitude * (p - 0.5) * 2) * (1 - cfg.pesoCota * cotaRate);
    const alvo = round(Math.min(cfg.teto, Math.max(cfg.piso, alvoBruto)));
    detalhes[k] = { n: b.n, aprovadas: b.good, cota: b.cota, taxaEncolhida: round(p), alvo };
    let depois = antes;
    let motivo: string;
    if (b.n < cfg.minAmostras) motivo = `amostra insuficiente (${b.n} de ${cfg.minAmostras}): sem ajuste`;
    else {
      const delta = Math.max(-cfg.tetoPorCiclo, Math.min(cfg.tetoPorCiclo, alvo - antes));
      depois = round(antes + delta);
      motivo = `${b.good}/${b.n} aprovadas${b.cota ? `, ${b.cota} por cota` : ""}; taxa encolhida ${round(p)} → alvo ×${alvo}; passo limitado a ±${cfg.tetoPorCiclo}`;
    }
    if (depois !== 1) fatores[k] = depois;
    if (depois !== antes || b.n >= cfg.minAmostras) decisoes.push({ chave: k, antes, depois, motivo });
  }
  return { state: { versao: 1, ciclo: prev.ciclo + 1, fatores, detalhes }, decisoes };
}

/** Fator a aplicar na pontuação: tipo específico primeiro, depois "qualquer". 1 = neutro. */
export function calibrationFactor(state: CalibrationState | null | undefined, role: Role, tool: ToolId, tipo: ProjectType | undefined): { fator: number; chave: string | null } {
  if (!state) return { fator: 1, chave: null };
  for (const k of [tipo ? calibrationKey(role, tool, tipo) : null, calibrationKey(role, tool, "qualquer")]) {
    if (k && state.fatores[k] !== undefined) return { fator: state.fatores[k]!, chave: k };
  }
  return { fator: 1, chave: null };
}

/** "Por que" de uma chave, com os números. */
export function explainKey(state: CalibrationState, key: string): string {
  const d = state.detalhes[key];
  const f = state.fatores[key] ?? 1;
  if (!d) return `${key}: sem resultados medidos; fator ×1 (neutro).`;
  return `${key}: ${d.aprovadas}/${d.n} aprovadas${d.cota ? `, ${d.cota} paradas por cota` : ""}; taxa encolhida ${d.taxaEncolhida}; alvo ×${d.alvo}; fator atual ×${f}.`;
}

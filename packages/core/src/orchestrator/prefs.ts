// SPDX-License-Identifier: AGPL-3.0-only
/** Preferências do orquestrador v0.3. Tudo que muda comportamento começa DESLIGADO. */
import { z } from "zod";

export const MAX_LOOP_ROUNDS = 3;

export const PrefsSchema = z
  .object({
    calibracao: z.boolean(),
    cicloCorretor: z.object({ ativo: z.boolean(), rodadas: z.number().int().min(1).max(MAX_LOOP_ROUNDS) }).strict(),
    paraleloSomenteLeitura: z.boolean(),
    sugestaoDeSkill: z.boolean(),
  })
  .strict();
export type OrchestratorPrefs = z.infer<typeof PrefsSchema>;

export const DEFAULT_PREFS: OrchestratorPrefs = {
  calibracao: false,
  cicloCorretor: { ativo: false, rodadas: 2 },
  paraleloSomenteLeitura: false,
  sugestaoDeSkill: false,
};

/** Lê o que veio do banco; qualquer coisa fora do formato volta ao padrão (falha fechada = desligado). */
export function parsePrefs(raw: string | null | undefined): OrchestratorPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    return PrefsSchema.parse({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
  } catch {
    return DEFAULT_PREFS;
  }
}

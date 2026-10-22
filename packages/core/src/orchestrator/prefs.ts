// SPDX-License-Identifier: AGPL-3.0-only
/** Preferências do orquestrador v0.3. Tudo que muda comportamento começa DESLIGADO. */
import { z } from "zod";

export const MAX_LOOP_ROUNDS = 3;
export const REQUIRED_AGENTS: readonly string[] = ["desenvolvedor", "qa"];

export const PrefsSchema = z
  .object({
    calibracao: z.boolean(),
    cicloCorretor: z.object({ ativo: z.boolean(), rodadas: z.number().int().min(1).max(MAX_LOOP_ROUNDS) }).strict(),
    paraleloSomenteLeitura: z.boolean(),
    sugestaoDeSkill: z.boolean(),
    /** Especialistas que o dono desligou. Desenvolvedor e QA não podem ser desligados (sem eles não há proposta revisada). */
    agentesDesligados: z
      .array(z.string().regex(/^[a-z][a-z0-9-]{1,40}$/))
      .max(40)
      .refine((ids) => !ids.some((id) => REQUIRED_AGENTS.includes(id)), { message: "Desenvolvedor e QA não podem ser desligados." }),
  })
  .strict();
export type OrchestratorPrefs = z.infer<typeof PrefsSchema>;

export const DEFAULT_PREFS: OrchestratorPrefs = {
  calibracao: false,
  cicloCorretor: { ativo: false, rodadas: 2 },
  paraleloSomenteLeitura: false,
  sugestaoDeSkill: false,
  agentesDesligados: [],
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

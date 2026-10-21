// SPDX-License-Identifier: AGPL-3.0-only
import type { DataClass } from "../types.ts";

export type Capability = "classify" | "summarize" | "answer" | "json";

export interface ModelConfig {
  id: string;
  capabilities: Capability[];
  contextTokens: number;
  maxOutputTokens: number;
  /** Limites publicados pelo provedor para a conta (conferir no painel da conta). */
  limits: { rpm: number; rpd: number; tpm: number; tpd: number };
}

export interface ProviderConfig {
  id: string;
  label: string;
  /** Endpoint compatível com /chat/completions. */
  baseUrl: string;
  /** Nome da variável de ambiente com a chave (o valor nunca fica no código). */
  apiKeyEnv: string;
  /** Somente "free_tier" é aceito. Qualquer outro valor é recusado na validação. */
  billing: "free_tier";
  /** Classes de dado que podem ser enviadas a este provedor. */
  allowedData: DataClass[];
  /** Para dados privados: exige confirmação de retenção zero/termos compatíveis. */
  privacyConfirmed: boolean;
  privacyNote: string;
  models: ModelConfig[];
}

export interface OwnerLimits {
  callsPerDay: number;
  tokensPerDay: number;
  maxConcurrent: number;
  maxAttemptsPerStep: number;
  timeoutMs: number;
}

/** Limites do produto (capítulo 40). Configuráveis; nunca maiores que a franquia real. */
export const DEFAULT_OWNER_LIMITS: OwnerLimits = {
  callsPerDay: 50,
  tokensPerDay: 100_000,
  maxConcurrent: 1,
  maxAttemptsPerStep: 2,
  timeoutMs: 45_000,
};

/**
 * Allowlist inicial. Valores conferidos em console.groq.com/docs/rate-limits em 13/10/2026
 * (tabela Free: 30 RPM, 1K RPD, 8K TPM, 200K TPD para gpt-oss-20b/120b).
 * Dados privados só são liberados depois que João ativar Zero Data Retention
 * na conta Groq e definir GROQ_ZDR_CONFIRMED=true (ver docs/SETUP.md).
 */
export function defaultProviders(env: Record<string, string | undefined>): ProviderConfig[] {
  const zdr = env.GROQ_ZDR_CONFIRMED === "true";
  return [
    {
      id: "groq",
      label: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKeyEnv: "GROQ_API_KEY",
      billing: "free_tier",
      allowedData: zdr ? ["public", "personal", "private_email", "private_code"] : ["public", "personal"],
      privacyConfirmed: zdr,
      privacyNote: zdr ? "Zero Data Retention confirmado pelo dono da conta." : "Sem confirmação de ZDR: e-mails e código privados não são enviados.",
      models: [
        {
          id: "openai/gpt-oss-20b",
          capabilities: ["classify", "summarize", "answer", "json"],
          contextTokens: 131_072,
          maxOutputTokens: 1_024,
          limits: { rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000 },
        },
        {
          id: "openai/gpt-oss-120b",
          capabilities: ["summarize", "answer", "json"],
          contextTokens: 131_072,
          maxOutputTokens: 1_024,
          limits: { rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000 },
        },
      ],
    },
  ];
}

export function validateProviders(list: unknown[]): { ok: ProviderConfig[]; rejected: { id: string; reason: string }[] } {
  const ok: ProviderConfig[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const raw of list) {
    const p = raw as Partial<ProviderConfig> & { billing?: string };
    const id = String(p?.id ?? "?");
    if (p?.billing !== "free_tier") {
      rejected.push({ id, reason: "provedor pago ou sem franquia declarada não é permitido" });
      continue;
    }
    if (!p.baseUrl?.startsWith("https://")) {
      rejected.push({ id, reason: "endpoint precisa ser HTTPS" });
      continue;
    }
    const privateData = (p.allowedData ?? []).some((d) => d === "private_email" || d === "private_code");
    if (privateData && !p.privacyConfirmed) {
      rejected.push({ id, reason: "dados privados sem confirmação de política de dados" });
      continue;
    }
    if ((p.allowedData ?? []).includes("secret")) {
      rejected.push({ id, reason: "segredos nunca vão para IA" });
      continue;
    }
    ok.push(p as ProviderConfig);
  }
  return { ok, rejected };
}

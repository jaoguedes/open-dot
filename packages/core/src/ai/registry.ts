import type { DataClass } from "../types.ts";

/**
 * Inventário de provedores (D-016). Só entra na rota quem estiver `enabled`.
 * Conferido na pesquisa de 14/10/2026. Nenhuma rota paga.
 */

export type BillingClass = "free_tier" | "paid" | "ended";

export interface ProviderSheet {
  id: string;
  label: string;
  enabled: boolean;
  billing: BillingClass;
  endpoint: string | null;
  models: string[];
  allowedData: DataClass[];
  /** Gemini nunca recebe dado privado. */
  neverPrivate: boolean;
  privacy: { retention: string; training: string; verifiedAt: string };
  note: string;
}

export const PROVIDER_REGISTRY: readonly ProviderSheet[] = [
  {
    id: "groq",
    label: "Groq",
    enabled: true,
    billing: "free_tier",
    endpoint: "https://api.groq.com/openai/v1",
    models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
    allowedData: ["public", "personal"],
    neverPrivate: false,
    privacy: { retention: "ZDR só se o dono confirmar", training: "não usar conteúdo para treino no ZDR", verifiedAt: "2026-10-14" },
    note: "Provedor ativo. Classifica no 20b; resume/responde no 120b.",
  },
  {
    id: "workers-ai",
    label: "Cloudflare Workers AI",
    enabled: false,
    billing: "free_tier",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "avaliar antes de ligar", training: "avaliar", verifiedAt: "2026-10-14" },
    note: "Fallback opcional pelo binding env.AI, desligado até passar na avaliação.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    enabled: false,
    billing: "free_tier",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: true,
    privacy: { retention: "não usar para privado", training: "não enviar privado", verifiedAt: "2026-10-14" },
    note: "Registrado e desligado. Gemini nunca recebe dado privado.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    enabled: false,
    billing: "paid",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "não usado", training: "não usado", verifiedAt: "2026-10-14" },
    note: "Desligado. Cobrança não é franquia gratuita.",
  },
  {
    id: "mistral",
    label: "Mistral",
    enabled: false,
    billing: "paid",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "não usado", training: "não usado", verifiedAt: "2026-10-14" },
    note: "Registrado e desligado.",
  },
  {
    id: "sambanova",
    label: "SambaNova",
    enabled: false,
    billing: "free_tier",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "não usado", training: "não usado", verifiedAt: "2026-10-14" },
    note: "Registrado e desligado.",
  },
  {
    id: "z-ai",
    label: "Z.ai",
    enabled: false,
    billing: "free_tier",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "não usado", training: "não usado", verifiedAt: "2026-10-14" },
    note: "Registrado e desligado.",
  },
  {
    id: "github-models",
    label: "GitHub Models",
    enabled: false,
    billing: "ended",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "encerrado", training: "encerrado", verifiedAt: "2026-10-14" },
    note: "Encerrado. Não é tratado como gratuito.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    enabled: false,
    billing: "paid",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "não usado", training: "não usado", verifiedAt: "2026-10-14" },
    note: "Não é tratado como gratuito.",
  },
  {
    id: "together",
    label: "Together",
    enabled: false,
    billing: "paid",
    endpoint: null,
    models: [],
    allowedData: ["public"],
    neverPrivate: false,
    privacy: { retention: "não usado", training: "não usado", verifiedAt: "2026-10-14" },
    note: "Não é tratado como gratuito.",
  },
];

export function enabledProviders(): ProviderSheet[] {
  return PROVIDER_REGISTRY.filter((p) => p.enabled && p.billing === "free_tier");
}

export function registryAllowsPaid(): boolean {
  return PROVIDER_REGISTRY.some((p) => p.enabled && p.billing === "paid");
}

/** Cartão público para Conexões: nunca inclui chave. */
export interface ProviderCard {
  id: string;
  label: string;
  enabled: boolean;
  billing: BillingClass;
  models: string[];
  allowedData: DataClass[];
  neverPrivate: boolean;
  note: string;
  privacy: { retention: string; training: string; verifiedAt: string };
  configured: boolean;
  quota: { calls: number; limit: number } | null;
  lastCheck: string | null;
}

export function providerCards(opts: { groqConfigured: boolean; groqPrivate: boolean; calls?: number; callLimit?: number }): ProviderCard[] {
  return PROVIDER_REGISTRY.map((p) => ({
    id: p.id,
    label: p.label,
    enabled: p.enabled && p.billing === "free_tier",
    billing: p.billing,
    models: p.models,
    allowedData: p.allowedData,
    neverPrivate: p.neverPrivate,
    note: p.note,
    privacy: p.privacy,
    configured: p.id === "groq" ? opts.groqConfigured : false,
    quota: p.id === "groq" && opts.callLimit != null ? { calls: opts.calls ?? 0, limit: opts.callLimit } : null,
    lastCheck: null,
  }));
}

import { z } from "zod";

/**
 * Configuração do Worker. Segredos chegam por `wrangler secret put` (produção)
 * ou `.dev.vars` (local). Nada disso vai para o bundle do navegador.
 */
export const EnvSchema = z.object({
  APP_ENV: z.enum(["development", "production"]).default("production"),
  /** URL pública do app, ex.: https://open-dot.<sub>.workers.dev */
  APP_ORIGIN: z.string().url(),
  TOKEN_KEYS: z.string().min(10),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),

  /** Login e Gmail usam o mesmo cliente OAuth do Google (tipo "Web application"). */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Único dono permitido: sub estável do Google (preferível) ou e-mail na primeira entrada. */
  OWNER_GOOGLE_SUB: z.string().optional(),
  OWNER_EMAIL: z.string().email().optional(),
  /** Nome mostrado na saudação até o dono salvar outro. Vazio = só "Bom dia". */
  OWNER_NAME: z.string().max(40).optional(),
  /** Contato público opcional. Não reutilize o e-mail de login se não quiser publicá-lo. */
  CONTACT_EMAIL: z.string().email().optional(),

  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),

  VERCEL_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),

  GROQ_API_KEY: z.string().optional(),
  GROQ_ZDR_CONFIRMED: z.enum(["true", "false"]).optional(),
  /** Finnhub free (ações dos EUA). Sem chave, cripto e câmbio continuam. B3 não entra neste plano. */
  FINNHUB_API_KEY: z.string().optional(),
  /** Chave demo opcional da CoinGecko. Nunca vai para o navegador nem para o log. */
  COINGECKO_DEMO_API_KEY: z.string().optional(),

  /** Rastreio PacoteVício. Sem a chave ou sem a flag, o provedor fica desligado. */
  PACOTEVICIO_API_KEY: z.string().optional(),
  PACOTEVICIO_TERMS_CONFIRMED: z.enum(["true", "false"]).optional(),

  AI_CALLS_PER_DAY: z.coerce.number().int().min(0).max(1000).default(50),
  AI_TOKENS_PER_DAY: z.coerce.number().int().min(0).max(1_000_000).default(100_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, unknown>): { ok: true; env: Env } | { ok: false; missing: string[] } {
  const strings: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v !== "") strings[k] = v;
  const r = EnvSchema.safeParse(strings);
  if (r.success) return { ok: true, env: r.data };
  return { ok: false, missing: r.error.issues.map((i) => i.path.join(".")) };
}

/** Quais integrações estão configuradas (sem revelar valores). */
export function configured(env: Env) {
  return {
    database: Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    owner: Boolean(env.OWNER_GOOGLE_SUB || env.OWNER_EMAIL),
    github: Boolean(env.GITHUB_WEBHOOK_SECRET),
    githubApp: Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY),
    vercel: Boolean(env.VERCEL_TOKEN && env.VERCEL_PROJECT_ID),
    ai: Boolean(env.GROQ_API_KEY),
    aiPrivate: env.GROQ_ZDR_CONFIRMED === "true",
    finnhub: Boolean(env.FINNHUB_API_KEY),
    tracking: Boolean(env.PACOTEVICIO_API_KEY) && env.PACOTEVICIO_TERMS_CONFIRMED === "true",
    trackingState: !env.PACOTEVICIO_API_KEY ? (env.PACOTEVICIO_TERMS_CONFIRMED === "true" ? "sem_chave" : "desligado") : env.PACOTEVICIO_TERMS_CONFIRMED === "true" ? "ligado" : "termos",
  };
}

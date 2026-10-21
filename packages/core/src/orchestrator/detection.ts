// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Detector (parte B): interpreta a saída dos comandos PÚBLICOS de cada CLI. Nunca recebe
 * nem devolve credenciais; o snapshot só aceita campos enumerados e textos curtos sem padrão de segredo.
 */
import { z } from "zod";
import { TOOL_IDS, type ToolId } from "./catalog.ts";

export const AUTH_METHODS = ["claude.ai", "oauth_token", "chatgpt", "google", "api_key", "api_key_helper", "third_party", "none", "unknown"] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];
/** Métodos que podem gerar cobrança por uso: nunca usados por padrão. */
export const POSSIBLY_PAID: ReadonlySet<AuthMethod> = new Set(["api_key", "api_key_helper", "third_party"]);

const SECRETISH = /(sk-|ghp_|gho_|github_pat_|AIza|GOCSPX-|xox[abprs]-|eyJ[A-Za-z0-9_-]{10,}\.|BEGIN [A-Z ]*PRIVATE KEY|bearer\s|token[=:]|[A-Za-z0-9+/_-]{40,}|@)/i;
const safeText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => !SECRETISH.test(s), "Texto com padrão de credencial ou e-mail não entra no snapshot.");

export const ToolSnapshotSchema = z
  .object({
    id: z.enum(TOOL_IDS),
    installed: z.boolean(),
    version: z.string().regex(/^\d+\.\d+\.\d+[0-9A-Za-z.+-]{0,20}$/).nullable(),
    loggedIn: z.boolean().nullable(),
    authMethod: z.enum(AUTH_METHODS).nullable(),
    possiblyPaid: z.boolean(),
    executable: z.boolean(),
    reason: safeText(200),
  })
  .strict();
export type ToolSnapshot = z.infer<typeof ToolSnapshotSchema>;

export const DetectionSnapshotSchema = z
  .object({ version: z.literal(1), observedAt: z.number().int().positive(), tools: z.array(ToolSnapshotSchema).max(TOOL_IDS.length) })
  .strict()
  .superRefine((s, ctx) => {
    if (new Set(s.tools.map((t) => t.id)).size !== s.tools.length) ctx.addIssue({ code: "custom", message: "Ferramenta repetida no snapshot." });
    for (const t of s.tools) {
      if (!t.installed && (t.loggedIn || t.executable)) ctx.addIssue({ code: "custom", message: "Não instalada não pode estar logada ou executável." });
      if (t.executable && t.loggedIn !== true) ctx.addIssue({ code: "custom", message: "Executável exige login confirmado." });
      if (t.authMethod && POSSIBLY_PAID.has(t.authMethod) !== t.possiblyPaid) ctx.addIssue({ code: "custom", message: "possiblyPaid contradiz o método de autenticação." });
    }
  });
export type DetectionSnapshot = z.infer<typeof DetectionSnapshotSchema>;

/** Primeira versão semântica de um texto (`2.1.296 (Claude Code)`, `codex-cli 0.40.0`). */
export function parseVersion(text: string): string | null {
  return /\b(\d+\.\d+\.\d+)(?:[-+][0-9A-Za-z.]{1,20})?\b/.exec(text)?.[0] ?? null;
}

export interface LoginState {
  loggedIn: boolean | null;
  authMethod: AuthMethod | null;
  possiblyPaid: boolean;
}

/** `claude auth status` (JSON por padrão; saída 0 com login, 1 sem). Lê só loggedIn e authMethod. */
export function parseClaudeAuthStatus(stdout: string, exitCode: number): LoginState {
  let v: unknown;
  try {
    v = JSON.parse(stdout);
  } catch {
    return { loggedIn: null, authMethod: "unknown", possiblyPaid: false };
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const raw = typeof o.authMethod === "string" ? o.authMethod : null;
  const known = (AUTH_METHODS as readonly string[]).includes(raw ?? "") ? (raw as AuthMethod) : raw === null ? null : "unknown";
  const loggedIn = o.loggedIn === true && exitCode === 0 ? true : o.loggedIn === false || exitCode !== 0 ? false : null;
  return { loggedIn, authMethod: loggedIn ? known : "none", possiblyPaid: Boolean(loggedIn && known && POSSIBLY_PAID.has(known)) };
}

/**
 * `codex login status`: só o código de saída e frases fixas. O formato não está na documentação
 * oficial; qualquer coisa fora do esperado vira desconhecido (falha fechada).
 */
export function parseCodexLoginStatus(text: string, exitCode: number): LoginState {
  if (exitCode !== 0) return { loggedIn: /not logged in/i.test(text) ? false : null, authMethod: /not logged in/i.test(text) ? "none" : null, possiblyPaid: false };
  if (/logged in using chatgpt/i.test(text)) return { loggedIn: true, authMethod: "chatgpt", possiblyPaid: false };
  if (/logged in using an api key|api key/i.test(text)) return { loggedIn: true, authMethod: "api_key", possiblyPaid: true };
  return { loggedIn: null, authMethod: "unknown", possiblyPaid: false };
}

/**
 * Gemini não tem comando de status documentado: uma chamada mínima em JSON mostra se há login.
 * Erro de autenticação = sem login; sucesso = logado (método não informado, plano desconhecido).
 */
export function parseGeminiProbe(stdout: string, exitCode: number): LoginState {
  let v: Record<string, unknown> = {};
  try {
    v = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return { loggedIn: null, authMethod: null, possiblyPaid: false };
  }
  const err = v.error && typeof v.error === "object" ? JSON.stringify(v.error) : "";
  if (exitCode === 0 && typeof v.response === "string" && !err) return { loggedIn: true, authMethod: "unknown", possiblyPaid: false };
  if (/auth|login|credential|unauthenticated/i.test(err)) return { loggedIn: false, authMethod: "none", possiblyPaid: false };
  return { loggedIn: null, authMethod: null, possiblyPaid: false };
}

export function emptySnapshot(id: ToolId, reason: string): ToolSnapshot {
  return { id, installed: false, version: null, loggedIn: null, authMethod: null, possiblyPaid: false, executable: false, reason };
}

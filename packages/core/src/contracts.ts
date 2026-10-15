import { z } from "zod";
import { AGENT_IDS } from "./types.ts";

/**
 * Contratos das respostas da API (F3). Fonte única dos tipos que o worker devolve e a
 * interface consome. O worker é testado contra estes esquemas (apps/worker/test/contracts.test.ts);
 * a interface valida a resposta só no build de desenvolvimento (o zod não vai para o bundle
 * publicado). Este arquivo NÃO é exportado por `@open-dot/core` de propósito: importe por
 * `@open-dot/core/contracts.ts`, e na interface só com `import type`.
 */

const agentId = z.enum(AGENT_IDS);
const iso = z.string().min(10);

export const ConfiguredSchema = z.object({
  database: z.boolean(),
  google: z.boolean(),
  owner: z.boolean(),
  github: z.boolean(),
  githubApp: z.boolean(),
  vercel: z.boolean(),
  ai: z.boolean(),
  aiPrivate: z.boolean(),
  finnhub: z.boolean(),
  tracking: z.boolean(),
  trackingState: z.enum(["ligado", "sem_chave", "termos", "desligado"]).optional(),
});
export type Configured = z.infer<typeof ConfiguredSchema>;

export const ConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(["gmail", "github", "vercel", "gsc"]),
  status: z.enum(["connected", "reauth_required", "error", "disabled"]),
  accountLabel: z.string().nullable(),
  scopes: z.array(z.string()),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const RoutineSchema = z.object({
  id: z.string(),
  agentId,
  kind: z.string(),
  times: z.array(z.string()),
  timeZone: z.string(),
  weekdays: z.array(z.number().int()),
  enabled: z.boolean(),
  nextRunAt: z.string().nullable(),
});
export type Routine = z.infer<typeof RoutineSchema>;

export const RunInfoSchema = z.object({
  id: z.string(),
  agentId,
  kind: z.string(),
  state: z.string(),
  scheduledAt: z.string().nullable(),
  late: z.boolean(),
  attempt: z.number().int(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  updatedAt: iso,
});
export type RunInfo = z.infer<typeof RunInfoSchema>;

export const UsageSchema = z.object({
  day: z.string(),
  calls: z.number(),
  tokens: z.number(),
  limits: z.object({ calls: z.number(), tokens: z.number() }),
  aiConfigured: z.boolean(),
  privateAllowed: z.boolean(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const MonitorSchema = z.object({
  id: z.string(),
  url: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  incident: z.object({ open: z.boolean().optional(), consecutiveFailures: z.number().optional(), kind: z.enum(["slow", "down"]).optional() }).passthrough(),
  lastCheckAt: z.string().nullable(),
});
export type Monitor = z.infer<typeof MonitorSchema>;

export const AskAnswerSchema = z.object({
  answer: z.string(),
  sources: z.array(z.object({ id: z.string(), title: z.string(), detail: z.string(), href: z.string().nullable(), at: z.string() })),
  aiUsed: z.boolean(),
  note: z.string().nullable(),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

export const SessionViewSchema = z.object({ id: z.string(), device: z.string(), createdAt: iso, expiresAt: iso, current: z.boolean() });
export type SessionView = z.infer<typeof SessionViewSchema>;

export const OwnerSchema = z.object({ email: z.string(), name: z.string().nullable(), timeZone: z.string() });

export const SessionResponseSchema = z.union([
  z.object({ authenticated: z.literal(true), owner: OwnerSchema.nullable() }),
  z.object({ authenticated: z.literal(false), devLoginAvailable: z.boolean(), googleLoginAvailable: z.boolean() }),
]);

export const FeedEntrySchema = z.object({
  id: z.string(),
  agentId,
  runId: z.string().nullable(),
  kind: z.enum(["email_digest", "site_incident", "ci_failure", "deploy", "notice", "file_organized", "news_digest", "quote_alert", "marketing_ideas", "shipment"]),
  title: z.string(),
  state: z.enum(["open", "done", "snoozed"]).optional(),
  body: z.record(z.unknown()),
  freshness: z.enum(["fresh", "stale", "partial"]),
  coverage: z.object({ analyzed: z.number(), available: z.number().nullable(), syncedUntil: z.string().nullable(), fieldsRead: z.array(z.string()), partial: z.boolean() }).passthrough().nullable(),
  createdAt: iso,
});

export const FeedPageSchema = z.object({ items: z.array(FeedEntrySchema), next: z.string().nullable() });

export const ApprovalViewSchema = z.object({
  id: z.string(),
  action: z.string(),
  payloadHash: z.string().length(64),
  status: z.string(),
  version: z.number().int(),
  expiresAt: iso,
  createdAt: iso,
  proposal: z.object({ action: z.string(), service: z.string(), account: z.string(), resource: z.string(), payload: z.record(z.unknown()), consequence: z.string() }).nullable(),
});

export const StatusAgentSchema = z.object({ agentId, semantic: z.string(), revision: z.number(), reason: z.string().nullable() }).passthrough();

export const SnapshotResponseSchema = z.object({
  owner: OwnerSchema.nullable(),
  feed: FeedPageSchema.nullable(),
  connections: z.object({ configured: ConfiguredSchema, connections: z.array(ConnectionSchema), agents: z.array(z.object({ id: z.string() }).passthrough()), providers: z.array(z.unknown()) }).nullable(),
  routines: z.object({ routines: z.array(RoutineSchema) }).nullable(),
  runs: z.object({ runs: z.array(RunInfoSchema) }).nullable(),
  usage: UsageSchema.nullable(),
  monitors: z.object({ monitors: z.array(MonitorSchema) }).nullable(),
  status: z.object({ agents: z.array(StatusAgentSchema) }).nullable(),
  approvals: z.object({ approvals: z.array(ApprovalViewSchema), canSend: z.boolean() }).nullable(),
  shipments: z.object({ shipments: z.array(z.unknown()), tracking: z.object({ enabled: z.boolean() }).passthrough() }).passthrough().nullable(),
  failures: z.array(z.object({ part: z.string(), reason: z.string() })),
});

export const ProblemSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), reason: z.string().optional() }) });

/** Mapa rota → esquema usado pela validação de desenvolvimento no cliente. */
export const RESPONSE_CONTRACTS: Array<{ pattern: RegExp; schema: z.ZodTypeAny }> = [
  { pattern: /^\/api\/snapshot$/, schema: SnapshotResponseSchema },
  { pattern: /^\/api\/session$/, schema: SessionResponseSchema },
  { pattern: /^\/api\/feed(\?.*)?$/, schema: FeedPageSchema },
  { pattern: /^\/api\/ask$/, schema: AskAnswerSchema },
  { pattern: /^\/api\/sessions$/, schema: z.object({ sessions: z.array(SessionViewSchema) }) },
];

/** Confere uma resposta; devolve a lista de problemas (vazia se bate). */
export function checkContract(path: string, data: unknown): string[] {
  const c = RESPONSE_CONTRACTS.find((x) => x.pattern.test(path));
  if (!c) return [];
  const r = c.schema.safeParse(data);
  return r.success ? [] : r.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
}

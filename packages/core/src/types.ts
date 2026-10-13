/**
 * Contratos compartilhados entre interface, worker e conectores.
 * Nada aqui depende de rede, banco ou navegador.
 */

export const AGENT_IDS = ["dot", "correio", "codigo", "sentinela", "social", "foco"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** Estados persistidos de uma execução (capítulo 13 do PDF). */
export const RUN_STATES = [
  "queued",
  "running",
  "waiting_approval",
  "waiting_quota",
  "retry_scheduled",
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
] as const;
export type RunState = (typeof RUN_STATES)[number];

export const TERMINAL_RUN_STATES: ReadonlySet<RunState> = new Set(["succeeded", "failed", "cancelled"]);

/** Classe de sensibilidade de um dado — decide para qual provedor de IA ele pode ir. */
export type DataClass = "public" | "personal" | "private_email" | "private_code" | "secret";

export type EvidenceSource = "gmail" | "github" | "vercel" | "http" | "demo";

/** Cobertura: quanto da fonte foi efetivamente lido. */
export interface Coverage {
  /** Itens analisados nesta execução. */
  analyzed: number;
  /** Itens disponíveis na janela consultada (quando conhecido). */
  available: number | null;
  /** Até onde a sincronização chegou (ISO). */
  syncedUntil: string | null;
  /** Campos realmente lidos (ex.: "remetente", "assunto", "trecho"). */
  fieldsRead: string[];
  partial: boolean;
  partialReason?: string;
}

export interface Evidence {
  id: string;
  ownerId: string;
  source: EvidenceSource;
  externalId: string;
  /** Construída pelo conector a partir de IDs — nunca aceita do modelo. */
  sourceUrl: string | null;
  title: string;
  excerpt: string | null;
  observedAt: string;
  fetchedAt: string;
  contentHash: string;
  sensitivity: DataClass;
}

export type Freshness = "fresh" | "stale" | "partial";

export interface FeedAction {
  kind: "open_source" | "prepare_reply" | "open_agent" | "review_group" | "reconnect";
  label: string;
  /** URL só quando construída por código confiável. */
  href?: string;
}

export interface FeedItem {
  id: string;
  ownerId: string;
  agentId: AgentId;
  runId: string | null;
  kind: "email_digest" | "site_incident" | "ci_failure" | "deploy" | "notice";
  title: string;
  /** Por que importa, em uma frase. */
  summary: string;
  freshness: Freshness;
  coverage: Coverage | null;
  evidenceIds: string[];
  actions: FeedAction[];
  createdAt: string;
  /** true quando gerado por dados de demonstração. */
  demo: boolean;
}

export type ConnectionStatus = "not_connected" | "connected" | "reauth_required" | "error" | "disabled";

export interface ConnectionSummary {
  id: string;
  provider: "gmail" | "github" | "vercel" | "http";
  status: ConnectionStatus;
  accountLabel: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastError: string | null;
}

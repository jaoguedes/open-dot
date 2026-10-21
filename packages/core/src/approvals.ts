// SPDX-License-Identifier: AGPL-3.0-only
import { canonicalJson, sha256Hex } from "./util.ts";

/**
 * Aprovação vinculada ao conteúdo exato (capítulo 05).
 * Mudar texto, destinatário ou recurso muda o hash e invalida a aprovação.
 * A decisão usa compare-and-set de versão: duas confirmações concorrentes geram um único efeito.
 */

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed" | "invalidated";

export interface ActionProposal {
  /** Ex.: "gmail.send", "github.issue.create". */
  action: string;
  service: string;
  account: string;
  resource: string;
  /** Conteúdo completo que será executado. */
  payload: Record<string, unknown>;
  /** Consequência explicada ao usuário. */
  consequence: string;
}

export interface Approval {
  id: string;
  ownerId: string;
  proposal: ActionProposal;
  payloadHash: string;
  status: ApprovalStatus;
  version: number;
  expiresAt: number;
  createdAt: number;
  decidedAt: number | null;
}

export async function hashProposal(p: ActionProposal): Promise<string> {
  return sha256Hex(canonicalJson({ action: p.action, service: p.service, account: p.account, resource: p.resource, payload: p.payload }));
}

export type DecisionResult = { ok: true; approval: Approval } | { ok: false; reason: "stale_version" | "not_pending" | "expired" | "hash_mismatch" | "wrong_owner" };

/** Decisão pura (o banco aplica a mesma regra com UPDATE condicional). */
export async function decide(a: Approval, input: { ownerId: string; decision: "approve" | "reject"; expectedVersion: number; payloadHash: string; now: number }): Promise<DecisionResult> {
  if (a.ownerId !== input.ownerId) return { ok: false, reason: "wrong_owner" };
  if (a.version !== input.expectedVersion) return { ok: false, reason: "stale_version" };
  if (a.status !== "pending") return { ok: false, reason: "not_pending" };
  if (input.now >= a.expiresAt) return { ok: false, reason: "expired" };
  if (input.payloadHash !== a.payloadHash) return { ok: false, reason: "hash_mismatch" };
  return {
    ok: true,
    approval: { ...a, status: input.decision === "approve" ? "approved" : "rejected", version: a.version + 1, decidedAt: input.now },
  };
}

/** Gmail continua só leitura: aprovar registra a decisão, não envia. */
export const GMAIL_CAN_SEND = false;

/** Antes de executar: o payload atual ainda é exatamente o aprovado? */
export async function stillMatches(a: Approval, current: ActionProposal): Promise<boolean> {
  return a.status === "approved" && (await hashProposal(current)) === a.payloadHash;
}

// ------------------------------------------------------------------ Fila (E2)

export interface QueueItem {
  id: string;
  status: string;
  payloadHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ApprovalQueue<T extends QueueItem> {
  /** Ordem de chegada, sem duplicatas nem vencidas; no máximo `max`. */
  visible: T[];
  /** Quantas pendentes ficaram fora dos `max` visíveis ("mais N"). */
  more: number;
  total: number;
}

/**
 * Uma aprovação por vez, em ordem de chegada. Só pendentes e não vencidas. A mesma
 * proposta (mesmo hash) pedida duas vezes aparece uma vez (a mais antiga).
 */
export function approvalQueue<T extends QueueItem>(items: readonly T[], now: number, max = 5): ApprovalQueue<T> {
  const seen = new Set<string>();
  const live = items
    .filter((a) => a.status === "pending" && Date.parse(a.expiresAt) > now)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .filter((a) => (seen.has(a.payloadHash) ? false : (seen.add(a.payloadHash), true)));
  return { visible: live.slice(0, max), more: Math.max(0, live.length - max), total: live.length };
}

/** "1 de N" para a aprovação aberta; null se ela não está na fila. */
export function queuePosition(queue: ApprovalQueue<QueueItem>, id: string): { index: number; label: string; next: string | null } | null {
  const i = queue.visible.findIndex((a) => a.id === id);
  if (i < 0) return null;
  return { index: i, label: `${i + 1} de ${queue.total}`, next: queue.visible[i + 1]?.id ?? null };
}

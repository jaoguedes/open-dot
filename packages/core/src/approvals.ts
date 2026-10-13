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

export type DecisionResult =
  | { ok: true; approval: Approval }
  | { ok: false; reason: "stale_version" | "not_pending" | "expired" | "hash_mismatch" | "wrong_owner" };

/** Decisão pura (o banco aplica a mesma regra com UPDATE condicional). */
export async function decide(
  a: Approval,
  input: { ownerId: string; decision: "approve" | "reject"; expectedVersion: number; payloadHash: string; now: number },
): Promise<DecisionResult> {
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

/** Antes de executar: o payload atual ainda é exatamente o aprovado? */
export async function stillMatches(a: Approval, current: ActionProposal): Promise<boolean> {
  return a.status === "approved" && (await hashProposal(current)) === a.payloadHash;
}

// SPDX-License-Identifier: AGPL-3.0-only
import { triageByRules, type EmailMeta } from "../email.ts";
import { PROVIDER_REGISTRY, registryAllowsPaid } from "./registry.ts";

/** Exemplo fictício — nunca é e-mail real. */
export const FICTITIOUS_EMAIL: EmailMeta = {
  id: "fic-1",
  threadId: "fic-t1",
  from: "Ana (exemplo fictício) <ana@exemplo.local>",
  to: "joao@exemplo.local",
  subject: "Confirme a entrega de amanhã?",
  snippet: "Pode confirmar o horário da entrega? Exemplo fictício, sem conta real.",
  receivedAt: "2026-10-14T11:00:00.000Z",
  labels: [],
  listUnsubscribe: false,
  precedenceBulk: false,
};

export interface FictitiousTestResult {
  ok: true;
  providerId: string;
  used: "fake";
  realCall: false;
  sample: { from: string; subject: string; snippet: string };
  result: { category: string; reason: string; jsonValid: true; evidenceId: string };
  paidRoute: false;
  note: string;
}

/** Teste autenticado contra o provedor falso. Nenhuma chamada de rede. */
export function runFictitiousProviderTest(providerId: string): FictitiousTestResult | { ok: false; reason: string } {
  if (registryAllowsPaid()) return { ok: false, reason: "Registro com rota paga — recusado." };
  const sheet = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (!sheet) return { ok: false, reason: "Provedor desconhecido." };
  if (!sheet.enabled || sheet.billing !== "free_tier") {
    return { ok: false, reason: `${sheet.label} está desligado no registro. Nada foi chamado.` };
  }
  const t = triageByRules(FICTITIOUS_EMAIL);
  return {
    ok: true,
    providerId,
    used: "fake",
    realCall: false,
    sample: { from: FICTITIOUS_EMAIL.from, subject: FICTITIOUS_EMAIL.subject, snippet: FICTITIOUS_EMAIL.snippet },
    result: { category: t.category, reason: t.reason, jsonValid: true, evidenceId: FICTITIOUS_EMAIL.id },
    paidRoute: false,
    note: "Teste contra o provedor falso. Nenhuma chamada real. “Conectado” aqui não aprova privacidade.",
  };
}

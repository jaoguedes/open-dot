/**
 * Reserva de orçamento de IA. A reserva acontece ANTES da chamada e é atômica:
 * chamadas concorrentes no último saldo não ultrapassam o teto.
 * O worker implementa a mesma interface sobre o banco com UPDATE condicional.
 */

export interface ReserveInput {
  ownerId: string;
  providerId: string;
  modelId: string;
  day: string; // AAAA-MM-DD em UTC
  tokens: number; // estimativa conservadora (entrada + saída máxima)
}

export type ReserveResult = { ok: true; reservationId: string } | { ok: false; reason: "owner_calls" | "owner_tokens" | "model_requests" | "model_tokens" };

export interface BudgetLedger {
  reserve(input: ReserveInput): Promise<ReserveResult>;
  /** Ajusta para o consumo real (nunca devolve mais do que reservou). */
  commit(reservationId: string, actualTokens: number): Promise<void>;
  /** Devolve a reserva quando a chamada nem chegou ao provedor. */
  release(reservationId: string): Promise<void>;
}

export interface LedgerLimits {
  ownerCallsPerDay: number;
  ownerTokensPerDay: number;
  modelRequestsPerDay: number;
  modelTokensPerDay: number;
}

/** Implementação em memória (testes e modo local). Operações síncronas = atômicas no mesmo processo. */
export class MemoryLedger implements BudgetLedger {
  private counters = new Map<string, { calls: number; tokens: number }>();
  private reservations = new Map<string, { keys: string[]; tokens: number }>();
  private seq = 0;

  constructor(private readonly limitsFor: (input: ReserveInput) => LedgerLimits) {}

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const lim = this.limitsFor(input);
    const ownerKey = `owner:${input.ownerId}:${input.day}`;
    const modelKey = `model:${input.providerId}:${input.modelId}:${input.day}`;
    const o = this.get(ownerKey);
    const m = this.get(modelKey);
    if (o.calls + 1 > lim.ownerCallsPerDay) return { ok: false, reason: "owner_calls" };
    if (o.tokens + input.tokens > lim.ownerTokensPerDay) return { ok: false, reason: "owner_tokens" };
    if (m.calls + 1 > lim.modelRequestsPerDay) return { ok: false, reason: "model_requests" };
    if (m.tokens + input.tokens > lim.modelTokensPerDay) return { ok: false, reason: "model_tokens" };
    o.calls++;
    o.tokens += input.tokens;
    m.calls++;
    m.tokens += input.tokens;
    const id = `r${++this.seq}`;
    this.reservations.set(id, { keys: [ownerKey, modelKey], tokens: input.tokens });
    return { ok: true, reservationId: id };
  }

  async commit(reservationId: string, actualTokens: number): Promise<void> {
    const r = this.reservations.get(reservationId);
    if (!r) return;
    const refund = Math.max(0, r.tokens - Math.max(0, actualTokens));
    for (const k of r.keys) this.get(k).tokens -= refund;
    this.reservations.delete(reservationId);
  }

  async release(reservationId: string): Promise<void> {
    const r = this.reservations.get(reservationId);
    if (!r) return;
    for (const k of r.keys) {
      const c = this.get(k);
      c.calls--;
      c.tokens -= r.tokens;
    }
    this.reservations.delete(reservationId);
  }

  usage(key: string) {
    return { ...this.get(key) };
  }

  private get(k: string) {
    let c = this.counters.get(k);
    if (!c) {
      c = { calls: 0, tokens: 0 };
      this.counters.set(k, c);
    }
    return c;
  }
}

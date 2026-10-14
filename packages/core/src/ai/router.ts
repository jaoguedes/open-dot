import type { DataClass } from "../types.ts";
import { parseRetryAfter } from "../util.ts";
import type { BudgetLedger } from "./budget.ts";
import type { Capability, ModelConfig, OwnerLimits, ProviderConfig } from "./config.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiTask {
  ownerId: string;
  kind: string; // ex.: "email_triage"
  capability: Capability;
  dataClass: DataClass;
  messages: ChatMessage[];
  maxOutputTokens: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export type AiOutcome =
  | { status: "ok"; text: string; providerId: string; modelId: string; usage: { prompt: number; completion: number } }
  /** Cota esgotada ou 429: preservar a tarefa e tentar em `retryAt`. */
  | { status: "waiting_quota"; retryAt: number; reason: string }
  /** Nenhum provedor permitido/disponível: degradar para regras. */
  | { status: "unavailable"; reason: string }
  | { status: "cancelled" };

export interface UsageRecord {
  at: number;
  ownerId: string;
  taskKind: string;
  providerId: string;
  modelId: string;
  outcome: "ok" | "rate_limited" | "timeout" | "error" | "auth_error" | "budget_denied";
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  httpStatus: number | null;
}

export interface RouterDeps {
  providers: ProviderConfig[];
  ledger: BudgetLedger;
  limits: OwnerLimits;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now?: () => number;
  /** Registro de consumo sem conteúdo (sem prompt, sem resposta). */
  onUsage?: (u: UsageRecord) => void | Promise<void>;
}

interface BreakerState {
  failures: number;
  openUntil: number;
  disabled: boolean; // 401/403: configuração inválida
}

const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 5 * 60_000;

/** Estimativa conservadora: ~4 caracteres por token + saída máxima. */
export function estimateTokens(messages: ChatMessage[], maxOutput: number): number {
  const chars = messages.reduce((n, m) => n + m.content.length + 8, 0);
  return Math.ceil(chars / 3.5) + maxOutput;
}

export class AiRouter {
  private breakers = new Map<string, BreakerState>();
  private cooldownUntil = new Map<string, number>(); // provider:model -> ts
  private inFlight = new Map<string, number>(); // ownerId -> count
  private readonly now: () => number;

  constructor(private readonly deps: RouterDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Candidatos em ordem: permissão para o dado → capacidade → disponibilidade. */
  candidates(task: Pick<AiTask, "dataClass" | "capability">): Array<{ provider: ProviderConfig; model: ModelConfig }> {
    if (task.dataClass === "secret") return [];
    const out: Array<{ provider: ProviderConfig; model: ModelConfig }> = [];
    for (const provider of this.deps.providers) {
      if (provider.billing !== "free_tier") continue;
      if (!provider.allowedData.includes(task.dataClass)) continue;
      if (!this.deps.env[provider.apiKeyEnv]) continue;
      const br = this.breakers.get(provider.id);
      if (br?.disabled) continue;
      if (br && br.openUntil > this.now()) continue;
      for (const model of provider.models) {
        if (!model.capabilities.includes(task.capability)) continue;
        out.push({ provider, model });
      }
    }
    return out;
  }

  /** Por que não há candidato (para mensagem honesta na interface). */
  explainNoCandidate(task: Pick<AiTask, "dataClass" | "capability">): string {
    if (task.dataClass === "secret") return "Segredos nunca são enviados para IA.";
    const privacyBlocked = this.deps.providers.every((p) => !p.allowedData.includes(task.dataClass));
    if (privacyBlocked) return "Nenhum provedor aprovado para este tipo de dado. Resumo por regras.";
    const noKey = this.deps.providers.every((p) => !this.deps.env[p.apiKeyEnv]);
    if (noKey) return "Nenhuma chave de IA configurada. Resumo por regras.";
    return "Provedores temporariamente indisponíveis.";
  }

  async run(task: AiTask): Promise<AiOutcome> {
    const list = this.candidates(task);
    if (!list.length) return { status: "unavailable", reason: this.explainNoCandidate(task) };

    const active = this.inFlight.get(task.ownerId) ?? 0;
    if (active >= this.deps.limits.maxConcurrent) {
      return { status: "waiting_quota", retryAt: this.now() + 30_000, reason: "limite de concorrência" };
    }
    this.inFlight.set(task.ownerId, active + 1);
    try {
      let attempts = 0;
      let earliestRetry = Infinity;
      let lastReason = "";
      for (const { provider, model } of list) {
        if (attempts >= this.deps.limits.maxAttemptsPerStep) break;
        if (task.signal?.aborted) return { status: "cancelled" };
        const key = `${provider.id}:${model.id}`;
        const cool = this.cooldownUntil.get(key) ?? 0;
        if (cool > this.now()) {
          earliestRetry = Math.min(earliestRetry, cool);
          lastReason = "aguardando Retry-After";
          continue;
        }
        const maxOut = Math.min(task.maxOutputTokens, model.maxOutputTokens);
        const estimate = estimateTokens(task.messages, maxOut);
        if (estimate > model.limits.tpm) {
          lastReason = "tarefa maior que o limite por minuto do modelo";
          continue;
        }
        const day = new Date(this.now()).toISOString().slice(0, 10);
        const reservation = await this.deps.ledger.reserve({ ownerId: task.ownerId, providerId: provider.id, modelId: model.id, day, tokens: estimate });
        if (!reservation.ok) {
          await this.log(task, provider.id, model.id, "budget_denied", 0, 0, 0, null);
          lastReason = `orçamento diário (${reservation.reason})`;
          earliestRetry = Math.min(earliestRetry, nextUtcMidnight(this.now()));
          continue;
        }
        attempts++;
        const started = this.now();
        const res = await this.callOnce(provider, model, task, maxOut);
        const latency = this.now() - started;
        if (res.kind === "ok") {
          await this.deps.ledger.commit(reservation.reservationId, res.prompt + res.completion);
          this.recordSuccess(provider.id);
          await this.log(task, provider.id, model.id, "ok", res.prompt, res.completion, latency, 200);
          return { status: "ok", text: res.text, providerId: provider.id, modelId: model.id, usage: { prompt: res.prompt, completion: res.completion } };
        }
        if (res.kind === "cancelled") {
          // Se chegou a sair para o provedor, pode ter consumido: mantém a reserva (conservador).
          if (res.sent) await this.deps.ledger.commit(reservation.reservationId, estimate);
          else await this.deps.ledger.release(reservation.reservationId);
          return { status: "cancelled" };
        }
        if (res.kind === "rate_limited") {
          await this.deps.ledger.commit(reservation.reservationId, 0); // conta a chamada, devolve tokens
          const until = this.now() + (res.retryAfterMs ?? 60_000);
          this.cooldownUntil.set(key, until);
          earliestRetry = Math.min(earliestRetry, until);
          lastReason = "limite do provedor (429)";
          await this.log(task, provider.id, model.id, "rate_limited", 0, 0, latency, 429);
          continue;
        }
        if (res.kind === "auth_error") {
          await this.deps.ledger.release(reservation.reservationId);
          this.breaker(provider.id).disabled = true;
          lastReason = "chave inválida ou sem permissão";
          await this.log(task, provider.id, model.id, "auth_error", 0, 0, latency, res.status);
          continue;
        }
        if (res.kind === "payment_required") {
          await this.deps.ledger.release(reservation.reservationId);
          this.breaker(provider.id).disabled = true;
          lastReason = "cobrança recusada (402): rota desligada";
          await this.log(task, provider.id, model.id, "auth_error", 0, 0, latency, 402);
          continue;
        }
        // timeout / erro 5xx / resposta inválida: conta conservadoramente
        await this.deps.ledger.commit(reservation.reservationId, estimate);
        this.recordFailure(provider.id);
        lastReason = res.kind === "timeout" ? "tempo esgotado" : "erro do provedor";
        await this.log(task, provider.id, model.id, res.kind === "timeout" ? "timeout" : "error", 0, 0, latency, res.status ?? null);
      }
      if (Number.isFinite(earliestRetry)) return { status: "waiting_quota", retryAt: earliestRetry, reason: lastReason };
      return { status: "unavailable", reason: lastReason || "sem provedor disponível" };
    } finally {
      this.inFlight.set(task.ownerId, (this.inFlight.get(task.ownerId) ?? 1) - 1);
    }
  }

  private async callOnce(
    provider: ProviderConfig,
    model: ModelConfig,
    task: AiTask,
    maxOut: number,
  ): Promise<
    | { kind: "ok"; text: string; prompt: number; completion: number }
    | { kind: "rate_limited"; retryAfterMs: number | null }
    | { kind: "auth_error"; status: number }
    | { kind: "payment_required"; status: number }
    | { kind: "timeout"; status?: number }
    | { kind: "error"; status?: number }
    | { kind: "cancelled"; sent: boolean }
  > {
    if (task.signal?.aborted) return { kind: "cancelled", sent: false };
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort("cancelled");
    task.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort("timeout"), this.deps.limits.timeoutMs);
    try {
      const resp = await this.deps.fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.deps.env[provider.apiKeyEnv]}` },
        body: JSON.stringify({
          model: model.id,
          messages: task.messages,
          temperature: 0.2,
          ...(provider.id === "groq"
            ? { max_completion_tokens: maxOut, reasoning_effort: "low" }
            : { max_tokens: maxOut }),
          ...(task.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (resp.status === 429) return { kind: "rate_limited", retryAfterMs: parseRetryAfter(resp.headers.get("retry-after"), this.now()) };
      if (resp.status === 401 || resp.status === 403) return { kind: "auth_error", status: resp.status };
      if (resp.status === 402) return { kind: "payment_required", status: resp.status };
      if (!resp.ok) return { kind: "error", status: resp.status };
      const body = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") return { kind: "error", status: resp.status };
      return { kind: "ok", text, prompt: body.usage?.prompt_tokens ?? 0, completion: body.usage?.completion_tokens ?? 0 };
    } catch (err) {
      if (ctrl.signal.aborted) return ctrl.signal.reason === "cancelled" ? { kind: "cancelled", sent: true } : { kind: "timeout" };
      void err;
      return { kind: "error" };
    } finally {
      clearTimeout(timer);
      task.signal?.removeEventListener("abort", onAbort);
    }
  }

  private breaker(id: string): BreakerState {
    let b = this.breakers.get(id);
    if (!b) {
      b = { failures: 0, openUntil: 0, disabled: false };
      this.breakers.set(id, b);
    }
    return b;
  }

  private recordFailure(id: string) {
    const b = this.breaker(id);
    b.failures++;
    if (b.failures >= BREAKER_THRESHOLD) {
      b.openUntil = this.now() + BREAKER_OPEN_MS;
      b.failures = 0;
    }
  }

  private recordSuccess(id: string) {
    const b = this.breaker(id);
    b.failures = 0;
    b.openUntil = 0;
  }

  breakerState(id: string): Readonly<BreakerState> | undefined {
    return this.breakers.get(id);
  }

  private async log(task: AiTask, providerId: string, modelId: string, outcome: UsageRecord["outcome"], p: number, c: number, latencyMs: number, httpStatus: number | null) {
    await this.deps.onUsage?.({ at: this.now(), ownerId: task.ownerId, taskKind: task.kind, providerId, modelId, outcome, promptTokens: p, completionTokens: c, latencyMs, httpStatus });
  }
}

function nextUtcMidnight(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

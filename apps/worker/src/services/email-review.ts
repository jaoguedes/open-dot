import {
  AiRouter,
  DEFAULT_RULES,
  UNTRUSTED_SYSTEM_RULES,
  buildDigest,
  defaultProviders,
  localParts,
  parseAiTriage,
  renderUntrusted,
  sanitizeUntrusted,
  triageByRules,
  validateProviders,
  type Triage,
} from "@open-dot/core";
import { messageLink } from "@open-dot/connectors/gmail.ts";
import type { Ctx } from "../context.ts";
import * as repo from "../repo.ts";

export interface ReviewResult {
  state: "succeeded" | "failed" | "retry_scheduled";
  errorCode?: string;
  message?: string;
  feedId?: string | null;
  nextAttemptAt?: number;
}

export function makeRouter(ctx: Ctx, fetchImpl: typeof fetch): AiRouter {
  const raw: Record<string, string | undefined> = Object.fromEntries(Object.entries(ctx.env).map(([k, v]) => [k, v === undefined ? undefined : String(v)]));
  const { ok } = validateProviders(defaultProviders(raw));
  const ledger = new repo.DbLedger(
    ctx.db,
    {
      ownerCalls: ctx.env.AI_CALLS_PER_DAY,
      ownerTokens: ctx.env.AI_TOKENS_PER_DAY,
      modelRequests: (mk) => ok.flatMap((p) => p.models.map((m) => [`${p.id}:${m.id}`, m.limits.rpd] as const)).find(([k]) => k === mk)?.[1] ?? 0,
      modelTokens: (mk) => ok.flatMap((p) => p.models.map((m) => [`${p.id}:${m.id}`, m.limits.tpd] as const)).find(([k]) => k === mk)?.[1] ?? 0,
    },
    ctx.now,
  );
  return new AiRouter({
    providers: ok,
    ledger,
    limits: { callsPerDay: ctx.env.AI_CALLS_PER_DAY, tokensPerDay: ctx.env.AI_TOKENS_PER_DAY, maxConcurrent: 1, maxAttemptsPerStep: 2, timeoutMs: 25_000 },
    env: raw,
    fetch: fetchImpl,
    now: ctx.now,
    onUsage: (u) => repo.recordUsage(ctx.db, u),
  });
}

export async function runEmailReview(ctx: Ctx, run: repo.RunRow, fetchImpl: typeof fetch): Promise<ReviewResult> {
  const conns = (await repo.listConnections(ctx.db, run.owner_id)).filter((c) => c.provider === "gmail" && c.status !== "disabled");
  if (!conns.length) return { state: "failed", errorCode: "not_connected", message: "Gmail não conectado." };
  const reauth = conns.find((c) => c.status === "reauth_required");
  const owner = await repo.getOwner(ctx.db, run.owner_id);
  const tz = owner?.time_zone ?? "America/Sao_Paulo";

  const messages = await repo.untriagedMessages(ctx.db, ctx.keys, run.owner_id, 40);
  const pendingLeft = await repo.countPending(ctx.db, run.owner_id);
  const syncedUntil = conns.map((c) => c.last_sync_at).filter(Boolean).sort().at(-1) ?? null;

  // 1) Regras determinísticas (sempre).
  const byRules = new Map<string, Triage>(messages.map((m) => [m.id, triageByRules(m, DEFAULT_RULES)]));
  let aiUsed = false;
  let aiNote: string | null = null;

  // 2) IA opcional, só se houver provedor aprovado para e-mail privado.
  if (messages.length) {
    const router = makeRouter(ctx, fetchImpl);
    const blocks = messages.map((m) => sanitizeUntrusted(m.id, `De: ${m.from}\nAssunto: ${m.subject}\nTrecho: ${m.snippet}`, 600));
    const out = await router.run({
      ownerId: run.owner_id,
      kind: "email_triage",
      capability: "classify",
      dataClass: "private_email",
      jsonMode: true,
      maxOutputTokens: 900,
      messages: [
        {
          role: "system",
          content: `${UNTRUSTED_SYSTEM_RULES}\nClassifique cada mensagem como important, review ou low. Responda JSON {"items":[{"id":"...","category":"...","reason":"frase curta em português"}]}. Use apenas os ids fornecidos.`,
        },
        { role: "user", content: renderUntrusted(blocks) },
      ],
    });
    if (out.status === "ok") {
      const parsed = parseAiTriage(out.text, new Set(messages.map((m) => m.id)));
      for (const t of parsed.ok) byRules.set(t.messageId, t);
      aiUsed = parsed.ok.length > 0;
      aiNote = parsed.rejected ? `${parsed.rejected} classificações da IA foram descartadas por não citarem uma mensagem válida.` : null;
    } else if (out.status === "waiting_quota") {
      aiNote = `Resumo por regras: IA sem cota agora (${out.reason}).`;
    } else if (out.status === "unavailable") {
      aiNote = `Resumo por regras. ${out.reason}`;
    }
  }

  const slotLabel = run.scheduled_at && run.slot_key && !run.slot_key.includes(":manual:") ? `${String(localParts(Date.parse(run.scheduled_at), tz).hour).padStart(2, "0")}h` : "agora";
  const digest = buildDigest({
    slotLabel,
    messages,
    triage: [...byRules.values()],
    syncedUntil,
    available: messages.length + pendingLeft,
    ...(reauth ? { partialReason: "Gmail precisa ser reconectado; mostrando apenas o que já tinha sido sincronizado." } : pendingLeft ? { partialReason: `${pendingLeft} mensagens ainda sendo baixadas.` } : {}),
    aiUsed,
    aiNote,
  });

  const accountFor = new Map(conns.map((c) => [c.id, c.account_label ?? ""]));
  const link = (messageId: string, threadId: string) => {
    const m = messages.find((x) => x.id === messageId);
    return messageLink(accountFor.get(m?.connectionId ?? "") ?? "", threadId);
  };
  const body = {
    headline: digest.headline,
    counts: digest.counts,
    total: digest.total,
    late: run.late === 1,
    top: digest.top.map((i) => ({ ...i, href: link(i.messageId, i.threadId) })),
    rest: digest.rest.map((i) => ({ ...i, href: link(i.messageId, i.threadId) })),
    aiUsed: digest.aiUsed,
    aiNote: digest.aiNote,
    actions: [{ kind: "open_source", label: "Abrir e-mail" }],
  };
  const feedId = await repo.insertFeed(ctx.db, ctx.keys, {
    ownerId: run.owner_id,
    agentId: "correio",
    runId: run.id,
    kind: "email_digest",
    title: run.late === 1 ? `${digest.title} (atrasada)` : digest.title,
    body,
    freshness: digest.coverage.partial ? "partial" : "fresh",
    coverage: digest.coverage,
    now: ctx.now(),
    markMessages: { runId: run.id, ids: messages.map((m) => m.id) },
  });
  await repo.audit(ctx.db, { ownerId: run.owner_id, actor: "routine", action: "email_review", target: run.id, outcome: "published", detail: `total=${digest.total} ai=${aiUsed}`, now: ctx.now() });
  return { state: "succeeded", feedId };
}

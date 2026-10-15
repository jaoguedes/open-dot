import {
  AiRouter,
  UNTRUSTED_SYSTEM_RULES,
  buildCorreioResumo,
  correioForModel,
  defaultProviders,
  localParts,
  parseCorreioAi,
  renderUntrusted,
  sanitizeUntrusted,
  validateProviders,
} from "@open-dot/core";
import { gmailWebHref } from "@open-dot/connectors/gmail.ts";
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

  let aiUsed = false;
  let aiNote: string | null = "Aviso por regras. A IA privada não entrou nesta revisão.";
  let resumo = buildCorreioResumo(messages);

  if (messages.length) {
    const router = makeRouter(ctx, fetchImpl);
    const blocks = messages.map((m) => sanitizeUntrusted(m.id, correioForModel(m), 500));
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
          content: `${UNTRUSTED_SYSTEM_RULES}\nDevolva só JSON {abertura, itens:[{categoria, titulo, quando, o_que_aconteceu, o_que_fazer, origem, sensivel}], sem_acao:[], ruido:{contagem}}. categoria: seguranca|pagamento|prazo|encomenda|resposta|outro. o_que_fazer começa com Confira, Pague, Veja, Responda, Acompanhe, Abra ou Guarde. Não invente código, link, número ou fato ausente do texto.`,
        },
        { role: "user", content: renderUntrusted(blocks) },
      ],
    });
    if (out.status === "ok") {
      const parsed = parseCorreioAi(out.text, new Set(messages.map((m) => m.id)));
      if (parsed) {
        resumo = parsed;
        aiUsed = true;
        aiNote = null;
      } else aiNote = "A IA respondeu fora do formato. Usei as regras.";
    } else if (out.status === "waiting_quota") aiNote = "Aviso por regras. A cota de IA acabou.";
    else aiNote = "Aviso por regras. A IA privada não está disponível.";
  }

  const slotLabel = run.scheduled_at && run.slot_key && !run.slot_key.includes(":manual:") ? `${String(localParts(Date.parse(run.scheduled_at), tz).hour).padStart(2, "0")}h` : "agora";
  const nome = (from: string) => {
    const n = from.split("<")[0]?.trim().replace(/^"|"$/g, "") ?? "";
    return !n || n.includes("@") ? "Remetente" : n.slice(0, 80);
  };
  const body = {
    abertura: resumo.abertura,
    itens: resumo.itens.map((i) => {
      const m = messages.find((x) => x.id === i.origem);
      return { ...i, de: m ? nome(m.from) : "Remetente", href: gmailWebHref(i.origem, i.rfc822 ?? m?.rfc822Id) };
    }),
    sem_acao: resumo.sem_acao,
    ruido: resumo.ruido,
    anexos: resumo.anexos,
    headline: resumo.abertura,
    total: messages.length,
    late: run.late === 1,
    aiUsed,
    aiNote,
    counts: { important: resumo.itens.length, review: resumo.sem_acao.length, low: resumo.ruido.contagem },
  };
  const partial = Boolean(reauth) || pendingLeft > 0;
  const feedId = await repo.insertFeed(ctx.db, ctx.keys, {
    ownerId: run.owner_id,
    agentId: "correio",
    runId: run.id,
    kind: "email_digest",
    title: `Sua revisão das ${slotLabel}${run.late === 1 ? " (atrasada)" : ""}`,
    body,
    freshness: partial ? "partial" : "fresh",
    coverage: {
      analyzed: messages.length,
      available: messages.length + pendingLeft,
      syncedUntil,
      fieldsRead: ["remetente", "assunto", "trecho curto"],
      partial,
      ...(partial ? { partialReason: reauth ? "Gmail precisa ser reconectado." : `${pendingLeft} mensagens ainda sendo baixadas.` } : {}),
    },
    now: ctx.now(),
    markMessages: { runId: run.id, ids: messages.map((m) => m.id) },
  });
  await repo.audit(ctx.db, { ownerId: run.owner_id, actor: "routine", action: "email_review", target: run.id, outcome: "published", detail: `itens=${resumo.itens.length} ai=${aiUsed}`, now: ctx.now() });
  return { state: "succeeded", feedId };
}

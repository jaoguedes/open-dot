import { ConnectorError } from "@open-dot/connectors/errors.ts";
import { refreshAccess } from "@open-dot/connectors/google.ts";
import { getMetadata, getProfile, listHistory, listRecentIds } from "@open-dot/connectors/gmail.ts";
import type { Ctx } from "../context.ts";
import { BudgetExhausted } from "../context.ts";
import * as repo from "../repo.ts";
import { scrubSecrets } from "../reasons.ts";

/**
 * Sincronização incremental do Gmail (somente leitura).
 * - Primeira vez: janela limitada; cursor = historyId lido ANTES da listagem (não perde mensagens).
 * - Depois: history.list paginado; o cursor só avança depois que todos os IDs viraram pendências no banco.
 * - 404 no history: ressincroniza a janela e marca cobertura parcial.
 * - Metadados são buscados aos poucos (limite de subrequisições do Worker gratuito).
 */

export interface SyncReport {
  connectionId: string;
  discovered: number;
  fetched: number;
  pendingLeft: number;
  resynced: boolean;
  error: string | null;
  status: "ok" | "reauth_required" | "rate_limited" | "error";
}

const INITIAL_QUERY = "in:inbox newer_than:2d";
const INITIAL_MAX = 20;
const MAX_HISTORY_PAGES = 3;

export async function accessToken(ctx: Ctx, conn: repo.ConnectionRow, fetchImpl: typeof fetch): Promise<string> {
  const tokens = await repo.readSecret(ctx.db, ctx.keys, conn.owner_id, conn.id);
  if (!tokens) throw new ConnectorError("reauth_required", "Credencial ausente. Reconecte o Gmail.");
  if (tokens.expiresAt - 60_000 > ctx.now()) return tokens.accessToken;
  if (!tokens.refreshToken) throw new ConnectorError("reauth_required", "Sem refresh token. Reconecte o Gmail.");
  if (!ctx.env.GOOGLE_CLIENT_ID || !ctx.env.GOOGLE_CLIENT_SECRET) throw new ConnectorError("reauth_required", "Cliente OAuth do Google não configurado.");
  // Lease: só uma execução renova por vez.
  if (!(await repo.acquireRefreshLease(ctx.db, conn.id, ctx.now()))) throw new ConnectorError("rate_limited", "Renovação de token em andamento.", 30_000);
  try {
    const fresh = await refreshAccess(fetchImpl, { clientId: ctx.env.GOOGLE_CLIENT_ID, clientSecret: ctx.env.GOOGLE_CLIENT_SECRET, refreshToken: tokens.refreshToken, now: ctx.now() });
    // Google pode devolver novo refresh token; persistir quando vier.
    const next = { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken ?? tokens.refreshToken, expiresAt: fresh.expiresAt };
    await repo.writeSecret(ctx.db, ctx.keys, conn.owner_id, conn.id, next, ctx.now());
    return next.accessToken;
  } finally {
    await repo.releaseRefreshLease(ctx.db, conn.id);
  }
}

export async function syncGmail(ctx: Ctx, conn: repo.ConnectionRow, fetchImpl: typeof fetch, maxFetch = 15): Promise<SyncReport> {
  const report: SyncReport = { connectionId: conn.id, discovered: 0, fetched: 0, pendingLeft: 0, resynced: false, error: null, status: "ok" };
  try {
    const token = await accessToken(ctx, conn, fetchImpl);
    if (!conn.cursor) {
      const profile = await getProfile(fetchImpl, token, ctx.now());
      const recent = await listRecentIds(fetchImpl, token, { query: INITIAL_QUERY, max: INITIAL_MAX, now: ctx.now() });
      await repo.addPending(ctx.db, conn.owner_id, conn.id, recent.ids, ctx.now());
      await repo.setCursor(ctx.db, conn.owner_id, conn.id, profile.historyId, ctx.now());
      report.discovered = recent.ids.length;
    } else {
      let pageToken: string | null = null;
      let newCursor: string | null = null;
      const collected: Array<{ id: string; threadId: string }> = [];
      try {
        for (let i = 0; i < MAX_HISTORY_PAGES; i++) {
          const page = await listHistory(fetchImpl, token, { startHistoryId: conn.cursor, pageToken, now: ctx.now() });
          collected.push(...page.added);
          newCursor = page.historyId;
          pageToken = page.nextPageToken;
          if (!pageToken) break;
        }
      } catch (e) {
        if (e instanceof ConnectorError && e.code === "cursor_expired") {
          const profile = await getProfile(fetchImpl, token, ctx.now());
          const recent = await listRecentIds(fetchImpl, token, { query: INITIAL_QUERY, max: INITIAL_MAX, now: ctx.now() });
          collected.push(...recent.ids);
          newCursor = profile.historyId;
          pageToken = null;
          report.resynced = true;
        } else throw e;
      }
      await repo.addPending(ctx.db, conn.owner_id, conn.id, collected, ctx.now());
      // Só avança se terminou todas as páginas; senão continua do mesmo cursor no próximo tique (dedupe protege).
      if (newCursor && !pageToken) await repo.setCursor(ctx.db, conn.owner_id, conn.id, newCursor, ctx.now());
      else await repo.touchSync(ctx.db, conn.owner_id, conn.id, ctx.now());
      report.discovered = collected.length;
    }
    const pending = await repo.pendingIds(ctx.db, conn.owner_id, conn.id, maxFetch);
    const got: import("@open-dot/core").EmailMeta[] = [];
    const drops: string[] = [];
    let stopped: unknown = null;
    for (const p of pending) {
      try {
        got.push(await getMetadata(fetchImpl, token, p.message_id, ctx.now()));
        report.fetched++;
      } catch (e) {
        if (e instanceof ConnectorError && e.code === "not_found") drops.push(p.message_id);
        else if (e instanceof BudgetExhausted) break;
        else {
          await repo.bumpPending(ctx.db, conn.owner_id, conn.id, p.message_id);
          stopped = e;
          break;
        }
      }
    }
    if (got.length) await repo.storeMessages(ctx.db, ctx.keys, got.map((m) => ({ ownerId: conn.owner_id, connectionId: conn.id, m, now: ctx.now() })));
    if (drops.length) {
      await ctx.db.batch(drops.map((id) => ({ sql: "DELETE FROM od_email_pending WHERE owner_id = ? AND connection_id = ? AND message_id = ?", args: [conn.owner_id, conn.id, id] })));
    }
    if (stopped) throw stopped;
    report.pendingLeft = await repo.countPending(ctx.db, conn.owner_id);
    return report;
  } catch (e) {
    if (e instanceof BudgetExhausted) {
      report.pendingLeft = await repo.countPending(ctx.db, conn.owner_id);
      return report;
    }
    if (e instanceof ConnectorError) {
      report.error = scrubSecrets(e.message);
      if (e.code === "reauth_required" || e.code === "forbidden_scope") {
        report.status = "reauth_required";
        // Uma notificação de reconexão; o sync para até o usuário reconectar.
        if (conn.status !== "reauth_required") {
          await repo.markConnection(ctx.db, conn.owner_id, conn.id, "reauth_required", e.message, ctx.now());
          await repo.insertFeed(ctx.db, ctx.keys, {
            ownerId: conn.owner_id,
            agentId: "correio",
            runId: `reauth:${conn.id}:${conn.version}`,
            kind: "notice",
            title: "Reconecte seu Gmail",
            body: { summary: "O acesso de leitura foi revogado ou expirou. As revisões estão pausadas até você reconectar.", actions: [{ kind: "reconnect", label: "Reconectar Gmail" }] },
            freshness: "stale",
            coverage: null,
            now: ctx.now(),
          });
        }
        return report;
      }
      report.status = e.code === "rate_limited" ? "rate_limited" : "error";
      await repo.markConnection(ctx.db, conn.owner_id, conn.id, "connected", e.message, ctx.now());
      return report;
    }
    report.status = "error";
    report.error = "erro inesperado na sincronização";
    return report;
  }
}

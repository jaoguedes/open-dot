import { randomId, type BudgetLedger, type ReserveInput, type ReserveResult, type UsageRecord } from "@open-dot/core";
import { open, seal, type Keyring } from "./crypto.ts";
import type { Db, SqlValue, Stmt } from "./db/types.ts";

/**
 * Acesso a dados. Toda função de leitura/escrita de dados do usuário recebe ownerId
 * vindo da SESSÃO (ou da instalação/assinatura do webhook) e filtra por ele.
 */

const iso = (ts: number) => new Date(ts).toISOString();

// ---------------- Donos e sessões ----------------

export async function upsertOwner(db: Db, p: { sub: string; email: string; name: string | null; now: number }): Promise<string> {
  const found = await db.query<{ id: string }>("SELECT id FROM od_owners WHERE google_sub = ?", [p.sub]);
  if (found[0]) return found[0].id;
  const id = randomId("own_");
  await db.run("INSERT INTO od_owners (id, google_sub, email, display_name, created_at) VALUES (?, ?, ?, ?, ?)", [id, p.sub, p.email, p.name, iso(p.now)]);
  return id;
}

export async function getOwner(db: Db, ownerId: string) {
  const r = await db.query<{ id: string; email: string; display_name: string | null; name_custom: number; time_zone: string }>("SELECT id, email, display_name, name_custom, time_zone FROM od_owners WHERE id = ?", [ownerId]);
  return r[0] ?? null;
}

export async function createSession(db: Db, p: { ownerId: string; idHash: string; now: number; days: number; userAgent: string | null }) {
  await db.run("INSERT INTO od_sessions (id_hash, owner_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)", [
    p.idHash,
    p.ownerId,
    iso(p.now),
    iso(p.now + p.days * 86_400_000),
    p.userAgent?.slice(0, 200) ?? null,
  ]);
}

export async function sessionOwner(db: Db, idHash: string, now: number): Promise<string | null> {
  const r = await db.query<{ owner_id: string }>("SELECT owner_id FROM od_sessions WHERE id_hash = ? AND expires_at > ?", [idHash, iso(now)]);
  return r[0]?.owner_id ?? null;
}

export async function deleteSession(db: Db, idHash: string) {
  await db.run("DELETE FROM od_sessions WHERE id_hash = ?", [idHash]);
}

// ---------------- OAuth state (uso único) ----------------

export async function saveOAuthState(db: Db, keys: Keyring, p: { stateHash: string; ownerId: string | null; purpose: "login" | "gmail" | "gsc"; verifier: string; nonce: string | null; now: number }) {
  await db.run("INSERT INTO od_oauth_states (state_hash, owner_id, purpose, verifier_enc, nonce, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    p.stateHash,
    p.ownerId,
    p.purpose,
    await seal(keys, p.verifier, `oauth:${p.stateHash}`),
    p.nonce,
    iso(p.now),
    iso(p.now + 10 * 60_000),
  ]);
}

export async function consumeOAuthState(db: Db, keys: Keyring, stateHash: string, now: number) {
  const r = await db.query<{ owner_id: string | null; purpose: "login" | "gmail" | "gsc"; verifier_enc: string; nonce: string | null }>(
    "SELECT owner_id, purpose, verifier_enc, nonce FROM od_oauth_states WHERE state_hash = ? AND expires_at > ?",
    [stateHash, iso(now)],
  );
  const row = r[0];
  if (!row) return null;
  const del = await db.run("DELETE FROM od_oauth_states WHERE state_hash = ?", [stateHash]);
  if (del.changes !== 1) return null; // já consumido em paralelo
  return { ownerId: row.owner_id, purpose: row.purpose, verifier: await open(keys, row.verifier_enc, `oauth:${stateHash}`), nonce: row.nonce };
}

// ---------------- Conexões ----------------

export interface ConnectionRow {
  id: string;
  owner_id: string;
  provider: string;
  status: string;
  account_label: string | null;
  external_id: string | null;
  scopes: string;
  cursor: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  version: number;
  refresh_lease_until: string | null;
}

export async function listConnections(db: Db, ownerId: string): Promise<ConnectionRow[]> {
  return db.query<ConnectionRow>("SELECT * FROM od_connections WHERE owner_id = ? ORDER BY provider", [ownerId]);
}

export async function getConnection(db: Db, ownerId: string, id: string): Promise<ConnectionRow | null> {
  return (await db.query<ConnectionRow>("SELECT * FROM od_connections WHERE owner_id = ? AND id = ?", [ownerId, id]))[0] ?? null;
}

export async function connectionsByProvider(db: Db, provider: string, status = "connected"): Promise<ConnectionRow[]> {
  return db.query<ConnectionRow>("SELECT * FROM od_connections WHERE provider = ? AND status = ?", [provider, status]);
}

export async function upsertGmailConnection(db: Db, keys: Keyring, p: { ownerId: string; email: string; scopes: string[]; tokens: object; now: number }): Promise<string> {
  const existing = (await db.query<{ id: string }>("SELECT id FROM od_connections WHERE owner_id = ? AND provider = 'gmail' AND external_id = ?", [p.ownerId, p.email]))[0];
  const id = existing?.id ?? randomId("con_");
  const secret = await seal(keys, JSON.stringify(p.tokens), `conn:${id}`);
  const now = iso(p.now);
  const stmts = existing
    ? [
        {
          sql: "UPDATE od_connections SET status = 'connected', scopes = ?, last_error = NULL, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ?",
          args: [JSON.stringify(p.scopes), now, id, p.ownerId] as SqlValue[],
        },
      ]
    : [
        {
          sql: "INSERT INTO od_connections (id, owner_id, provider, status, account_label, external_id, scopes, created_at, updated_at) VALUES (?, ?, 'gmail', 'connected', ?, ?, ?, ?, ?)",
          args: [id, p.ownerId, p.email, p.email, JSON.stringify(p.scopes), now, now] as SqlValue[],
        },
      ];
  stmts.push({
    sql: "INSERT INTO od_connection_secrets (connection_id, owner_id, key_version, ciphertext, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(connection_id) DO UPDATE SET key_version = excluded.key_version, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at",
    args: [id, p.ownerId, keys.current, secret, now],
  });
  await db.batch(stmts);
  return id;
}

export async function upsertGscConnection(db: Db, keys: Keyring, p: { ownerId: string; account: string; scopes: string[]; tokens: object; now: number }): Promise<string> {
  const existing = (await db.query<{ id: string }>("SELECT id FROM od_connections WHERE owner_id = ? AND provider = 'gsc'", [p.ownerId]))[0];
  const id = existing?.id ?? randomId("con_");
  const secret = await seal(keys, JSON.stringify(p.tokens), `conn:${id}`);
  const now = iso(p.now);
  const stmts = existing
    ? [{ sql: "UPDATE od_connections SET status = 'connected', account_label = ?, scopes = ?, last_error = NULL, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ?", args: [p.account, JSON.stringify(p.scopes), now, id, p.ownerId] as SqlValue[] }]
    : [{ sql: "INSERT INTO od_connections (id, owner_id, provider, status, account_label, external_id, scopes, created_at, updated_at) VALUES (?, ?, 'gsc', 'connected', ?, ?, ?, ?, ?)", args: [id, p.ownerId, p.account, p.account, JSON.stringify(p.scopes), now, now] as SqlValue[] }];
  stmts.push({
    sql: "INSERT INTO od_connection_secrets (connection_id, owner_id, key_version, ciphertext, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(connection_id) DO UPDATE SET key_version = excluded.key_version, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at",
    args: [id, p.ownerId, keys.current, secret, now],
  });
  await db.batch(stmts);
  return id;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export async function readSecret(db: Db, keys: Keyring, ownerId: string, connectionId: string): Promise<StoredTokens | null> {
  const r = await db.query<{ ciphertext: string }>("SELECT ciphertext FROM od_connection_secrets WHERE connection_id = ? AND owner_id = ?", [connectionId, ownerId]);
  if (!r[0]) return null;
  return JSON.parse(await open(keys, r[0].ciphertext, `conn:${connectionId}`)) as StoredTokens;
}

export async function writeSecret(db: Db, keys: Keyring, ownerId: string, connectionId: string, tokens: StoredTokens, now: number) {
  await db.run("UPDATE od_connection_secrets SET ciphertext = ?, key_version = ?, updated_at = ? WHERE connection_id = ? AND owner_id = ?", [
    await seal(keys, JSON.stringify(tokens), `conn:${connectionId}`),
    keys.current,
    iso(now),
    connectionId,
    ownerId,
  ]);
}

/** Lease para renovar token sem corrida entre execuções simultâneas. */
export async function acquireRefreshLease(db: Db, connectionId: string, now: number, ms = 30_000): Promise<boolean> {
  const r = await db.run("UPDATE od_connections SET refresh_lease_until = ? WHERE id = ? AND (refresh_lease_until IS NULL OR refresh_lease_until < ?)", [iso(now + ms), connectionId, iso(now)]);
  return r.changes === 1;
}

export async function releaseRefreshLease(db: Db, connectionId: string) {
  await db.run("UPDATE od_connections SET refresh_lease_until = NULL WHERE id = ?", [connectionId]);
}

export async function markConnection(db: Db, ownerId: string, id: string, status: string, error: string | null, now: number) {
  await db.run("UPDATE od_connections SET status = ?, last_error = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ?", [status, error, iso(now), id, ownerId]);
}

export async function setCursor(db: Db, ownerId: string, id: string, cursor: string, now: number) {
  await db.run("UPDATE od_connections SET cursor = ?, cursor_at = ?, last_sync_at = ?, last_error = NULL, updated_at = ? WHERE id = ? AND owner_id = ?", [cursor, iso(now), iso(now), iso(now), id, ownerId]);
}

export async function touchSync(db: Db, ownerId: string, id: string, now: number) {
  await db.run("UPDATE od_connections SET last_sync_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [iso(now), iso(now), id, ownerId]);
}

export async function disconnect(db: Db, ownerId: string, id: string, now: number) {
  await db.batch([
    { sql: "DELETE FROM od_connection_secrets WHERE connection_id = ? AND owner_id = ?", args: [id, ownerId] },
    { sql: "UPDATE od_connections SET status = 'disabled', cursor = NULL, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ?", args: [iso(now), id, ownerId] },
    { sql: "DELETE FROM od_email_pending WHERE connection_id = ? AND owner_id = ?", args: [id, ownerId] },
  ]);
}

// ---------------- Rotinas e execuções ----------------

export interface RoutineRow {
  id: string;
  owner_id: string;
  agent_id: string;
  kind: string;
  times: string;
  time_zone: string;
  weekdays: string;
  enabled: number;
  last_planned_at: string | null;
  created_at: string;
}

export async function ensureEmailRoutine(db: Db, ownerId: string, now: number): Promise<string> {
  const r = await db.query<{ id: string }>("SELECT id FROM od_routines WHERE owner_id = ? AND kind = 'email_review'", [ownerId]);
  if (r[0]) return r[0].id;
  const id = randomId("rt_");
  await db.run("INSERT INTO od_routines (id, owner_id, agent_id, kind, times, time_zone, weekdays, enabled, last_planned_at, created_at, updated_at) VALUES (?, ?, 'correio', 'email_review', ?, 'America/Sao_Paulo', '[]', 1, ?, ?, ?)", [
    id,
    ownerId,
    JSON.stringify(["08:00", "17:00"]),
    iso(now),
    iso(now),
    iso(now),
  ]);
  return id;
}

export async function ensureNewsRoutine(db: Db, ownerId: string, now: number): Promise<string> {
  const r = await db.query<{ id: string }>("SELECT id FROM od_routines WHERE owner_id = ? AND kind = 'news_review'", [ownerId]);
  if (r[0]) return r[0].id;
  const id = randomId("rt_");
  await db.run("INSERT INTO od_routines (id, owner_id, agent_id, kind, times, time_zone, weekdays, enabled, last_planned_at, created_at, updated_at) VALUES (?, ?, 'noticias', 'news_review', ?, 'America/Sao_Paulo', '[]', 1, ?, ?, ?)", [
    id,
    ownerId,
    JSON.stringify(["08:00"]),
    iso(now),
    iso(now),
    iso(now),
  ]);
  return id;
}

export async function agentSettings(db: Db, ownerId: string, agentId: string) {
  return (
    await db.query<{ enabled: number; config: string; last_test_at: string | null; last_error: string | null }>(
      "SELECT enabled, config, last_test_at, last_error FROM od_agent_settings WHERE owner_id = ? AND agent_id = ?",
      [ownerId, agentId],
    )
  )[0] ?? null;
}

export async function listAgentSettings(db: Db, ownerId: string) {
  return db.query<{ agent_id: string; enabled: number; config: string; last_test_at: string | null; last_error: string | null }>(
    "SELECT agent_id, enabled, config, last_test_at, last_error FROM od_agent_settings WHERE owner_id = ?",
    [ownerId],
  );
}

export async function setRoutineKindEnabled(db: Db, ownerId: string, kind: string, enabled: boolean, now: number) {
  await db.run("UPDATE od_routines SET enabled = ?, updated_at = ? WHERE owner_id = ? AND kind = ?", [enabled ? 1 : 0, iso(now), ownerId, kind]);
}

export async function setAgentEnabled(db: Db, ownerId: string, agentId: string, enabled: boolean, now: number) {
  await db.run(
    "INSERT INTO od_agent_settings (owner_id, agent_id, enabled, config, updated_at) VALUES (?, ?, ?, '{}', ?) ON CONFLICT(owner_id, agent_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at",
    [ownerId, agentId, enabled ? 1 : 0, iso(now)],
  );
}

export async function touchAgentSettings(db: Db, ownerId: string, agentId: string, p: { lastTestAt: string | null; lastError: string | null; now: number }) {
  await db.run(
    "INSERT INTO od_agent_settings (owner_id, agent_id, enabled, config, last_test_at, last_error, updated_at) VALUES (?, ?, 1, '{}', ?, ?, ?) ON CONFLICT(owner_id, agent_id) DO UPDATE SET last_test_at = excluded.last_test_at, last_error = excluded.last_error, updated_at = excluded.updated_at",
    [ownerId, agentId, p.lastTestAt, p.lastError, iso(p.now)],
  );
}

export async function listQuotes(db: Db, ownerId: string) {
  return db.query<{ symbol: string; price: number; change_pct: number | null; source: string; quoted_at: string; fetched_at: string }>(
    "SELECT symbol, price, change_pct, source, quoted_at, fetched_at FROM od_quotes WHERE owner_id = ?",
    [ownerId],
  );
}

export async function listRoutines(db: Db, ownerId: string) {
  return db.query<RoutineRow>("SELECT * FROM od_routines WHERE owner_id = ? ORDER BY kind", [ownerId]);
}

export async function enabledRoutines(db: Db) {
  return db.query<RoutineRow>("SELECT * FROM od_routines WHERE enabled = 1");
}

export async function updateRoutine(db: Db, ownerId: string, id: string, p: { times: string[]; timeZone: string; enabled: boolean; now: number }) {
  // Mudar horário invalida execuções futuras ainda não iniciadas.
  return db.batch([
    { sql: "UPDATE od_routines SET times = ?, time_zone = ?, enabled = ?, last_planned_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?", args: [JSON.stringify(p.times), p.timeZone, p.enabled ? 1 : 0, iso(p.now), iso(p.now), id, ownerId] },
    { sql: "UPDATE od_runs SET state = 'cancelled', version = version + 1, updated_at = ? WHERE owner_id = ? AND routine_id = ? AND state = 'queued' AND scheduled_at > ?", args: [iso(p.now), ownerId, id, iso(p.now)] },
  ]);
}

export async function setPlanned(db: Db, routineId: string, ts: number) {
  await db.run("UPDATE od_routines SET last_planned_at = ? WHERE id = ?", [iso(ts), routineId]);
}

/** Cria a execução do slot. A UNIQUE(owner_id, slot_key) torna o cron repetido inofensivo. */
export async function createRunForSlot(db: Db, p: { ownerId: string; routineId: string | null; agentId: string; kind: string; slotKey: string; scheduledAt: number; late: boolean; now: number }): Promise<boolean> {
  const r = await db.run(
    "INSERT OR IGNORE INTO od_runs (id, owner_id, routine_id, agent_id, kind, slot_key, scheduled_at, late, state, version, attempt, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 1, 0, ?, ?, ?)",
    [randomId("run_"), p.ownerId, p.routineId, p.agentId, p.kind, p.slotKey, iso(p.scheduledAt), p.late ? 1 : 0, iso(p.scheduledAt), iso(p.now), iso(p.now)],
  );
  return r.changes === 1;
}

export interface RunRow {
  id: string;
  owner_id: string;
  routine_id: string | null;
  agent_id: string;
  kind: string;
  slot_key: string | null;
  scheduled_at: string | null;
  late: number;
  state: string;
  version: number;
  attempt: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function dueRuns(db: Db, now: number, limit = 3): Promise<RunRow[]> {
  return db.query<RunRow>(
    "SELECT * FROM od_runs WHERE (state IN ('queued','retry_scheduled','waiting_quota') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (state = 'running' AND lease_until < ?) ORDER BY scheduled_at LIMIT ?",
    [iso(now), iso(now), limit],
  );
}

export async function expireStaleRuns(db: Db, now: number): Promise<number> {
  const cutoff = iso(now - 10 * 60_000);
  const nowIso = iso(now);
  const running = await db.run(
    "UPDATE od_runs SET state = 'failed', error_code = 'stale_run', error_message = 'Execução passou de 10 minutos.', version = version + 1, lease_until = NULL, updated_at = ? WHERE state = 'running' AND updated_at <= ?",
    [nowIso, cutoff],
  );
  const queued = await db.run(
    "UPDATE od_runs SET state = 'uncertain', error_code = 'stale_run', error_message = 'Execução na fila passou de 10 minutos do horário.', version = version + 1, updated_at = ? WHERE state = 'queued' AND scheduled_at IS NOT NULL AND scheduled_at <= ? AND updated_at <= ?",
    [nowIso, cutoff, cutoff],
  );
  return running.changes + queued.changes;
}

/** Toma a execução com compare-and-set de versão + lease. */
export async function claimRun(db: Db, run: RunRow, now: number, leaseMs = 4 * 60_000): Promise<RunRow | null> {
  const r = await db.run("UPDATE od_runs SET state = 'running', version = version + 1, attempt = attempt + 1, lease_until = ?, updated_at = ? WHERE id = ? AND version = ?", [
    iso(now + leaseMs),
    iso(now),
    run.id,
    run.version,
  ]);
  if (r.changes !== 1) return null;
  return { ...run, state: "running", version: run.version + 1, attempt: run.attempt + 1 };
}

export async function finishRun(db: Db, run: RunRow, p: { state: "succeeded" | "failed" | "waiting_quota" | "retry_scheduled" | "uncertain" | "waiting_approval"; errorCode?: string; errorMessage?: string; nextAttemptAt?: number; now: number }): Promise<boolean> {
  const r = await db.run(
    "UPDATE od_runs SET state = ?, version = version + 1, lease_until = NULL, error_code = ?, error_message = ?, next_attempt_at = ?, updated_at = ? WHERE id = ? AND version = ? AND state = 'running'",
    [p.state, p.errorCode ?? null, p.errorMessage?.slice(0, 300) ?? null, p.nextAttemptAt ? iso(p.nextAttemptAt) : null, iso(p.now), run.id, run.version],
  );
  return r.changes === 1;
}

export async function listRuns(db: Db, ownerId: string, limit = 20) {
  return db.query<RunRow>("SELECT * FROM od_runs WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?", [ownerId, limit]);
}

// ---------------- E-mail ----------------

export async function addPending(db: Db, ownerId: string, connectionId: string, ids: Array<{ id: string; threadId: string }>, now: number) {
  if (!ids.length) return;
  await db.batch(
    ids.map((m) => ({
      sql: "INSERT OR IGNORE INTO od_email_pending (owner_id, connection_id, message_id, thread_id, discovered_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM od_email_messages WHERE owner_id = ? AND connection_id = ? AND message_id = ?)",
      args: [ownerId, connectionId, m.id, m.threadId, iso(now), ownerId, connectionId, m.id],
    })),
  );
}

export async function pendingIds(db: Db, ownerId: string, connectionId: string, limit: number) {
  return db.query<{ message_id: string; thread_id: string; attempts: number }>("SELECT message_id, thread_id, attempts FROM od_email_pending WHERE owner_id = ? AND connection_id = ? ORDER BY discovered_at LIMIT ?", [ownerId, connectionId, limit]);
}

export async function countPending(db: Db, ownerId: string): Promise<number> {
  const r = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM od_email_pending WHERE owner_id = ?", [ownerId]);
  return Number(r[0]?.n ?? 0);
}

export async function storeMessage(db: Db, keys: Keyring, p: { ownerId: string; connectionId: string; m: import("@open-dot/core").EmailMeta; now: number }) {
  await storeMessages(db, keys, [p]);
}

export async function storeMessages(db: Db, keys: Keyring, rows: Array<{ ownerId: string; connectionId: string; m: import("@open-dot/core").EmailMeta; now: number }>) {
  if (!rows.length) return;
  const stmts: Stmt[] = [];
  for (const p of rows) {
    const aad = `msg:${p.ownerId}:${p.m.id}`;
    stmts.push(
      {
        sql: "INSERT OR IGNORE INTO od_email_messages (owner_id, connection_id, message_id, thread_id, from_enc, subject_enc, snippet_enc, received_at, labels, list_unsub, bulk, fetched_at, rfc822_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          p.ownerId,
          p.connectionId,
          p.m.id,
          p.m.threadId,
          await seal(keys, p.m.from, aad),
          await seal(keys, p.m.subject, aad),
          await seal(keys, p.m.snippet, aad),
          p.m.receivedAt,
          JSON.stringify(p.m.labels),
          p.m.listUnsubscribe ? 1 : 0,
          p.m.precedenceBulk ? 1 : 0,
          iso(p.now),
          p.m.rfc822Id ?? null,
        ],
      },
      { sql: "DELETE FROM od_email_pending WHERE owner_id = ? AND connection_id = ? AND message_id = ?", args: [p.ownerId, p.connectionId, p.m.id] },
    );
  }
  await db.batch(stmts);
}

export async function dropPending(db: Db, ownerId: string, connectionId: string, messageId: string) {
  await db.run("DELETE FROM od_email_pending WHERE owner_id = ? AND connection_id = ? AND message_id = ?", [ownerId, connectionId, messageId]);
}

export async function bumpPending(db: Db, ownerId: string, connectionId: string, messageId: string) {
  await db.run("UPDATE od_email_pending SET attempts = attempts + 1 WHERE owner_id = ? AND connection_id = ? AND message_id = ?", [ownerId, connectionId, messageId]);
}

export async function untriagedMessages(db: Db, keys: Keyring, ownerId: string, limit = 50) {
  const rows = await db.query<{ connection_id: string; message_id: string; thread_id: string; from_enc: string; subject_enc: string; snippet_enc: string | null; received_at: string; labels: string; list_unsub: number; bulk: number; rfc822_id: string | null }>(
    "SELECT connection_id, message_id, thread_id, from_enc, subject_enc, snippet_enc, received_at, labels, list_unsub, bulk, rfc822_id FROM od_email_messages WHERE owner_id = ? AND digest_run_id IS NULL ORDER BY received_at DESC LIMIT ?",
    [ownerId, limit],
  );
  const out: Array<import("@open-dot/core").EmailMeta & { connectionId: string }> = [];
  for (const r of rows) {
    const aad = `msg:${ownerId}:${r.message_id}`;
    out.push({
      connectionId: r.connection_id,
      id: r.message_id,
      threadId: r.thread_id,
      from: await open(keys, r.from_enc, aad),
      to: "",
      subject: await open(keys, r.subject_enc, aad),
      snippet: r.snippet_enc ? await open(keys, r.snippet_enc, aad) : "",
      receivedAt: r.received_at,
      labels: JSON.parse(r.labels) as string[],
      listUnsubscribe: r.list_unsub === 1,
      precedenceBulk: r.bulk === 1,
      rfc822Id: r.rfc822_id,
    });
  }
  return out;
}

// ---------------- Feed ----------------

export async function insertFeed(db: Db, keys: Keyring, p: { ownerId: string; agentId: string; runId: string | null; kind: string; title: string; body: unknown; freshness: string; coverage: unknown; now: number; retentionDays?: number; markMessages?: { runId: string; ids: string[] } }): Promise<string | null> {
  const id = randomId("fd_");
  const stmts = [
    {
      sql: "INSERT OR IGNORE INTO od_feed_items (id, owner_id, agent_id, run_id, kind, title, body_enc, freshness, coverage, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, p.ownerId, p.agentId, p.runId, p.kind, p.title, await seal(keys, JSON.stringify(p.body), `feed:${p.ownerId}`), p.freshness, p.coverage ? JSON.stringify(p.coverage) : null, iso(p.now), iso(p.now + (p.retentionDays ?? 30) * 86_400_000)] as SqlValue[],
    },
  ];
  for (const mid of p.markMessages?.ids ?? []) {
    stmts.push({ sql: "UPDATE od_email_messages SET digest_run_id = ? WHERE owner_id = ? AND message_id = ? AND digest_run_id IS NULL", args: [p.markMessages!.runId, p.ownerId, mid] });
  }
  const res = await db.batch(stmts);
  return res[0]?.changes === 1 ? id : null;
}

export async function insertFeeds(db: Db, keys: Keyring, items: Array<{ ownerId: string; agentId: string; runId: string | null; kind: string; title: string; body: unknown; freshness: string; coverage: unknown; now: number; retentionDays?: number }>): Promise<void> {
  if (!items.length) return;
  const stmts: Stmt[] = [];
  for (const p of items) {
    stmts.push({
      sql: "INSERT OR IGNORE INTO od_feed_items (id, owner_id, agent_id, run_id, kind, title, body_enc, freshness, coverage, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [randomId("fd_"), p.ownerId, p.agentId, p.runId, p.kind, p.title, await seal(keys, JSON.stringify(p.body), `feed:${p.ownerId}`), p.freshness, p.coverage ? JSON.stringify(p.coverage) : null, iso(p.now), iso(p.now + (p.retentionDays ?? 30) * 86_400_000)],
    });
  }
  await db.batch(stmts);
}

export async function listFeed(db: Db, keys: Keyring, ownerId: string, p: { before?: { createdAt: string; id: string } | null; limit: number; now: number }) {
  const args: SqlValue[] = [ownerId, iso(p.now)];
  let where = "owner_id = ? AND expires_at > ?";
  if (p.before) {
    where += " AND (created_at < ? OR (created_at = ? AND id < ?))";
    args.push(p.before.createdAt, p.before.createdAt, p.before.id);
  }
  args.push(Math.min(p.limit, 50));
  const rows = await db.query<{ id: string; agent_id: string; run_id: string | null; kind: string; title: string; body_enc: string; freshness: string; coverage: string | null; created_at: string; state: string; resolved_at: string | null; snooze_until: string | null }>(
    `SELECT id, agent_id, run_id, kind, title, body_enc, freshness, coverage, created_at, state, resolved_at, snooze_until FROM od_feed_items WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    args,
  );
  const out = [];
  for (const r of rows) {
    const awake = r.state === "snoozed" && r.snooze_until && Date.parse(r.snooze_until) <= p.now;
    out.push({ id: r.id, agentId: r.agent_id, runId: r.run_id, kind: r.kind, title: r.title, body: JSON.parse(await open(keys, r.body_enc, `feed:${ownerId}`)), freshness: r.freshness, coverage: r.coverage ? JSON.parse(r.coverage) : null, createdAt: r.created_at, state: awake ? "open" : (r.state || "open"), resolvedAt: r.resolved_at, snoozeUntil: r.snooze_until });
  }
  return out;
}

export async function setFeedState(db: Db, ownerId: string, id: string, state: "done" | "snoozed" | "open", now: number, snoozeUntil: string | null): Promise<boolean> {
  const res = await db.run(
    "UPDATE od_feed_items SET state = ?, resolved_at = ?, snooze_until = ? WHERE id = ? AND owner_id = ?",
    [state, state === "done" ? iso(now) : null, snoozeUntil, id, ownerId],
  );
  return res.changes === 1;
}

export async function markFeedDone(db: Db, ownerId: string, kind: string, runLike: string, now: number): Promise<void> {
  await db.run(
    "UPDATE od_feed_items SET state = 'done', resolved_at = ? WHERE owner_id = ? AND kind = ? AND state = 'open' AND run_id LIKE ?",
    [iso(now), ownerId, kind, runLike],
  );
}

// ---------------- Orçamento de IA (reserva atômica em SQL) ----------------

export class DbLedger implements BudgetLedger {
  constructor(
    private readonly db: Db,
    private readonly limits: { ownerCalls: number; ownerTokens: number; modelRequests: (m: string) => number; modelTokens: (m: string) => number },
    private readonly now: () => number,
  ) {}

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const ownerKey = `owner:${input.ownerId}`;
    const modelKey = `model:${input.providerId}:${input.modelId}`;
    const id = randomId("rsv_");
    const mk = `${input.providerId}:${input.modelId}`;
    // Tudo numa transação. changes() refere-se ao comando anterior na mesma conexão:
    // o contador do modelo e a reserva só são gravados se o do dono passou nas condições.
    await this.db.batch([
      { sql: "INSERT OR IGNORE INTO od_quota_counters (scope_key, day, calls, tokens) VALUES (?, ?, 0, 0)", args: [ownerKey, input.day] },
      { sql: "INSERT OR IGNORE INTO od_quota_counters (scope_key, day, calls, tokens) VALUES (?, ?, 0, 0)", args: [modelKey, input.day] },
      {
        sql: `UPDATE od_quota_counters SET calls = calls + 1, tokens = tokens + ?
              WHERE scope_key = ? AND day = ? AND calls + 1 <= ? AND tokens + ? <= ?
              AND EXISTS (SELECT 1 FROM od_quota_counters m WHERE m.scope_key = ? AND m.day = ? AND m.calls + 1 <= ? AND m.tokens + ? <= ?)`,
        args: [input.tokens, ownerKey, input.day, this.limits.ownerCalls, input.tokens, this.limits.ownerTokens, modelKey, input.day, this.limits.modelRequests(mk), input.tokens, this.limits.modelTokens(mk)],
      },
      { sql: "UPDATE od_quota_counters SET calls = calls + 1, tokens = tokens + ? WHERE scope_key = ? AND day = ? AND changes() = 1", args: [input.tokens, modelKey, input.day] },
      {
        sql: "INSERT INTO od_quota_reservations (id, owner_id, day, owner_key, model_key, tokens, state, created_at) SELECT ?, ?, ?, ?, ?, ?, 'reserved', ? WHERE changes() = 1",
        args: [id, input.ownerId, input.day, ownerKey, modelKey, input.tokens, iso(this.now())],
      },
    ]);
    const ok = await this.db.query<{ id: string }>("SELECT id FROM od_quota_reservations WHERE id = ?", [id]);
    if (ok[0]) return { ok: true, reservationId: id };
    const c = await this.db.query<{ scope_key: string; calls: number; tokens: number }>("SELECT scope_key, calls, tokens FROM od_quota_counters WHERE day = ? AND scope_key IN (?, ?)", [input.day, ownerKey, modelKey]);
    const o = c.find((x) => x.scope_key === ownerKey);
    const m = c.find((x) => x.scope_key === modelKey);
    if (o && o.calls + 1 > this.limits.ownerCalls) return { ok: false, reason: "owner_calls" };
    if (o && o.tokens + input.tokens > this.limits.ownerTokens) return { ok: false, reason: "owner_tokens" };
    if (m && m.calls + 1 > this.limits.modelRequests(mk)) return { ok: false, reason: "model_requests" };
    return { ok: false, reason: "model_tokens" };
  }

  async commit(reservationId: string, actualTokens: number): Promise<void> {
    await this.settle(reservationId, "committed", (reserved) => Math.max(0, reserved - Math.max(0, actualTokens)), 0);
  }

  async release(reservationId: string): Promise<void> {
    await this.settle(reservationId, "released", (reserved) => reserved, 1);
  }

  private async settle(id: string, state: string, refundTokens: (reserved: number) => number, refundCalls: number) {
    const r = (await this.db.query<{ tokens: number; day: string; owner_key: string; model_key: string }>("SELECT tokens, day, owner_key, model_key FROM od_quota_reservations WHERE id = ? AND state = 'reserved'", [id]))[0];
    if (!r) return;
    const refund = refundTokens(Number(r.tokens));
    await this.db.batch([
      { sql: "UPDATE od_quota_reservations SET state = ? WHERE id = ? AND state = 'reserved'", args: [state, id] },
      { sql: "UPDATE od_quota_counters SET tokens = tokens - ?, calls = calls - ? WHERE day = ? AND scope_key IN (?, ?) AND changes() = 1", args: [refund, refundCalls, r.day, r.owner_key, r.model_key] },
    ]);
  }
}

export async function recordUsage(db: Db, u: UsageRecord) {
  await db.run("INSERT INTO od_ai_usage (owner_id, at, task_kind, provider_id, model_id, outcome, prompt_tokens, completion_tokens, latency_ms, http_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    u.ownerId,
    iso(u.at),
    u.taskKind,
    u.providerId,
    u.modelId,
    u.outcome,
    u.promptTokens,
    u.completionTokens,
    u.latencyMs,
    u.httpStatus,
  ]);
}

export async function usageToday(db: Db, ownerId: string, now: number) {
  const day = iso(now).slice(0, 10);
  const c = (await db.query<{ calls: number; tokens: number }>("SELECT calls, tokens FROM od_quota_counters WHERE scope_key = ? AND day = ?", [`owner:${ownerId}`, day]))[0];
  const recent = await db.query<{ at: string; task_kind: string; provider_id: string; model_id: string; outcome: string; prompt_tokens: number; completion_tokens: number }>(
    "SELECT at, task_kind, provider_id, model_id, outcome, prompt_tokens, completion_tokens FROM od_ai_usage WHERE owner_id = ? ORDER BY at DESC LIMIT 20",
    [ownerId],
  );
  return { day, calls: Number(c?.calls ?? 0), tokens: Number(c?.tokens ?? 0), recent };
}

// ---------------- Aprovações ----------------

/** Decisão com compare-and-set: duas confirmações concorrentes → um único efeito. */
export async function decideApproval(db: Db, p: { ownerId: string; id: string; decision: "approve" | "reject"; expectedVersion: number; payloadHash: string; now: number }): Promise<"ok" | "conflict" | "expired" | "not_found"> {
  const r = await db.run(
    "UPDATE od_approvals SET status = ?, version = version + 1, decided_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND status = 'pending' AND payload_hash = ? AND expires_at > ?",
    [p.decision === "approve" ? "approved" : "rejected", iso(p.now), p.id, p.ownerId, p.expectedVersion, p.payloadHash, iso(p.now)],
  );
  if (r.changes === 1) return "ok";
  const row = (await db.query<{ status: string; expires_at: string }>("SELECT status, expires_at FROM od_approvals WHERE id = ? AND owner_id = ?", [p.id, p.ownerId]))[0];
  if (!row) return "not_found";
  if (row.status === "pending" && row.expires_at <= iso(p.now)) return "expired";
  return "conflict";
}

export async function listApprovals(db: Db, keys: Keyring, ownerId: string) {
  const rows = await db.query<{ id: string; action: string; proposal_enc: string; payload_hash: string; status: string; version: number; expires_at: string; created_at: string }>(
    "SELECT id, action, proposal_enc, payload_hash, status, version, expires_at, created_at FROM od_approvals WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50",
    [ownerId],
  );
  const out = [];
  for (const r of rows) {
    let proposal: unknown = null;
    try {
      proposal = JSON.parse(await open(keys, r.proposal_enc, `appr:${r.id}`));
    } catch {
      proposal = null;
    }
    out.push({
      id: r.id,
      action: r.action,
      payloadHash: r.payload_hash,
      status: r.status,
      version: r.version,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      proposal,
    });
  }
  return out;
}

export async function createApproval(
  db: Db,
  keys: Keyring,
  p: { ownerId: string; action: string; proposal: object; payloadHash: string; now: number; ttlMs?: number },
): Promise<string> {
  const id = randomId("ap_");
  await db.run(
    "INSERT INTO od_approvals (id, owner_id, action, proposal_enc, payload_hash, status, version, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?)",
    [id, p.ownerId, p.action, await seal(keys, JSON.stringify(p.proposal), `appr:${id}`), p.payloadHash, iso(p.now + (p.ttlMs ?? 86_400_000)), iso(p.now)],
  );
  return id;
}

export async function editApproval(
  db: Db,
  keys: Keyring,
  p: { ownerId: string; id: string; proposal: object; payloadHash: string; expectedVersion: number; now: number },
): Promise<"ok" | "conflict" | "not_found"> {
  const enc = await seal(keys, JSON.stringify(p.proposal), `appr:${p.id}`);
  const r = await db.run(
    "UPDATE od_approvals SET proposal_enc = ?, payload_hash = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ? AND status = 'pending'",
    [enc, p.payloadHash, p.id, p.ownerId, p.expectedVersion],
  );
  if (r.changes === 1) return "ok";
  const row = (await db.query<{ id: string }>("SELECT id FROM od_approvals WHERE id = ? AND owner_id = ?", [p.id, p.ownerId]))[0];
  return row ? "conflict" : "not_found";
}

// ---------------- Monitores ----------------

export interface MonitorRow {
  id: string;
  owner_id: string;
  url: string;
  host: string;
  label: string;
  interval_min: number;
  enabled: number;
  incident: string;
  last_check_at: string | null;
}

export async function listMonitors(db: Db, ownerId: string) {
  return db.query<MonitorRow>("SELECT * FROM od_monitors WHERE owner_id = ? ORDER BY created_at", [ownerId]);
}

export async function dueMonitors(db: Db, now: number, limit = 3) {
  return db.query<MonitorRow>("SELECT * FROM od_monitors WHERE enabled = 1 ORDER BY COALESCE(last_check_at, '') LIMIT ?", [limit]).then((rows) =>
    rows.filter((m) => !m.last_check_at || Date.parse(m.last_check_at) + m.interval_min * 60_000 - 30_000 <= now),
  );
}

export async function addMonitor(db: Db, p: { ownerId: string; url: string; host: string; label: string; now: number }): Promise<string> {
  const id = randomId("mon_");
  await db.run("INSERT OR IGNORE INTO od_monitors (id, owner_id, url, host, label, interval_min, enabled, incident, created_at) VALUES (?, ?, ?, ?, ?, 5, 1, '{}', ?)", [id, p.ownerId, p.url, p.host, p.label, iso(p.now)]);
  return id;
}

export async function saveSample(db: Db, m: MonitorRow, s: { at: number; ok: boolean; status: number | null; latencyMs: number | null; error?: string }, incident: unknown) {
  await db.batch([
    { sql: "INSERT OR IGNORE INTO od_monitor_samples (monitor_id, owner_id, at, ok, status, latency_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [m.id, m.owner_id, iso(s.at), s.ok ? 1 : 0, s.status, s.latencyMs, s.error ?? null] },
    { sql: "UPDATE od_monitors SET incident = ?, last_check_at = ? WHERE id = ? AND owner_id = ?", args: [JSON.stringify(incident), iso(s.at), m.id, m.owner_id] },
  ]);
}

// ---------------- Webhooks e auditoria ----------------

/** true se é a primeira vez que vemos esta entrega. */
export async function recordDelivery(db: Db, p: { provider: string; deliveryId: string; ownerId: string | null; payloadHash: string; now: number }): Promise<boolean> {
  const r = await db.run("INSERT OR IGNORE INTO od_inbox_events (provider, delivery_id, owner_id, received_at, payload_hash) VALUES (?, ?, ?, ?, ?)", [p.provider, p.deliveryId, p.ownerId, iso(p.now), p.payloadHash]);
  return r.changes === 1;
}

export async function audit(db: Db, p: { ownerId: string | null; actor: "user" | "routine" | "system"; action: string; target?: string | null; outcome: string; detail?: string | null; now: number }) {
  await db.run("INSERT INTO od_audit_events (owner_id, at, actor, action, target, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?)", [p.ownerId, iso(p.now), p.actor, p.action, p.target ?? null, p.outcome, p.detail?.slice(0, 300) ?? null]);
}

/** Retenção: apaga o que venceu (evidências 7 dias, resumos 30, auditoria 90). */
export async function applyRetention(db: Db, now: number) {
  await db.batch([
    { sql: "DELETE FROM od_feed_items WHERE expires_at <= ?", args: [iso(now)] },
    { sql: "DELETE FROM od_evidence WHERE expires_at <= ?", args: [iso(now)] },
    { sql: "UPDATE od_email_messages SET snippet_enc = NULL WHERE snippet_enc IS NOT NULL AND fetched_at <= ?", args: [iso(now - 7 * 86_400_000)] },
    { sql: "DELETE FROM od_email_messages WHERE fetched_at <= ?", args: [iso(now - 30 * 86_400_000)] },
    { sql: "DELETE FROM od_audit_events WHERE at <= ?", args: [iso(now - 90 * 86_400_000)] },
    { sql: "DELETE FROM od_monitor_samples WHERE at <= ?", args: [iso(now - 90 * 86_400_000)] },
    { sql: "DELETE FROM od_oauth_states WHERE expires_at <= ?", args: [iso(now)] },
    { sql: "DELETE FROM od_sessions WHERE expires_at <= ?", args: [iso(now)] },
    { sql: "DELETE FROM od_inbox_events WHERE received_at <= ?", args: [iso(now - 30 * 86_400_000)] },
    { sql: "DELETE FROM od_shipments WHERE active = 0 AND updated_at <= ?", args: [iso(now - 90 * 86_400_000)] },
  ]);
}

export interface ShipmentRow {
  id: string;
  code: string;
  carrier: string | null;
  confidence: string | null;
  store_label: string | null;
  status: string | null;
  status_label: string | null;
  last_event_at: string | null;
  last_event: string | null;
  events_json: string;
  provider: string | null;
  provider_checked_at: string | null;
  delivered_at: string | null;
  active: number;
  needs_carrier: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function setDisplayName(db: Db, ownerId: string, name: string) {
  await db.run("UPDATE od_owners SET display_name = ?, name_custom = 1 WHERE id = ?", [name, ownerId]);
}

export async function countShipments(db: Db, ownerId: string): Promise<number> {
  const row = (await db.query<{ n: number }>("SELECT count(*) AS n FROM od_shipments WHERE owner_id = ?", [ownerId]))[0];
  return row?.n ?? 0;
}

export async function listShipments(db: Db, ownerId: string): Promise<ShipmentRow[]> {
  return db.query<ShipmentRow>(
    "SELECT id, code, carrier, confidence, store_label, status, status_label, last_event_at, last_event, events_json, provider, provider_checked_at, delivered_at, active, needs_carrier, last_error, created_at, updated_at FROM od_shipments WHERE owner_id = ? ORDER BY active DESC, updated_at DESC",
    [ownerId],
  );
}

export async function insertShipment(db: Db, p: {
  id: string; ownerId: string; code: string; carrier: string | null; confidence: string | null;
  storeLabel: string | null; needsCarrier: boolean; now: number;
}): Promise<boolean> {
  const r = await db.run(
    `INSERT OR IGNORE INTO od_shipments
      (id, owner_id, code, carrier, confidence, store_label, events_json, active, needs_carrier, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 1, ?, ?, ?)`,
    [p.id, p.ownerId, p.code, p.carrier, p.confidence, p.storeLabel, p.needsCarrier ? 1 : 0, iso(p.now), iso(p.now)],
  );
  return r.changes === 1;
}

export async function deleteShipment(db: Db, ownerId: string, id: string): Promise<boolean> {
  const r = await db.run("DELETE FROM od_shipments WHERE owner_id = ? AND id = ?", [ownerId, id]);
  return r.changes === 1;
}

export async function dueShipments(db: Db, ownerId: string, dueBeforeIso: string, limit: number): Promise<ShipmentRow[]> {
  return db.query<ShipmentRow>(
    `SELECT id, code, carrier, confidence, store_label, status, status_label, last_event_at, last_event, events_json, provider, provider_checked_at, delivered_at, active, needs_carrier, last_error, created_at, updated_at
     FROM od_shipments
     WHERE owner_id = ? AND active = 1 AND needs_carrier = 0 AND delivered_at IS NULL
       AND (provider_checked_at IS NULL OR provider_checked_at <= ?)
     ORDER BY provider_checked_at IS NOT NULL, provider_checked_at ASC
     LIMIT ?`,
    [ownerId, dueBeforeIso, limit],
  );
}

export async function saveShipmentTrack(db: Db, p: {
  id: string; ownerId: string; carrier: string | null; status: string; statusLabel: string;
  lastEventAt: string | null; lastEvent: string | null; eventsJson: string; provider: string | null;
  delivered: boolean; error: string | null; now: number;
}) {
  await db.run(
    `UPDATE od_shipments SET
       carrier = COALESCE(?, carrier), status = ?, status_label = ?, last_event_at = ?, last_event = ?,
       events_json = ?, provider = ?, provider_checked_at = ?, delivered_at = ?, active = ?,
       last_error = ?, updated_at = ?
     WHERE id = ? AND owner_id = ?`,
    [
      p.carrier, p.status, p.statusLabel, p.lastEventAt, p.lastEvent, p.eventsJson, p.provider,
      iso(p.now), p.delivered ? iso(p.now) : null, p.delivered ? 0 : 1, p.error, iso(p.now), p.id, p.ownerId,
    ],
  );
}

export async function touchShipment(db: Db, id: string, ownerId: string, error: string | null, now: number) {
  await db.run("UPDATE od_shipments SET provider_checked_at = ?, last_error = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [iso(now), error, iso(now), id, ownerId]);
}

export async function confirmShipmentCarrier(db: Db, ownerId: string, id: string, carrier: string, now: number): Promise<boolean> {
  const r = await db.run(
    "UPDATE od_shipments SET carrier = ?, needs_carrier = 0, provider_checked_at = NULL, updated_at = ? WHERE owner_id = ? AND id = ?",
    [carrier, iso(now), ownerId, id],
  );
  return r.changes === 1;
}

export async function takeTrackingCall(db: Db, ownerId: string, month: string, stop: number): Promise<boolean> {
  await db.run("INSERT OR IGNORE INTO od_tracking_budget (owner_id, month, calls) VALUES (?, ?, 0)", [ownerId, month]);
  const r = await db.run("UPDATE od_tracking_budget SET calls = calls + 1 WHERE owner_id = ? AND month = ? AND calls < ?", [ownerId, month, stop]);
  return r.changes === 1;
}

export async function trackingCalls(db: Db, ownerId: string, month: string): Promise<number> {
  const row = (await db.query<{ calls: number }>("SELECT calls FROM od_tracking_budget WHERE owner_id = ? AND month = ?", [ownerId, month]))[0];
  return row?.calls ?? 0;
}

export async function recentMailTexts(db: Db, keys: Keyring, ownerId: string, limit = 40) {
  const rows = await db.query<{ message_id: string; from_enc: string; subject_enc: string; snippet_enc: string | null }>(
    "SELECT message_id, from_enc, subject_enc, snippet_enc FROM od_email_messages WHERE owner_id = ? ORDER BY received_at DESC LIMIT ?",
    [ownerId, limit],
  );
  const out: { id: string; from: string; subject: string; snippet: string }[] = [];
  for (const r of rows) {
    const aad = `msg:${ownerId}:${r.message_id}`;
    out.push({
      id: r.message_id,
      from: await open(keys, r.from_enc, aad),
      subject: await open(keys, r.subject_enc, aad),
      snippet: r.snippet_enc ? await open(keys, r.snippet_enc, aad) : "",
    });
  }
  return out;
}

export async function runBySlot(db: Db, ownerId: string, slotKey: string): Promise<RunRow | null> {
  return (await db.query<RunRow>("SELECT * FROM od_runs WHERE owner_id = ? AND slot_key = ?", [ownerId, slotKey]))[0] ?? null;
}

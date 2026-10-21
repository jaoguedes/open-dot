// SPDX-License-Identifier: AGPL-3.0-only
import { SqliteDb } from "../src/db/sqlite.ts";
import { applyMigrations } from "../src/db/migrate.ts";
import { loadMigrations } from "../../../scripts/lib/migrations.ts";
import { loadKeyring } from "../src/crypto.ts";
import { parseEnv, type Env } from "../src/env.ts";
import type { Ctx } from "../src/context.ts";
import { handleApi } from "../src/app.ts";

export { loadMigrations };

export const TEST_KEY = "v1:" + Buffer.alloc(32, 7).toString("base64");

export async function makeCtx(opts: { fetch?: typeof fetch; env?: Record<string, string>; now?: () => number } = {}): Promise<Ctx & { db: SqliteDb; clock: { t: number } }> {
  const db = new SqliteDb(":memory:");
  await applyMigrations(db, loadMigrations());
  const parsed = parseEnv({
    APP_ENV: "development",
    APP_ORIGIN: "http://localhost:8787",
    TOKEN_KEYS: TEST_KEY,
    GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "csecret",
    OWNER_EMAIL: "joao@example.com",
    ...opts.env,
  });
  if (!parsed.ok) throw new Error("env inválido: " + parsed.missing.join(","));
  const clock = { t: Date.parse("2026-10-13T10:00:00Z") };
  return {
    env: parsed.env as Env,
    db,
    keys: await loadKeyring(TEST_KEY),
    fetch: opts.fetch ?? (async () => new Response("sem rede no teste", { status: 599 })),
    now: opts.now ?? (() => clock.t),
    clock,
  };
}

/** Cliente HTTP de teste contra o roteador, com cookie de sessão. */
export function client(ctx: Ctx) {
  let cookie = "";
  async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra };
    if (cookie) headers.cookie = cookie;
    if (method !== "GET" && !("x-open-dot" in extra)) headers["x-open-dot"] = "1";
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await handleApi(ctx, new Request(`http://localhost:8787${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? (JSON.parse(text) as any) : null };
  }
  return { call, setCookie: (c: string) => (cookie = c), getCookie: () => cookie };
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

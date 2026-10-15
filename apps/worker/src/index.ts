/**
 * Entrada do Cloudflare Worker: API (/api/*), arquivos estáticos da interface e cron.
 * Um único Worker gratuito serve tudo; o Turso guarda o estado.
 */
import { handleApi } from "./app.ts";
import { loadKeyring, type Keyring } from "./crypto.ts";
import { HranaDb } from "./db/hrana.ts";
import { parseEnv } from "./env.ts";
import { tick } from "./jobs.ts";
import { logSafe } from "./reasons.ts";
import type { Ctx } from "./context.ts";

interface Bindings extends Record<string, unknown> {
  ASSETS?: { fetch(req: Request): Promise<Response> };
  CF_VERSION_METADATA?: { id?: string };
}

export async function assetOrReal404(res: Response): Promise<Response> {
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 404 || type.includes("text/html")) {
    return new Response("não encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  return res;
}

async function versionResponse(url: URL, bindings: Bindings): Promise<Response> {
  let app = "desconhecida";
  if (bindings.ASSETS) {
    const v = await bindings.ASSETS.fetch(new Request(new URL("/version.json", url.origin)));
    if (v.ok) {
      const body = (await v.json().catch(() => null)) as { app?: unknown } | null;
      if (body && typeof body.app === "string" && /^[a-f0-9]{8,64}$/.test(body.app)) app = body.app;
    }
  }
  const worker = bindings.CF_VERSION_METADATA?.id && /^[0-9a-f-]{8,64}$/i.test(bindings.CF_VERSION_METADATA.id) ? bindings.CF_VERSION_METADATA.id : "local";
  return new Response(JSON.stringify({ app, worker }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

let keyCache: { spec: string; ring: Keyring } | null = null;

async function buildCtx(bindings: Bindings): Promise<Ctx | { error: string[] }> {
  const parsed = parseEnv(bindings);
  if (!parsed.ok) return { error: parsed.missing };
  const env = parsed.env;
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return { error: ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] };
  if (!keyCache || keyCache.spec !== env.TOKEN_KEYS) keyCache = { spec: env.TOKEN_KEYS, ring: await loadKeyring(env.TOKEN_KEYS) };
  return { env, db: new HranaDb(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN), keys: keyCache.ring, fetch: (i, init) => fetch(i, init), now: () => Date.now() };
}

export default {
  async fetch(req: Request, bindings: Bindings): Promise<Response> {
    try {
    const url = new URL(req.url);
    if (url.pathname === "/api/version" && req.method === "GET") return versionResponse(url, bindings);
    if (url.pathname.startsWith("/api/")) {
      const ctx = await buildCtx(bindings);
      if ("error" in ctx) {
        logSafe("error", { api: "not_configured", missing: ctx.error });
        return new Response(JSON.stringify({ error: { code: "not_configured", message: "Configuração incompleta do servidor." } }), { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      return handleApi(ctx, req);
    }
    if ((url.pathname.startsWith("/assets/") || url.pathname.startsWith("/chunks/")) && bindings.ASSETS) {
      return assetOrReal404(await bindings.ASSETS.fetch(req));
    }
    if (bindings.ASSETS) return bindings.ASSETS.fetch(req);
    return new Response("Interface não publicada.", { status: 404 });
    } catch (e) {
      logSafe("error", { api: "fatal", reason: e instanceof Error ? e.name : "unknown" });
      return new Response(JSON.stringify({ error: { code: "internal", message: "Não consegui falar com o servidor." } }), { status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
  },

  async scheduled(_controller: unknown, bindings: Bindings): Promise<void> {
    try {
    const ctx = await buildCtx(bindings);
    if ("error" in ctx) {
      logSafe("error", { cron: "skipped", missing: ctx.error });
      return;
    }
    const report = await tick(ctx);
    logSafe("log", { cron: "tick", ...report });
    } catch (e) {
      logSafe("error", { cron: "error", reason: e instanceof Error ? e.name : "unknown" });
    }
  },
};

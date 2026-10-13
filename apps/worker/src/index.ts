/**
 * Entrada do Cloudflare Worker: API (/api/*), arquivos estáticos da interface e cron.
 * Um único Worker gratuito serve tudo; o Turso guarda o estado.
 */
import { handleApi } from "./app.ts";
import { loadKeyring, type Keyring } from "./crypto.ts";
import { HranaDb } from "./db/hrana.ts";
import { parseEnv } from "./env.ts";
import { tick } from "./jobs.ts";
import type { Ctx } from "./context.ts";

interface Bindings extends Record<string, unknown> {
  ASSETS?: { fetch(req: Request): Promise<Response> };
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
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const ctx = await buildCtx(bindings);
      if ("error" in ctx) {
        // Não revela valores; só os nomes das variáveis que faltam.
        return new Response(JSON.stringify({ error: { code: "not_configured", message: "Configuração incompleta do servidor.", missing: ctx.error } }), { status: 503, headers: { "content-type": "application/json" } });
      }
      return handleApi(ctx, req);
    }
    if (bindings.ASSETS) return bindings.ASSETS.fetch(req);
    return new Response("Interface não publicada.", { status: 404 });
  },

  async scheduled(_controller: unknown, bindings: Bindings): Promise<void> {
    const ctx = await buildCtx(bindings);
    if ("error" in ctx) {
      console.error(JSON.stringify({ cron: "skipped", missing: ctx.error }));
      return;
    }
    const report = await tick(ctx);
    console.log(JSON.stringify({ cron: "tick", ...report }));
  },
};

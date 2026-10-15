import { z } from "zod";
import { AGENTS, GMAIL_CAN_SEND, selfHealthUrl, UNTRUSTED_SYSTEM_RULES, checkEvidenceRefs, countsAsAgentError, displayNameFor, hashProposal, isValidTimeZone, localParts, nextSlot, parseHHMM, providerCards, renderUntrusted, runFictitiousProviderTest, sanitizeUntrusted, sha256Hex, toVisual, zonedTimeToUtc, type ActionProposal, type AgentId, type SemanticState } from "@open-dot/core";
import { GMAIL_READ_SCOPES, GSC_READ_SCOPES, LOGIN_SCOPES, authUrl, exchangeCode, readIdToken, revoke } from "@open-dot/connectors/google.ts";
import { getProfile } from "@open-dot/connectors/gmail.ts";
import { normalizeEvent, verifySignature, isNewer } from "@open-dot/connectors/github.ts";
import { checkTarget } from "@open-dot/core";
import { ConnectorError } from "@open-dot/connectors/errors.ts";
import { BudgetExhausted, SubrequestBudget, type Ctx } from "./context.ts";
import { logSafe, safeReason } from "./reasons.ts";
import { configured } from "./env.ts";
import { REQUIRED_SCHEMA, currentSchema, schemaCompatible } from "./db/migrate.ts";
import { pkceChallenge, randomToken } from "./crypto.ts";
import { csrfOk, currentOwner, currentSessionHash, endSession, json, problem, redirect, SECURITY_HEADERS, startSession, sessionCookie, withSessionCookie } from "./http.ts";
import * as repo from "./repo.ts";
import { makeRouter, runEmailReview } from "./services/email-review.ts";
import { syncGmail } from "./services/gmail.ts";
import * as shipments from "./services/shipments.ts";
import * as uploads from "./services/uploads.ts";
import { ingestNews, listRecentNews } from "./services/news.ts";
import { ingestQuotes } from "./services/quotes.ts";
import { testMarketing } from "./services/marketing.ts";
import { DEFAULT_ASSETS, NEWS_FEEDS, QUOTE_DISCLAIMER, isQuoteStale } from "@open-dot/core";

type Handler = (ctx: Ctx, req: Request, params: Record<string, string>, ownerId: string | null) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  auth: boolean;
  csrf: boolean;
  handler: Handler;
}

const routes: Route[] = [];
function route(method: string, path: string, opts: { auth: boolean; csrf?: boolean }, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, pattern, keys, auth: opts.auth, csrf: opts.csrf ?? method !== "GET", handler });
}

export async function handleApi(ctx: Ctx, req: Request): Promise<Response> {
  const url = new URL(req.url);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(url.pathname);
    if (!m) continue;
    let params: Record<string, string>;
    try {
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
    } catch {
      return withHeaders(problem(400, "invalid_input", "Endereço inválido."));
    }
    if (r.csrf && !csrfOk(ctx, req)) return withHeaders(problem(403, "csrf", "Requisição recusada (origem ou cabeçalho ausente)."));
    let ownerId: string | null = null;
    try {
      ownerId = await currentOwner(ctx, req);
    } catch {
      return withHeaders(problem(503, "db_unavailable", "Banco indisponível no momento."));
    }
    if (r.auth && !ownerId) return withHeaders(problem(401, "unauthenticated", "Entre para continuar."));
    try {
      return withHeaders(await r.handler(ctx, req, params, ownerId));
    } catch (e) {
      const badInput = e instanceof z.ZodError || e instanceof SyntaxError || (e instanceof Error && (e.name === "InvalidCharacterError" || e.name === "URIError"));
      if (badInput) return withHeaders(problem(400, "invalid_input", "Dados inválidos."));
      const reason = safeReason(e);
      logSafe("error", { at: new Date(ctx.now()).toISOString(), route: url.pathname.replace(/\/[^/]*\d[^/]*(?=\/|$)/g, "/:id"), reason });
      return withHeaders(problem(500, "internal", "Algo deu errado. Nada foi enviado ou alterado fora do Open Dot.", reason));
    }
  }
  return withHeaders(problem(404, "not_found", "Rota inexistente."));
}

function withHeaders(r: Response): Response {
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
}

const redirectUri = (ctx: Ctx) => `${ctx.env.APP_ORIGIN}/api/oauth/google/callback`;

// ---------------------------------------------------------------- Saúde e sessão

route("GET", "/api/health", { auth: false }, async (ctx, req) => {
  const { version, error } = await currentSchema(ctx.db);
  const ok = schemaCompatible(version, REQUIRED_SCHEMA);
  let ownerId: string | null = null;
  try {
    ownerId = await currentOwner(ctx, req);
  } catch {
    ownerId = null;
  }
  if (!ownerId) return json({ ok });
  return json({
    ok,
    schema: version,
    schemaError: error ?? null,
    requiredSchema: REQUIRED_SCHEMA,
    env: ctx.env.APP_ENV,
    configured: configured(ctx.env),
    time: new Date(ctx.now()).toISOString(),
  });
});

route("GET", "/api/legal", { auth: false }, async (ctx) => json({ contact: ctx.env.CONTACT_EMAIL ?? null }));

route("GET", "/api/session", { auth: false }, async (ctx, req, _p, ownerId) => {
  const local = isLocalRequest(ctx, req);
  if (!ownerId) return json({ authenticated: false, devLoginAvailable: ctx.env.APP_ENV === "development" && local, googleLoginAvailable: configured(ctx.env).google && configured(ctx.env).owner });
  const owner = await repo.getOwner(ctx.db, ownerId);
  return json({ authenticated: true, owner: owner && { email: owner.email, name: displayNameFor(owner.email, owner.display_name, owner.name_custom === 1, ctx.env.OWNER_NAME ?? ""), timeZone: owner.time_zone } });
});

function isLocalRequest(ctx: Ctx, req: Request): boolean {
  const h = new URL(req.url).hostname;
  const o = new URL(ctx.env.APP_ORIGIN).hostname;
  return (h === "localhost" || h === "127.0.0.1") && (o === "localhost" || o === "127.0.0.1");
}

/** Entrada local de desenvolvimento: só em APP_ENV=development e em localhost. */
route("POST", "/api/session/dev", { auth: false }, async (ctx, req) => {
  if (ctx.env.APP_ENV !== "development" || !isLocalRequest(ctx, req)) return problem(403, "forbidden", "Entrada de desenvolvimento desativada.");
  const ownerId = await repo.upsertOwner(ctx.db, { sub: "dev-local", email: "dev@localhost", name: "Desenvolvimento local", now: ctx.now() });
  await repo.ensureEmailRoutine(ctx.db, ownerId, ctx.now());
  await repo.ensureNewsRoutine(ctx.db, ownerId, ctx.now());
  const cookie = await startSession(ctx, req, ownerId);
  return withSessionCookie(ctx, json({ ok: true }), cookie);
});

route("POST", "/api/logout", { auth: false }, async (ctx, req) => withSessionCookie(ctx, json({ ok: true }), await endSession(ctx, req)));

/** Aparelhos com sessão aberta. Só o agente do navegador e as datas; o token nunca sai. */
route("GET", "/api/sessions", { auth: true }, async (ctx, req, _p, ownerId) => {
  const current = await currentSessionHash(ctx, req);
  const rows = await repo.listSessions(ctx.db, ownerId!, ctx.now());
  return json({
    sessions: rows.map((r, i) => ({ id: `s${i + 1}`, device: describeUserAgent(r.user_agent), createdAt: r.created_at, expiresAt: r.expires_at, current: r.id_hash === current })),
  });
});

route("POST", "/api/sessions/logout-all", { auth: true }, async (ctx, _req, _p, ownerId) => {
  const removed = await repo.deleteOwnerSessions(ctx.db, ownerId!);
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "logout_all", outcome: "ok", detail: `sessoes=${removed}`, now: ctx.now() });
  return withSessionCookie(ctx, json({ ok: true, removed }), sessionCookie(ctx, "", 0));
});

function describeUserAgent(ua: string | null): string {
  if (!ua) return "Aparelho desconhecido";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Outro sistema";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${browser} no ${os}`;
}

const DisplayNameInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\p{L}][\p{L} '\u2019-]{0,39}$/u, "Use letras, espaço, apóstrofo ou hífen."),
});

route("PATCH", "/api/profile", { auth: true }, async (ctx, req, _p, ownerId) => {
  const body = DisplayNameInput.parse(await req.json());
  await repo.setDisplayName(ctx.db, ownerId!, body.name);
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "profile_name", outcome: "ok", now: ctx.now() });
  return json({ name: body.name });
});

// ---------------------------------------------------------------- OAuth Google (login e Gmail)

async function beginGoogle(ctx: Ctx, purpose: "login" | "gmail" | "gsc", ownerId: string | null, loginHint?: string): Promise<string> {
  if (!ctx.env.GOOGLE_CLIENT_ID) throw new ConnectorError("not_supported", "Google OAuth não configurado.");
  const state = randomToken();
  const verifier = randomToken(48);
  const nonce = randomToken(16);
  await repo.saveOAuthState(ctx.db, ctx.keys, { stateHash: await sha256Hex(state), ownerId, purpose, verifier, nonce, now: ctx.now() });
  const scopes = purpose === "login" ? LOGIN_SCOPES : purpose === "gsc" ? GSC_READ_SCOPES : GMAIL_READ_SCOPES;
  return authUrl({
    clientId: ctx.env.GOOGLE_CLIENT_ID,
    redirectUri: redirectUri(ctx),
    scopes,
    state,
    codeChallenge: await pkceChallenge(verifier),
    nonce,
    offline: purpose !== "login",
    ...(loginHint ? { loginHint } : {}),
  });
}

route("GET", "/api/auth/google/start", { auth: false }, async (ctx) => {
  if (!configured(ctx.env).google || !configured(ctx.env).owner) return redirect("/?erro=login_nao_configurado");
  return redirect(await beginGoogle(ctx, "login", null, ctx.env.OWNER_EMAIL));
});

route("POST", "/api/connections/gmail/start", { auth: true }, async (ctx, _req, _p, ownerId) => {
  if (!configured(ctx.env).google) return problem(409, "not_configured", "Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET antes de conectar o Gmail.");
  return json({ url: await beginGoogle(ctx, "gmail", ownerId) });
});

route("POST", "/api/connections/gsc/start", { auth: true }, async (ctx, _req, _p, ownerId) => {
  if (!configured(ctx.env).google) return problem(409, "not_configured", "Configure o cliente OAuth do Google antes de conectar o Search Console.");
  return json({ url: await beginGoogle(ctx, "gsc", ownerId) });
});

/**
 * Qualquer falha na troca do código, no id_token ou no perfil volta para a tela com um
 * código conhecido. O navegador nunca vê JSON cru nem a mensagem do Google.
 */
route("GET", "/api/oauth/google/callback", { auth: false }, async (ctx, req, p, sessionOwnerId) => {
  try {
    return await oauthCallback(ctx, req, p, sessionOwnerId);
  } catch (e) {
    const reason = safeReason(e);
    logSafe("error", { at: new Date(ctx.now()).toISOString(), route: "/api/oauth/google/callback", reason });
    await repo.audit(ctx.db, { ownerId: sessionOwnerId, actor: "user", action: "oauth_callback", outcome: "failed", detail: reason, now: ctx.now() }).catch(() => undefined);
    return redirect(sessionOwnerId ? "/conexoes?erro=callback_invalido" : "/?erro=callback_invalido");
  }
});

const oauthCallback: Handler = async (ctx, req, _p, sessionOwnerId) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return redirect("/?erro=consentimento_negado");
  if (!state || !code) return redirect("/?erro=callback_invalido");
  const st = await repo.consumeOAuthState(ctx.db, ctx.keys, await sha256Hex(state), ctx.now());
  if (!st) return redirect("/?erro=estado_expirado");
  const tokens = await exchangeCode(ctx.fetch, { clientId: ctx.env.GOOGLE_CLIENT_ID!, clientSecret: ctx.env.GOOGLE_CLIENT_SECRET!, code, codeVerifier: st.verifier, redirectUri: redirectUri(ctx), now: ctx.now() });
  if (!tokens.idToken) return redirect("/?erro=sem_id_token");
  const claims = readIdToken(tokens.idToken, { clientId: ctx.env.GOOGLE_CLIENT_ID!, nonce: st.nonce, now: ctx.now() });

  if (st.purpose === "login") {
    const allowedSub = ctx.env.OWNER_GOOGLE_SUB;
    const allowedEmail = ctx.env.OWNER_EMAIL?.toLowerCase();
    const allowed = allowedSub ? claims.sub === allowedSub : Boolean(allowedEmail && claims.emailVerified && claims.email === allowedEmail);
    if (!allowed) {
      await repo.audit(ctx.db, { ownerId: null, actor: "user", action: "login", outcome: "denied", now: ctx.now() });
      return redirect("/?erro=conta_nao_autorizada");
    }
    const ownerId = await repo.upsertOwner(ctx.db, { sub: claims.sub, email: claims.email, name: ctx.env.OWNER_NAME ?? null, now: ctx.now() });
    await repo.ensureEmailRoutine(ctx.db, ownerId, ctx.now());
    await repo.ensureNewsRoutine(ctx.db, ownerId, ctx.now());
    const cookie = await startSession(ctx, req, ownerId);
    await repo.audit(ctx.db, { ownerId, actor: "user", action: "login", outcome: "ok", now: ctx.now() });
    return withSessionCookie(ctx, redirect("/"), cookie);
  }

  if (!st.ownerId || st.ownerId !== sessionOwnerId) return redirect("/?erro=sessao_trocada");

  if (st.purpose === "gsc") {
    if (!tokens.scope.includes("https://www.googleapis.com/auth/webmasters.readonly")) return redirect("/conexoes?erro=permissao_gsc_negada");
    if (!tokens.refreshToken) return redirect("/conexoes?erro=sem_refresh_token");
    const connId = await repo.upsertGscConnection(ctx.db, ctx.keys, {
      ownerId: st.ownerId,
      account: claims.email,
      scopes: tokens.scope,
      tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
      now: ctx.now(),
    });
    await repo.audit(ctx.db, { ownerId: st.ownerId, actor: "user", action: "gsc_connect", target: connId, outcome: "ok", detail: "scope=webmasters.readonly", now: ctx.now() });
    return redirect("/conexoes?ok=gsc");
  }

  // Conexão do Gmail: precisa da mesma sessão que iniciou o fluxo.
  if (!tokens.scope.includes("https://www.googleapis.com/auth/gmail.readonly")) return redirect("/conexoes?erro=permissao_gmail_negada");
  if (!tokens.refreshToken) return redirect("/conexoes?erro=sem_refresh_token");
  const profile = await getProfile(ctx.fetch, tokens.accessToken, ctx.now());
  const connId = await repo.upsertGmailConnection(ctx.db, ctx.keys, {
    ownerId: st.ownerId,
    email: profile.emailAddress.toLowerCase(),
    scopes: tokens.scope,
    tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
    now: ctx.now(),
  });
  await repo.ensureEmailRoutine(ctx.db, st.ownerId, ctx.now());
  await repo.ensureNewsRoutine(ctx.db, st.ownerId, ctx.now());
  await repo.audit(ctx.db, { ownerId: st.ownerId, actor: "user", action: "gmail_connect", target: connId, outcome: "ok", detail: "scope=gmail.readonly", now: ctx.now() });
  return redirect("/conexoes?ok=gmail");
};

// ---------------------------------------------------------------- Conexões

const EXTRA_AGENTS = ["noticias", "mercado", "marketing"] as const;

async function extraAgentCards(ctx: Ctx, ownerId: string) {
  const settings = await repo.listAgentSettings(ctx.db, ownerId);
  const byId = new Map(settings.map((s) => [s.agent_id, s]));
  const conns = await repo.listConnections(ctx.db, ownerId);
  const cfg = configured(ctx.env);
  const quotes = await repo.listQuotes(ctx.db, ownerId);
  const gsc = conns.find((c) => c.provider === "gsc" && c.status === "connected");
  const now = ctx.now();

  const noticiasMissing: string[] = [];
  const mercadoMissing: string[] = [];
  if (!cfg.finnhub) mercadoMissing.push("Ações (PETR4.SA) pedem FINNHUB_API_KEY no setup:cloud (plano gratuito da Finnhub). Cripto e câmbio não precisam de chave.");
  if (!quotes.length) mercadoMissing.push("Ainda sem cotação. Use Testar — nada é inventado.");
  const marketingMissing: string[] = [];
  if (!gsc) marketingMissing.push("Falta conectar o Google Search Console (só leitura).");
  if (!cfg.vercel) marketingMissing.push("Falta token da Vercel no setup:cloud (deployments; visitas só se Web Analytics Hobby estiver ativo).");
  marketingMissing.push("Redes sociais: planejadas, sem implementar.");

  return EXTRA_AGENTS.map((id) => {
    const s = byId.get(id);
    const base = {
      id,
      name: AGENTS[id].name,
      description: AGENTS[id].description,
      enabled: s ? s.enabled === 1 : true,
      lastTestAt: s?.last_test_at ?? null,
      lastError: s?.last_error ?? null,
    };
    if (id === "noticias") {
      return {
        ...base,
        sources: NEWS_FEEDS.map((f) => ({ id: f.id, label: `${f.outlet} · ${f.theme}`, detail: f.url })),
        missing: noticiasMissing,
        note: "Só feeds RSS/Atom da allowlist. Sem scraping de paywall.",
      };
    }
    if (id === "mercado") {
      return {
        ...base,
        sources: DEFAULT_ASSETS.map((a) => ({ id: a.symbol, label: `${a.label} (${a.symbol})`, detail: `${a.source} · alerta ±${a.alertAbsPct}%` })),
        quotes: quotes.map((q) => ({
          symbol: q.symbol,
          price: q.price,
          changePct: q.change_pct,
          source: q.source,
          quotedAt: q.quoted_at,
          fetchedAt: q.fetched_at,
          stale: isQuoteStale({ fetchedAt: q.fetched_at }, now),
          disclaimer: QUOTE_DISCLAIMER,
        })),
        missing: mercadoMissing,
        note: QUOTE_DISCLAIMER,
      };
    }
    return {
      ...base,
      sources: [
        ...(cfg.vercel ? [{ id: "vercel", label: "Vercel (leitura)", detail: "Deployments. Visitas só com Web Analytics Hobby ativo — sem número inventado." }] : []),
        ...(gsc ? [{ id: "gsc", label: `Search Console · ${gsc.account_label ?? "conectado"}`, detail: "webmasters.readonly" }] : []),
      ],
      missing: marketingMissing,
      note: "Ideias de post são rascunho. Publicar nunca é automático.",
    };
  });
}

route("GET", "/api/connections", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const rows = await repo.listConnections(ctx.db, ownerId!);
  return json({
    configured: configured(ctx.env),
    connections: rows.map((c) => ({ id: c.id, provider: c.provider, status: c.status, accountLabel: c.account_label, scopes: JSON.parse(c.scopes) as string[], lastSyncAt: c.last_sync_at, lastError: c.last_error })),
    agents: await extraAgentCards(ctx, ownerId!),
    providers: providerCards({ groqConfigured: configured(ctx.env).ai, groqPrivate: configured(ctx.env).aiPrivate }),
  });
});

route("POST", "/api/ai/providers/:id/test", { auth: true }, async (_ctx, _r, p) => {
  const r = runFictitiousProviderTest(p.id!);
  if (!r.ok) return problem(409, "provider_disabled", "reason" in r ? r.reason : "Provedor recusado.");
  return json(r);
});

route("POST", "/api/agents/:id/test", { auth: true }, async (ctx, _r, p, ownerId) => {
  const id = p.id as AgentId;
  if (!EXTRA_AGENTS.includes(id as (typeof EXTRA_AGENTS)[number])) return problem(404, "not_found", "Agente desconhecido.");
  const settings = await repo.agentSettings(ctx.db, ownerId!, id);
  if (settings && settings.enabled === 0) return problem(409, "disabled", `${AGENTS[id].name} está desativado.`, "disabled");
  const budget = new SubrequestBudget(44);
  const scoped: Ctx = { ...ctx, db: budget.watch(ctx.db), fetch: budget.wrap(ctx.fetch) };
  try {
    if (id === "noticias") {
      const r = await ingestNews(scoped, ownerId!, scoped.fetch, { maxFeeds: 4 });
      const items = await listRecentNews(scoped.db, ownerId!, 8);
      return json({ ok: true, agentId: id, fetched: r.fetched, stored: r.stored, failures: r.failures, subrequests: budget.used, sample: items.slice(0, 3).map((i) => ({ title: i.title, link: i.link, outlet: i.outlet })), published: false });
    }
    if (id === "mercado") {
      const r = await ingestQuotes(scoped, ownerId!, scoped.fetch);
      return json({
        ok: true,
        agentId: id,
        quotes: r.quotes.map((q) => ({ ...q, stale: isQuoteStale(q, ctx.now()), disclaimer: QUOTE_DISCLAIMER })),
        failures: r.failures,
        subrequests: budget.used,
        disclaimer: QUOTE_DISCLAIMER,
        traded: false,
      });
    }
    const r = await testMarketing(scoped, ownerId!, scoped.fetch);
    return json({ ok: true, agentId: id, subrequests: budget.used, ...r });
  } catch (e) {
    if (e instanceof BudgetExhausted) return problem(503, "internal", "Algo deu errado. Nada foi enviado ou alterado fora do Open Dot.", "subrequest_limit");
    throw e;
  }
});

route("POST", "/api/agents/:id/disable", { auth: true }, async (ctx, _r, p, ownerId) => {
  const id = p.id as AgentId;
  if (!EXTRA_AGENTS.includes(id as (typeof EXTRA_AGENTS)[number])) return problem(404, "not_found", "Agente desconhecido.");
  await repo.setAgentEnabled(ctx.db, ownerId!, id, false, ctx.now());
  if (id === "noticias") await repo.setRoutineKindEnabled(ctx.db, ownerId!, "news_review", false, ctx.now());
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "agent_disable", target: id, outcome: "ok", now: ctx.now() });
  return json({ ok: true, enabled: false });
});

route("POST", "/api/agents/:id/enable", { auth: true }, async (ctx, _r, p, ownerId) => {
  const id = p.id as AgentId;
  if (!EXTRA_AGENTS.includes(id as (typeof EXTRA_AGENTS)[number])) return problem(404, "not_found", "Agente desconhecido.");
  await repo.setAgentEnabled(ctx.db, ownerId!, id, true, ctx.now());
  if (id === "noticias") {
    await repo.ensureNewsRoutine(ctx.db, ownerId!, ctx.now());
    await repo.setRoutineKindEnabled(ctx.db, ownerId!, "news_review", true, ctx.now());
  }
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "agent_enable", target: id, outcome: "ok", now: ctx.now() });
  return json({ ok: true, enabled: true });
});

route("POST", "/api/connections/:id/disconnect", { auth: true }, async (ctx, _r, p, ownerId) => {
  const conn = await repo.getConnection(ctx.db, ownerId!, p.id!);
  if (!conn) return problem(404, "not_found", "Conexão não encontrada.");
  const tokens = await repo.readSecret(ctx.db, ctx.keys, ownerId!, conn.id).catch(() => null);
  const revoked = tokens?.refreshToken ? await revoke(ctx.fetch, tokens.refreshToken) : false;
  await repo.disconnect(ctx.db, ownerId!, conn.id, ctx.now());
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "disconnect", target: conn.id, outcome: revoked ? "revoked" : "local_only", now: ctx.now() });
  return json({ ok: true, revokedAtProvider: revoked });
});

// ---------------------------------------------------------------- Snapshot único (C1)

/** Partes do snapshot: as mesmas rotas GET que o app chamava uma a uma. */
const SNAPSHOT_PARTS = [
  ["feed", "/api/feed"],
  ["connections", "/api/connections"],
  ["routines", "/api/routines"],
  ["runs", "/api/runs"],
  ["usage", "/api/usage"],
  ["monitors", "/api/monitors"],
  ["status", "/api/status"],
  ["approvals", "/api/approvals"],
  ["shipments", "/api/shipments"],
] as const;

async function internalGet(ctx: Ctx, req: Request, path: string, ownerId: string): Promise<unknown> {
  const r = routes.find((x) => x.method === "GET" && x.pattern.test(path));
  if (!r) throw new Error("rota interna ausente");
  const sub = new Request(new URL(path, req.url), { method: "GET", headers: req.headers });
  const res = await r.handler(ctx, sub, {}, ownerId);
  if (!res.ok) throw new Error(`parte respondeu ${res.status}`);
  return res.json();
}

/**
 * Uma requisição no lugar de dez. Cada parte falha sozinha (vai para `failures` com
 * o motivo seguro) e as outras seguem. ETag fraca sobre o corpo: 304 quando nada mudou.
 */
route("GET", "/api/snapshot", { auth: true }, async (ctx, req, _p, ownerId) => {
  const owner = await repo.getOwner(ctx.db, ownerId!);
  const parts: Record<string, unknown> = {};
  const failures: Array<{ part: string; reason: string }> = [];
  for (const [name, path] of SNAPSHOT_PARTS) {
    try {
      parts[name] = await internalGet(ctx, req, path, ownerId!);
    } catch (e) {
      if (e instanceof BudgetExhausted) throw e;
      failures.push({ part: name, reason: safeReason(e) });
      parts[name] = null;
    }
  }
  const body = JSON.stringify({
    owner: owner && { email: owner.email, name: displayNameFor(owner.email, owner.display_name, owner.name_custom === 1, ctx.env.OWNER_NAME ?? ""), timeZone: owner.time_zone },
    ...parts,
    failures,
  });
  const etag = `W/"${(await sha256Hex(body)).slice(0, 32)}"`;
  const headers = { etag, "cache-control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
});

// ---------------------------------------------------------------- Feed, rotinas, execuções

route("GET", "/api/feed", { auth: true }, async (ctx, req, _p, ownerId) => {
  const u = new URL(req.url);
  const cursor = u.searchParams.get("before");
  let before: { createdAt: string; id: string } | null = null;
  if (cursor) {
    const parsed = z.object({ createdAt: z.string().min(1), id: z.string().min(1) }).safeParse(JSON.parse(atob(cursor)));
    if (!parsed.success) return problem(400, "invalid_input", "Página inválida.");
    before = parsed.data;
  }
  const items = await repo.listFeed(ctx.db, ctx.keys, ownerId!, { before, limit: 20, now: ctx.now() });
  const last = items.at(-1);
  return json({ items, next: items.length === 20 && last ? btoa(JSON.stringify({ createdAt: last.createdAt, id: last.id })) : null });
});

route("GET", "/api/routines", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const rows = await repo.listRoutines(ctx.db, ownerId!);
  return json({
    routines: rows.map((r) => {
      const spec = { routineId: r.id, ownerId: r.owner_id, times: JSON.parse(r.times) as string[], timeZone: r.time_zone, weekdays: JSON.parse(r.weekdays) as number[] };
      const next = r.enabled ? nextSlot(spec, ctx.now()) : null;
      return { id: r.id, agentId: r.agent_id, kind: r.kind, times: spec.times, timeZone: r.time_zone, weekdays: spec.weekdays, enabled: r.enabled === 1, nextRunAt: next ? new Date(next.scheduledAt).toISOString() : null };
    }),
  });
});

const RoutineInput = z.object({ times: z.array(z.string()).min(1).max(6), timeZone: z.string(), enabled: z.boolean() });

route("PUT", "/api/routines/:id", { auth: true }, async (ctx, req, p, ownerId) => {
  const body = RoutineInput.parse(await req.json());
  if (!isValidTimeZone(body.timeZone)) return problem(400, "invalid_tz", "Fuso horário inválido.");
  for (const t of body.times) parseHHMM(t);
  const res = await repo.updateRoutine(ctx.db, ownerId!, p.id!, { ...body, now: ctx.now() });
  if (res[0]?.changes !== 1) return problem(404, "not_found", "Rotina não encontrada.");
  return json({ ok: true, cancelledFutureRuns: res[1]?.changes ?? 0 });
});

route("POST", "/api/routines/:id/run-now", { auth: true }, async (ctx, _r, p, ownerId) => {
  const r = (await repo.listRoutines(ctx.db, ownerId!)).find((x) => x.id === p.id);
  if (!r) return problem(404, "not_found", "Rotina não encontrada.");
  const minute = Math.floor(ctx.now() / 60_000);
  const created = await repo.createRunForSlot(ctx.db, { ownerId: ownerId!, routineId: r.id, agentId: r.agent_id, kind: r.kind, slotKey: `${ownerId}:${r.id}:manual:${minute}`, scheduledAt: ctx.now(), late: false, now: ctx.now() });
  return json({ ok: true, created, note: "A revisão roda no próximo ciclo do agendador (até 5 minutos)." });
});

route("POST", "/api/correio/review-now", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const gmail = (await repo.listConnections(ctx.db, ownerId!)).find((c) => c.provider === "gmail" && c.status === "connected");
  if (!gmail) return problem(409, "not_connected", "Conecte o Gmail antes de revisar.");
  const budget = new SubrequestBudget(40);
  const f = budget.wrap(ctx.fetch);
  const sync = await syncGmail(ctx, gmail, f);
  const found = await shipments.extractShipments(ctx, ownerId!);
  const routine = (await repo.listRoutines(ctx.db, ownerId!)).find((r) => r.kind === "email_review");
  if (!routine) return json({ ok: true, synced: sync.fetched, shipments: found, reviewed: false, note: "Gmail sincronizado. Não há rotina de revisão." });
  const slotKey = `${ownerId}:${routine.id}:manual:${Math.floor(ctx.now() / 60_000)}`;
  await repo.createRunForSlot(ctx.db, { ownerId: ownerId!, routineId: routine.id, agentId: routine.agent_id, kind: routine.kind, slotKey, scheduledAt: ctx.now(), late: false, now: ctx.now() });
  const queued = await repo.runBySlot(ctx.db, ownerId!, slotKey);
  if (!queued) return json({ ok: true, synced: sync.fetched, shipments: found, reviewed: false, note: "Não foi possível abrir a revisão." });
  if (queued.state === "succeeded") return json({ ok: true, synced: sync.fetched, shipments: found, reviewed: true, note: "Revisão deste minuto já estava concluída." });
  const claimed = queued.state === "running" ? null : await repo.claimRun(ctx.db, queued, ctx.now());
  if (!claimed) return json({ ok: true, synced: sync.fetched, shipments: found, reviewed: false, note: "A revisão já está em andamento." });
  const result = await runEmailReview(ctx, claimed, f);
  await repo.finishRun(ctx.db, claimed, { state: result.state, ...(result.errorCode ? { errorCode: result.errorCode } : {}), ...(result.message ? { errorMessage: result.message } : {}), now: ctx.now() });
  const done = result.state === "succeeded";
  return json({
    ok: done,
    synced: sync.fetched,
    shipments: found,
    reviewed: true,
    state: result.state,
    note: done ? "Revisão concluída. Nada foi enviado." : (result.message ?? "A revisão não concluiu."),
  });
});

route("GET", "/api/runs", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const rows = await repo.listRuns(ctx.db, ownerId!, 30);
  return json({ runs: rows.map((r) => ({ id: r.id, agentId: r.agent_id, kind: r.kind, state: r.state, scheduledAt: r.scheduled_at, late: r.late === 1, attempt: r.attempt, errorCode: r.error_code, errorMessage: r.error_message, updatedAt: r.updated_at })) });
});

route("GET", "/api/usage", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const u = await repo.usageToday(ctx.db, ownerId!, ctx.now());
  return json({ ...u, limits: { calls: ctx.env.AI_CALLS_PER_DAY, tokens: ctx.env.AI_TOKENS_PER_DAY }, aiConfigured: configured(ctx.env).ai, privateAllowed: configured(ctx.env).aiPrivate });
});

// ---------------------------------------------------------------- Perguntas sobre o feed

const AskInput = z.object({ question: z.string().min(2).max(500) });

function terms(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9@.]+/)
    .filter((w) => w.length >= 3 && !["que", "qual", "quais", "com", "para", "por", "uma", "dos", "das", "meu", "minha", "tem", "algum", "alguma"].includes(w));
}

/**
 * Responde usando SOMENTE itens do feed do dono. Sem IA aprovada, devolve as fontes
 * encontradas por busca de palavras (degradação útil). Com IA, as citações são validadas.
 */
route("POST", "/api/ask", { auth: true }, async (ctx, req, _p, ownerId) => {
  const { question } = AskInput.parse(await req.json());
  const items = await repo.listFeed(ctx.db, ctx.keys, ownerId!, { before: null, limit: 30, now: ctx.now() });
  const q = terms(question);
  type Src = { id: string; title: string; detail: string; href: string | null; at: string };
  const sources: Array<Src & { score: number }> = [];
  for (const it of items) {
    const rows: Array<{ title: string; detail: string; href: string | null }> = [];
    const b = it.body as { top?: any[]; rest?: any[]; summary?: string; href?: string; abertura?: string; itens?: Array<{ titulo?: string; de?: string; o_que_aconteceu?: string; o_que_fazer?: string; href?: string | null }> };
    for (const m of [...(b.top ?? []), ...(b.rest ?? [])]) rows.push({ title: `${m.subject} — ${m.from}`, detail: m.reason, href: m.href ?? null });
    for (const m of b.itens ?? []) rows.push({ title: `${m.titulo ?? ""} — ${m.de ?? ""}`, detail: `${m.o_que_aconteceu ?? ""} ${m.o_que_fazer ?? ""}`, href: m.href ?? null });
    if (b.summary) rows.push({ title: it.title, detail: b.summary, href: b.href ?? null });
    if (b.abertura) rows.push({ title: it.title, detail: b.abertura, href: null });
    rows.forEach((r, i) => {
      const hay = terms(`${r.title} ${r.detail}`);
      const score = q.filter((t) => hay.some((h) => h.includes(t))).length;
      if (score > 0) sources.push({ id: `${it.id}#${i}`, ...r, at: it.createdAt, score });
    });
  }
  sources.sort((a, b) => b.score - a.score || b.at.localeCompare(a.at));
  const top = sources.slice(0, 5).map(({ score: _s, ...s }) => s);
  if (!top.length) return json({ answer: "Não encontrei nada sobre isso nas revisões guardadas. Posso estar sem dados dessa fonte ou do período.", sources: [], aiUsed: false, note: null });

  const router = makeRouter(ctx, ctx.fetch);
  const out = await router.run({
    ownerId: ownerId!,
    kind: "ask",
    capability: "answer",
    dataClass: "private_email",
    jsonMode: true,
    maxOutputTokens: 400,
    messages: [
      { role: "system", content: `${UNTRUSTED_SYSTEM_RULES}\nResponda em português, em até 3 frases, usando só as fontes. JSON: {"answer":"...","sources":["id",...]}` },
      { role: "user", content: `Pergunta: ${question}\n${renderUntrusted(top.map((s) => sanitizeUntrusted(s.id, `${s.title}\n${s.detail}`, 400)))}` },
    ],
  });
  if (out.status === "ok") {
    try {
      const parsed = JSON.parse(out.text) as { answer?: string; sources?: string[] };
      const refs = checkEvidenceRefs(parsed.sources ?? [], new Set(top.map((s) => s.id)));
      if (parsed.answer && refs.valid.length) return json({ answer: parsed.answer.slice(0, 800), sources: top.filter((s) => refs.valid.includes(s.id)), aiUsed: true, note: refs.invalid.length ? "Algumas citações da IA foram descartadas." : null });
    } catch {
      /* cai para a resposta por busca */
    }
  }
  const note = out.status === "unavailable" || out.status === "waiting_quota" ? out.reason : "Resposta da IA descartada por não citar fontes válidas.";
  return json({ answer: `Encontrei ${top.length} ${top.length === 1 ? "item relacionado" : "itens relacionados"}. Veja as fontes abaixo.`, sources: top, aiUsed: false, note });
});

// ---------------------------------------------------------------- Estado visual (para o Dot)

route("GET", "/api/status", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const runs = await repo.listRuns(ctx.db, ownerId!, 30);
  const conns = await repo.listConnections(ctx.db, ownerId!);
  const shipmentCount = await repo.countShipments(ctx.db, ownerId!);
  const trackingOn = configured(ctx.env).tracking;
  const agents: AgentId[] = ["dot", "correio", "codigo", "sentinela", "noticias", "mercado", "marketing", "entregas"];
  const out = agents.map((a) => {
    let semantic: SemanticState = "idle";
    let reason: string | null = null;
    const latest = runs.find((r) => r.agent_id === a);
    if (latest) {
      const age = ctx.now() - Date.parse(latest.updated_at);
      const active = latest.state === "running" || latest.state === "queued" || latest.state === "retry_scheduled";
      if (active && age <= 10 * 60_000) semantic = "working";
      else if (countsAsAgentError({ state: latest.state, errorCode: latest.error_code, ageMs: age })) {
        semantic = "error";
        reason = latest.error_code || (active ? "stale_run" : "unknown");
      } else if (latest.state === "waiting_approval") semantic = "waiting";
    }
    if (a === "correio") {
      const g = conns.find((c) => c.provider === "gmail" && c.status !== "disabled");
      if (g?.status === "reauth_required" && semantic !== "error") ((semantic = "disconnected"), (reason = "Reconecte o Gmail"));
    }
    if (a === "entregas" && shipmentCount === 0 && !trackingOn) {
      semantic = "disconnected";
      reason = "Não conectado";
    }
    return { ...toVisual(a, semantic, latest?.id ?? null, reason), revision: latest ? Date.parse(latest.updated_at) : 0 };
  });
  return json({ agents: out });
});

route("POST", "/api/feed/:id/done", { auth: true }, async (ctx, _req, p, ownerId) => {
  const ok = await repo.setFeedState(ctx.db, ownerId!, p.id!, "done", ctx.now(), null);
  if (!ok) return problem(404, "not_found", "Item não encontrado.");
  await repo.audit(ctx.db, { ownerId: ownerId!, actor: "user", action: "feed_done", target: p.id!, outcome: "ok", now: ctx.now() });
  return json({ ok: true });
});

route("POST", "/api/feed/:id/snooze", { auth: true }, async (ctx, _req, p, ownerId) => {
  const owner = await repo.getOwner(ctx.db, ownerId!);
  const tz = owner?.time_zone || "America/Sao_Paulo";
  const parts = localParts(ctx.now(), tz);
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const until = zonedTimeToUtc({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() }, "08:00", tz);
  const ok = await repo.setFeedState(ctx.db, ownerId!, p.id!, "snoozed", ctx.now(), new Date(until).toISOString());
  if (!ok) return problem(404, "not_found", "Item não encontrado.");
  await repo.audit(ctx.db, { ownerId: ownerId!, actor: "user", action: "feed_snooze", target: p.id!, outcome: "ok", now: ctx.now() });
  return json({ ok: true, until: new Date(until).toISOString() });
});

// ---------------------------------------------------------------- Aprovações

const DecisionInput = z.object({ decision: z.enum(["approve", "reject"]), expectedVersion: z.number().int(), payloadHash: z.string().length(64) });

route("GET", "/api/approvals", { auth: true }, async (ctx, _r, _p, ownerId) => json({ approvals: await repo.listApprovals(ctx.db, ctx.keys, ownerId!), canSend: GMAIL_CAN_SEND }));

const EditInput = z.object({
  expectedVersion: z.number().int(),
  proposal: z.object({
    action: z.string(),
    service: z.string(),
    account: z.string(),
    resource: z.string(),
    payload: z.record(z.unknown()),
    consequence: z.string(),
  }),
});

route("POST", "/api/approvals/:id/edit", { auth: true }, async (ctx, req, p, ownerId) => {
  const body = EditInput.parse(await req.json());
  const proposal = body.proposal as ActionProposal;
  const payloadHash = await hashProposal(proposal);
  const r = await repo.editApproval(ctx.db, ctx.keys, { ownerId: ownerId!, id: p.id!, proposal, payloadHash, expectedVersion: body.expectedVersion, now: ctx.now() });
  const status = r === "ok" ? 200 : r === "not_found" ? 404 : 409;
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "approval_edit", target: p.id!, outcome: r, now: ctx.now() });
  return json({ result: r, payloadHash: r === "ok" ? payloadHash : undefined, version: r === "ok" ? body.expectedVersion + 1 : undefined }, status);
});

route("POST", "/api/approvals/:id/decision", { auth: true }, async (ctx, req, p, ownerId) => {
  const body = DecisionInput.parse(await req.json());
  const r = await repo.decideApproval(ctx.db, { ownerId: ownerId!, id: p.id!, ...body, now: ctx.now() });
  const status = r === "ok" ? 200 : r === "not_found" ? 404 : 409;
  await repo.audit(ctx.db, { ownerId, actor: "user", action: `approval_${body.decision}`, target: p.id!, outcome: r, now: ctx.now() });
  if (body.decision === "approve" && r === "ok") {
    return json({ result: r, executed: false, sent: false, note: GMAIL_CAN_SEND ? null : "Envio ainda não habilitado. O Gmail continua só leitura." }, status);
  }
  return json({ result: r, executed: false, sent: false }, status);
});

// ---------------------------------------------------------------- Absorção de arquivos

route("POST", "/api/uploads", { auth: true }, async (ctx, req, _p, ownerId) => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > uploads.MAX_UPLOAD_BODY) return problem(413, "too_large", "Texto extraído grande demais.");
  const raw = await req.arrayBuffer();
  if (raw.byteLength > uploads.MAX_UPLOAD_BODY) return problem(413, "too_large", "Texto extraído grande demais.");
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return problem(400, "invalid_input", "Dados inválidos.");
  }
  const input = uploads.parseUploadInput(body);
  if (!input) return problem(400, "invalid_input", "Dados inválidos.");
  const r = await uploads.createUpload(ctx, ownerId!, input);
  if (!r.ok) return json({ error: { code: r.code, message: r.message }, ...(r.existing ? { existing: r.existing } : {}) }, r.status);
  return json(r, 201);
});

route("GET", "/api/uploads", { auth: true }, async (ctx, _r, _p, ownerId) => json({ uploads: await uploads.listUploads(ctx, ownerId!) }));

route("GET", "/api/uploads/:id", { auth: true }, async (ctx, _r, p, ownerId) => {
  const u = await uploads.getUpload(ctx, ownerId!, p.id!);
  return u ? json(u) : problem(404, "not_found", "Arquivo não encontrado.");
});

route("POST", "/api/uploads/:id/process", { auth: true }, async (ctx, _r, p, ownerId) => {
  const u = await uploads.processNow(ctx, ownerId!, p.id!);
  return u ? json(u) : problem(404, "not_found", "Arquivo não encontrado.");
});

route("DELETE", "/api/uploads/:id", { auth: true }, async (ctx, _r, p, ownerId) => {
  const ok = await uploads.deleteUpload(ctx, ownerId!, p.id!);
  if (ok) await repo.audit(ctx.db, { ownerId, actor: "user", action: "upload_delete", target: p.id!, outcome: "ok", now: ctx.now() });
  return ok ? json({ ok: true }) : problem(404, "not_found", "Arquivo não encontrado.");
});

// ---------------------------------------------------------------- Entregas

const ShipmentInput = z.object({
  code: z.string().trim().min(8).max(40),
  carrier: z.string().trim().min(2).max(40).optional(),
});

route("GET", "/api/shipments", { auth: true }, async (ctx, _r, _p, ownerId) => json(await shipments.shipmentSnapshot(ctx, ownerId!)));

route("POST", "/api/shipments", { auth: true }, async (ctx, req, _p, ownerId) => {
  const body = ShipmentInput.parse(await req.json());
  const r = await shipments.addShipment(ctx, ownerId!, body.code, body.carrier ?? null);
  if (!r.ok) return problem(r.status, r.code, r.message);
  if (r.created && r.shipment && !r.shipment.needsCarrier) {
    const budget = new SubrequestBudget(4);
    await shipments.pollShipments(ctx, ownerId!, budget.wrap(ctx.fetch), 1);
  }
  const snap = await shipments.shipmentSnapshot(ctx, ownerId!);
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "shipment_add", outcome: r.created ? "created" : "exists", now: ctx.now() });
  return json({ ...r, ...snap }, r.created ? 201 : 200);
});

route("POST", "/api/shipments/:id/carrier", { auth: true }, async (ctx, req, p, ownerId) => {
  const body = z.object({ carrier: z.string().trim().min(2).max(40) }).parse(await req.json());
  const ok = await shipments.confirmCarrier(ctx, ownerId!, p.id!, body.carrier);
  if (!ok) return problem(404, "not_found", "Encomenda não encontrada.");
  return json(await shipments.shipmentSnapshot(ctx, ownerId!));
});

route("DELETE", "/api/shipments/:id", { auth: true }, async (ctx, _r, p, ownerId) => {
  const ok = await repo.deleteShipment(ctx.db, ownerId!, p.id!);
  if (!ok) return problem(404, "not_found", "Encomenda não encontrada.");
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "shipment_delete", target: p.id!, outcome: "ok", now: ctx.now() });
  return json({ ok: true });
});

// ---------------------------------------------------------------- Monitores

const MonitorInput = z.object({ url: z.string().url().max(300), label: z.string().min(1).max(60) });

route("GET", "/api/monitors", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const rows = await repo.listMonitors(ctx.db, ownerId!);
  return json({ monitors: rows.map((m) => ({ id: m.id, url: m.url, label: m.label, enabled: m.enabled === 1, incident: JSON.parse(m.incident || "{}"), lastCheckAt: m.last_check_at })) });
});

route("POST", "/api/monitors/self", { auth: true }, async (ctx, _r, _p, ownerId) => {
  const url = selfHealthUrl(ctx.env.APP_ORIGIN);
  if (!url) return problem(409, "local_origin", "Vigiar o próprio Open Dot só funciona na versão publicada.");
  const rows = await repo.listMonitors(ctx.db, ownerId!);
  const existing = rows.find((m) => m.url === url);
  if (existing) return json({ id: existing.id, created: false });
  if (rows.length >= 3) return problem(409, "limit", "Limite de 3 sites no plano gratuito do Open Dot.");
  const host = new URL(url).hostname;
  const guard = checkTarget(url, [host]);
  if (!guard.ok) return problem(400, "blocked_target", `Endereço não permitido: ${guard.reason}.`);
  await repo.addMonitor(ctx.db, { ownerId: ownerId!, url, host, label: "Open Dot", now: ctx.now() });
  const saved = (await repo.listMonitors(ctx.db, ownerId!)).find((m) => m.url === url);
  if (!saved) return problem(500, "internal", "Não foi possível registrar o monitor.");
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "monitor_self", target: saved.id, outcome: "ok", now: ctx.now() });
  return json({ id: saved.id, created: true }, 201);
});

route("POST", "/api/monitors", { auth: true }, async (ctx, req, _p, ownerId) => {
  const body = MonitorInput.parse(await req.json());
  const host = new URL(body.url).hostname;
  const guard = checkTarget(body.url, [host]);
  if (!guard.ok) return problem(400, "blocked_target", `Endereço não permitido: ${guard.reason}.`);
  const count = (await repo.listMonitors(ctx.db, ownerId!)).length;
  if (count >= 3) return problem(409, "limit", "Limite de 3 sites no plano gratuito do Open Dot.");
  const id = await repo.addMonitor(ctx.db, { ownerId: ownerId!, url: body.url, host, label: body.label, now: ctx.now() });
  return json({ id });
});

// ---------------------------------------------------------------- Webhook GitHub (somente leitura)

route("POST", "/api/webhooks/github", { auth: false, csrf: false }, async (ctx, req) => {
  const secret = ctx.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return problem(404, "not_configured", "Webhook não configurado.");
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 1_000_000) return problem(413, "too_large", "Payload grande demais.");
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > 1_000_000) return problem(413, "too_large", "Payload grande demais.");
  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), secret))) return problem(401, "bad_signature", "Assinatura inválida.");
  const delivery = req.headers.get("x-github-delivery");
  const eventName = req.headers.get("x-github-event") ?? "";
  if (!delivery) return problem(400, "no_delivery", "Entrega sem ID.");
  const payload = JSON.parse(new TextDecoder().decode(raw)) as Record<string, any>;
  const ev = normalizeEvent(eventName, payload);
  // Dono vem da instalação registrada, nunca do payload.
  const inst = ev?.installationId ? (await ctx.db.query<{ owner_id: string }>("SELECT owner_id FROM od_github_installations WHERE installation_id = ? AND active = 1", [ev.installationId]))[0] : undefined;
  const fresh = await repo.recordDelivery(ctx.db, { provider: "github", deliveryId: delivery, ownerId: inst?.owner_id ?? null, payloadHash: await sha256Hex(raw), now: ctx.now() });
  if (!fresh) return json({ ok: true, duplicate: true });
  if (!ev || !inst || ev.kind === "installation") return json({ ok: true, ignored: true });
  const prev = (await ctx.db.query<{ updated_at: string }>("SELECT updated_at FROM od_github_resources WHERE owner_id = ? AND resource_key = ?", [inst.owner_id, ev.resourceKey]))[0];
  if (!isNewer(ev.updatedAt, prev?.updated_at ?? null)) return json({ ok: true, stale: true });
  await ctx.db.run(
    "INSERT INTO od_github_resources (owner_id, resource_key, kind, repo, title, state, conclusion, url, head_sha, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, resource_key) DO UPDATE SET title = excluded.title, state = excluded.state, conclusion = excluded.conclusion, url = excluded.url, head_sha = excluded.head_sha, updated_at = excluded.updated_at",
    [inst.owner_id, ev.resourceKey, ev.kind, ev.repo, ev.title, ev.state, ev.conclusion, ev.url, ev.headSha, ev.updatedAt],
  );
  if (ev.kind === "workflow" && ev.conclusion === "success") {
    await ctx.db.run(
      "UPDATE od_feed_items SET state = 'done', resolved_at = ? WHERE owner_id = ? AND kind = 'ci_failure' AND state = 'open' AND title = ?",
      [new Date(ctx.now()).toISOString(), inst.owner_id, `Workflow falhou em ${ev.repo}`],
    );
  }
  if (ev.kind === "workflow" && ev.conclusion === "failure") {
    await repo.insertFeed(ctx.db, ctx.keys, {
      ownerId: inst.owner_id,
      agentId: "codigo",
      runId: `gh:${ev.resourceKey}`,
      kind: "ci_failure",
      title: `Workflow falhou em ${ev.repo}`,
      body: { summary: `${ev.title} terminou com falha${ev.headSha ? ` no commit ${ev.headSha.slice(0, 7)}` : ""}. Os logs não foram baixados automaticamente.`, href: ev.url },
      freshness: "fresh",
      coverage: null,
      now: ctx.now(),
    });
  }
  return json({ ok: true });
});

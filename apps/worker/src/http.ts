import { sha256Hex } from "@open-dot/core";
import { randomToken } from "./crypto.ts";
import type { Ctx } from "./context.ts";
import { createSession, deleteSession, sessionOwner } from "./repo.ts";

export const SESSION_COOKIE = "od_session";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function problem(status: number, code: string, message: string, reason?: string): Response {
  const error: { code: string; message: string; reason?: string } = { code, message };
  if (reason) error.reason = reason;
  return json({ error }, status);
}

export function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store", ...headers } });
}

function isLocalOrigin(origin: string): boolean {
  const h = new URL(origin).hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export function sessionCookie(ctx: Ctx, token: string, maxAgeSec: number): string {
  const secure = isLocalOrigin(ctx.env.APP_ORIGIN) ? "" : "; Secure";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function currentOwner(ctx: Ctx, req: Request): Promise<string | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length < 20) return null;
  return sessionOwner(ctx.db, await sha256Hex(token), ctx.now());
}

export async function startSession(ctx: Ctx, req: Request, ownerId: string): Promise<string> {
  const token = randomToken();
  await createSession(ctx.db, { ownerId, idHash: await sha256Hex(token), now: ctx.now(), days: ctx.env.SESSION_DAYS, userAgent: req.headers.get("user-agent") });
  return sessionCookie(ctx, token, ctx.env.SESSION_DAYS * 86_400);
}

export async function endSession(ctx: Ctx, req: Request): Promise<string> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await deleteSession(ctx.db, await sha256Hex(token));
  return sessionCookie(ctx, "", 0);
}

/**
 * Proteção CSRF para mutações: exige cabeçalho próprio (não enviável por formulário
 * de outro site sem CORS) e, quando presente, Origin igual ao do app.
 */
export function csrfOk(ctx: Ctx, req: Request): boolean {
  if (req.headers.get("x-open-dot") !== "1") return false;
  const origin = req.headers.get("origin");
  if (origin && origin !== ctx.env.APP_ORIGIN) return false;
  return true;
}

export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

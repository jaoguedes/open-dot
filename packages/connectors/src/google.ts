import { parseRetryAfter } from "@open-dot/core";
import { ConnectorError, fetchWithTimeout } from "./errors.ts";

/**
 * OAuth 2.0 do Google (Authorization Code + PKCE, servidor confidencial).
 * Escopos conferidos em developers.google.com/workspace/gmail/api/auth/scopes (13/10/2026):
 * gmail.readonly é RESTRITO. Começamos só com leitura.
 */

export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";

export const LOGIN_SCOPES = ["openid", "email"];
export const GMAIL_READ_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"];
/** Search Console só leitura. Conferido em developers.google.com/webmaster-tools/v1/how-tos/authorizing (14/10/2026). */
export const GSC_READ_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/webmasters.readonly"];

export function authUrl(p: { clientId: string; redirectUri: string; scopes: string[]; state: string; codeChallenge: string; nonce?: string; loginHint?: string; offline: boolean }): string {
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", p.scopes.join(" "));
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (p.nonce) u.searchParams.set("nonce", p.nonce);
  if (p.loginHint) u.searchParams.set("login_hint", p.loginHint);
  if (p.offline) {
    // Necessário para receber refresh_token; "consent" garante o refresh na reconexão.
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
  }
  u.searchParams.set("include_granted_scopes", "false");
  return u.toString();
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string[];
  idToken: string | null;
}

async function tokenRequest(fetchImpl: typeof fetch, body: Record<string, string>, now: number): Promise<TokenSet> {
  const resp = await fetchWithTimeout(
    fetchImpl,
    GOOGLE_TOKEN,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() },
    15_000,
  );
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const err = String(data.error ?? "");
    if (err === "invalid_grant") throw new ConnectorError("reauth_required", "Acesso ao Google revogado ou expirado. Reconecte a conta.", null, resp.status);
    if (resp.status === 429) throw new ConnectorError("rate_limited", "Google limitou as requisições.", parseRetryAfter(resp.headers.get("retry-after")), 429);
    if (resp.status >= 500) throw new ConnectorError("upstream", `Google respondeu ${resp.status}`, null, resp.status);
    throw new ConnectorError("invalid_response", `Falha no token (${err || resp.status})`, null, resp.status);
  }
  if (typeof data.access_token !== "string") throw new ConnectorError("invalid_response", "Resposta de token sem access_token");
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt: now + Number(data.expires_in ?? 3600) * 1000,
    scope: String(data.scope ?? "").split(" ").filter(Boolean),
    idToken: typeof data.id_token === "string" ? data.id_token : null,
  };
}

export function exchangeCode(fetchImpl: typeof fetch, p: { clientId: string; clientSecret: string; code: string; codeVerifier: string; redirectUri: string; now: number }) {
  return tokenRequest(fetchImpl, { grant_type: "authorization_code", client_id: p.clientId, client_secret: p.clientSecret, code: p.code, code_verifier: p.codeVerifier, redirect_uri: p.redirectUri }, p.now);
}

export function refreshAccess(fetchImpl: typeof fetch, p: { clientId: string; clientSecret: string; refreshToken: string; now: number }) {
  return tokenRequest(fetchImpl, { grant_type: "refresh_token", client_id: p.clientId, client_secret: p.clientSecret, refresh_token: p.refreshToken }, p.now);
}

export async function revoke(fetchImpl: typeof fetch, token: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(fetchImpl, GOOGLE_REVOKE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() }, 10_000);
    return r.ok;
  } catch {
    return false;
  }
}

export interface IdClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Valida o ID token recebido DIRETAMENTE do endpoint de token do Google (TLS, servidor a servidor).
 * Pelo OpenID Connect Core 3.1.3.7, nesse caso a validação TLS pode substituir a checagem
 * de assinatura; ainda conferimos emissor, audiência, expiração e nonce.
 */
export function readIdToken(idToken: string, p: { clientId: string; nonce: string | null; now: number }): IdClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new ConnectorError("invalid_response", "ID token malformado");
  const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1]!.length / 4) * 4, "=")), (c) => c.charCodeAt(0)))) as Record<string, unknown>;
  const iss = json.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") throw new ConnectorError("invalid_response", "Emissor inesperado");
  const aud = json.aud;
  if (aud !== p.clientId && !(Array.isArray(aud) && aud.includes(p.clientId))) throw new ConnectorError("invalid_response", "Audiência inesperada");
  if (typeof json.exp !== "number" || json.exp * 1000 < p.now - 60_000) throw new ConnectorError("invalid_response", "ID token expirado");
  if (p.nonce !== null && json.nonce !== p.nonce) throw new ConnectorError("invalid_response", "Nonce não confere");
  if (typeof json.sub !== "string" || typeof json.email !== "string") throw new ConnectorError("invalid_response", "ID token sem sub/email");
  return { sub: json.sub, email: json.email.toLowerCase(), emailVerified: json.email_verified === true, name: typeof json.name === "string" ? json.name : null };
}

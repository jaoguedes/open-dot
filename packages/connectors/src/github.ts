// SPDX-License-Identifier: AGPL-3.0-only
import { timingSafeEqual, toHex } from "@open-dot/core";
import { ConnectorError, fetchWithTimeout } from "./errors.ts";

/**
 * GitHub App somente leitura. Webhook: HMAC SHA-256 do corpo bruto em X-Hub-Signature-256
 * com prefixo "sha256=", comparação em tempo constante, dedupe por X-GitHub-Delivery.
 * Token de instalação: validade de 1 hora, restringível a repositórios e permissões.
 * Fonte: docs.github.com (13/10/2026).
 */

export async function verifySignature(rawBody: Uint8Array, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=") || !secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody as BufferSource));
  return timingSafeEqual(`sha256=${toHex(mac)}`, header);
}

export const SUBSCRIBED_EVENTS = ["pull_request", "issues", "workflow_run", "check_run", "installation", "installation_repositories"] as const;

export interface GithubEvent {
  kind: "pr" | "issue" | "workflow" | "check" | "installation";
  installationId: number | null;
  repo: string | null;
  number: number | null;
  title: string;
  state: string;
  conclusion: string | null;
  url: string | null;
  headSha: string | null;
  updatedAt: string;
  /** Usado para não regredir com evento antigo. */
  resourceKey: string;
}

function safeGithubUrl(u: unknown): string | null {
  return typeof u === "string" && u.startsWith("https://github.com/") ? u : null;
}

export function normalizeEvent(eventName: string, payload: Record<string, any>): GithubEvent | null {
  const installationId = typeof payload.installation?.id === "number" ? payload.installation.id : null;
  const repo = typeof payload.repository?.full_name === "string" ? payload.repository.full_name : null;
  switch (eventName) {
    case "pull_request": {
      const pr = payload.pull_request ?? {};
      return {
        kind: "pr",
        installationId,
        repo,
        number: pr.number ?? null,
        title: String(pr.title ?? "").slice(0, 200),
        state: pr.merged ? "merged" : String(pr.state ?? payload.action),
        conclusion: null,
        url: safeGithubUrl(pr.html_url),
        headSha: pr.head?.sha ?? null,
        updatedAt: String(pr.updated_at ?? new Date().toISOString()),
        resourceKey: `${repo}#pr${pr.number}`,
      };
    }
    case "issues": {
      const is = payload.issue ?? {};
      return {
        kind: "issue",
        installationId,
        repo,
        number: is.number ?? null,
        title: String(is.title ?? "").slice(0, 200),
        state: String(is.state ?? payload.action),
        conclusion: null,
        url: safeGithubUrl(is.html_url),
        headSha: null,
        updatedAt: String(is.updated_at ?? new Date().toISOString()),
        resourceKey: `${repo}#issue${is.number}`,
      };
    }
    case "workflow_run": {
      const w = payload.workflow_run ?? {};
      return {
        kind: "workflow",
        installationId,
        repo,
        number: w.run_number ?? null,
        title: String(w.name ?? "workflow").slice(0, 200),
        state: String(w.status ?? ""),
        conclusion: w.conclusion ?? null,
        url: safeGithubUrl(w.html_url),
        headSha: w.head_sha ?? null,
        updatedAt: String(w.updated_at ?? new Date().toISOString()),
        resourceKey: `${repo}#run${w.id}`,
      };
    }
    case "check_run": {
      const c = payload.check_run ?? {};
      return {
        kind: "check",
        installationId,
        repo,
        number: null,
        title: String(c.name ?? "check").slice(0, 200),
        state: String(c.status ?? ""),
        conclusion: c.conclusion ?? null,
        url: safeGithubUrl(c.html_url),
        headSha: c.head_sha ?? null,
        updatedAt: String(c.completed_at ?? c.started_at ?? new Date().toISOString()),
        resourceKey: `${repo}#check${c.id}`,
      };
    }
    case "installation":
    case "installation_repositories":
      return {
        kind: "installation",
        installationId,
        repo: null,
        number: null,
        title: `Instalação ${payload.action}`,
        state: String(payload.action ?? ""),
        conclusion: null,
        url: null,
        headSha: null,
        updatedAt: new Date().toISOString(),
        resourceKey: `installation#${installationId}`,
      };
    default:
      return null;
  }
}

/** true quando o evento novo é mais recente que o último aplicado ao mesmo recurso. */
export function isNewer(incomingUpdatedAt: string, lastAppliedAt: string | null): boolean {
  if (!lastAppliedAt) return true;
  return Date.parse(incomingUpdatedAt) > Date.parse(lastAppliedAt);
}

// ---------- Autenticação como GitHub App (implementado; teste real pendente) ----------

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** GitHub entrega PKCS#1 ("BEGIN RSA PRIVATE KEY"); WebCrypto exige PKCS#8. Embrulha em ASN.1. */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algId = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const body = [0x02, 0x01, 0x00, ...algId, ...octet];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function appJwt(appId: string, privateKeyPem: string, now: number): Promise<string> {
  const der = pemToDer(privateKeyPem);
  const pkcs8 = privateKeyPem.includes("BEGIN RSA PRIVATE KEY") ? pkcs1ToPkcs8(der) : der;
  const key = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const iat = Math.floor(now / 1000) - 60; // tolerância de relógio
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iat, exp: iat + 9 * 60, iss: appId }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

export async function installationToken(
  fetchImpl: typeof fetch,
  p: { appId: string; privateKeyPem: string; installationId: number; repositoryIds?: number[]; now: number },
): Promise<{ token: string; expiresAt: number }> {
  const jwt = await appJwt(p.appId, p.privateKeyPem, p.now);
  const resp = await fetchWithTimeout(
    fetchImpl,
    `https://api.github.com/app/installations/${p.installationId}/access_tokens`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "open-dot" },
      body: JSON.stringify({
        ...(p.repositoryIds?.length ? { repository_ids: p.repositoryIds } : {}),
        permissions: { metadata: "read", pull_requests: "read", issues: "read", actions: "read", checks: "read" },
      }),
    },
    15_000,
  );
  if (resp.status === 404 || resp.status === 401) throw new ConnectorError("reauth_required", "Instalação do GitHub App removida ou chave inválida.", null, resp.status);
  if (!resp.ok) throw new ConnectorError("upstream", `GitHub respondeu ${resp.status}`, null, resp.status);
  const data = (await resp.json()) as { token: string; expires_at: string };
  return { token: data.token, expiresAt: Date.parse(data.expires_at) };
}

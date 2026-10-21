// SPDX-License-Identifier: AGPL-3.0-only
import { parseRetryAfter } from "@open-dot/core";
import { ConnectorError, fetchWithTimeout } from "./errors.ts";

/**
 * Google Search Console só leitura (`webmasters.readonly`).
 * Conferido em developers.google.com/webmaster-tools/v1/how-tos/authorizing (14/10/2026).
 * Sem inspeção de URL em massa e sem alteração de sitemaps.
 */

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export async function listGscSites(fetchImpl: typeof fetch, accessToken: string, now: number): Promise<GscSite[]> {
  const resp = await fetchWithTimeout(fetchImpl, "https://www.googleapis.com/webmasters/v3/sites", { headers: { authorization: `Bearer ${accessToken}` } }, 15_000);
  if (resp.status === 401 || resp.status === 403) throw new ConnectorError("reauth_required", "Reconecte o Search Console (só leitura).", null, resp.status);
  if (resp.status === 429) throw new ConnectorError("rate_limited", "Search Console limitou as requisições.", parseRetryAfter(resp.headers.get("retry-after"), now) ?? 60_000, 429);
  if (!resp.ok) throw new ConnectorError("upstream", `Search Console respondeu ${resp.status}`, null, resp.status);
  const data = (await resp.json()) as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> };
  return (data.siteEntry ?? [])
    .filter((s) => typeof s.siteUrl === "string" && s.siteUrl.startsWith("http"))
    .map((s) => ({ siteUrl: s.siteUrl!, permissionLevel: String(s.permissionLevel ?? "siteUnverifiedUser") }));
}

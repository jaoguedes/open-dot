import { parseRetryAfter } from "@open-dot/core";
import { ConnectorError, fetchWithTimeout } from "./errors.ts";

/**
 * Vercel somente leitura: GET /v7/deployments (conferido em vercel.com/docs/rest-api/deployments, 13/10/2026).
 * Account Webhooks são Pro/Enterprise; no plano gratuito usamos polling moderado.
 * Redeploy/rollback são escrita e nunca são automáticos.
 */

export interface Deployment {
  id: string;
  url: string | null;
  state: string;
  target: string | null;
  createdAt: number;
  sha: string | null;
  inspectorUrl: string | null;
}

export async function listDeployments(fetchImpl: typeof fetch, p: { token: string; projectId: string; teamId?: string; limit?: number; now: number }): Promise<Deployment[]> {
  const q = new URLSearchParams({ projectId: p.projectId, limit: String(Math.min(p.limit ?? 10, 20)) });
  if (p.teamId) q.set("teamId", p.teamId);
  const resp = await fetchWithTimeout(fetchImpl, `https://api.vercel.com/v7/deployments?${q}`, { headers: { authorization: `Bearer ${p.token}` } }, 15_000);
  if (resp.status === 401 || resp.status === 403) throw new ConnectorError("reauth_required", "Token da Vercel inválido ou sem acesso ao projeto.", null, resp.status);
  if (resp.status === 429) throw new ConnectorError("rate_limited", "Vercel limitou as requisições.", parseRetryAfter(resp.headers.get("retry-after"), p.now) ?? 60_000, 429);
  if (!resp.ok) throw new ConnectorError("upstream", `Vercel respondeu ${resp.status}`, null, resp.status);
  const data = (await resp.json()) as { deployments?: Array<Record<string, any>> };
  return (data.deployments ?? []).map((d) => ({
    id: String(d.uid ?? d.id),
    url: typeof d.url === "string" ? `https://${d.url}` : null,
    state: String(d.state ?? d.readyState ?? "UNKNOWN"),
    target: d.target ?? null,
    createdAt: Number(d.createdAt ?? d.created ?? 0),
    sha: d.meta?.githubCommitSha ?? null,
    inspectorUrl: typeof d.inspectorUrl === "string" && d.inspectorUrl.startsWith("https://vercel.com/") ? d.inspectorUrl : null,
  }));
}

/**
 * Web Analytics no Hobby pode existir no painel; a API de insights costuma recusar o plano Free.
 * Nunca inventa visitas: se a leitura falhar, devolve unavailable.
 */
export async function webAnalyticsHint(
  fetchImpl: typeof fetch,
  p: { token: string; projectId: string; teamId?: string },
): Promise<{ available: false; note: string }> {
  const q = new URLSearchParams({ projectId: p.projectId });
  if (p.teamId) q.set("teamId", p.teamId);
  try {
    const resp = await fetchWithTimeout(fetchImpl, `https://api.vercel.com/v1/web/insights?${q}`, { headers: { authorization: `Bearer ${p.token}` } }, 10_000);
    if (resp.ok) {
      return { available: false, note: "A API de insights respondeu, mas este app não lê números de visita ainda — só deployments. Sem dado inventado." };
    }
    return {
      available: false,
      note: `Web Analytics do Hobby não está disponível neste token (HTTP ${resp.status}). Visitas só aparecem se a conta tiver o recurso gratuito ativo; nada foi inventado.`,
    };
  } catch {
    return { available: false, note: "Não foi possível consultar Web Analytics. Deployments continuam só leitura. Sem visitas inventadas." };
  }
}

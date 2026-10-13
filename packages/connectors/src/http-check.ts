import { checkTarget, type Sample } from "@open-dot/core";

/**
 * Verificação HTTP de um site próprio: GET com timeout, limite de bytes,
 * redirecionamento manual revalidado contra a allowlist. Uma origem de medição
 * não representa todos os visitantes.
 */
export async function checkSite(
  fetchImpl: typeof fetch,
  p: { url: string; allowedHosts: string[]; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; now: () => number },
): Promise<Sample & { finalUrl: string | null }> {
  const timeoutMs = p.timeoutMs ?? 10_000;
  const maxBytes = p.maxBytes ?? 256 * 1024;
  let url = p.url;
  const started = p.now();
  for (let hop = 0; hop <= (p.maxRedirects ?? 3); hop++) {
    const guard = checkTarget(url, p.allowedHosts);
    if (!guard.ok) return { at: started, ok: false, status: null, latencyMs: null, error: `bloqueado: ${guard.reason}`, finalUrl: url };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetchImpl(url, { method: "GET", redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "open-dot-sentinela/0.1" } });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("location");
        if (!loc) return { at: started, ok: false, status: resp.status, latencyMs: p.now() - started, error: "redirecionamento sem destino", finalUrl: url };
        url = new URL(loc, url).toString();
        continue;
      }
      // Lê no máximo maxBytes, só para confirmar que a resposta chega.
      let read = 0;
      const reader = resp.body?.getReader();
      if (reader) {
        while (read < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          read += value?.byteLength ?? 0;
        }
        await reader.cancel().catch(() => {});
      }
      const latencyMs = p.now() - started;
      const ok = resp.status >= 200 && resp.status < 400;
      return { at: started, ok, status: resp.status, latencyMs, ...(ok ? {} : { error: `HTTP ${resp.status}` }), finalUrl: url };
    } catch {
      return { at: started, ok: false, status: null, latencyMs: null, error: ctrl.signal.aborted ? "tempo esgotado" : "falha de rede", finalUrl: url };
    } finally {
      clearTimeout(timer);
    }
  }
  return { at: started, ok: false, status: null, latencyMs: null, error: "redirecionamentos demais", finalUrl: url };
}

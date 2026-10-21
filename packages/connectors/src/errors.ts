// SPDX-License-Identifier: AGPL-3.0-only
/** Erros normalizados entre conectores. Funções não suportadas falham explicitamente. */
export type ConnectorErrorCode =
  | "reauth_required" // refresh inválido/revogado (invalid_grant)
  | "unauthorized" // 401 de acesso: tentar renovar uma vez
  | "forbidden_scope" // 403 por permissão ausente
  | "rate_limited" // 429 / rateLimitExceeded
  | "cursor_expired" // historyId antigo (404)
  | "not_found"
  | "upstream" // 5xx
  | "timeout"
  | "invalid_response"
  | "not_supported";

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
    readonly retryAfterMs: number | null = null,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new ConnectorError("timeout", `Tempo esgotado em ${new URL(url).host}`);
    throw new ConnectorError("upstream", `Falha de rede em ${new URL(url).host}`);
  } finally {
    clearTimeout(t);
  }
}

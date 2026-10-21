// SPDX-License-Identifier: AGPL-3.0-only
import { ConnectorError } from "@open-dot/connectors/errors.ts";
import { BudgetExhausted } from "./context.ts";

/**
 * Tira de um texto o que pode ser segredo ou dado pessoal antes de logar, gravar
 * ou responder: e-mail, cabeçalho Authorization, Bearer, pares chave=valor sensíveis,
 * JWT e sequências longas que parecem token.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/authorization\s*[:=]\s*(bearer\s+|basic\s+)?[^\s,;"']+/gi, "Authorization: [oculto]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [oculto]")
    .replace(/\b(token|access_token|refresh_token|id_token|api[_-]?key|key|secret|client_secret|password|senha|code|cookie|session)(["']?\s*[:=]\s*["']?)[^\s&,;"']+/gi, "$1$2[oculto]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-mail]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?/g, "[oculto]")
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, "[oculto]");
}

/** Log estruturado, sempre passando pelo scrub. Nunca use console.* direto no Worker. */
export function logSafe(level: "log" | "error", data: Record<string, unknown>): void {
  let text: string;
  try {
    text = JSON.stringify(data);
  } catch {
    text = JSON.stringify({ log: "unserializable" });
  }
  console[level](scrubSecrets(text));
}

/** Código seguro para a interface. Sem mensagem interna e sem segredo. */
export function safeReason(e: unknown): string {
  if (e instanceof BudgetExhausted) return "subrequest_limit";
  if (e instanceof ConnectorError) {
    if (e.code === "timeout") return "upstream_timeout";
    if (typeof e.status === "number" && e.status >= 400 && e.status <= 599) return `upstream_http_${e.status}`;
    return "unknown";
  }
  const msg = e instanceof Error ? e.message : "";
  if (/schema/i.test(msg)) return "schema_mismatch";
  if (/sqlite|database|hrana|turso/i.test(msg)) return "db_error";
  if (/timeout|tempo esgotado|aborted/i.test(msg)) return "upstream_timeout";
  if (/feed|xml|rss|atom/i.test(msg)) return "invalid_feed";
  return "unknown";
}

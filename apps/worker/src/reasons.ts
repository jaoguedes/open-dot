import { ConnectorError } from "@open-dot/connectors/errors.ts";
import { BudgetExhausted } from "./context.ts";

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

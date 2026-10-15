/** Quando o app pode buscar dados de novo (C1). Pura, para testar sem navegador. */
export const POLL_MS = 60_000;
export const FOCUS_MIN_GAP_MS = 15_000;

export type RefreshTrigger = "interval" | "focus" | "visible" | "manual";

export function shouldRefresh(trigger: RefreshTrigger, lastAt: number | null, now: number, hidden: boolean): boolean {
  if (trigger === "manual") return true;
  if (hidden) return false;
  if (lastAt === null) return true;
  if (trigger === "interval") return now - lastAt >= POLL_MS - 1_000;
  return now - lastAt >= FOCUS_MIN_GAP_MS;
}

/** Nome em português de cada parte do snapshot, para a faixa "desatualizado". */
export const SNAPSHOT_PART_LABEL: Record<string, string> = {
  feed: "feed",
  connections: "conexões",
  routines: "rotinas",
  runs: "execuções",
  usage: "uso",
  monitors: "monitores",
  status: "estado",
  approvals: "aprovações",
  shipments: "encomendas",
};

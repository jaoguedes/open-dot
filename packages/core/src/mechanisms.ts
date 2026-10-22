// SPDX-License-Identifier: AGPL-3.0-only
/** Identidade do mecanismo (D-027, v0.3); nunca inferir driver a partir da função do agente. */
export const MECHANISMS = [
  { id: "codex", name: "Codex", color: "#A48BFF" },
  { id: "claude-code", name: "Claude Code", color: "#FF9A55" },
  { id: "cursor", name: "Cursor", color: "#62AAFF" },
] as const;
export type MechanismId = (typeof MECHANISMS)[number]["id"];

/** Cores de identidade de agentes do Open Dot que não são ferramentas (D-027). */
export const AGENT_IDENTITY = { sentinela: "#4FE3B6", foco: "#F28FD0" } as const;
/** Intensidade padrão da cor interna do Dot por agente (aprovada pelo João). */
export const DEFAULT_TINT_INTENSITY = 100;

/** Identidade do mecanismo; nunca inferir driver a partir da função do agente. */
export const MECHANISMS = [
  { id: "codex", name: "Codex", color: "#8878EE" },
  { id: "claude-code", name: "Claude Code", color: "#E99A69" },
  { id: "cursor", name: "Cursor", color: "#69A9DE" },
] as const;
export type MechanismId = (typeof MECHANISMS)[number]["id"];

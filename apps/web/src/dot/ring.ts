// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
/** Anel da Sentinela: nos mini-Dots é a marca do agente; no Dot grande, só enquanto trabalha. */
export function showSentinelaRing(opts: { agentId: string; size: number; semantic: string; ring?: boolean }): boolean {
  if (opts.ring !== undefined) return opts.ring;
  if (opts.agentId !== "sentinela") return false;
  if (opts.size <= 48) return true;
  return opts.semantic === "working" || opts.semantic === "thinking";
}

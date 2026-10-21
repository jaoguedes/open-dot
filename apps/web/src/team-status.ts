// SPDX-License-Identifier: AGPL-3.0-only
export interface ToolSnap {
  id: string;
  installed: boolean;
  version: string | null;
  loggedIn: boolean | null;
  authMethod: string | null;
  possiblyPaid: boolean;
  executable: boolean;
  reason: string;
}

/** Estado de uma ferramenta em texto; a cor do selo nunca é o único sinal. */
export function toolStatus(t: ToolSnap | undefined, estado: string): { label: string; tone: "ok" | "off" | "warn" } {
  if (estado === "planejado") return { label: "Planejada", tone: "off" };
  if (!t || !t.installed) return { label: "Não instalada", tone: "off" };
  if (t.loggedIn !== true) return { label: "Instalada, sem login", tone: "warn" };
  if (t.possiblyPaid) return { label: "Login possivelmente pago: não usado", tone: "warn" };
  if (estado === "indisponivel") return { label: "Instalada; integração indisponível", tone: "off" };
  if (!t.executable) return { label: "Logada; driver desligado", tone: "warn" };
  return { label: "Pronta", tone: "ok" };
}

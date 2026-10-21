// SPDX-License-Identifier: AGPL-3.0-only
import type { MechanismId } from "@open-dot/core/mechanisms.ts";

export interface Driver {
  id: MechanismId;
  installed: boolean;
  authenticated: boolean;
  executable: boolean;
  reason: string;
}

/** Estado do mecanismo dito em texto, a partir do Runner autenticado; nunca do navegador. */
export function handoffStatus(driver: Driver | undefined, online: boolean): { label: string; tone: "ok" | "off" | "warn" } {
  if (!driver) return { label: "Sem diagnóstico do Runner", tone: "off" };
  if (!online) return { label: "Runner offline", tone: "off" };
  if (!driver.installed) return { label: "CLI não instalado", tone: "off" };
  if (!driver.authenticated) return { label: "Sem login oficial", tone: "warn" };
  if (!driver.executable) return { label: "Indisponível neste Runner", tone: "off" };
  return { label: "Pode receber o pacote de continuidade", tone: "ok" };
}

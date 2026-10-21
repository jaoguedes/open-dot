// SPDX-License-Identifier: AGPL-3.0-only
import { agentsIn, buildRegistry, type AgentEntry, type AgentPlace } from "./agents.ts";
import type { AgentId } from "./types.ts";
import { AGENT_COLORS, DEFAULT_ACCESSORY } from "./visual.ts";

/** Registro único dos agentes (E1). Para adicionar um agente, veja CONTRIBUTING.md. */
export const AGENT_REGISTRY: readonly AgentEntry[] = buildRegistry(AGENT_COLORS, DEFAULT_ACCESSORY);

export function agentsInPlace(place: AgentPlace): AgentId[] {
  return agentsIn<AgentId>(place, AGENT_REGISTRY);
}

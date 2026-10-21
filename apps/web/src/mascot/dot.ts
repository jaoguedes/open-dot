// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Fronteira do mascote: o app importa só de "@open-dot/mascot". Este adaptador liga ao Dot,
 * cujo código e arte têm licença própria (LICENSE-DOT-ASSETS.md). Forks sem o Dot usam
 * tsconfig.placeholder.json, que aponta a fronteira para ./placeholder (AGPL).
 */
export { AgentDot, type AgentDotProps } from "../dot/AgentDot.tsx";
export { SplashScreen } from "../dot/SplashScreen.tsx";
export { CROWN_UNLOCKED } from "../dot/accessories.ts";
export const MASCOT = { kind: "dot", name: "Dot" } as const;

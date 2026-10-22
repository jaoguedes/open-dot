// SPDX-License-Identifier: AGPL-3.0-only
/** Componentes base do v0.3 (docs/DESIGN.md): rótulo mono, chip, disco de agente e cartão. */
import type { ReactNode } from "react";
import { AGENT_IDENTITY, MECHANISMS } from "@open-dot/core";

export type AgentKey = (typeof MECHANISMS)[number]["id"] | keyof typeof AGENT_IDENTITY;

const NAMES: Record<AgentKey, string> = { codex: "Codex", "claude-code": "Claude Code", cursor: "Cursor", sentinela: "Sentinela", foco: "Foco" };

export function agentColor(id: string): string | null {
  const m = MECHANISMS.find((x) => x.id === id);
  if (m) return m.color;
  return (AGENT_IDENTITY as Record<string, string>)[id] ?? null;
}

export function agentName(id: string): string {
  return (NAMES as Record<string, string>)[id] ?? id;
}

export function MonoLabel({ children, tone }: { children: ReactNode; tone?: "amber" }) {
  return <span className={`mono-label${tone ? ` ${tone}` : ""}`}>{children}</span>;
}

/** Chip fixo da demonstração (regra 7): aparece sempre que os dados não são reais. */
export function DemoChip() {
  return (
    <span className="mono-label amber" role="note">
      DADOS DE EXEMPLO
    </span>
  );
}

export function Chip({ children, onClick, pressed }: { children: ReactNode; onClick?: () => void; pressed?: boolean }) {
  if (onClick)
    return (
      <button type="button" className="chip-v3" aria-pressed={pressed} onClick={onClick}>
        {children}
      </button>
    );
  return <span className="chip-v3">{children}</span>;
}

/** Disco simples com a cor do agente; o nome vem em texto (a cor nunca é o único sinal). */
export function AgentDisc({ id, size = 40, label }: { id: string; size?: number; label?: boolean }) {
  const color = agentColor(id) ?? "var(--blue)";
  const name = agentName(id);
  return (
    <span className="agent-disc-wrap">
      <span className="agent-disc" style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.4) }} aria-hidden={label ? true : undefined} title={label ? undefined : name}>
        {name.slice(0, 1)}
      </span>
      {label && <span className="agent-disc-name">{name}</span>}
    </span>
  );
}

export function Card({ children, className, as = "section", labelledBy }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; labelledBy?: string }) {
  const Tag = as;
  return (
    <Tag className={`card-v3${className ? ` ${className}` : ""}`} aria-labelledby={labelledBy}>
      {children}
    </Tag>
  );
}

// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Casca do v0.3 (docs/DESIGN.md): trilho recolhido de 84 px no computador e barra inferior de
 * 4 itens no celular. O trilho abre ao passar o mouse, no foco ou pelo botão, SOBRE o conteúdo;
 * fecha com Esc ou clique fora. "Fixar aberto" fica só neste navegador e, aí sim, ocupa espaço.
 */
import { useEffect, useRef, useState } from "react";
import { AgentDot } from "@open-dot/mascot";
import { useApp } from "../store.tsx";
import { Icon, type IconName } from "./Icons.tsx";
import { agentColor, agentName } from "./ui.tsx";

export interface RailItem {
  path: string;
  label: string;
  icon: IconName;
}

export const RAIL: RailItem[] = [
  { path: "/meu-dia", label: "Meu dia", icon: "home" },
  { path: "/workspace", label: "Workspace", icon: "grid" },
  { path: "/runner", label: "Runner", icon: "terminal" },
  { path: "/correio", label: "Correio e Notícias", icon: "news" },
  { path: "/rotinas", label: "Rotinas", icon: "clock" },
  { path: "/conexoes", label: "Conexões", icon: "plug" },
  { path: "/memoria", label: "Memória", icon: "memory" },
  { path: "/mascote", label: "Mascote", icon: "sparkle" },
];

/** Discos de agente: ferramentas levam à Equipe; Sentinela e Foco à página do agente. */
export const RAIL_AGENTS: Array<{ id: string; path: string }> = [
  { id: "codex", path: "/equipe" },
  { id: "claude-code", path: "/equipe" },
  { id: "cursor", path: "/equipe" },
  { id: "sentinela", path: "/agente/sentinela" },
  { id: "foco", path: "/agente/foco" },
];

export const BOTTOM: RailItem[] = [
  { path: "/workspace", label: "Workspace", icon: "grid" },
  { path: "/runner", label: "Runner", icon: "terminal" },
  { path: "/correio", label: "Correio", icon: "news" },
  { path: "/mais", label: "Mais", icon: "menu" },
];

const PIN_KEY = "od-rail-pinned";

function readPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function isCurrent(path: string, current: string): boolean {
  if (path === "/meu-dia") return current === "/" || current === "/meu-dia";
  return current === path || current.startsWith(`${path}/`);
}

export function Rail({ go, current }: { go: (p: string) => void; current: string }) {
  const app = useApp();
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [pinned, setPinned] = useState(readPinned);
  const ref = useRef<HTMLElement>(null);
  const open = pinned || hover || focusIn || toggled;

  useEffect(() => {
    document.documentElement.dataset.rail = pinned ? "pinned" : "collapsed";
    try {
      localStorage.setItem(PIN_KEY, pinned ? "1" : "0");
    } catch {
      /* preferência só local; sem armazenamento, o trilho fica recolhido */
    }
  }, [pinned]);

  useEffect(() => {
    if (!open || pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setHover(false);
      setToggled(false);
      if (ref.current?.contains(document.activeElement)) (document.getElementById("conteudo") as HTMLElement | null)?.focus();
      setFocusIn(false);
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setToggled(false);
        setHover(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, pinned]);

  const nav = (p: string) => {
    setToggled(false);
    setHover(false);
    go(p);
  };
  const initial = (app.snap?.owner?.name || "Você").trim().slice(0, 1).toUpperCase();
  return (
    <nav
      ref={ref}
      className={`rail${open ? " open" : ""}${pinned ? " pinned" : ""}`}
      aria-label="Navegação principal"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) setFocusIn(false);
      }}
    >
      <a className="rail-logo" href="/meu-dia" aria-label="Open Dot, Meu dia" title="Open Dot" onClick={(e) => (e.preventDefault(), nav("/meu-dia"))}>
        <AgentDot visual={app.visualFor("dot")} accessory="none" size={48} animate={false} reducedMotion={app.reducedMotion} label="Open Dot" />
        <span className="rail-label od-wordmark" aria-hidden="true">
          <span>open</span>
          <b>dot</b>
        </span>
      </a>
      <button type="button" className="rail-toggle" aria-label={open ? "Recolher menu" : "Expandir menu"} aria-expanded={open} title={open ? "Recolher menu" : "Expandir menu"} onClick={() => (pinned ? setPinned(false) : setToggled((v) => !v))}>
        <Icon name={open ? "x" : "menu"} size={18} />
      </button>
      <div className="rail-items">
        {RAIL.map((n) => {
          const on = isCurrent(n.path, current);
          return (
            <a key={n.path} href={n.path} className="rail-item" aria-label={n.label} title={open ? undefined : n.label} aria-current={on ? "page" : undefined} onClick={(e) => (e.preventDefault(), nav(n.path))}>
              <Icon name={n.icon} size={22} />
              <span className="rail-label" aria-hidden="true">
                {n.label}
              </span>
            </a>
          );
        })}
      </div>
      <hr className="rail-sep" />
      <div className="rail-items" role="group" aria-label="Agentes">
        {RAIL_AGENTS.map((a) => (
          <a key={a.id} href={a.path} className="rail-item rail-agent" aria-label={`${agentName(a.id)}: ${a.path === "/equipe" ? "ver na Equipe" : "abrir"}`} title={open ? undefined : agentName(a.id)} onClick={(e) => (e.preventDefault(), nav(a.path))}>
            <span className="rail-disc" style={{ background: agentColor(a.id) ?? "var(--blue)" }} aria-hidden="true">
              {agentName(a.id).slice(0, 1)}
            </span>
            <span className="rail-label" aria-hidden="true">
              {agentName(a.id)}
            </span>
          </a>
        ))}
      </div>
      <span className="rail-grow" />
      <label className="rail-pin">
        <input type="checkbox" aria-label="Fixar menu aberto" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        <Icon name="pin" size={16} />
        <span className="rail-label" aria-hidden="true">
          Fixar aberto
        </span>
      </label>
      <a className="rail-item rail-avatar" href="/configuracoes" aria-label="Configurações e conta" title={open ? undefined : "Configurações e conta"} aria-current={isCurrent("/configuracoes", current) ? "page" : undefined} onClick={(e) => (e.preventDefault(), nav("/configuracoes"))}>
        <span className="rail-disc avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="rail-label" aria-hidden="true">
          Configurações
        </span>
      </a>
    </nav>
  );
}

export function BottomBar({ go, current }: { go: (p: string) => void; current: string }) {
  return (
    <nav className="bottombar" aria-label="Principal">
      {BOTTOM.map((n) => {
        const on = isCurrent(n.path, current);
        return (
          <a key={n.path} href={n.path} className={`bottom-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(n.path))}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

// SPDX-License-Identifier: AGPL-3.0-only
import { AGENTS, agentsInPlace } from "@open-dot/core";
import { AgentDot } from "@open-dot/mascot";
import { useApp } from "../store.tsx";
import { Icon, type IconName } from "../components/Icons.tsx";
import "../screens.css";

const LINKS: Array<{ path: string; label: string; icon: IconName }> = [
  { path: "/meu-dia", label: "Meu dia", icon: "home" },
  { path: "/conexoes", label: "Conexões", icon: "plug" },
  { path: "/equipe", label: "Equipe", icon: "chat" },
  { path: "/rotinas", label: "Rotinas", icon: "clock" },
  { path: "/memoria", label: "Memória", icon: "memory" },
  { path: "/mascote", label: "Mascote", icon: "sparkle" },
  { path: "/configuracoes", label: "Configurações", icon: "sliders" },
];
const LIST = agentsInPlace("list");

/** Mais (celular): o que não cabe na barra inferior, com alvos de toque grandes, e a lista de agentes. */
export function More() {
  const app = useApp();
  return (
    <section className="screen screen-narrow" aria-labelledby="more-title">
      <header className="screen-head">
        <h1 id="more-title">Mais</h1>
      </header>
      <nav aria-label="Mais páginas" className="more-grid">
        {LINKS.map((l) => (
          <a
            key={l.path}
            href={l.path}
            className="card more-tile"
            onClick={(e) => {
              e.preventDefault();
              app.navigate(l.path);
            }}
          >
            <Icon name={l.icon} size={22} />
            <span>{l.label}</span>
          </a>
        ))}
      </nav>
      <h2 className="screen-section">Agentes</h2>
      <nav aria-label="Agentes" className="more-grid">
        {LIST.map((a) => (
          <a
            key={a}
            href={`/agente/${a}`}
            className="card more-tile"
            onClick={(e) => {
              e.preventDefault();
              app.navigate(`/agente/${a}`);
            }}
          >
            <AgentDot visual={app.visualFor(a)} accessory={app.accessoryFor(a)} size={44} animate={false} reducedMotion={app.reducedMotion} />
            <span>{AGENTS[a].name}</span>
          </a>
        ))}
      </nav>
    </section>
  );
}

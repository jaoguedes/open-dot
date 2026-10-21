// SPDX-License-Identifier: AGPL-3.0-only
import { useApp } from "../store.tsx";
import { Icon, type IconName } from "../components/Icons.tsx";
import "../screens.css";

const LINKS: Array<{ path: string; label: string; icon: IconName }> = [
  { path: "/workspace", label: "Workspace", icon: "layers" },
  { path: "/runner", label: "Runner", icon: "code" },
  { path: "/equipe", label: "Equipe", icon: "chat" },
  { path: "/rotinas", label: "Rotinas", icon: "clock" },
  { path: "/conexoes", label: "Conexões", icon: "plug" },
  { path: "/memoria", label: "Memória", icon: "file" },
  { path: "/mascote", label: "Mascote", icon: "sparkle" },
  { path: "/configuracoes", label: "Configurações", icon: "panel" },
];

/** Mais (celular): o que não cabe no dock, com alvos de toque grandes. */
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
    </section>
  );
}

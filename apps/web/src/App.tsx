import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, SEMANTIC_PRIORITY, type AgentId } from "@open-dot/core";
import { useApp } from "./store.tsx";
import { Icon, type IconName } from "./components/Icons.tsx";
import { AgentDot } from "./dot/AgentDot.tsx";
import { SplashScreen } from "./dot/SplashScreen.tsx";
import { api } from "./api.ts";
import { Home } from "./views/Home.tsx";
import { MyDay } from "./views/MyDay.tsx";
import { Routines } from "./views/Routines.tsx";
import { Connections } from "./views/Connections.tsx";
import { Mascot } from "./views/Mascot.tsx";
import { ContextPanel } from "./components/ContextPanel.tsx";
import { fmtHeaderStamp, fmtTime } from "./format.ts";

function useSplash(loading: boolean, reduced: boolean): { show: boolean; fading: boolean } {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);
  const t0 = useRef(performance.now());
  useEffect(() => {
    if (loading) return;
    let fadeT = 0;
    const wait = Math.max(0, 1200 - (performance.now() - t0.current));
    const showT = window.setTimeout(() => {
      setFading(true);
      fadeT = window.setTimeout(() => setShow(false), reduced ? 0 : 250);
    }, wait);
    return () => {
      window.clearTimeout(showT);
      if (fadeT) window.clearTimeout(fadeT);
    };
  }, [loading, reduced]);
  return { show, fading };
}

const SIDEBAR_AGENTS: AgentId[] = ["dot", "correio", "codigo", "sentinela"];
const LIST_AGENTS: AgentId[] = ["correio", "codigo", "sentinela", "foco"];

interface NavDef {
  path: string;
  label: string;
  icon: IconName;
}
const NAV: NavDef[] = [
  { path: "/meu-dia", label: "Meu dia", icon: "home" },
  { path: "/rotinas", label: "Rotinas", icon: "clock" },
  { path: "/conexoes", label: "Conexões", icon: "plug" },
  { path: "/mascote", label: "Mascote", icon: "sparkle" },
];

export function App() {
  const app = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
      if (e.key === "Escape") {
        setMenuOpen(false);
        setCtxOpen(false);
        setPalette(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const splash = useSplash(app.mode === "loading", app.reducedMotion);
  if (app.mode === "loading" && splash.show) {
    return <SplashScreen fading={splash.fading} reducedMotion={app.reducedMotion} />;
  }
  if (app.mode === "login") {
    return (
      <>
        {splash.show && <SplashScreen fading={splash.fading} reducedMotion={app.reducedMotion} />}
        <div aria-hidden={splash.show && !splash.fading ? true : undefined}>
          <Login />
        </div>
      </>
    );
  }
  if (app.mode === "setup") {
    return (
      <>
        {splash.show && <SplashScreen fading={splash.fading} reducedMotion={app.reducedMotion} />}
        <Setup />
      </>
    );
  }

  const go = (p: string) => {
    app.navigate(p);
    setMenuOpen(false);
  };
  const agentMatch = /^\/agente\/(\w+)$/.exec(app.path);
  const agentId = (agentMatch?.[1] && agentMatch[1] in AGENTS ? agentMatch[1] : null) as AgentId | null;
  const route = agentId ? "agent" : app.path;
  const showContext = route === "/" || route === "agent";

  let view;
  switch (route) {
    case "/meu-dia":
      view = <MyDay />;
      break;
    case "/rotinas":
      view = <Routines />;
      break;
    case "/conexoes":
      view = <Connections />;
      break;
    case "/mascote":
      view = <Mascot />;
      break;
    case "agent":
      view = <Home agentId={agentId!} />;
      break;
    default:
      view = <Home agentId="dot" />;
  }

  return (
    <>
      {splash.show && <SplashScreen fading={splash.fading} reducedMotion={app.reducedMotion} />}
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="app">
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        <Sidebar open={menuOpen} go={go} current={app.path} />
        <div className="main">
          <div>
            {app.mode === "demo" && (
              <div className="banner demo" role="status">
                <Icon name="layers" />
                <span>
                  <b>Demonstração</b> · dados fictícios. {app.demoReason} Nada aqui está conectado.
                </span>
              </div>
            )}
            {!app.online && (
              <div className="banner err" role="status">
                <Icon name="alert" /> Você está offline. Mostrando os últimos dados carregados{app.lastLoadedAt ? ` (${fmtTime(new Date(app.lastLoadedAt).toISOString())})` : ""}.
              </div>
            )}
            {app.online && app.failures.length > 0 && (
              <div className="banner err" role="status">
                <Icon name="alert" /> Não consegui atualizar: {app.failures.join(", ")}. Os dados exibidos podem estar desatualizados.
                <button className="btn ghost" onClick={() => void app.refresh()}>
                  Tentar de novo
                </button>
              </div>
            )}
            <header className="topbar">
              <button className="icon-btn menu-btn" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
                <Icon name="menu" />
              </button>
              <time className="top-date hide-sm" dateTime={new Date().toISOString()}>{fmtHeaderStamp()}</time>
              <div className="spacer" />
              <Island go={go} />
              <div className="spacer" />
              <button className="search" onClick={() => setPalette(true)} aria-label="Pergunte ao Dot">
                <Icon name="search" size={16} /> Pergunte ao Dot <kbd>⌘K</kbd>
              </button>
              {showContext && (
                <button className="icon-btn" aria-label="Mostrar contexto" aria-expanded={ctxOpen} onClick={() => setCtxOpen((v) => !v)}>
                  <Icon name="panel" />
                </button>
              )}
              <ThemeButton />
            </header>
          </div>
          <div className={`workspace ${showContext ? "" : "no-context"}`}>
            <main id="conteudo" className="content" tabIndex={-1}>
              <div className="reading">{view}</div>
            </main>
            {showContext && <ContextPanel open={ctxOpen} onClose={() => setCtxOpen(false)} agentId={agentId ?? "dot"} />}
          </div>
        </div>
      </div>
      {palette && <Palette onClose={() => setPalette(false)} go={go} />}
      <div className="sr-only" aria-live="polite">
        {app.announcement}
      </div>
    </>
  );
}

function Sidebar({ open, go, current }: { open: boolean; go: (p: string) => void; current: string }) {
  const app = useApp();
  const pending = app.snap?.feed.filter((f) => f.kind !== "notice" && f.kind !== "file_organized").length ?? 0;
  const usage = app.snap?.usage;
  const pct = usage ? Math.min(100, Math.round((usage.calls / Math.max(1, usage.limits.calls)) * 100)) : 0;
  const statusLine = (a: AgentId) => {
    const v = app.visualFor(a);
    if (v.reason) return v.reason;
    if (a === "correio") {
      const g = app.snap?.connections.find((c) => c.provider === "gmail" && c.status !== "disabled");
      if (!g) return app.mode === "demo" ? "3 mensagens importantes (exemplo)" : "Gmail não conectado";
    }
    if (a === "codigo" && !app.snap?.configured.github) return app.mode === "demo" ? "1 workflow falhou (exemplo)" : "GitHub não configurado";
    if (a === "sentinela" && !app.snap?.monitors.length) return app.mode === "demo" ? "Um site pede atenção (exemplo)" : "Nenhum site cadastrado";
    return v.label;
  };
  return (
    <nav className={`sidebar ${open ? "open" : ""}`} aria-label="Navegação principal">
      <a className="brand" href="/meu-dia" onClick={(e) => (e.preventDefault(), go("/meu-dia"))}>
        <AgentDot visual={app.visualFor("dot")} accessory="none" size={30} animate={false} reducedMotion={app.reducedMotion} label="Open Dot" />
        <span className="od-wordmark"><span>open</span><b>dot</b></span>
      </a>
      <div className="nav">
        {NAV.map((n) => (
          <a key={n.path} href={n.path} className="nav-item" aria-current={current === n.path ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(n.path))}>
            <Icon name={n.icon} /> {n.label}
            {n.path === "/meu-dia" && pending > 0 && <span className="count" aria-label={`${pending} itens`}>{pending}</span>}
          </a>
        ))}
      </div>
      <div className="nav">
        <div className="nav-label">Seus agentes</div>
        {LIST_AGENTS.map((a) => {
          const path = `/agente/${a}`;
          const v = app.visualFor(a);
          const feedHit = app.snap?.feed.some((f) => f.agentId === a && (f.kind === "ci_failure" || f.kind === "site_incident"));
          const st = v.semantic === "error" || feedHit ? "err" : v.semantic === "working" || v.semantic === "thinking" ? "busy" : a === "sentinela" ? "ok" : "";
          return (
            <a key={a} href={path} className="nav-item agent-item" aria-current={current === path ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(path))}>
              <AgentDot visual={v} accessory={app.accessoryFor(a)} size={38} animate={false} reducedMotion={app.reducedMotion} />
              <span className="lines">
                <span>{AGENTS[a].name}</span>
                <span>{statusLine(a)}</span>
              </span>
              <span className={`agent-dot-status ${st}`} aria-hidden="true" />
            </a>
          );
        })}
      </div>
      <div className="sidebar-foot">
        <div>
          <div className="tiny" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>IA hoje{app.mode === "demo" ? " · exemplo" : ""}</span>
            <span className="mono">{usage ? `${usage.calls} / ${usage.limits.calls}` : "—"}</span>
          </div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Chamadas de IA usadas hoje">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="tiny" style={{ marginTop: 6 }}>
            Custo R$ 0. {usage && !usage.aiConfigured ? "Resumos por regras." : "Sem cobrança extra."}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="tiny" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--text)", fontWeight: 500 }}>{app.snap?.owner?.name ?? app.snap?.owner?.email ?? "—"}</div>
            {app.mode === "demo" ? "Demonstração" : "Espaço pessoal"}
          </div>
          {app.mode === "live" && (
            <button className="btn ghost" onClick={() => void api.logout().then(() => location.assign("/"))}>
              Sair
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function ThemeButton() {
  const app = useApp();
  const dark = document.documentElement.dataset.theme === "dark";
  return (
    <button className="icon-btn" aria-label={dark ? "Usar tema claro" : "Usar tema escuro"} onClick={() => app.setPrefs({ theme: dark ? "light" : "dark" })}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

function Island({ go }: { go: (p: string) => void }) {
  const app = useApp();
  const dom = useMemo(() => {
    let best = app.visualFor("dot");
    for (const a of SIDEBAR_AGENTS) {
      const v = app.visualFor(a);
      if (SEMANTIC_PRIORITY[v.semantic] > SEMANTIC_PRIORITY[best.semantic]) best = v;
    }
    return best;
  }, [app]);
  const digest = app.snap?.feed.find((f) => f.kind === "email_digest");
  const line1 = `${AGENTS[dom.agentId].name} ${dom.label.toLowerCase()}`;
  const line2 = dom.reason ?? (digest ? `${digest.body.counts?.important ?? 0} mensagens desde as 17h` : "Nada pendente agora");
  return (
    <aside className="island" aria-label="Ilha do Dot">
      <AgentDot
        visual={dom}
        accessory={app.accessoryFor(dom.agentId)}
        size={40}
        reducedMotion={app.reducedMotion}
        interactive
        onAffection={(r) => r === "suppressed" && app.announce("Carinho pausado: há algo que precisa da sua atenção.")}
      />
      <button type="button" className="txt" role="status" onClick={() => go("/")} aria-label="Abrir conversa com o Dot">
        <span>{line1}</span>
        <span>{line2}</span>
      </button>
    </aside>
  );
}

function Palette({ onClose, go }: { onClose: () => void; go: (p: string) => void }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const items = [
    { label: "Conversa com o Dot", path: "/" },
    ...NAV.map((n) => ({ label: n.label, path: n.path })),
    { label: "Mascote & aparência", path: "/mascote" },
    ...SIDEBAR_AGENTS.filter((a) => a !== "dot").map((a) => ({ label: `Agente ${AGENTS[a].name}`, path: `/agente/${a}` })),
  ].filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="scrim" onClick={onClose} style={{ display: "grid", placeItems: "start center", paddingTop: "12vh" }}>
      <div role="dialog" aria-modal="true" aria-label="Buscar ou ir para" className="island" style={{ position: "static", transform: "none", flexDirection: "column", alignItems: "stretch", width: "min(520px, calc(100vw - 32px))", padding: 12 }} onClick={(e) => e.stopPropagation()}>
        <input ref={input} type="text" placeholder="Ir para…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ir para" onKeyDown={(e) => e.key === "Enter" && items[0] && (go(items[0].path), onClose())} />
        <ul className="list" style={{ marginTop: 8 }}>
          {items.map((i) => (
            <li key={i.path}>
              <button className="nav-item" onClick={() => (go(i.path), onClose())}>
                <Icon name="arrow" size={14} /> {i.label}
              </button>
            </li>
          ))}
          {!items.length && <li className="meta" style={{ padding: 8 }}>Nada encontrado.</li>}
        </ul>
      </div>
    </div>
  );
}

function Login() {
  const app = useApp();
  const err = new URLSearchParams(location.search).get("erro");
  const msgs: Record<string, string> = {
    conta_nao_autorizada: "Esta conta Google não é a dona deste Open Dot.",
    estado_expirado: "O login expirou ou foi reaproveitado. Tente de novo.",
    consentimento_negado: "Você cancelou no Google. Nada foi conectado.",
    login_nao_configurado: "Login com Google ainda não foi configurado no servidor.",
  };
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100%", padding: 16 }}>
      <div style={{ width: "min(400px, 100%)", display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center" }}>
        <AgentDot visual={app.visualFor("dot")} accessory="none" size={120} reducedMotion={app.reducedMotion} label="Dot" />
        <h1>Open Dot</h1>
        <p className="meta">Seu contexto. Um companheiro. Entre para ver suas revisões.</p>
        {err && msgs[err] && (
          <p role="alert" className="chip err">
            {msgs[err]}
          </p>
        )}
        {app.login.google && (
          <a className="btn primary" href="/api/auth/google/start">
            Entrar com Google
          </a>
        )}
        {app.login.dev && (
          <button className="btn" onClick={() => void api.devLogin().then(() => app.refresh())}>
            Entrar no modo desenvolvimento (local)
          </button>
        )}
        {!app.login.google && !app.login.dev && <p className="meta">Nenhuma forma de entrada configurada. Veja docs/COMECE_AQUI_CURSOR.md.</p>}
        <button className="btn ghost" onClick={() => app.enterDemo("Você escolheu ver a demonstração.")}>
          Ver demonstração
        </button>
      </div>
    </main>
  );
}

function Setup() {
  const app = useApp();
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100%", padding: 16 }}>
      <div className="state" style={{ maxWidth: 480 }}>
        <h2>Configuração incompleta</h2>
        <p>O servidor está rodando, mas faltam variáveis privadas. Nenhum valor é mostrado aqui, só os nomes:</p>
        <code>{app.setupMissing.join(", ") || "—"}</code>
        <p className="meta">Siga docs/ACOES_DO_JOAO.md. Enquanto isso, você pode ver a demonstração.</p>
        <button className="btn" onClick={() => app.enterDemo("Servidor sem configuração completa.")}>
          Ver demonstração
        </button>
      </div>
    </main>
  );
}

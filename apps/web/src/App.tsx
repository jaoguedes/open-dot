import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AGENTS, SEMANTIC_PRIORITY, toVisual, type AgentId } from "@open-dot/core";
import { useApp } from "./store.tsx";
import { Icon, type IconName } from "./components/Icons.tsx";
import { AgentDot } from "./dot/AgentDot.tsx";
import { SplashScreen } from "./dot/SplashScreen.tsx";
import { api } from "./api.ts";
import { Home } from "./views/Home.tsx";
import { Entregas } from "./views/Entregas.tsx";
import { MyDay } from "./views/MyDay.tsx";
import { Routines } from "./views/Routines.tsx";
import { Connections } from "./views/Connections.tsx";
import { Mascot } from "./views/Mascot.tsx";
import { Approval } from "./views/Approval.tsx";
import { About } from "./views/About.tsx";
import { Privacy } from "./views/Privacy.tsx";
import { ContextPanel } from "./components/ContextPanel.tsx";
import { fmtHeaderStamp, fmtTime } from "./format.ts";
import { agentConnected, agentPresence, islandLine, sortAgents } from "./presence.ts";

function isMyDayPath(path: string): boolean {
  return path === "/" || path === "/meu-dia";
}

function isPublicPath(path: string): boolean {
  return path === "/sobre" || path === "/privacidade";
}

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

const SIDEBAR_AGENTS: AgentId[] = ["dot", "correio", "codigo", "sentinela", "noticias", "mercado", "marketing", "entregas"];
const LIST_AGENTS: AgentId[] = ["correio", "codigo", "sentinela", "foco", "noticias", "mercado", "marketing", "entregas"];

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

  const splash = useSplash(app.mode === "loading" && !isPublicPath(app.path), app.reducedMotion);
  if (isPublicPath(app.path)) {
    return <PublicShell path={app.path}>{app.path === "/privacidade" ? <Privacy /> : <About />}</PublicShell>;
  }
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
  const apprMatch = /^\/aprovacao\/([^/]+)$/.exec(app.path);
  const route = agentId ? "agent" : apprMatch ? "approval" : isMyDayPath(app.path) ? "/meu-dia" : app.path;
  const showContext = route === "agent";
  const hideDock = route === "approval";

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
    case "approval":
      view = <Approval id={decodeURIComponent(apprMatch![1]!)} />;
      break;
    case "agent":
      view = agentId === "entregas" ? <Entregas /> : <Home agentId={agentId!} />;
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
              <div className="top-actions">
                <button className="search" onClick={() => setPalette(true)} aria-label="Pergunte ao Dot">
                  <Icon name="search" size={16} /> Pergunte ao Dot <kbd>⌘K</kbd>
                </button>
                {showContext && (
                  <button className="icon-btn" aria-label="Mostrar contexto" aria-expanded={ctxOpen} onClick={() => setCtxOpen((v) => !v)}>
                    <Icon name="panel" />
                  </button>
                )}
                <button className="icon-btn" aria-label="Notificações" type="button">
                  <Icon name="bell" />
                </button>
                <ThemeButton />
              </div>
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
      {!hideDock && <Dock go={go} current={app.path} onAsk={() => setPalette(true)} />}
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
  const facts = factsFrom(app.snap, app.mode === "demo");
  const waiting = app.snap?.shipments.shipments.filter((s) => s.needsCarrier).length ?? 0;
  const presenceOf = (a: AgentId) =>
    agentPresence(a, app.visualFor(a), app.snap?.feed ?? [], app.snap?.monitors ?? [], { connected: agentConnected(a, facts), pendingShipments: waiting });
  const ordered = sortAgents(LIST_AGENTS, presenceOf);
  return (
    <nav className={`sidebar ${open ? "open" : ""}`} aria-label="Navegação principal">
      <a className="brand" href="/meu-dia" onClick={(e) => (e.preventDefault(), go("/meu-dia"))}>
        <AgentDot visual={app.visualFor("dot")} accessory="none" size={30} animate={false} reducedMotion={app.reducedMotion} label="Open Dot" />
        <span className="od-wordmark"><span>open</span><b>dot</b><span className="od-wordmark-dot" /></span>
      </a>
      <div className="nav">
        {NAV.map((n) => (
          <a key={n.path} href={n.path} className="nav-item" aria-current={(n.path === "/meu-dia" ? isMyDayPath(current) : current === n.path) ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(n.path))}>
            <Icon name={n.icon} /> {n.label}
            {n.path === "/meu-dia" && pending > 0 && <span className="count" aria-label={`${pending} itens`}>{pending}</span>}
          </a>
        ))}
      </div>
      <div className="nav">
        <div className="nav-label">Seus agentes</div>
        {ordered.map((a) => {
          const path = `/agente/${a}`;
          const connected = agentConnected(a, facts);
          const v = connected ? app.visualFor(a) : toVisual(a, "disconnected");
          const p = presenceOf(a);
          return (
            <a key={a} href={path} className={`nav-item agent-item ${connected ? "" : "is-off"}`} aria-current={current === path ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(path))}>
              <AgentDot visual={v} accessory={app.accessoryFor(a)} size={44} animate={false} reducedMotion={app.reducedMotion} antennaPulse={a === "noticias" && (app.snap?.feed.some((f) => f.agentId === "noticias" && f.kind === "news_digest" && f.freshness === "fresh") ?? false)} />
              <span className="lines">
                <span>{AGENTS[a].name}</span>
                <span>{p.label}</span>
              </span>
              {connected ? <span className={`agent-dot-status ${p.dotClass}`} aria-hidden="true" /> : <span className="tiny">Conectar</span>}
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
        <NameLine />
      </div>
    </nav>
  );
}

function factsFrom(snap: ReturnType<typeof useApp>["snap"], demo: boolean) {
  const conns = snap?.connections ?? [];
  const disabled: Partial<Record<AgentId, boolean>> = {};
  for (const a of snap?.agents ?? []) if (!a.enabled) disabled[a.id] = true;
  return {
    demo,
    gmail: conns.some((c) => c.provider === "gmail" && c.status === "connected"),
    github: Boolean(snap?.configured.github || snap?.configured.githubApp) || conns.some((c) => c.provider === "github" && c.status === "connected"),
    vercel: Boolean(snap?.configured.vercel),
    gsc: conns.some((c) => c.provider === "gsc" && c.status === "connected"),
    monitors: snap?.monitors.length ?? 0,
    shipments: snap?.shipments.shipments.length ?? 0,
    tracking: Boolean(snap?.configured.tracking || snap?.shipments.tracking.enabled),
    disabled,
  };
}

function NameLine() {
  const app = useApp();
  const shown = app.snap?.owner?.name || "João";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  if (app.mode !== "live") {
    return (
      <div className="tiny">
        <div style={{ color: "var(--text)", fontWeight: 500 }}>{shown}</div>
        Demonstração
      </div>
    );
  }
  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="tiny" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--text)", fontWeight: 500 }}>{shown}</div>
          Espaço pessoal
        </div>
        <button className="btn ghost" type="button" onClick={() => (setValue(shown), setError(null), setEditing(true))}>
          Nome
        </button>
        <button className="btn ghost" onClick={() => void api.logout().then(() => location.assign("/"))}>
          Sair
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        void api.updateName(value.trim()).then(
          async (r) => {
            setEditing(false);
            app.announce(`Nome salvo: ${r.name}`);
            await app.refresh();
          },
          (err: unknown) => setError(err instanceof Error ? "Use letras, espaço ou hífen." : "Não consegui salvar o nome."),
        );
      }}
    >
      <label className="tiny" htmlFor="display-name">Nome de exibição</label>
      <input id="display-name" value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} autoFocus />
      {error && <p className="tiny" role="alert">{error}</p>}
      <div className="row-actions">
        <button className="btn primary" type="submit">Salvar</button>
        <button className="btn ghost" type="button" onClick={() => setEditing(false)}>Cancelar</button>
      </div>
    </form>
  );
}

function Dock({ go, current, onAsk }: { go: (p: string) => void; current: string; onAsk: () => void }) {
  const my = isMyDayPath(current);
  return (
    <nav className="dock" aria-label="Principal">
      <a href="/meu-dia" className={`dock-item ${my ? "on" : ""}`} aria-label="Meu dia" aria-current={my ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/meu-dia"))}>
        <Icon name="home" />
        <span>Meu dia</span>
      </a>
      <a href="/rotinas" className="dock-icon" aria-label="Rotinas" aria-current={current === "/rotinas" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/rotinas"))}>
        <Icon name="clock" />
      </a>
      <button type="button" className="dock-icon" aria-label="Perguntar ao Dot" onClick={onAsk}>
        <Icon name="search" />
      </button>
      <a href="/conexoes" className="dock-icon" aria-label="Conexões" aria-current={current === "/conexoes" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/conexoes"))}>
        <Icon name="plug" />
      </a>
      <a href="/mascote" className="dock-icon" aria-label="Mascote" aria-current={current === "/mascote" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/mascote"))}>
        <Icon name="sparkle" />
      </a>
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
    let working = null as typeof best | null;
    for (const a of SIDEBAR_AGENTS) {
      const v = app.visualFor(a);
      if (v.semantic === "working" || v.semantic === "thinking") working = v;
      if (SEMANTIC_PRIORITY[v.semantic] > SEMANTIC_PRIORITY[best.semantic]) best = v;
    }
    return working ?? best;
  }, [app]);
  const shown = app.activity ?? dom;
  const digest = app.snap?.feed.find((f) => f.kind === "email_digest");
      const line1 = islandLine(shown);
      const line2 = shown.reason ?? (digest ? `${digest.body.counts?.important ?? 0} mensagens desde as 17h` : "Nada pendente agora");
  return (
    <aside className="island" aria-label="Ilha do Dot">
      <AgentDot
        visual={shown}
        accessory={app.accessoryFor(shown.agentId)}
        size={40}
        reducedMotion={app.reducedMotion}
        interactive
        onAffection={(r) => r === "suppressed" && app.announce("Carinho pausado: há algo que precisa da sua atenção.")}
      />
      <button type="button" className="txt" role="status" onClick={() => go("/agente/dot")} aria-label="Abrir conversa com o Dot">
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
    { label: "Conversa com o Dot", path: "/agente/dot" },
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
        <p className="tiny">
          <a href="/sobre">Sobre</a>
          {" · "}
          <a href="/privacidade">Privacidade</a>
        </p>
      </div>
    </main>
  );
}

function PublicShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="public-shell">
      <header className="public-bar">
        <a className="brand" href="/sobre">
          <span className="od-wordmark">
            <span>open</span>
            <b>dot</b>
            <span className="od-wordmark-dot" />
          </span>
        </a>
        <nav aria-label="Páginas públicas">
          <a href="/sobre" aria-current={path === "/sobre" ? "page" : undefined}>
            Sobre
          </a>
          <a href="/privacidade" aria-current={path === "/privacidade" ? "page" : undefined}>
            Privacidade
          </a>
          <a href="/">Entrar</a>
        </nav>
      </header>
      <main id="conteudo" className="public-main" tabIndex={-1}>
        {children}
      </main>
    </div>
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

// SPDX-License-Identifier: AGPL-3.0-only
import { markSplashSeen, readSplashSeen, splashPlan } from "./splash-policy.ts";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AGENTS, agentsInPlace, toVisual, versionChanged, type AgentId } from "@open-dot/core";
import { useApp } from "./store.tsx";
import { Icon, type IconName } from "./components/Icons.tsx";
import { AgentDot } from "@open-dot/mascot";
import { SplashScreen } from "@open-dot/mascot";
import { api } from "./api.ts";
import { Home } from "./views/Home.tsx";

import { MyDay } from "./views/MyDay.tsx";
import { NotificationBell } from "./components/NotificationCenter.tsx";
import { useDialog } from "./components/useDialog.ts";
import { sound } from "./sound.ts";

// Telas menos visitadas carregam sob demanda (C5): a primeira tela baixa menos.
const AgentWorkspace = lazy(() => import("./views/AgentWorkspace.tsx").then((m) => ({ default: m.AgentWorkspace })));
const Runner = lazy(() => import("./views/Runner.tsx").then((m) => ({ default: m.Runner })));
const Entregas = lazy(() => import("./views/Entregas.tsx").then((m) => ({ default: m.Entregas })));
const Routines = lazy(() => import("./views/Routines.tsx").then((m) => ({ default: m.Routines })));
const Connections = lazy(() => import("./views/Connections.tsx").then((m) => ({ default: m.Connections })));
const ContextPanel = lazy(() => import("./components/ContextPanel.tsx").then((m) => ({ default: m.ContextPanel })));
const CommandPalette = lazy(() => import("./components/CommandPalette.tsx").then((m) => ({ default: m.CommandPalette })));
const Approval = lazy(() => import("./views/Approval.tsx").then((m) => ({ default: m.Approval })));
const About = lazy(() => import("./views/About.tsx").then((m) => ({ default: m.About })));
const Privacy = lazy(() => import("./views/Privacy.tsx").then((m) => ({ default: m.Privacy })));
const Mascot = lazy(() => import("./views/Mascot.tsx").then((m) => ({ default: m.Mascot })));
const Team = lazy(() => import("./views/Team.tsx").then((m) => ({ default: m.Team })));
import { DotTrouble, type TroubleInfo } from "./components/DotTrouble.tsx";
import { fmtHeaderStamp, fmtTime } from "./format.ts";
import { agentConnected, agentPresence, dominantVisual, islandLine, islandReason, runProgress, sortAgents } from "./presence.ts";

function isMyDayPath(path: string): boolean {
  return path === "/" || path === "/meu-dia";
}

function isPublicPath(path: string): boolean {
  return path === "/sobre" || path === "/privacidade";
}

function useSplash(loading: boolean, reduced: boolean): { show: boolean; fading: boolean } {
  const plan = useRef(splashPlan(readSplashSeen())).current;
  const [show, setShow] = useState(plan.showAtStart);
  const [fading, setFading] = useState(false);
  const shownAt = useRef<number | null>(plan.showAtStart ? performance.now() : null);
  useEffect(() => {
    if (!loading || show) return;
    const t = window.setTimeout(() => {
      shownAt.current = performance.now();
      setShow(true);
    }, plan.delayMs);
    return () => window.clearTimeout(t);
  }, [loading, show, plan]);
  useEffect(() => {
    if (loading) return;
    markSplashSeen();
    if (!show || shownAt.current === null) return;
    let fadeT = 0;
    const wait = Math.max(0, plan.minMs - (performance.now() - shownAt.current));
    const showT = window.setTimeout(() => {
      setFading(true);
      fadeT = window.setTimeout(() => setShow(false), reduced ? 0 : 250);
    }, wait);
    return () => {
      window.clearTimeout(showT);
      if (fadeT) window.clearTimeout(fadeT);
    };
  }, [loading, reduced, show, plan]);
  return { show, fading };
}

const SIDEBAR_AGENTS: AgentId[] = agentsInPlace("presence");
const LIST_AGENTS: AgentId[] = agentsInPlace("list");

interface NavDef {
  path: string;
  label: string;
  icon: IconName;
}
const PALETTE_DESTINATIONS = [
  { label: "Conversa com o Dot", path: "/agente/dot" },
  { label: "Meu dia", path: "/meu-dia" },
  { label: "Agent Workspace", path: "/workspace" },
  { label: "Runner desktop", path: "/runner" },
  { label: "Rotinas", path: "/rotinas" },
  { label: "Conexões", path: "/conexoes" },
  { label: "Mascote e aparência", path: "/mascote" },
];
const NAV: NavDef[] = [
  { path: "/meu-dia", label: "Meu dia", icon: "home" },
  { path: "/workspace", label: "Workspace", icon: "layers" },
  { path: "/runner", label: "Runner", icon: "code" },
  { path: "/equipe", label: "Equipe", icon: "chat" },
  { path: "/rotinas", label: "Rotinas", icon: "clock" },
  { path: "/conexoes", label: "Conexões", icon: "plug" },
  { path: "/mascote", label: "Mascote", icon: "sparkle" },
];

export function App() {
  const app = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [update, setUpdate] = useState(false);
  const [trouble, setTrouble] = useState<TroubleInfo | null>(null);
  useEffect(() => {
    const loaded = document.querySelector('meta[name="open-dot-build"]')?.getAttribute("content") ?? "";
    const look = () => {
      void api
        .version()
        .then((v) => setUpdate(versionChanged(loaded, v.app)))
        .catch(() => {});
    };
    look();
    const onVis = () => {
      if (document.visibilityState === "visible") look();
    };
    const onTrouble = (ev: Event) => {
      const detail = (ev as CustomEvent<TroubleInfo>).detail;
      if (detail?.code) {
        setTrouble({ code: detail.code, route: location.pathname });
        sound.play("dot-error");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("od-trouble", onTrouble);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("od-trouble", onTrouble);
    };
  }, []);

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
    return (
      <PublicShell path={app.path}>
        <Suspense
          fallback={
            <p className="meta" role="status">
              Carregando…
            </p>
          }
        >
          {app.path === "/privacidade" ? <Privacy /> : <About />}
        </Suspense>
      </PublicShell>
    );
  }
  if (app.mode === "loading" && splash.show) {
    return <SplashScreen fading={splash.fading} reducedMotion={app.reducedMotion} />;
  }
  // Abertura repetida na mesma sessão: fundo liso pelos primeiros 400 ms, sem splash.
  if (app.mode === "loading") return <div className="boot-blank" aria-busy="true" />;
  if (app.mode === "unreachable") {
    return (
      <main className="reading pad-24">
        <DotTrouble info={{ code: "offline", route: app.path }} reducedMotion={app.reducedMotion} onRetry={() => void app.refresh()} />
        <button className="btn" type="button" onClick={() => app.enterDemo("Você pediu a demonstração.")}>
          Ver demonstração
        </button>
      </main>
    );
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
    case "/workspace":
      view = <AgentWorkspace />;
      break;
    case "/runner":
      view = <Runner />;
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
    case "/equipe":
      view = <Team />;
      break;
    case "approval": {
      let approvalId = "";
      try {
        approvalId = decodeURIComponent(apprMatch![1]!);
      } catch {
        view = <MissingPage title="Endereço inválido" go={go} />;
        break;
      }
      view = <Approval id={approvalId} />;
      break;
    }
    case "agent":
      view = agentId === "entregas" ? <Entregas /> : <Home agentId={agentId!} />;
      break;
    default:
      view = <MissingPage title="Não achei essa página" go={go} />;
  }

  return (
    <>
      {splash.show && <SplashScreen fading={splash.fading} reducedMotion={app.reducedMotion} />}
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <ForcedBoom />
      <div className="app">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- tocar fora fecha; no teclado, Esc fecha (useDialog) */}
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        <Sidebar open={menuOpen} go={go} current={app.path} onClose={() => setMenuOpen(false)} />
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
            {trouble && (
              <DotTrouble
                info={trouble}
                reducedMotion={app.reducedMotion}
                onRetry={() => {
                  setTrouble(null);
                  void app.refresh();
                }}
                onDismiss={() => setTrouble(null)}
              />
            )}
            {app.notice && <NoticeBar />}
            {update && (
              <div className="banner" role="status">
                Nova versão disponível
                <button className="btn" type="button" onClick={() => location.reload()}>
                  Atualizar
                </button>
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
              <time className="top-date hide-sm" dateTime={new Date().toISOString()}>
                {fmtHeaderStamp()}
              </time>
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
                <NotificationBell go={go} />
                <ThemeButton />
              </div>
            </header>
          </div>
          <div className={`workspace ${showContext ? "" : "no-context"}`}>
            <main id="conteudo" className="content" tabIndex={-1}>
              <div className="reading">
                {(route === "agent" || route === "approval") && (
                  <div className="agent-tools">
                    <button type="button" className="btn back-btn" aria-label="Voltar" onClick={() => app.goBack()}>
                      ← Voltar
                    </button>
                    {route === "agent" && agentId && <AgentRail current={agentId} go={go} />}
                  </div>
                )}
                <Suspense
                  fallback={
                    <p className="meta" role="status">
                      Carregando…
                    </p>
                  }
                >
                  {view}
                </Suspense>
              </div>
            </main>
            {showContext && (
              <Suspense fallback={null}>
                <ContextPanel open={ctxOpen} onClose={() => setCtxOpen(false)} agentId={agentId ?? "dot"} />
              </Suspense>
            )}
          </div>
        </div>
      </div>
      {!hideDock && <Dock go={go} current={app.path} onAsk={() => setPalette(true)} />}
      {palette && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setPalette(false)} go={go} destinations={PALETTE_DESTINATIONS} agents={LIST_AGENTS} />
        </Suspense>
      )}
      <div className="sr-only" aria-live="polite">
        {app.announcement}
      </div>
    </>
  );
}

function MissingPage({ title, go }: { title: string; go: (p: string) => void }) {
  return (
    <div className="state">
      <h1>{title}</h1>
      <p>Esse caminho não existe no Open Dot.</p>
      <button className="btn primary" type="button" onClick={() => go("/meu-dia")}>
        Meu dia
      </button>
    </div>
  );
}

function AgentRail({ current, go }: { current: AgentId; go: (p: string) => void }) {
  const app = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [current]);
  return (
    <div className="agent-rail" role="navigation" aria-label="Trocar de agente">
      {LIST_AGENTS.map((a) => (
        <button
          key={a}
          ref={a === current ? ref : undefined}
          type="button"
          className={`agent-pill ${a === current ? "on" : ""}`}
          aria-current={a === current ? "true" : undefined}
          onClick={() => go(`/agente/${a}`)}
        >
          <AgentDot visual={app.visualFor(a)} accessory="none" size={22} animate={false} reducedMotion={app.reducedMotion} />
          {AGENTS[a].name}
        </button>
      ))}
    </div>
  );
}

function Sidebar({ open, go, current, onClose }: { open: boolean; go: (p: string) => void; current: string; onClose: () => void }) {
  const app = useApp();
  const navRef = useRef<HTMLElement>(null);
  // No celular a barra vira gaveta: modal enquanto aberta (D4).
  useDialog(open, navRef, onClose);
  const pending = app.snap?.feed.filter((f) => f.kind !== "notice" && f.kind !== "file_organized").length ?? 0;
  const usage = app.snap?.usage;
  const pct = usage ? Math.min(100, Math.round((usage.calls / Math.max(1, usage.limits.calls)) * 100)) : 0;
  const facts = factsFrom(app.snap, app.mode === "demo");
  const waiting = app.snap?.shipments.shipments.filter((s) => s.needsCarrier).length ?? 0;
  const presenceOf = (a: AgentId) => agentPresence(a, app.visualFor(a), app.snap?.feed ?? [], app.snap?.monitors ?? [], { connected: agentConnected(a, facts), pendingShipments: waiting });
  const ordered = sortAgents(LIST_AGENTS, presenceOf);
  return (
    <nav ref={navRef} className={`sidebar ${open ? "open" : ""}`} aria-label="Navegação principal" aria-modal={open ? true : undefined} role={open ? "dialog" : undefined}>
      <a className="brand" href="/meu-dia" onClick={(e) => (e.preventDefault(), go("/meu-dia"))}>
        <AgentDot visual={app.visualFor("dot")} accessory="none" size={30} animate={false} reducedMotion={app.reducedMotion} label="Open Dot" />
        <span className="od-wordmark">
          <span>open</span>
          <b>dot</b>
          <span className="od-wordmark-dot" />
        </span>
      </a>
      <div className="nav">
        {NAV.map((n) => (
          <a
            key={n.path}
            href={n.path}
            className="nav-item"
            aria-current={(n.path === "/meu-dia" ? isMyDayPath(current) : current === n.path) ? "page" : undefined}
            onClick={(e) => (e.preventDefault(), go(n.path))}
          >
            <Icon name={n.icon} /> {n.label}
            {n.path === "/meu-dia" && pending > 0 && (
              <span className="count" aria-label={`${pending} itens`}>
                {pending}
              </span>
            )}
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
              <AgentDot
                visual={v}
                accessory={app.accessoryFor(a)}
                size={44}
                animate={false}
                reducedMotion={app.reducedMotion}
                antennaPulse={a === "noticias" && (app.snap?.feed.some((f) => f.agentId === "noticias" && f.kind === "news_digest" && f.freshness === "fresh") ?? false)}
              />
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
          <div className="tiny row-between">
            <span>IA hoje{app.mode === "demo" ? " · exemplo" : ""}</span>
            <span className="mono">{usage ? `${usage.calls} / ${usage.limits.calls}` : "—"}</span>
          </div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Chamadas de IA usadas hoje">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="tiny mt-6">Custo R$ 0. {usage && !usage.aiConfigured ? "Resumos por regras." : "Sem cobrança extra."}</div>
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
  const shown = app.snap?.owner?.name || "Seu nome";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) nameInput.current?.focus();
  }, [editing]);
  if (app.mode !== "live") {
    return (
      <div className="tiny">
        <div className="text-strong">{shown}</div>
        Demonstração
      </div>
    );
  }
  if (!editing) {
    return (
      <div className="row-center-8">
        <div className="tiny grow-min0">
          <div className="text-strong">{shown}</div>
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
      <label className="tiny" htmlFor="display-name">
        Nome de exibição
      </label>
      <input id="display-name" ref={nameInput} value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} />
      {error && (
        <p className="tiny" role="alert">
          {error}
        </p>
      )}
      <div className="row-actions">
        <button className="btn primary" type="submit">
          Salvar
        </button>
        <button className="btn ghost" type="button" onClick={() => setEditing(false)}>
          Cancelar
        </button>
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
  const { visualFor } = app;
  const dom = useMemo(() => dominantVisual(SIDEBAR_AGENTS.map((a) => visualFor(a))), [visualFor]);
  const shown = app.activity ?? dom;
  const digest = app.snap?.feed.find((f) => f.kind === "email_digest");
  const line1 = islandLine(shown);
  // Execução ativa mais recente, pelo estado real (E5).
  const activeRun = app.snap?.runs.find((r) => r.state === "running" || r.state === "queued" || r.state === "retry_scheduled") ?? null;
  const progress = runProgress(activeRun);
  const openMail = digest?.body.itens ? app.mailOpen.length : digest && digest.state !== "done" && digest.state !== "snoozed" ? (digest.body.counts?.important ?? 0) : 0;
  const line2 = islandReason(shown.reason) ?? (openMail ? `${openMail} ${openMail === 1 ? "e-mail pede" : "e-mails pedem"} você` : "Nada pendente agora");
  // A ilha não é região viva: só erro e "precisa de você" são anunciados, uma vez por mudança (D4).
  const spoken = useRef<string>("");
  const { announce } = app;
  useEffect(() => {
    const key = `${shown.agentId}:${shown.semantic}`;
    const important = shown.semantic === "error" || shown.semantic === "waiting";
    if (important && spoken.current !== key) announce(`${line1}. ${line2}`);
    spoken.current = key;
  }, [shown.agentId, shown.semantic, line1, line2, announce]);
  return (
    <aside className="island" aria-label="Ilha do Dot">
      <AgentDot
        visual={shown}
        accessory={app.accessoryFor(shown.agentId)}
        size={40}
        reducedMotion={app.reducedMotion}
        interactive
        onAffection={(r) => (r === "ok" ? sound.play("dot-love") : r === "suppressed" && app.announce("Carinho pausado: há algo que precisa da sua atenção."))}
      />
      <button type="button" className="txt" aria-live="off" onClick={() => go("/agente/dot")} aria-label={`${line1}. ${line2}. Abrir conversa com o Dot`}>
        <span>{line1}</span>
        <span>{progress ? `${AGENTS[activeRun!.agentId]?.name ?? "Agente"} · etapa ${progress.step} de ${progress.steps} · ${progress.label}` : line2}</span>
        {progress && <progress className="island-progress" max={progress.steps} value={progress.step} aria-hidden="true" />}
      </button>
    </aside>
  );
}

function ForcedBoom() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get("forcar") === "render") {
    throw new Error("token=segredo-teste senha=abc pessoa@example.com");
  }
  return null;
}

function Login() {
  const app = useApp();
  const err = new URLSearchParams(location.search).get("erro");
  const msgs: Record<string, string> = {
    conta_nao_autorizada: "Esta conta Google não é a dona deste Open Dot.",
    estado_expirado: "O login expirou ou foi reaproveitado. Tente de novo.",
    consentimento_negado: "Você cancelou no Google. Nada foi conectado.",
    login_nao_configurado: "Login com Google ainda não foi configurado no servidor.",
    muitas_tentativas: "Muitas tentativas de entrar a partir desta rede. Espere alguns minutos e tente de novo.",
    callback_invalido: "O retorno do Google veio incompleto. Tente entrar de novo.",
    sem_id_token: "O Google não confirmou a sua conta. Tente entrar de novo.",
    sessao_trocada: "A sessão mudou no meio do caminho. Entre de novo.",
    sem_refresh_token: "O Google não enviou a permissão de longa duração. Remova o acesso em myaccount.google.com/permissions e tente de novo.",
    permissao_gmail_negada: "O Google não concedeu a leitura do Gmail. Nada foi conectado.",
    permissao_gsc_negada: "O Google não concedeu a leitura do Search Console. Nada foi conectado.",
  };
  return (
    <main className="center-screen">
      <div className="login-col">
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
    <main className="center-screen">
      <div className="state maxw-480">
        <h2>Configuração incompleta</h2>
        <p>O servidor está rodando, mas faltam variáveis privadas. Nenhum valor é mostrado aqui, só os nomes:</p>
        <code>{app.setupMissing.join(", ") || "—"}</code>
        <p className="meta">Siga docs/SETUP.md. Enquanto isso, você pode ver a demonstração.</p>
        <button className="btn" onClick={() => app.enterDemo("Servidor sem configuração completa.")}>
          Ver demonstração
        </button>
      </div>
    </main>
  );
}

/** Aviso curto da triagem (G) com Desfazer quando um remetente foi silenciado. */
function NoticeBar() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const n = app.notice!;
  const undo = async () => {
    setBusy(true);
    try {
      await api.undoSilence(n.undoHash!);
      app.clearTriageFor(n.undoHash!);
      app.setNotice({ text: "Desfeito. Voltei a avisar sobre esse remetente." });
      await app.refresh();
    } catch {
      app.setNotice({ text: "Não consegui desfazer. Tente em Conexões > Remetentes silenciados." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="banner" role="status">
      <span>{n.text}</span>
      {n.undoHash && (
        <button className="btn" type="button" disabled={busy} onClick={() => void undo()}>
          Desfazer
        </button>
      )}
      <button className="btn ghost" type="button" onClick={() => app.setNotice(null)}>
        Fechar
      </button>
    </div>
  );
}

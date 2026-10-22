// SPDX-License-Identifier: AGPL-3.0-only
import { markSplashSeen, readSplashSeen, splashPlan } from "./splash-policy.ts";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AGENTS, agentsInPlace, versionChanged, type AgentId } from "@open-dot/core";
import { useApp } from "./store.tsx";
import { Icon } from "./components/Icons.tsx";
import { AgentDot } from "@open-dot/mascot";
import { SplashScreen } from "@open-dot/mascot";
import { api } from "./api.ts";
import { Home } from "./views/Home.tsx";

import { MyDay } from "./views/MyDay.tsx";
import { NotificationBell } from "./components/NotificationCenter.tsx";
import { sound } from "./sound.ts";

// Telas menos visitadas carregam sob demanda (C5): a primeira tela baixa menos.
const AgentWorkspace = lazy(() => import("./views/AgentWorkspace.tsx").then((m) => ({ default: m.AgentWorkspace })));
const Runner = lazy(() => import("./views/Runner.tsx").then((m) => ({ default: m.Runner })));
const Entregas = lazy(() => import("./views/Entregas.tsx").then((m) => ({ default: m.Entregas })));
const Routines = lazy(() => import("./views/Routines.tsx").then((m) => ({ default: m.Routines })));
const Connections = lazy(() => import("./views/Connections.tsx").then((m) => ({ default: m.Connections })));
const ContextPanel = lazy(() => import("./components/ContextPanel.tsx").then((m) => ({ default: m.ContextPanel })));
// A paleta fica fora da primeira tela, mas é pré-carregada logo depois: ⌘K abre na hora e o que
// a pessoa digita em seguida não se perde enquanto o pedaço carrega.
let paletteModule: typeof import("./components/CommandPalette.tsx") | null = null;
const paletteImport = () => import("./components/CommandPalette.tsx").then((m) => (paletteModule = m));
const CommandPalette = lazy(() => paletteImport().then((m) => ({ default: m.CommandPalette })));
/** Escolhe o componente da paleta UMA vez por abertura: trocar do lazy para o módulo já carregado
 *  no meio da abertura remontava a paleta e apagava o que a pessoa tinha digitado. */
function PaletteHost(props: { onClose: () => void; go: (p: string) => void; destinations: Array<{ label: string; path: string }>; agents: AgentId[] }) {
  const Palette = useRef(paletteModule ? paletteModule.CommandPalette : CommandPalette).current;
  return (
    <Suspense fallback={null}>
      <Palette {...props} />
    </Suspense>
  );
}
const Approval = lazy(() => import("./views/Approval.tsx").then((m) => ({ default: m.Approval })));
const About = lazy(() => import("./views/About.tsx").then((m) => ({ default: m.About })));
const Privacy = lazy(() => import("./views/Privacy.tsx").then((m) => ({ default: m.Privacy })));
const Mascot = lazy(() => import("./views/Mascot.tsx").then((m) => ({ default: m.Mascot })));
const Team = lazy(() => import("./views/Team.tsx").then((m) => ({ default: m.Team })));
const Memory = lazy(() => import("./views/Memory.tsx").then((m) => ({ default: m.Memory })));
const Settings = lazy(() => import("./views/Settings.tsx").then((m) => ({ default: m.Settings })));
const Correio = lazy(() => import("./views/Correio.tsx").then((m) => ({ default: m.Correio })));
const Approvals = lazy(() => import("./views/Approvals.tsx").then((m) => ({ default: m.Approvals })));
const More = lazy(() => import("./views/More.tsx").then((m) => ({ default: m.More })));
import { DotTrouble, type TroubleInfo } from "./components/DotTrouble.tsx";
import { fmtHeaderStamp, fmtTime } from "./format.ts";
import { dominantVisual, islandLine, islandReason, runProgress } from "./presence.ts";
import { BottomBar, Rail } from "./components/Shell.tsx";
import { DemoChip } from "./components/ui.tsx";

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

const PALETTE_DESTINATIONS = [
  { label: "Conversa com o Dot", path: "/agente/dot" },
  { label: "Meu dia", path: "/meu-dia" },
  { label: "Agent Workspace", path: "/workspace" },
  { label: "Runner desktop", path: "/runner" },
  { label: "Correio e Notícias", path: "/correio" },
  { label: "Equipe", path: "/equipe" },
  { label: "Aprovações do Runner", path: "/aprovacoes" },
  { label: "Rotinas", path: "/rotinas" },
  { label: "Conexões", path: "/conexoes" },
  { label: "Mascote e aparência", path: "/mascote" },
];

export function App() {
  const app = useApp();
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
    const t = window.setTimeout(() => void paletteImport().catch(() => undefined), 1500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
      if (e.key === "Escape") {
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

  const go = (p: string) => app.navigate(p);
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
    case "/memoria":
      view = <Memory />;
      break;
    case "/configuracoes":
      view = <Settings />;
      break;
    case "/correio":
      view = <Correio />;
      break;
    case "/aprovacoes":
      view = <Approvals />;
      break;
    case "/mais":
      view = <More />;
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
        <div className="rail-slot">
          <Rail go={go} current={app.path} />
        </div>
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
              <a className="mobile-dot" href="/meu-dia" aria-label="Open Dot, Meu dia" onClick={(e) => (e.preventDefault(), go("/meu-dia"))}>
                <AgentDot visual={app.visualFor("dot")} accessory="none" size={44} animate={false} reducedMotion={app.reducedMotion} label="Open Dot" />
              </a>
              {app.mode === "demo" && <DemoChip />}
              <time className="top-date hide-sm" dateTime={new Date().toISOString()}>
                {fmtHeaderStamp()}
              </time>
              <div className="spacer" />
              <Island go={go} />
              <div className="spacer" />
              <div className="top-actions">
                <button className="search" onClick={() => setPalette(true)} aria-label="Perguntar ao Dot">
                  <Icon name="search" size={16} /> <span className="search-text">Perguntar ao Dot</span> <kbd>⌘K</kbd>
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
      {!hideDock && <BottomBar go={go} current={app.path} />}
      {palette && <PaletteHost onClose={() => setPalette(false)} go={go} destinations={PALETTE_DESTINATIONS} agents={LIST_AGENTS} />}
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

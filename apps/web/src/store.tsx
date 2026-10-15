import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_ACCESSORY, toVisual, type Accessory, type AgentId, type AgentVisual } from "@open-dot/core";
import { ApiError, api, fetchSnapshot, loadSnapshot, type Snapshot } from "./api.ts";
import { shouldRefresh, type RefreshTrigger } from "./refresh-policy.ts";
import { setOwnerTimeZone } from "./format.ts";
import { applyDismiss } from "./presence.ts";
import { DEFAULT_VOLUME, sound } from "./sound.ts";
import { apiFailureMode } from "./failure-mode.ts";

export type Mode = "loading" | "live" | "demo" | "login" | "setup" | "unreachable";

export interface Prefs {
  theme: "system" | "light" | "dark";
  motion: "system" | "reduced" | "full";
  transparency: "system" | "reduced";
  accessories: boolean;
  /** Sons do Dot (E7): desligados por padrão. */
  sound: boolean;
  soundVolume: number;
}

interface AppState {
  mode: Mode;
  demoReason: string | null;
  snap: Snapshot | null;
  failures: string[];
  online: boolean;
  lastLoadedAt: number | null;
  setupMissing: string[];
  login: { dev: boolean; google: boolean };
  refresh: () => Promise<void>;
  enterDemo: (reason: string) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  reducedMotion: boolean;
  visualFor: (a: AgentId) => AgentVisual;
  accessoryFor: (a: AgentId) => Accessory;
  activity: AgentVisual | null;
  setActivity: (v: AgentVisual | null) => void;
  path: string;
  navigate: (p: string) => void;
  goBack: () => void;
  announce: (msg: string) => void;
  announcement: string;
  /** Há mais itens antigos no feed (cursor do servidor). */
  feedHasMore: boolean;
  loadMoreFeed: () => Promise<void>;
  /** Some com o erro do agente até a próxima execução dele. */
  dismissError: (a: AgentId) => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fora do provider");
  return v;
}

const PREFS_KEY = "open-dot:prefs";
const DISMISS_KEY = "open-dot:dismissed-errors";
function readPrefs(): Prefs {
  const base: Prefs = { theme: "dark", motion: "system", transparency: "system", accessories: true, sound: false, soundVolume: DEFAULT_VOLUME };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return base;
  }
}

function useMedia(q: string): boolean {
  const [m, setM] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [demoReason, setDemoReason] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [lastLoadedAt, setLast] = useState<number | null>(null);
  const [setupMissing, setSetupMissing] = useState<string[]>([]);
  const [login, setLogin] = useState({ dev: false, google: false });
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const [path, setPath] = useState(() => location.pathname);
  const [navDepth, setNavDepth] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [activity, setActivity] = useState<AgentVisual | null>(null);
  const [feedNext, setFeedNext] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Partial<Record<AgentId, number>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as Partial<Record<AgentId, number>>;
    } catch {
      return {};
    }
  });

  const sysDark = useMedia("(prefers-color-scheme: dark)");
  const sysReduced = useMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = prefs.motion === "reduced" || (prefs.motion === "system" && sysReduced);

  useEffect(() => {
    sound.setEnabled(prefs.sound);
    sound.setVolume(prefs.soundVolume);
  }, [prefs.sound, prefs.soundVolume]);

  // Sons por mudança de dados (E7): oi uma vez por sessão; atenção quando aprovações ou
  // itens que pedem você aumentam; aviso quando chega item novo no polling.
  const lastCounts = useRef<{ need: number; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (mode !== "live" || !snap) return;
    try {
      if (sessionStorage.getItem("od-hello-sound") !== "1") {
        sessionStorage.setItem("od-hello-sound", "1");
        sound.play("dot-hello");
      }
    } catch {
      /* sem sessionStorage: sem oi */
    }
    const need =
      snap.approvals.filter((a) => a.status === "pending").length +
      snap.feed.filter((f) => (f.kind === "ci_failure" || f.kind === "site_incident") && f.state !== "done" && f.state !== "snoozed").length;
    const ids = new Set(snap.feed.map((f) => f.id));
    const prev = lastCounts.current;
    lastCounts.current = { need, ids };
    if (!prev) return;
    if (need > prev.need) sound.play("dot-attention");
    else if ([...ids].some((id) => !prev.ids.has(id))) sound.play("dot-notify");
  }, [mode, snap]);

  useEffect(() => {
    const dark = prefs.theme === "dark" || (prefs.theme === "system" && sysDark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
    document.documentElement.dataset.transparency = prefs.transparency;
  }, [prefs, sysDark, reducedMotion]);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((old) => {
      const next = { ...old, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* armazenamento indisponível: preferências só nesta sessão */
      }
      return next;
    });
  }, []);

  /** A demonstração carrega sob demanda: o bundle inicial não leva os dados fictícios. */
  const enterDemo = useCallback((reason: string) => {
    void import("./demo.ts")
      .then(({ demoSnapshot }) => {
        setDemoReason(reason);
        setSnap(demoSnapshot());
        setFailures([]);
        setMode("demo");
        setLast(Date.now());
      })
      .catch(() => setMode("unreachable"));
  }, []);

  const etagRef = useRef<string | null>(null);
  const olderRef = useRef<Snapshot["feed"]>([]);
  const lastTryRef = useRef<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const showLogin = useCallback(async () => {
    etagRef.current = null;
    try {
      const s = await api.session();
      setLogin({ dev: Boolean(s.devLoginAvailable), google: Boolean(s.googleLoginAvailable) });
    } catch {
      /* sem opções de login: a tela mostra a entrada padrão */
    }
    setMode("login");
  }, []);

  const load = useCallback(async () => {
    if (new URLSearchParams(location.search).has("demo")) return enterDemo("Você abriu o modo demonstração.");
    lastTryRef.current = Date.now();
    try {
      const r = await fetchSnapshot(snap ? etagRef.current : null);
      if (r.kind === "same") {
        setFailures([]);
        setMode("live");
        setLast(Date.now());
        return;
      }
      if (r.kind === "fresh") {
        setOwnerTimeZone(r.snap.owner?.timeZone);
        etagRef.current = r.etag;
        // Páginas antigas já carregadas continuam na tela depois da atualização.
        const firstIds = new Set(r.snap.feed.map((f) => f.id));
        setSnap({ ...r.snap, feed: [...r.snap.feed, ...olderRef.current.filter((f) => !firstIds.has(f.id))] });
        if (!olderRef.current.length) setFeedNext(r.next);
        setFailures(r.failures);
        setMode("live");
        setLast(Date.now());
        return;
      }
      // Worker antigo (rollback): rotas separadas.
      const s = await api.session();
      if (!s.authenticated) return showLogin();
      setOwnerTimeZone(s.owner?.timeZone);
      const { snap: data, failures: f } = await loadSnapshot(s.owner ?? null);
      setSnap(data);
      setFailures(f);
      setMode("live");
      setLast(Date.now());
    } catch (e) {
      if (e instanceof ApiError && e.status === 503 && e.code === "not_configured") {
        setSetupMissing(e.missing ?? []);
        setMode("setup");
      } else if (e instanceof ApiError && e.status === 401) {
        await showLogin();
      } else {
        const next = apiFailureMode(location.hostname, mode === "live" || Boolean(snap));
        if (next === "keep") setFailures(["servidor"]);
        else if (next === "unreachable") setMode("unreachable");
        else enterDemo(e instanceof ApiError && e.code === "offline" ? "Servidor indisponível." : "A API do Open Dot não está rodando aqui.");
      }
    }
  }, [enterDemo, mode, snap, showLogin]);

  /** Uma busca por vez; gatilhos automáticos respeitam aba visível, 60 s e 15 s no foco. */
  const refreshFor = useCallback(
    (trigger: RefreshTrigger): Promise<void> => {
      if (inFlight.current) return inFlight.current;
      if (!shouldRefresh(trigger, lastTryRef.current, Date.now(), typeof document !== "undefined" && document.hidden)) return Promise.resolve();
      const p = load().finally(() => {
        inFlight.current = null;
      });
      inFlight.current = p;
      return p;
    },
    [load],
  );
  const refresh = useCallback(() => refreshFor("manual"), [refreshFor]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const focus = () => mode === "live" && void refreshFor("focus");
    const visible = () => mode === "live" && !document.hidden && void refreshFor("visible");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    const t = window.setInterval(() => mode === "live" && void refreshFor("interval"), 15_000);
    const pop = () => {
      setPath(location.pathname);
      setNavDepth((d) => Math.max(0, d - 1));
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("popstate", pop);
      window.clearInterval(t);
    };
  }, [mode, refreshFor]);

  const navigate = useCallback((p: string) => {
    if (p === location.pathname) {
      document.getElementById("conteudo")?.scrollTo({ top: 0 });
      return;
    }
    history.pushState(null, "", p + (new URLSearchParams(location.search).has("demo") ? "?demo=1" : ""));
    setNavDepth((d) => d + 1);
    setPath(p);
    requestAnimationFrame(() => document.getElementById("conteudo")?.focus());
  }, []);
  const goBack = useCallback(() => {
    if (navDepth > 0) history.back();
    else navigate("/meu-dia");
  }, [navDepth, navigate]);

  const visualFor = useCallback(
    (a: AgentId): AgentVisual => {
      const s = snap?.status.find((x) => x.agentId === a);
      return s ? applyDismiss(s, dismissed[a]) : toVisual(a, "idle");
    },
    [snap, dismissed],
  );
  const dismissError = useCallback(
    (a: AgentId) => {
      const rev = snap?.status.find((x) => x.agentId === a)?.revision;
      if (rev === undefined) return;
      setDismissed((old) => {
        const next = { ...old, [a]: rev };
        try {
          localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
        } catch {
          /* sem armazenamento: vale até recarregar */
        }
        return next;
      });
    },
    [snap],
  );
  const accessoryFor = useCallback((a: AgentId): Accessory => (prefs.accessories ? DEFAULT_ACCESSORY[a] : "none"), [prefs.accessories]);

  const loadMoreFeed = useCallback(async () => {
    if (!feedNext || mode !== "live") return;
    const r = await api.feed(feedNext);
    olderRef.current = [...olderRef.current, ...r.items];
    setSnap((old) => {
      if (!old) return old;
      const have = new Set(old.feed.map((f) => f.id));
      return { ...old, feed: [...old.feed, ...r.items.filter((f) => !have.has(f.id))] };
    });
    setFeedNext(r.next);
  }, [feedNext, mode]);

  const announce = useCallback((msg: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(msg));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      mode,
      demoReason,
      snap,
      failures,
      online,
      lastLoadedAt,
      setupMissing,
      login,
      refresh,
      enterDemo,
      prefs,
      setPrefs,
      reducedMotion,
      visualFor,
      accessoryFor,
      activity,
      setActivity,
      path,
      navigate,
      goBack,
      announce,
      announcement,
      feedHasMore: Boolean(feedNext) && mode === "live",
      loadMoreFeed,
      dismissError,
    }),
    [
      mode,
      demoReason,
      snap,
      failures,
      online,
      lastLoadedAt,
      setupMissing,
      login,
      refresh,
      enterDemo,
      prefs,
      setPrefs,
      reducedMotion,
      visualFor,
      accessoryFor,
      activity,
      path,
      navigate,
      goBack,
      announce,
      announcement,
      feedNext,
      loadMoreFeed,
      dismissError,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

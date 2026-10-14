import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ACCESSORY, toVisual, type Accessory, type AgentId, type AgentVisual } from "@open-dot/core";
import { ApiError, api, loadSnapshot, type Snapshot } from "./api.ts";
import { demoSnapshot } from "./demo.ts";

export type Mode = "loading" | "live" | "demo" | "login" | "setup";

export interface Prefs {
  theme: "system" | "light" | "dark";
  motion: "system" | "reduced" | "full";
  transparency: "system" | "reduced";
  accessories: boolean;
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
  path: string;
  navigate: (p: string) => void;
  announce: (msg: string) => void;
  announcement: string;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fora do provider");
  return v;
}

const PREFS_KEY = "open-dot:prefs";
function readPrefs(): Prefs {
  const base: Prefs = { theme: "dark", motion: "system", transparency: "system", accessories: true };
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
  const [announcement, setAnnouncement] = useState("");

  const sysDark = useMedia("(prefers-color-scheme: dark)");
  const sysReduced = useMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = prefs.motion === "reduced" || (prefs.motion === "system" && sysReduced);

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

  const enterDemo = useCallback((reason: string) => {
    setDemoReason(reason);
    setSnap(demoSnapshot());
    setFailures([]);
    setMode("demo");
    setLast(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    if (new URLSearchParams(location.search).has("demo")) return enterDemo("Você abriu o modo demonstração.");
    try {
      const s = await api.session();
      if (!s.authenticated) {
        setLogin({ dev: Boolean(s.devLoginAvailable), google: Boolean(s.googleLoginAvailable) });
        setMode("login");
        return;
      }
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
        setMode("login");
      } else if (mode === "live") {
        // Mantém os últimos dados, marcados como desatualizados.
        setFailures(["servidor"]);
      } else {
        enterDemo(e instanceof ApiError && e.code === "offline" ? "Servidor indisponível." : "A API do Open Dot não está rodando aqui.");
      }
    }
  }, [enterDemo, mode]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const focus = () => mode === "live" && void refresh();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("focus", focus);
    const t = window.setInterval(() => mode === "live" && !document.hidden && void refresh(), 60_000);
    const pop = () => setPath(location.pathname);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", focus);
      window.removeEventListener("popstate", pop);
      window.clearInterval(t);
    };
  }, [mode, refresh]);

  const navigate = useCallback((p: string) => {
    if (p === location.pathname) return;
    history.pushState(null, "", p + (new URLSearchParams(location.search).has("demo") ? "?demo=1" : ""));
    setPath(p);
    requestAnimationFrame(() => document.getElementById("conteudo")?.focus());
  }, []);

  const visualFor = useCallback(
    (a: AgentId): AgentVisual => {
      const s = snap?.status.find((x) => x.agentId === a);
      return s ?? toVisual(a, "idle");
    },
    [snap],
  );
  const accessoryFor = useCallback((a: AgentId): Accessory => (prefs.accessories ? DEFAULT_ACCESSORY[a] : "none"), [prefs.accessories]);

  const announce = useCallback((msg: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(msg));
  }, []);

  const value = useMemo<AppState>(
    () => ({ mode, demoReason, snap, failures, online, lastLoadedAt, setupMissing, login, refresh, enterDemo, prefs, setPrefs, reducedMotion, visualFor, accessoryFor, path, navigate, announce, announcement }),
    [mode, demoReason, snap, failures, online, lastLoadedAt, setupMissing, login, refresh, enterDemo, prefs, setPrefs, reducedMotion, visualFor, accessoryFor, path, navigate, announce, announcement],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

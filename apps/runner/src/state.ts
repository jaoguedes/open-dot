// SPDX-License-Identifier: AGPL-3.0-only
/** Estado do Runner companheiro na interface: tudo vem do processo nativo; nada é inventado. */
import { useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_MOOD, healthMood, type DotHealthMood, type MoodState } from "@open-dot/core";
import { setMaxFps, setPaused } from "@open-dot/mascot";
import { errorText, invoke, listen, nativeAvailable, type CompanionView, type HealthView, type LocalDiagnostics, type ProcessItem } from "./bridge.ts";

export interface RunnerData {
  native: boolean;
  loading: boolean;
  error: string;
  companion: CompanionView | null;
  diagnostics: LocalDiagnostics | null;
  health: HealthView | null;
  mood: DotHealthMood;
  processes: ProcessItem[];
  processNote: string;
  refresh: () => void;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
  setError: (s: string) => void;
}

export function useRunnerData(): RunnerData {
  const native = nativeAvailable();
  const [companion, setCompanion] = useState<CompanionView | null>(null);
  const [diagnostics, setDiagnostics] = useState<LocalDiagnostics | null>(null);
  const [health, setHealth] = useState<HealthView | null>(null);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [processNote, setProcessNote] = useState("");
  const [loading, setLoading] = useState(native);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const moodRef = useRef<MoodState>(INITIAL_MOOD);
  const [mood, setMood] = useState<DotHealthMood>({ state: INITIAL_MOOD, heat: 0, strain: 0, reason: null });

  useEffect(() => {
    if (!native) return;
    let alive = true;
    void (async () => {
      try {
        const [c, d, h, p] = await Promise.all([
          invoke<CompanionView>("companion_get"),
          invoke<LocalDiagnostics>("diagnostics"),
          invoke<HealthView>("health_get"),
          invoke<{ items: ProcessItem[]; nota: string }>("processes_list"),
        ]);
        if (!alive) return;
        setCompanion(c?.settings ? c : null);
        setDiagnostics(d);
        setHealth(h?.rules ? h : null);
        setProcesses(Array.isArray(p?.items) ? p.items : []);
        setProcessNote(p?.nota ?? "");
      } catch (e) {
        if (alive) setError(errorText(e, "Não consegui ler o estado local."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [native, rev]);

  // Diagnóstico e processos: atualização calma, parada com a janela oculta (G2).
  useEffect(() => {
    if (!native) return;
    let timer = 0;
    const tick = () => {
      if (!document.hidden) setRev((r) => r + 1);
    };
    timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [native]);

  useEffect(() => {
    const offs = [
      listen<{ sample: HealthView["sample"]; paused: string | null }>("od-health", (p) => setHealth((h) => (h ? { ...h, sample: p.sample, paused: p.paused } : h))),
      listen<CompanionView>("od-companion", (c) => setCompanion(c)),
      listen<{ hidden: boolean }>("od-visibility", (v) => setPaused(v.hidden)),
    ];
    return () => offs.forEach((f) => f());
  }, []);

  useEffect(() => {
    if (companion) setMaxFps(companion.knobs.uiFps);
  }, [companion]);

  useEffect(() => {
    const s = health?.sample;
    if (!s) return;
    const next = healthMood(moodRef.current, { cpu: s.cpu, memory: s.memory, battery: s.battery, cpuSpeedLimit: s.cpuSpeedLimit, temperatureC: s.temperatureC, atMs: s.atMs });
    moodRef.current = next.state;
    setMood(next);
  }, [health?.sample]);

  return useMemo(
    () => ({
      native,
      loading,
      error,
      companion,
      diagnostics,
      health,
      mood,
      processes,
      processNote,
      setError,
      refresh: () => setRev((r) => r + 1),
      save: async (patch: Record<string, unknown>) => {
        try {
          const c = await invoke<CompanionView>("companion_set", { patch });
          setCompanion(c);
          setError("");
          return true;
        } catch (e) {
          setError(errorText(e, "Não consegui salvar o ajuste."));
          return false;
        }
      },
    }),
    [native, loading, error, companion, diagnostics, health, mood, processes, processNote],
  );
}

export const PROFILE_LABEL = { leve: "Leve", equilibrado: "Equilibrado", maximo: "Máximo" } as const;

export function pct(n: number | null | undefined): string {
  return typeof n === "number" ? `${Math.round(n)}%` : "indisponível";
}
export function gb(n: number | null | undefined): string {
  return typeof n === "number" ? `${n >= 100 ? Math.round(n) : n.toFixed(1)} GB` : "indisponível";
}
export function mb(bytes: number): string {
  return `${Math.round(bytes / 1_048_576)} MB`;
}

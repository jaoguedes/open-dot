// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Saúde do computador → reação do Dot (v0.3, D-028). Só a partir de medida real, com histerese
 * para não piscar entre estados, e sempre com o motivo em texto. Sem amostra = tranquilo, sem motivo.
 */
export interface HealthSample {
  cpu: number;
  memory: number;
  battery?: { percent: number; charging: boolean; onAc: boolean } | null;
  cpuSpeedLimit?: number | null;
  temperatureC?: number | null;
  atMs: number;
}

export type MoodLevel = "tranquilo" | "calor" | "panico";
export interface MoodState {
  level: MoodLevel;
  /** Desde quando a condição de subir de nível vem acontecendo. */
  upSince: number | null;
  /** Desde quando a condição de descer de nível vem acontecendo. */
  downSince: number | null;
  /** Desde quando o nível atual vale (para o texto "há 1 min"). */
  levelSince: number;
}

export const MOOD_RULES = {
  heatCpu: 75,
  heatMemory: 88,
  heatUpMs: 30_000,
  panicCpu: 92,
  panicUpMs: 20_000,
  coolMargin: 15,
  coolDownMs: 30_000,
} as const;

export const INITIAL_MOOD: MoodState = { level: "tranquilo", upSince: null, downSince: null, levelSince: 0 };

export interface DotHealthMood {
  state: MoodState;
  heat: number;
  strain: number;
  reason: string | null;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`;
}

function wants(s: HealthSample): MoodLevel {
  const throttled = typeof s.cpuSpeedLimit === "number" && s.cpuSpeedLimit < 100;
  if (s.cpu >= MOOD_RULES.panicCpu || throttled) return "panico";
  if (s.cpu >= MOOD_RULES.heatCpu || s.memory >= MOOD_RULES.heatMemory) return "calor";
  return "tranquilo";
}

const RANK: Record<MoodLevel, number> = { tranquilo: 0, calor: 1, panico: 2 };

/** Próximo estado com histerese: sobe só se a condição dura; desce só abaixo do limite − margem por um tempo. */
export function nextMood(prev: MoodState, s: HealthSample): MoodState {
  const target = wants(s);
  if (RANK[target] > RANK[prev.level]) {
    const upSince = prev.upSince ?? s.atMs;
    const need = target === "panico" ? (typeof s.cpuSpeedLimit === "number" && s.cpuSpeedLimit < 100 ? 0 : MOOD_RULES.panicUpMs) : MOOD_RULES.heatUpMs;
    if (s.atMs - upSince >= need) return { level: target, upSince: null, downSince: null, levelSince: s.atMs };
    return { ...prev, upSince, downSince: null };
  }
  const limit = prev.level === "panico" ? MOOD_RULES.panicCpu : MOOD_RULES.heatCpu;
  const cool = prev.level !== "tranquilo" && s.cpu < limit - MOOD_RULES.coolMargin && s.memory < MOOD_RULES.heatMemory && wants(s) !== "panico";
  if (cool) {
    const downSince = prev.downSince ?? s.atMs;
    if (s.atMs - downSince >= MOOD_RULES.coolDownMs) return { level: prev.level === "panico" ? "calor" : "tranquilo", upSince: null, downSince: null, levelSince: s.atMs };
    return { ...prev, upSince: null, downSince };
  }
  return { ...prev, upSince: null, downSince: null };
}

/** Reação do Dot e o motivo real em texto. */
export function healthMood(prev: MoodState, s: HealthSample | null): DotHealthMood {
  if (!s) return { state: prev, heat: 0, strain: 0, reason: null };
  const state = nextMood(prev, s);
  const since = ago(s.atMs - state.levelSince);
  const throttled = typeof s.cpuSpeedLimit === "number" && s.cpuSpeedLimit < 100;
  if (state.level === "panico")
    return { state, heat: 1, strain: clamp(0.7 + (s.cpu - MOOD_RULES.panicCpu) / 30, 0.7, 1), reason: throttled ? `Sistema limitando a CPU a ${s.cpuSpeedLimit}% por calor` : `CPU ${Math.round(s.cpu)}% ${since}` };
  if (state.level === "calor") {
    const byMem = s.memory >= MOOD_RULES.heatMemory && s.cpu < MOOD_RULES.heatCpu;
    return { state, heat: clamp(0.6 + (s.cpu - MOOD_RULES.heatCpu) / 40, 0.6, 0.95), strain: 0, reason: byMem ? `Memória ${Math.round(s.memory)}% ${since}` : `CPU ${Math.round(s.cpu)}% ${since}` };
  }
  return { state, heat: 0, strain: 0, reason: null };
}

/**
 * Sons do Dot (E7). Arquivos originais em /sounds (ver public/sounds/README.md).
 * Desligado por padrão. Pré-carrega no primeiro toque (o iOS exige gesto), nunca toca com
 * a aba oculta, no máximo 2 sons por segundo; erro e atenção têm prioridade e cortam os outros.
 * Os sons não entram no service worker: carregam sob demanda.
 */
export const SOUND_NAMES = [
  "dot-hello",
  "dot-think",
  "dot-done",
  "dot-attention",
  "dot-error",
  "dot-send",
  "dot-receive",
  "dot-tap",
  "dot-love",
  "dot-sleep",
  "dot-pop",
  "dot-close",
  "dot-notify",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

const PRIORITY: ReadonlySet<SoundName> = new Set(["dot-error", "dot-attention"]);
export const DEFAULT_VOLUME = 0.25;
export const MAX_VOLUME = 0.6;

interface AudioLike {
  volume: number;
  currentTime: number;
  paused: boolean;
  preload: string;
  load(): void;
  play(): Promise<void> | void;
  pause(): void;
}

export type PlayResult = "played" | "off" | "hidden" | "limit" | "blocked";

export function createSoundPlayer(deps: { makeAudio: (src: string) => AudioLike; isHidden: () => boolean; now: () => number }) {
  let enabled = false;
  let volume = DEFAULT_VOLUME;
  let unlocked = false;
  const cache = new Map<SoundName, AudioLike>();
  let recent: number[] = [];
  let current: { audio: AudioLike; priority: boolean; until: number } | null = null;

  const get = (name: SoundName) => {
    let a = cache.get(name);
    if (!a) {
      a = deps.makeAudio(`/sounds/${name}.mp3`);
      a.preload = "auto";
      cache.set(name, a);
    }
    return a;
  };

  const start = (name: SoundName): PlayResult => {
    if (deps.isHidden()) return "hidden";
    const now = deps.now();
    const priority = PRIORITY.has(name);
    recent = recent.filter((t) => now - t < 1000);
    if (current && current.priority && !current.audio.paused && now < current.until && !priority) return "blocked";
    if (!priority && recent.length >= 2) return "limit";
    if (current && !current.audio.paused) {
      current.audio.pause();
      current.audio.currentTime = 0;
    }
    const audio = get(name);
    audio.volume = volume;
    audio.currentTime = 0;
    try {
      const r = audio.play();
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => undefined);
    } catch {
      return "blocked";
    }
    recent.push(now);
    // Os sons mais longos têm ~1,4 s; a prioridade protege por 1,5 s.
    current = { audio, priority, until: now + 1500 };
    return "played";
  };

  return {
    setEnabled(v: boolean) {
      enabled = v;
    },
    enabled: () => enabled,
    setVolume(v: number) {
      volume = Math.min(MAX_VOLUME, Math.max(0, Number.isFinite(v) ? v : DEFAULT_VOLUME));
    },
    volume: () => volume,
    /** Primeiro gesto do usuário: cria e pré-carrega os 13 sons. */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      for (const n of SOUND_NAMES) {
        try {
          get(n).load();
        } catch {
          /* navegador sem áudio: os sons ficam mudos */
        }
      }
    },
    play(name: SoundName): PlayResult {
      if (!enabled) return "off";
      return start(name);
    },
    /** Botão "Ouvir" da tela Mascote: toca mesmo com os sons desligados (ação explícita). */
    preview(name: SoundName): PlayResult {
      return start(name);
    },
  };
}

export type SoundPlayer = ReturnType<typeof createSoundPlayer>;

/** Instância do app. Em ambiente sem `Audio` (testes, SSR) vira um tocador mudo. */
export const sound: SoundPlayer = createSoundPlayer({
  makeAudio: (src) =>
    typeof Audio !== "undefined"
      ? (new Audio(src) as unknown as AudioLike)
      : { volume: 0, currentTime: 0, paused: true, preload: "", load() {}, play() {}, pause() {} },
  isHidden: () => typeof document !== "undefined" && document.hidden,
  now: () => Date.now(),
});

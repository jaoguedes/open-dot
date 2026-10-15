/** Splash (C4): na primeira abertura da sessão mostra o "oi" por 1,2 s; depois só se a carga passar de 400 ms. */
export const SPLASH_KEY = "od-splash-seen";
export const FIRST_MIN_MS = 1_200;
export const LATER_DELAY_MS = 400;

export interface SplashPlan {
  /** Começa visível já no primeiro quadro? */
  showAtStart: boolean;
  /** Tempo mínimo na tela depois que aparece. */
  minMs: number;
  /** Se não começa visível, aparece depois deste atraso caso ainda esteja carregando. */
  delayMs: number;
}

export function splashPlan(seenThisSession: boolean): SplashPlan {
  return seenThisSession ? { showAtStart: false, minMs: 0, delayMs: LATER_DELAY_MS } : { showAtStart: true, minMs: FIRST_MIN_MS, delayMs: 0 };
}

export function readSplashSeen(): boolean {
  try {
    return sessionStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSplashSeen(): void {
  try {
    sessionStorage.setItem(SPLASH_KEY, "1");
  } catch {
    /* sem sessionStorage: o splash volta a aparecer, sem prejuízo */
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
import { api, type AskAnswer, type Snapshot } from "./api.ts";

/** Pergunta ao Dot: na demonstração responde com os dados fictícios, sem rede. */
export async function askDot(question: string, demo: Snapshot | null): Promise<AskAnswer> {
  if (demo) return (await import("./demo.ts")).demoAsk(question, demo);
  return api.ask(question);
}

export interface EnterKey {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode?: number;
}

/**
 * Enter na caixa de perguntas (D7). Toque: Enter quebra linha e o botão envia.
 * Teclado físico: Enter envia, Shift+Enter quebra. Durante composição (acentos, IME) nada.
 */
export function composerEnter(e: EnterKey, touch: boolean): "send" | "newline" | "ignore" {
  if (e.key !== "Enter") return "ignore";
  if (e.isComposing || e.keyCode === 229) return "ignore";
  if (touch || e.shiftKey) return "newline";
  return "send";
}

export function isTouchPrimary(): boolean {
  try {
    return matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

const LAST_KEY = "od-last-answer";
export type SavedAnswer = AskAnswer & { question: string };

export function readLastAnswer(): SavedAnswer | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedAnswer;
    return typeof v?.answer === "string" && Array.isArray(v.sources) ? v : null;
  } catch {
    return null;
  }
}

export function saveLastAnswer(a: SavedAnswer | null): void {
  try {
    if (a) sessionStorage.setItem(LAST_KEY, JSON.stringify(a));
    else sessionStorage.removeItem(LAST_KEY);
  } catch {
    /* sem sessionStorage: a resposta some ao recarregar */
  }
}

/** Linhas visíveis da caixa: cresce com o texto até 5. */
export function composerRows(text: string): number {
  return Math.min(5, Math.max(1, text.split("\n").length));
}

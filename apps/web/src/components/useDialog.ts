import { useEffect, useRef, type RefObject } from "react";
import { sound } from "../sound.ts";

/**
 * Comportamento de diálogo modal (D4): tudo fora do diálogo fica `inert` (o foco não
 * sai e o leitor de tela não lê o fundo), o foco entra no primeiro campo ou botão,
 * Esc fecha e, ao fechar, o foco volta para quem abriu.
 */
export function useDialog(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void, initial?: RefObject<HTMLElement | null>): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const touched: HTMLElement[] = [];
    for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sib of Array.from(parent.children)) {
        if (sib === node || !(sib instanceof HTMLElement) || sib.inert || sib.tagName === "SCRIPT") continue;
        sib.inert = true;
        touched.push(sib);
      }
    }
    const target = initial?.current ?? el.querySelector<HTMLElement>("input, textarea, select, button, [href], [tabindex]:not([tabindex='-1'])") ?? el;
    if (target === el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    target.focus();
    sound.play("dot-pop");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      // O fundo é inert, mas o Tab ainda escaparia para a barra do navegador: o ciclo fica aqui.
      const items = Array.from(el.querySelectorAll<HTMLElement>("input, textarea, select, button, [href], [tabindex]:not([tabindex='-1'])")).filter((n) => !n.hasAttribute("disabled") && n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !el.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !el.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      for (const t of touched) t.inert = false;
      sound.play("dot-close");
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, ref, initial]);
}

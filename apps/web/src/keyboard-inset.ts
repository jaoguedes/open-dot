/**
 * Altura do teclado virtual (iOS Safari): o teclado encolhe só o visualViewport, e a caixa
 * de perguntas fixa ficaria atrás dele. Publica --kb no <html>; a caixa sobe essa altura.
 * Um cálculo por quadro, só quando o visualViewport muda (sem jank). Pura no cálculo.
 */
export function keyboardInset(innerHeight: number, vvHeight: number, vvOffsetTop: number): number {
  const kb = Math.round(innerHeight - vvHeight - vvOffsetTop);
  return kb > 80 ? kb : 0;
}

export function watchKeyboard(): () => void {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return () => {};
  let frame = 0;
  let last = -1;
  const apply = () => {
    frame = 0;
    const kb = keyboardInset(window.innerHeight, vv.height, vv.offsetTop);
    if (kb === last) return;
    last = kb;
    document.documentElement.style.setProperty("--kb", `${kb}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  apply();
  return () => {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}

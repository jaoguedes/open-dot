// SPDX-License-Identifier: AGPL-3.0-only
// v0.3: em 360, 390 e 430 px, em cada tela do app, rola até o fim e confere que o último controle
// (e "Copiar detalhes" nas telas de agente) fica ACIMA da barra inferior e da caixa de perguntas.
// Requer npm run dev (ou demo) em UI_BASE (padrão http://localhost:8787).
import { chromium } from "playwright";
const BASE = process.env.UI_BASE ?? "http://localhost:8787";
const ROUTES = ["/agente/codigo", "/agente/sentinela", "/agente/correio", "/agente/noticias", "/equipe", "/aprovacoes", "/correio", "/runner", "/conexoes", "/workspace", "/meu-dia", "/rotinas", "/memoria", "/mais", "/configuracoes"];
const browser = await chromium.launch();
let failed = 0;
for (const w of [360, 390, 430]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addInitScript(() => sessionStorage.setItem("od-splash-seen", "1"));
  const p = await ctx.newPage();
  for (const route of ROUTES) {
    await p.goto(`${BASE}${route}?demo=1`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(async () => {
      const sc = document.getElementById("conteudo");
      for (const el of [sc, document.scrollingElement]) if (el) el.scrollTop = el.scrollHeight;
      await new Promise((res) => setTimeout(res, 200));
      const bars = [document.querySelector(".bottombar"), document.querySelector(".composer")].filter(Boolean).map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
      const limit = Math.min(innerHeight, ...bars.map((b) => b.top));
      const hiddenInClosed = (e) => { for (let d = e.closest("details"); d; d = d.parentElement?.closest("details")) if (!d.open && !(e.tagName === "SUMMARY" && e.parentElement === d)) return true; return false; };
      const vis = [...document.querySelectorAll("#conteudo button, #conteudo a, #conteudo input, #conteudo select, #conteudo textarea, #conteudo summary")].filter((e) => !e.closest(".bottombar, .composer") && !hiddenInClosed(e) && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().width > 2);
      const last = vis.map((e) => ({ t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30), b: e.getBoundingClientRect().bottom })).sort((a, b) => b.b - a.b)[0];
      const copy = [...document.querySelectorAll("#conteudo button")].find((e) => /Copiar detalhes/.test(e.textContent || ""));
      const cb = copy?.getBoundingClientRect();
      return { limit: Math.round(limit), last, copyBottom: cb ? Math.round(cb.bottom) : null, hasComposer: bars.length > 1 };
    });
    const bad = (r.last && r.last.b > r.limit + 1) || (r.copyBottom !== null && r.copyBottom > r.limit + 1);
    if (bad) {
      failed++;
      console.log(`FALHA ${w}px ${route}: último "${r.last?.t}" termina em ${Math.round(r.last?.b ?? 0)}; "Copiar detalhes" em ${r.copyBottom}; limite ${r.limit}`);
    } else console.log(`ok   ${w}px ${route} (limite ${r.limit}${r.copyBottom !== null ? `, Copiar detalhes ${r.copyBottom}` : ""})`);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `FALHA: ${failed}` : "ok: último controle acessível em todas as telas e larguras");
process.exit(failed ? 1 : 0);

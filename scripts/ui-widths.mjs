// SPDX-License-Identifier: AGPL-3.0-only
// v0.3 (5.6): sem rolagem horizontal em 360–1440 px nas telas principais e 1º cartão ≤ 900 px a 390 px.
// Requer npm run dev (ou demo) em UI_BASE (padrão http://localhost:8787).
import { chromium } from "playwright";
const BASE = process.env.UI_BASE ?? "http://localhost:8787";
const b = await chromium.launch();
let failed = 0;
for (const w of [360, 390, 430, 768, 1024, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  await ctx.addInitScript(() => sessionStorage.setItem("od-splash-seen", "1"));
  const p = await ctx.newPage();
  const out = [];
  for (const path of ["/", "/workspace", "/runner", "/aprovacoes", "/equipe", "/conexoes", "/correio", "/rotinas", "/memoria", "/mascote", "/configuracoes", "/mais", "/agente/correio"]) {
    await p.goto(BASE + path + "?demo=1");
    await p.waitForTimeout(1000);
    const r = await p.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth + 1, card: Math.round(document.querySelector(".feed-card")?.getBoundingClientRect().height ?? 0) }));
    if (r.wide) (out.push(`${path}:rolagem horizontal`), failed++);
    if (path === "/") {
      out.push(`1º cartão ${r.card}px`);
      if (w <= 430 && r.card > 900) failed++;
    }
  }
  console.log(w, out.join(" "));
  await ctx.close();
}
await b.close();
console.log(failed ? `FALHA: ${failed}` : "ok: sem rolagem horizontal e 1º cartão dentro do limite");
process.exit(failed ? 1 : 0);

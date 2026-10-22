// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Mede o app web em demonstração: tempo até o conteúdo da tela aparecer e CPU do navegador em
 * repouso (CDP TaskDuration em 10 s parado), em 390, 768 e 1440 px. Precisa de um servidor
 * (`npm run demo` ou `npm run dev`). Chromium headless com renderização por software: os números
 * servem para comparar antes/depois na mesma máquina, não como valor absoluto de um navegador real.
 *   UI_BASE=http://localhost:8787 node scripts/perf/measure-web.mjs [--json saida.json]
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.UI_BASE ?? "http://localhost:8787";
const IDLE_S = Number(process.env.PERF_IDLE_S ?? 10);
const routes = ["/?demo=1", "/workspace?demo=1"];
const widths = [390, 768, 1440];
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const out = { base: BASE, ociosoSegundos: IDLE_S, medidas: [] };
for (const width of widths) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addInitScript(() => sessionStorage.setItem("od-splash-seen", "1"));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Performance.enable");
    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.locator("main#conteudo, main").first().waitFor({ timeout: 30_000 });
    await page.locator(".splash").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
    const cargaMs = Date.now() - t0;
    await page.waitForTimeout(3000);
    const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    await page.waitForTimeout(IDLE_S * 1000);
    const m2 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const cpuPct = ((m2.TaskDuration - m1.TaskDuration) / IDLE_S) * 100;
    // Com a aba oculta o Dot e as atualizações devem parar.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1000);
    const h1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    await page.waitForTimeout(5000);
    const h2 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const ocultaPct = ((h2.TaskDuration - h1.TaskDuration) / 5) * 100;
    out.medidas.push({ largura: width, rota: route, cargaMs, cpuRepousoPct: Math.round(cpuPct * 10) / 10, cpuAbaOcultaPct: Math.round(ocultaPct * 10) / 10, heapMb: Math.round(m2.JSHeapUsedSize / 2 ** 20) });
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2) + "\n");

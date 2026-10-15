// Fotografa o Dot na tela Mascote (demonstração, movimento reduzido) em alguns estados.
// Uso: node scripts/capture-dot.mjs <pasta> [prefixo]   (precisa do npm run dev em :8787)
import { chromium } from "playwright";
const [dir, prefix = ""] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
await p.goto("http://localhost:8787/mascote?demo=1");
await p.locator(".splash").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
const stage = p.locator(".mascot-stage");
await stage.waitFor();
for (const [label, file] of [["Em repouso", "repouso"], ["Trabalhando", "trabalhando"], ["Com erro", "erro"]]) {
  await p.getByLabel(label, { exact: true }).check();
  await p.waitForTimeout(1500);
  await stage.locator(".dot-svg").first().screenshot({ path: `${dir}/${prefix}${file}.png`, omitBackground: true });
}
await b.close();

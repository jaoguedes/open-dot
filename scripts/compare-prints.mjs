import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.UI_BASE ?? "http://localhost:8787";
const OUT = process.env.UI_OUT ?? "test-results/ui";
mkdirSync(OUT, { recursive: true });

const launch = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const browser = await chromium.launch({ ...launch, args: ["--enable-unsafe-swiftshader"] });

async function grab(page, path, fullPage = false) {
  const sess = await page.context().newCDPSession(page);
  const { data } = await sess.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage });
  writeFileSync(path, Buffer.from(data, "base64"));
}

async function ready(p) {
  const splash = p.locator(".splash");
  const seen = await splash.waitFor({ state: "attached", timeout: 2500 }).then(() => true).catch(() => false);
  if (seen) await splash.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
}

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto(BASE + "/?demo=1");
  await ready(p);
  const greet = await p.locator(".hero h1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  console.log("tela 01 h1", greet, "px");
  await grab(p, `${OUT}/compare-01-app-1440.png`);
  await p.goto(`file://${join(ROOT, "docs/referencias/design/01-web-meu-dia.html")}`);
  await p.waitForTimeout(600);
  await grab(p, `${OUT}/compare-01-ref-1440.png`);
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto(BASE + "/?demo=1");
  await ready(p);
  const greet = await p.locator(".hero h1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const dock = await p.getByRole("navigation", { name: "Principal" }).isVisible();
  console.log("tela 02 h1", greet, "px dock", dock);
  await grab(p, `${OUT}/compare-02-app-390.png`);
  await p.goto(`file://${join(ROOT, "docs/referencias/design/02-pwa-inicio.html")}`);
  await p.waitForTimeout(600);
  await grab(p, `${OUT}/compare-02-ref-390.png`);
  await ctx.close();
}

await browser.close();
console.log("prints em", OUT);

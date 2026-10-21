// SPDX-License-Identifier: AGPL-3.0-only
// Smoke da URL pública: /, /sobre e /privacidade em 1440 e 390, sem erro de console.
//   UI_BASE=https://open-dot.<SEU-SUBDOMINIO>.workers.dev node scripts/smoke-public.mjs
import { chromium } from "playwright";

const BASE = (process.env.UI_BASE ?? "").replace(/\/$/, "");
if (!BASE) {
  console.error("Defina UI_BASE com a URL pública.");
  process.exit(1);
}

const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FALHA"} ${name}${detail ? ` — ${detail}` : ""}`);
};

for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  for (const path of ["/", "/sobre", "/privacidade"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
    const p = await ctx.newPage();
    const errors = [];
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    p.on("pageerror", (e) => errors.push(String(e)));
    const res = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30_000 });
    check(`${w} ${path}: HTTP`, (res?.status() ?? 0) < 400, String(res?.status()));
    await p.waitForTimeout(800);
    check(`${w} ${path}: sem erro de console`, errors.length === 0, errors.join(" | ").slice(0, 200));
    await ctx.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} smokes públicos.`);
process.exit(failed.length ? 1 : 0);

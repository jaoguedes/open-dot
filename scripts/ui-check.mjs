// Verificação de interface no Chromium (Playwright). Requer o servidor local rodando (npm run dev).
//   npm run test:ui            → base http://localhost:8787
// Checa: login local, estados vazios, demo rotulada, 320 px sem rolagem horizontal,
// zoom 200%, teclado/foco, tema claro/escuro, movimento reduzido e erros de console.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.UI_BASE ?? "http://localhost:8787";
const OUT = process.env.UI_OUT ?? "test-results/ui";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FALHA"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  p.on("pageerror", (e) => errors.push(String(e)));
  return { p, ctx, errors };
}

const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// 1) Login local e estado vazio real
{
  const { p, ctx, errors } = await page({ colorScheme: "dark" });
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: /modo desenvolvimento/i }).click();
  await p.getByRole("heading", { name: /Conecte seu Gmail/i }).waitFor();
  check("login local leva ao estado vazio com ação de conectar Gmail", true);
  check("modo real não exibe faixa de demonstração", (await p.locator(".banner.demo").count()) === 0);
  await p.screenshot({ path: `${OUT}/live-vazio-escuro.png` });
  await p.goto(BASE + "/conexoes");
  const gmailChip = await p.locator("section.card").first().locator(".chip").first().innerText();
  check("Conexões não mostra 'conectado' sem conexão real", /Não conectado/.test(gmailChip), gmailChip);
  const btn = p.getByRole("button", { name: "Conectar Gmail" });
  check("botão Conectar Gmail desabilitado sem OAuth configurado (com explicação)", await btn.isDisabled());
  await p.screenshot({ path: `${OUT}/live-conexoes.png`, fullPage: true });
  check("sem erros de console (modo real)", errors.length === 0, errors.join(" | ").slice(0, 300));
  await ctx.close();
}

// 2) Demonstração: rotulada, desktop claro/escuro
for (const scheme of ["dark", "light"]) {
  const { p, ctx, errors } = await page({ colorScheme: scheme });
  await p.goto(BASE + "/?demo=1");
  await p.getByText("Demonstração", { exact: true }).waitFor();
  check(`demo rotulada (${scheme})`, (await p.locator(".banner.demo").count()) === 1);
  const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  const interLoaded = await p.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Inter" && f.status === "loaded");
  });
  check(`Inter local carregada (${scheme})`, font.includes("Inter") && interLoaded, font);
  await p.screenshot({ path: `${OUT}/demo-home-${scheme}.png` });
  for (const [path, name] of [["/meu-dia", "meu-dia"], ["/rotinas", "rotinas"], ["/mascote", "mascote"], ["/agente/sentinela", "sentinela"]]) {
    await p.goto(BASE + path + "?demo=1");
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${OUT}/demo-${name}-${scheme}.png`, fullPage: true });
  }
  check(`sem erros de console na demo (${scheme})`, errors.length === 0, errors.join(" | ").slice(0, 300));
  await ctx.close();
}

// 3) 320 px e zoom 200% (equivalente: 720 px de largura com deviceScaleFactor 2)
for (const [w, label] of [[320, "320px"], [390, "390px"], [640, "zoom200-1280"]]) {
  const { p, ctx } = await page({ viewport: { width: w, height: 800 }, colorScheme: "light", deviceScaleFactor: label.startsWith("zoom") ? 2 : 1 });
  for (const path of ["/", "/meu-dia", "/rotinas", "/conexoes", "/mascote"]) {
    await p.goto(BASE + path + "?demo=1");
    await p.waitForTimeout(100);
    check(`${label} sem rolagem horizontal em ${path}`, await noHScroll(p));
  }
  await p.goto(BASE + "/?demo=1");
  await p.screenshot({ path: `${OUT}/demo-home-${label}.png`, fullPage: true });
  // menu acessível no celular
  if (w < 768) {
    await p.getByRole("button", { name: "Abrir menu" }).click();
    await p.getByRole("link", { name: "Rotinas" }).click();
    check(`${label}: navegação pelo menu funciona`, p.url().includes("/rotinas"));
  }
  await ctx.close();
}

// 4) Teclado: skip link, foco visível, ⌘K
{
  const { p, ctx } = await page({ colorScheme: "dark" });
  await p.goto(BASE + "/?demo=1");
  await p.locator(".banner.demo").waitFor();
  await p.keyboard.press("Tab");
  const first = await p.evaluate(() => document.activeElement?.textContent?.trim());
  check("primeiro Tab foca 'Pular para o conteúdo'", first === "Pular para o conteúdo", first);
  await p.keyboard.press("Tab");
  const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check("foco visível no próximo controle", outline !== "none", outline);
  await p.keyboard.press("Control+k");
  check("Ctrl/⌘+K abre 'Ir para'", await p.getByRole("dialog", { name: "Buscar ou ir para" }).isVisible());
  await p.keyboard.type("rot");
  await p.keyboard.press("Enter");
  check("navegação por teclado no 'Ir para'", p.url().includes("/rotinas"));
  await ctx.close();
}

// 5) Movimento reduzido: sem animação contínua do Dot
{
  const { p, ctx } = await page({ reducedMotion: "reduce" });
  await p.goto(BASE + "/?demo=1");
  const anim = await p.evaluate(() => [...document.querySelectorAll(".dot-body")].map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== "none"));
  check("prefers-reduced-motion: nenhuma animação no corpo do Dot", anim.length === 0, anim.join(","));
  await ctx.close();
}

// 6) Prioridade visual: carinho suprimido quando há aprovação/erro
{
  const { p, ctx } = await page();
  await p.goto(BASE + "/mascote?demo=1");
  await p.getByRole("radio", { name: "Esperando seu OK" }).check();
  await p.getByRole("button", { name: "Fazer carinho" }).first().click();
  await p.waitForTimeout(200);
  const hearts = await p.locator("section.card .hearts svg").count();
  const note = await p.getByText(/Carinho não aparece/).count();
  check("carinho não mascara aprovação pendente", hearts === 0 && note === 1);
  await p.getByRole("radio", { name: "Em repouso" }).check();
  await p.getByRole("button", { name: "Fazer carinho" }).first().click();
  await p.waitForTimeout(250);
  check("carinho aparece em repouso", (await p.locator("section.card .hearts svg").count()) > 0);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações de interface passaram. Capturas em ${OUT}/`);
process.exit(failed.length ? 1 : 0);

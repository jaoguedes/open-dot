// SPDX-License-Identifier: AGPL-3.0-only
// Verificação de interface no Chromium (Playwright). Requer o servidor local rodando (npm run dev).
//   npm run test:ui            → base http://localhost:8787
// Checa: login local, estados vazios, demo rotulada, 320 px sem rolagem horizontal,
// zoom 200%, teclado/foco, tema claro/escuro, movimento reduzido e erros de console.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makePdf } from "./lib/make-pdf.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BASE = process.env.UI_BASE ?? "http://localhost:8787";
const OUT = process.env.UI_OUT ?? "test-results/ui";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FALHA"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const launch = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const browser = await chromium.launch({ ...launch, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
// Navegador sem WebGL para testar o fallback do Dot 3D.
const browser2d = await chromium.launch({ ...launch, args: ["--disable-webgl", "--disable-3d-apis"] });
const measures = {};

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  p.on("pageerror", (e) => errors.push(String(e)));
  return { p, ctx, errors };
}

const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function shot(target, opts) {
  if (typeof target.context === "function" && opts.path) {
    const sess = await target.context().newCDPSession(target);
    const { data } = await sess.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: Boolean(opts.fullPage),
    });
    writeFileSync(opts.path, Buffer.from(data, "base64"));
    return;
  }
  await target.screenshot({ animations: "disabled", timeout: 8_000, ...opts });
}

async function ready(p) {
  const splash = p.locator(".splash");
  const seen = await splash
    .waitFor({ state: "attached", timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  if (seen) await splash.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
}

// UI_ONLY=dot3d roda só a seção do Dot 3D (iteração rápida); sem a variável, roda tudo.
const ONLY = process.env.UI_ONLY ?? "";
if (!ONLY) {
  {
    const { p, ctx, errors } = await page({ colorScheme: "dark" });
    await p.goto(BASE + "/sobre");
    await p.locator(".legal h1").waitFor({ timeout: 10_000 });
    check("sobre abre sem login", (await p.locator(".legal h1").innerText()) === "Open Dot" && (await p.getByRole("button", { name: /modo desenvolvimento/i }).count()) === 0);
    check("sobre liga privacidade", (await p.getByRole("link", { name: /privacidade/i }).count()) > 0);
    check("sobre sem erro de console", errors.length === 0, errors.join(" | ").slice(0, 200));
    await p.goto(BASE + "/privacidade");
    await ready(p);
    check("privacidade abre sem login", (await p.getByRole("heading", { name: "Privacidade" }).count()) > 0);
    check("privacidade cita Gmail só leitura", (await p.getByText(/gmail\.readonly/).count()) > 0);
    check("privacidade sem erro de console", errors.length === 0, errors.join(" | ").slice(0, 200));
    await ctx.close();
  }
  // 1) Login local e estado vazio real
  {
    const { p, ctx, errors } = await page({ colorScheme: "dark" });
    await p.goto(BASE + "/");
    const splashOn = await p
      .locator(".splash")
      .waitFor({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    await ready(p);
    await p.getByRole("button", { name: /modo desenvolvimento/i }).waitFor({ timeout: 20_000 });
    await p
      .locator(".splash")
      .waitFor({ state: "detached", timeout: 5_000 })
      .catch(() => {});
    check("boot chega no login local", true);
    check("splash some depois da sessão", (await p.locator(".splash").count()) === 0);
    if (splashOn) check("splash aparece no boot", true);
    await p.getByRole("button", { name: /modo desenvolvimento/i }).click();
    await p.getByRole("navigation", { name: "Navegação principal" }).waitFor();
    check("login local entra no app autenticado", (await p.getByRole("link", { name: /Meu dia/ }).count()) > 0);
    check("modo real não exibe faixa de demonstração", (await p.locator(".banner.demo").count()) === 0);
    await shot(p, { path: `${OUT}/live-vazio-escuro.png` });
    await p.goto(BASE + "/conexoes");
    const gmailChip = await p.locator("section.card").first().locator(".chip").first().innerText();
    check("Conexões não mostra 'conectado' sem conexão real", /Não conectado/.test(gmailChip), gmailChip);
    const btn = p.getByRole("button", { name: "Conectar Gmail" });
    const gmailReady = await btn.isEnabled();
    const hint = await p.getByText(/Falta configurar o cliente OAuth/).count();
    check("Conectar Gmail: habilitado só com OAuth local, senão explica a falta", gmailReady ? hint === 0 : hint > 0, gmailReady ? "OAuth local presente; botão livre" : "sem OAuth; botão travado");
    await shot(p, { path: `${OUT}/live-conexoes.png`, fullPage: true });
    check("sem erros de console (modo real)", errors.length === 0, errors.join(" | ").slice(0, 300));
    await ctx.close();
  }

  // 2) Demonstração: rotulada, desktop claro/escuro
  for (const scheme of ["dark", "light"]) {
    const { p, ctx, errors } = await page({ colorScheme: scheme });
    await p.goto(BASE + "/?demo=1");
    await ready(p);
    await p.getByText("Demonstração", { exact: true }).waitFor();
    check(`demo rotulada (${scheme})`, (await p.locator(".banner.demo").count()) === 1);
    const currentNav = await p.locator('nav[aria-label="Navegação principal"] a[aria-current="page"]').first().innerText();
    check(`/?demo=1 marca Meu dia (${scheme})`, /Meu dia/.test(currentNav), currentNav);
    const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
    const jakartaLoaded = await p.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Plus Jakarta Sans" && f.status === "loaded");
    });
    check(`Plus Jakarta Sans local carregada (${scheme})`, font.includes("Plus Jakarta Sans") && jakartaLoaded, font);
    await shot(p, { path: `${OUT}/demo-home-${scheme}.png` });
    for (const [path, name] of [
      ["/meu-dia", "meu-dia"],
      ["/rotinas", "rotinas"],
      ["/mascote", "mascote"],
      ["/agente/sentinela", "sentinela"],
    ]) {
      await p.goto(BASE + path + "?demo=1");
      await ready(p);
      await p.waitForTimeout(150);
      await shot(p, { path: `${OUT}/demo-${name}-${scheme}.png`, fullPage: true });
    }
    check(`sem erros de console na demo (${scheme})`, errors.length === 0, errors.join(" | ").slice(0, 300));
    await ctx.close();
  }

  // 3) 320 px e zoom 200% (equivalente: 720 px de largura com deviceScaleFactor 2)
  for (const [w, label] of [
    [320, "320px"],
    [390, "390px"],
    [640, "zoom200-1280"],
  ]) {
    const { p, ctx } = await page({ viewport: { width: w, height: 800 }, colorScheme: "light", deviceScaleFactor: label.startsWith("zoom") ? 2 : 1 });
    for (const path of ["/", "/meu-dia", "/rotinas", "/conexoes", "/mascote"]) {
      await p.goto(BASE + path + "?demo=1");
      await ready(p);
      check(`${label} sem rolagem horizontal em ${path}`, await noHScroll(p));
    }
    await p.goto(BASE + "/?demo=1");
    await ready(p);
    await shot(p, { path: `${OUT}/demo-home-${label}.png`, fullPage: true });
    // navegação móvel (v0.3): barra inferior com 4 itens
    if (w < 760) {
      const items = await p.getByRole("navigation", { name: "Principal" }).getByRole("link").allInnerTexts();
      check(`${label}: barra inferior com Workspace, Runner, Correio e Mais`, items.join("|") === "Workspace|Runner|Correio|Mais", items.join("|"));
      check(`${label}: sem trilho lateral no celular`, !(await p.locator(".rail").isVisible()));
      await p.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Runner" }).click();
      check(`${label}: navegação pela barra inferior funciona`, p.url().includes("/runner"));
      await p.goto(BASE + "/aprovacao/demo-ap1?demo=1");
      await ready(p);
      check(`${label}: tela de aprovação`, await p.getByRole("heading", { name: "Posso enviar esta resposta?" }).isVisible());
      await p.getByRole("button", { name: "Aprovar e enviar" }).click();
      check(`${label}: aprovar não envia`, (await p.getByText(/Envio ainda não habilitado/).count()) > 0);
      await p.getByRole("button", { name: "Editar" }).click();
      check(`${label}: editar abre o texto`, await p.getByLabel("Texto da resposta").isVisible());
      await p.getByRole("button", { name: "Cancelar edição" }).click();
      await p.getByRole("button", { name: "Negar" }).click();
      check(`${label}: negar na demonstração`, (await p.getByText(/recusa fictícia/).count()) > 0);
    }
    await ctx.close();
  }

  // 4) Teclado: skip link, foco visível, ⌘K
  {
    const { p, ctx } = await page({ colorScheme: "dark" });
    await p.goto(BASE + "/?demo=1");
    await ready(p);
    await p.locator(".banner.demo").waitFor();
    await p.keyboard.press("Tab");
    const first = await p.evaluate(() => document.activeElement?.textContent?.trim());
    check("primeiro Tab foca 'Pular para o conteúdo'", first === "Pular para o conteúdo", first);
    await p.keyboard.press("Tab");
    const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check("foco visível no próximo controle", outline !== "none", outline);
    await p.keyboard.press("Control+k");
    check("Ctrl/⌘+K abre 'Ir para'", await p.getByRole("dialog", { name: "Buscar ou perguntar" }).isVisible());
    await p.keyboard.type("rot");
    await p.keyboard.press("Enter");
    check("navegação por teclado no 'Ir para'", p.url().includes("/rotinas"));
    await ctx.close();
  }

  // 4b) Trilho recolhido (v0.3): 84 px, abre por hover, foco e botão sobre o conteúdo, fecha com Esc
  {
    const { p, ctx } = await page({ colorScheme: "dark", viewport: { width: 1440, height: 900 } });
    await p.goto(BASE + "/workspace?demo=1");
    await ready(p);
    const rail = p.locator("nav.rail");
    const width = () => rail.evaluate((el) => el.getBoundingClientRect().width);
    // Chromium headless com renderização por software atrasa a transição de 160 ms: espera o estado final.
    const settle = (open) => p.waitForFunction((o) => { const w = document.querySelector("nav.rail").getBoundingClientRect().width; return o ? w > 240 : w < 90; }, open, { timeout: 5000 }).catch(() => {});
    const contentLeft = () => p.locator("#conteudo").evaluate((el) => el.getBoundingClientRect().left);
    check("trilho recolhido com 84 px", Math.round(await width()) === 84, String(await width()));
    const left0 = await contentLeft();
    await rail.hover();
    await settle(true);
    check("trilho abre ao passar o mouse", (await width()) > 200, String(await width()));
    check("trilho abre sobre o conteúdo (não empurra)", Math.abs((await contentLeft()) - left0) < 1);
    await p.mouse.move(900, 500);
    await settle(false);
    check("trilho fecha ao tirar o mouse", Math.round(await width()) === 84, String(await width()));
    await rail.getByRole("link", { name: "Workspace" }).focus();
    await settle(true);
    check("trilho abre no foco do teclado", (await width()) > 200, String(await width()));
    await p.keyboard.press("Escape");
    await settle(false);
    check("Esc fecha o trilho", Math.round(await width()) === 84, String(await width()));
    await p.getByRole("button", { name: "Expandir menu" }).click();
    await settle(true);
    check("botão abre o trilho", (await width()) > 200);
    await p.mouse.click(1200, 600);
    await settle(false);
    check("clique fora fecha o trilho", Math.round(await width()) === 84, String(await width()));
    const labels = await rail.locator("a.rail-item").evaluateAll((els) => els.map((e) => [e.getAttribute("aria-label"), e.getAttribute("title")]));
    check("cada item do trilho tem nome acessível", labels.every(([a]) => a && a.length > 1), JSON.stringify(labels).slice(0, 200));
    check("cada item recolhido tem dica (title)", labels.every(([, t]) => t && t.length > 1));
    await ctx.close();
  }

  // 5) Movimento reduzido: sem animação contínua do Dot
  {
    const { p, ctx } = await page({ reducedMotion: "reduce" });
    await p.goto(BASE + "/?demo=1");
    await ready(p);
    const anim = await p.evaluate(() => [...document.querySelectorAll(".dot-body")].map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== "none"));
    check("prefers-reduced-motion: nenhuma animação CSS no corpo do Dot", anim.length === 0, anim.join(","));
    check("prefers-reduced-motion: motor SVG no caminho padrão", (await p.locator('[data-dot-renderer="engine"]').count()) > 0);
    await ctx.close();
  }

  // 6) Motor SVG: carinho, bloqueio, toque, tonto, olhar, acessórios
  {
    const { p, ctx } = await page({ colorScheme: "dark" });
    const requested = [];
    p.on("request", (r) => requested.push(r.url()));
    await p.goto(BASE + "/mascote?demo=1");
    await ready(p);
    await p.locator('[data-dot-renderer="engine"]').first().waitFor();
    check("caminho padrão usa o motor SVG", (await p.locator('[data-dot-renderer="engine"]').count()) > 0);
    check(
      "chunk do three.js não carrega no caminho padrão",
      !requested.some((u) => /DotScene/.test(u)),
      requested
        .filter((u) => /DotScene|three/.test(u))
        .join(" | ")
        .slice(0, 200),
    );

    const preview = p.locator("section.card [data-dot-renderer='engine']").first();
    await preview.scrollIntoViewIfNeeded();
    await p.getByRole("radio", { name: "Esperando seu OK" }).check();
    await p.getByRole("button", { name: "Fazer carinho" }).first().click();
    await p.getByText(/Carinho não aparece/).waitFor({ timeout: 3_000 });
    const heartsBlocked = await p.evaluate(() => [...document.querySelectorAll("section.card [data-part]")].filter((e) => Number(e.getAttribute("opacity")) > 0.08).length);
    const note = await p.getByText(/Carinho não aparece/).count();
    check("carinho não mascara aprovação pendente", heartsBlocked === 0 && note === 1, `partículas=${heartsBlocked} nota=${note}`);

    await p.getByRole("radio", { name: "Em repouso" }).check();
    await p.getByRole("button", { name: "Fazer carinho" }).first().click();
    const hearts = await p
      .waitForFunction(
        () => {
          const parts = [...document.querySelectorAll("section.card [data-part]")].filter((e) => Number(e.getAttribute("opacity")) > 0.08).length;
          const ind = Number(document.querySelector('section.card [data-r="ind-heart"]')?.getAttribute("opacity") ?? "0");
          return parts + (ind > 0.08 ? 1 : 0);
        },
        null,
        { timeout: 3_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => 0);
    check("carinho aparece em repouso", Number(hearts) > 0, `${hearts} partículas`);

    await p.getByRole("radio", { name: "Com erro" }).check();
    const stage = p.locator("section.card [data-dot-renderer='engine']").first();
    await stage.click({ position: { x: 110, y: 110 } });
    await p.waitForTimeout(150);
    const blockedPoke = await p.evaluate(() => document.querySelector("section.card [data-dot-renderer='engine'] svg")?.getAttribute("aria-label") ?? "");
    check("toque no erro não troca o estado", /erro/i.test(blockedPoke), blockedPoke);

    await p.getByRole("radio", { name: "Em repouso" }).check();
    await stage.scrollIntoViewIfNeeded();
    await stage.evaluate((el) => {
      for (let i = 0; i < 3; i++) el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const dizzy = await p
      .waitForFunction(() => Number(document.querySelector('section.card [data-r="ind-spiral"]')?.getAttribute("opacity") ?? "0"), null, { timeout: 3_000 })
      .then((h) => h.jsonValue())
      .catch(() => 0);
    check("três toques em 0,9 s disparam tonto", Number(dizzy) > 0, `spiral=${dizzy}`);

    const before = await p.evaluate(() => document.querySelector('section.card [data-r="eyeAd0"]')?.parentElement?.getAttribute("transform") ?? "");
    const box = await stage.boundingBox();
    if (box) await p.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.4);
    await p.waitForTimeout(200);
    const after = await p.evaluate(() => document.querySelector('section.card [data-r="eyeAd0"]')?.parentElement?.getAttribute("transform") ?? "");
    check("o olhar segue o ponteiro", before !== after, `${before} → ${after}`);

    await p.getByRole("radio", { name: "Correio" }).check();
    const cap = await p
      .waitForFunction(() => Number(document.querySelector('section.card [data-r="cap"]')?.getAttribute("opacity") ?? "0"), null, { timeout: 3_000 })
      .then((h) => h.jsonValue())
      .catch(() => 0);
    check("acessório do Correio (boné) aparece", Number(cap) > 0, `cap=${cap}`);
    await ctx.close();
  }
}

// 7) Dot 3D (só com DOT_RENDERER=glb). No caminho padrão o motor SVG cobre o mascote.
if (process.env.DOT_RENDERER === "glb" && (!ONLY || ONLY === "dot3d")) {
  {
    const ctx2 = await browser2d.newContext();
    const p = await ctx2.newPage();
    await p.goto(BASE + "/mascote?demo=1");
    const el = p.locator("[data-dot-renderer]").first();
    await p.locator('[data-dot-renderer="2d"]').waitFor({ timeout: 10_000 });
    check("sem WebGL: cai para o Dot 2D com motivo escrito", (await el.getAttribute("data-dot-fallback")) === "no-webgl" && (await p.getByText(/não oferece WebGL/).count()) === 1);
    check("sem WebGL: nenhum canvas visível", (await p.locator("canvas:visible").count()) === 0);
    await ctx2.close();
  }
  {
    const { p, ctx, errors } = await page({ reducedMotion: "reduce" });
    await p.goto(BASE + "/mascote?demo=1");
    await p.locator('[data-dot-renderer="2d"]').waitFor({ timeout: 10_000 });
    check(
      "movimento reduzido: Dot 2D parado, sem WebGL",
      (await p.locator("[data-dot-renderer]").first().getAttribute("data-dot-fallback")) === "reduced-motion" && (await p.locator("canvas").count()) === 0,
    );
    check("movimento reduzido: sem erros de console", errors.length === 0, errors.join(" | ").slice(0, 300));
    await ctx.close();
  }
  {
    const { p, ctx, errors } = await page({ colorScheme: "light" });
    await p.goto(BASE + "/mascote?demo=1");
    const renderer = await p
      .locator('[data-dot-renderer="3d"], [data-dot-renderer="2d"]')
      .first()
      .getAttribute("data-dot-renderer", { timeout: 20_000 })
      .catch(() => "timeout");
    const reason = await p.locator("[data-dot-renderer]").first().getAttribute("data-dot-fallback");
    const manifest = await p.evaluate(() => fetch("/dot/manifest.json").then((r) => r.ok));
    if (!manifest) {
      check("Dot 3D: sem manifesto publicado, usa 2D com motivo", renderer === "2d" && reason === "manifest", `${renderer}/${reason}`);
    } else {
      check("Dot 3D carrega com WebGL (GLB do manifesto)", renderer === "3d", `${renderer}/${reason ?? ""}`);
      check("Dot 3D: um único canvas na página", (await p.locator("canvas").count()) === 1);
      await p.waitForTimeout(1500);
      const s0 = await p.evaluate(() => window.__openDot3d?.());
      await p.waitForTimeout(2000);
      const s1 = await p.evaluate(() => window.__openDot3d?.());
      // Repouso: só piscadas ocasionais. 2 s a 30 fps seriam 60 quadros.
      const restFrames = s1 && s0 ? s1.rendered - s0.rendered : -1;
      check("Dot 3D em repouso renderiza sob demanda (< 20 quadros em 2 s)", restFrames >= 0 && restFrames < 20, `${restFrames} quadros`);
      await p.getByRole("radio", { name: "Trabalhando" }).check();
      await p.waitForTimeout(300);
      const w0 = await p.evaluate(() => ({ s: window.__openDot3d?.(), t: performance.now() }));
      await p.waitForTimeout(2000);
      const w1 = await p.evaluate(() => ({ s: window.__openDot3d?.(), t: performance.now() }));
      const fps = w0.s && w1.s ? ((w1.s.rendered - w0.s.rendered) * 1000) / (w1.t - w0.t) : -1;
      check("Dot 3D ativo fica em no máximo 30 fps", fps > 0 && fps <= 31, `${fps.toFixed(1)} fps (medição em Chromium headless/SwiftShader)`);
      const mem = await p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null));
      measures.dot3d = { restFramesIn2s: restFrames, activeFps: Number(fps.toFixed(1)), jsHeapMB: mem, stats: w1.s };
      await p.getByRole("radio", { name: "Com erro" }).check();
      await p.waitForTimeout(400);
      const se = await p.evaluate(() => window.__openDot3d?.());
      check("Dot 3D: erro troca para body_error + face_squint", se?.body === "body_error" && se?.face === "face_squint", `${se?.body}/${se?.face}`);
      await p.getByRole("radio", { name: "Código" }).check();
      await p.waitForTimeout(600);
      const sg = await p.evaluate(() => window.__openDot3d?.());
      check("Dot 3D: acessório do Código (óculos) preso ao socket", sg?.accessory === "Prop_Glasses", String(sg?.accessory));
      await p.getByRole("radio", { name: "Em repouso" }).check();
      await p.getByRole("button", { name: "Fazer carinho" }).first().click();
      await p.waitForTimeout(400);
      const sh = await p.evaluate(() => window.__openDot3d?.());
      check("Dot 3D: carinho cria corações independentes", (sh?.hearts ?? 0) > 0, `${sh?.hearts} corações`);
      await shot(p, { path: `${OUT}/dot3d-mascote.png` });
      await shot(p.locator(".dot3d-stage"), { path: `${OUT}/dot3d-close.png` });
      // Janela oculta: o loop para.
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const h0 = await p.evaluate(() => window.__openDot3d?.()?.rendered ?? 0);
      await p.getByRole("radio", { name: "Trabalhando" }).check();
      await p.waitForTimeout(1000);
      const h1 = await p.evaluate(() => window.__openDot3d?.()?.rendered ?? 0);
      check("Dot 3D pausa com a janela oculta", h1 - h0 === 0, `${h1 - h0} quadros oculto`);
      // Perda de contexto: volta para o 2D sozinho.
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.querySelector("canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      });
      await p
        .locator('[data-dot-renderer="2d"]')
        .waitFor({ timeout: 5000 })
        .catch(() => {});
      check("Dot 3D: perda de contexto cai para o 2D", (await p.locator("[data-dot-renderer]").first().getAttribute("data-dot-fallback")) === "context-lost");
    }
    check("Dot 3D: sem erros de console", errors.length === 0, errors.join(" | ").slice(0, 300));
    await ctx.close();
  }
}

// 8) Absorção de arquivos (servidor real local): upload lento, PDF com texto e escaneado, grande, duplicado, tipo errado.
if (!ONLY || ONLY === "absorb") {
  const { p, ctx, errors } = await page();
  await p.goto(BASE + "/");
  await ready(p);
  await p.getByRole("button", { name: /modo desenvolvimento/i }).click();
  await p.goto(BASE + "/agente/dot");
  const panel = p.getByRole("region", { name: "Absorver arquivo" });
  await panel.waitFor();
  const status = panel.getByTestId("absorb-status");
  const phase = () => panel.getAttribute("data-absorb-phase");
  const input = panel.locator('input[type="file"]');
  // Todas as mudanças de texto do status, em ordem, para provar que "recebido" não aparece antes da resposta.
  await p.evaluate(() => {
    window.__absorbLog = [];
    const el = document.querySelector('[data-testid="absorb-status"]');
    new MutationObserver(() => window.__absorbLog.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const stamp = Date.now();
  const txt = {
    name: `notas-${stamp}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(`# Notas de teste ${stamp}\n\nReunião sobre manutenção do contrato e prazos de entrega.\n\n## Próximos passos\n\nRevisar relatório de manutenção até sexta.`),
  };

  // Upload lento: segura a resposta do POST por 2,5 s.
  let releasedAt = 0;
  await p.route("**/api/uploads", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, 2500));
    const res = await route.fetch();
    releasedAt = Date.now();
    await route.fulfill({ response: res });
  });
  await input.setInputFiles(txt);
  await p.waitForTimeout(1500);
  const during = await phase();
  const logDuring = await p.evaluate(() => window.__absorbLog.join(" | "));
  check("upload lento: continua 'enviando' enquanto o servidor não responde", during === "uploading", `${during} · ${logDuring}`);
  check("upload lento: 'recebido' não aparece antes da resposta", !/recebido|organizado/i.test(logDuring), logDuring);
  const organized = await p
    .locator('[data-absorb-phase="organized"]')
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  check("upload lento: termina 'organizado' após o job, com resultado", organized && releasedAt > 0);
  const log = await p.evaluate(() => window.__absorbLog);
  const iRec = log.findIndex((t) => /recebido/i.test(t));
  const iOrg = log.findIndex((t) => /organizado/i.test(t));
  check("ordem real das fases: enviando → recebido → organizado", log.some((t) => /Enviando/.test(t)) && iRec >= 0 && iOrg > iRec, log.join(" | ").slice(0, 300));
  await shot(p, { path: `${OUT}/absorcao-organizado.png` });
  await p.unroute("**/api/uploads");

  // Duplicado.
  await input.setInputFiles(txt);
  await p.waitForFunction(() => /já foi absorvido/i.test(document.querySelector('[data-testid="absorb-status"]')?.textContent ?? ""), null, { timeout: 10_000 }).catch(() => {});
  check("arquivo duplicado: mensagem específica", /já foi absorvido/.test(await status.innerText()), await status.innerText());

  // Grande (> 5 MB): recusado antes de extrair/enviar.
  let posts = 0;
  p.on("request", (r) => r.url().endsWith("/api/uploads") && r.method() === "POST" && posts++);
  await input.setInputFiles({ name: "grande.txt", mimeType: "text/plain", buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 97) });
  await p.waitForTimeout(300);
  check("arquivo grande: recusado com mensagem, sem envio", /maior que 5 MB/.test(await status.innerText()) && posts === 0, await status.innerText());

  // Tipo errado.
  await input.setInputFiles({ name: "programa.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await p.waitForTimeout(300);
  check("tipo não suportado: mensagem específica", /não suportado/.test(await status.innerText()) && posts === 0, await status.innerText());

  // PDF escaneado (sem camada de texto): extraído no Web Worker com pdf.js, recusado sem enviar.
  await input.setInputFiles({ name: "digitalizado.pdf", mimeType: "application/pdf", buffer: Buffer.from(makePdf([null, null])) });
  await p.waitForFunction(() => /escaneado|imagem/i.test(document.querySelector('[data-testid="absorb-status"]')?.textContent ?? ""), null, { timeout: 20_000 }).catch(() => {});
  check("PDF escaneado: mensagem específica, sem envio", /escaneado|imagem/i.test(await status.innerText()) && posts === 0, await status.innerText());

  // PDF com texto: pdf.js real no Web Worker, páginas contadas.
  await input.setInputFiles({
    name: `contrato-${stamp}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from(makePdf([`Contrato ${stamp} de manutencao predial`, "Clausula de prazos e entregas mensais"])),
  });
  await p
    .locator('[data-absorb-phase="organized"]')
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  const pdfResult = (await panel.getByTestId("absorb-result").count()) ? await panel.getByTestId("absorb-result").innerText() : await status.innerText();
  check("PDF com texto: extraído no navegador e organizado (2 páginas)", /2 páginas/.test(pdfResult), pdfResult.slice(0, 200));

  // Limpeza: apaga o que este teste criou (o banco local persiste entre execuções).
  const removed = await p.evaluate(async (stamp) => {
    const list = await (await fetch("/api/uploads")).json();
    const mine = list.uploads.filter((u) => u.fileName.includes(String(stamp)));
    for (const u of mine) await fetch(`/api/uploads/${u.id}`, { method: "DELETE", headers: { "x-open-dot": "1" } });
    return mine.length;
  }, stamp);
  check("limpeza: uploads do teste apagados", removed === 2, String(removed));
  // 4xx esperados (duplicado) aparecem como "Failed to load resource" no console; o resto conta.
  const unexpected = errors.filter((e) => !/status of 409/.test(e));
  check("absorção: sem erros de console inesperados", unexpected.length === 0, unexpected.join(" | ").slice(0, 300));
  await ctx.close();
}

{
  const { p, ctx } = await page({ colorScheme: "dark" });
  await p.goto(BASE + "/?demo=1");
  await ready(p);
  const man = await p.evaluate(async () => {
    const r = await fetch("/manifest.webmanifest");
    const j = await r.json();
    return { ok: r.ok, name: j.name, short: j.short_name, display: j.display, theme: j.theme_color, icons: (j.icons ?? []).map((i) => i.purpose).join(",") };
  });
  check(
    "manifest: Open Dot / opendot / standalone / #07080C",
    man.ok && man.name === "Open Dot" && man.short === "opendot" && man.display === "standalone" && man.theme.toLowerCase() === "#07080c" && /maskable/.test(man.icons),
    JSON.stringify(man),
  );
  await p.waitForTimeout(500);
  const sw = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg);
  });
  check("service worker registrado", sw);
  await ctx.close();
}

{
  const { p, ctx } = await page({ colorScheme: "dark" });
  await p.goto(BASE + "/conexoes?demo=1");
  await ready(p);
  await p.getByRole("button", { name: "Testar com exemplo fictício" }).first().click();
  check("tela de provedores: teste fictício no provedor falso", (await p.getByText(/provedor falso/).count()) > 0);
  await ctx.close();
}

{
  const { p, ctx } = await page({ colorScheme: "dark", viewport: { width: 1440, height: 900 } });
  await p.goto(BASE + "/?demo=1");
  await ready(p);
  const greet = await p.locator(".hero h1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("tela 01 1440: saudação 56–64 px", greet >= 56 && greet <= 64, `${greet}px`);
  await shot(p, { path: `${OUT}/compare-01-app-1440.png` });
  await p.goto(`file://${join(ROOT, "docs/referencias/design/01-web-meu-dia.html")}`);
  await p.waitForTimeout(400);
  await shot(p, { path: `${OUT}/compare-01-ref-1440.png` });
  await ctx.close();
}

{
  const { p, ctx } = await page({ colorScheme: "dark", viewport: { width: 390, height: 844 } });
  await p.goto(BASE + "/?demo=1");
  await ready(p);
  const greet = await p.locator(".hero h1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("tela 02 390: saudação 20 px", greet === 20, `${greet}px`);
  check("tela 02: barra inferior visível", await p.getByRole("navigation", { name: "Principal" }).isVisible());
  // v0.3 (5.6): o 1º cartão da demonstração media 1.748 px no celular; limite de 900 px a 390 px.
  const first = await p.evaluate(() => {
    const card = document.querySelector(".feed-card");
    return card ? Math.round(card.getBoundingClientRect().height) : null;
  });
  check("tela 02: 1º cartão com no máximo 900 px de altura a 390 px", first !== null && first <= 900, `${first}px`);
  await shot(p, { path: `${OUT}/compare-02-app-390.png` });
  await p.goto(`file://${join(ROOT, "docs/referencias/design/02-pwa-inicio.html")}`);
  await p.waitForTimeout(400);
  const phone = p
    .locator("div")
    .filter({ hasText: /Bo(m dia|a tarde|a noite), Alex/ })
    .first();
  await shot(phone, { path: `${OUT}/compare-02-ref-390.png` }).catch(async () => {
    await shot(p, { path: `${OUT}/compare-02-ref-390.png` });
  });
  await ctx.close();
}

await browser.close();
await browser2d.close();
writeFileSync(
  `${OUT}/medicoes.json`,
  JSON.stringify({ at: new Date().toISOString(), note: "Medições em Chromium headless com SwiftShader (CPU). Não são metas nem números de GPU real.", ...measures }, null, 2),
);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações de interface passaram. Capturas em ${OUT}/`);
process.exit(failed.length ? 1 : 0);

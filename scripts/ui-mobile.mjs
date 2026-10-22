// SPDX-License-Identifier: AGPL-3.0-only
// Celular 390×844 (UI_WIDTH=360|430 para as outras larguras). Requer npm run dev em http://localhost:8787.
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://localhost:8787";
const launch = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const browser = await chromium.launch({ ...launch, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.UI_WIDTH ?? 390), height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

const paths = [
  ["/?demo=1", "Meu dia"],
  ["/rotinas?demo=1", "Rotinas"],
  ["/conexoes?demo=1", "Conexões"],
  ["/agente/dot?demo=1", "Dot"],
  ["/agente/correio?demo=1", "Correio"],
  ["/agente/codigo?demo=1", "Código"],
  ["/agente/sentinela?demo=1", "Sentinela"],
  ["/agente/foco?demo=1", "Foco"],
  ["/agente/noticias?demo=1", "Notícias"],
  ["/agente/mercado?demo=1", "Mercado"],
  ["/agente/marketing?demo=1", "Marketing"],
  ["/agente/entregas?demo=1", "Entregas"],
];

let failed = 0;
function fail(msg) {
  failed++;
  console.log("FALHA " + msg);
}

for (const [path, name] of paths) {
  errors.length = 0;
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /modo desenvolvimento|demonstração/i })
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  await page
    .locator(".splash")
    .waitFor({ state: "detached", timeout: 8_000 })
    .catch(() => {});
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) fail(`${name}: rolagem horizontal`);
  // A caixa é fixa e o conteúdo rola por baixo dela. Falha se um botão estiver inteiro
  // escondido na primeira vista, ou se ainda houver sobreposição depois de rolar até o fim
  // (aí ele seria inalcançável).
  const coveredNow = (whole) =>
    page.evaluate((whole) => {
      const box = document.querySelector(".composer");
      if (!box) return null;
      const br = box.getBoundingClientRect();
      const hit = [...document.querySelectorAll("button, a.btn")].find((el) => {
        if (el.closest(".composer")) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight) return false;
        if (r.right <= br.left || r.left >= br.right) return false;
        return whole ? r.top >= br.top - 1 && r.bottom <= br.bottom + 1 : !(r.bottom <= br.top + 1 || r.top >= br.bottom - 1);
      });
      return hit ? hit.textContent.trim().slice(0, 40) : null;
    }, whole);
  let covered = await coveredNow(true);
  if (!covered) {
    await page.evaluate(() => {
      const c = document.getElementById("conteudo");
      if (c) c.scrollTop = c.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(150);
    covered = await coveredNow(false);
  }
  if (covered) fail(`${name}: botão "${covered}" coberto pela caixa de perguntas`);
  if (errors.length) fail(`${name}: console ${errors[0]}`);
  else console.log("ok   " + name);
}

errors.length = 0;
await page.goto(BASE + "/?demo=1", { waitUntil: "domcontentloaded" });
await page
  .locator(".splash")
  .waitFor({ state: "detached", timeout: 8_000 })
  .catch(() => {});
await page.getByRole("button", { name: "Perguntar ao Dot" }).click();
const dialog = page.getByRole("dialog", { name: "Buscar ou perguntar" });
await dialog.waitFor({ timeout: 5_000 });
const box = await dialog.boundingBox();
if (!box || box.width < 40 || box.height < 40) fail("busca: diálogo invisível");
else console.log("ok   Busca");
const vp = page.viewportSize();
if (box && (box.width < vp.width - 10 || box.height < vp.height - 44)) fail("busca: no celular deveria ocupar a tela");
await dialog.getByRole("button", { name: "Fechar" }).click();
await dialog.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => fail("busca: não fechou no Fechar"));

async function openDemo(path) {
  errors.length = 0;
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page
    .locator(".splash")
    .waitFor({ state: "detached", timeout: 8_000 })
    .catch(() => {});
}

// O gancho ?forcar=render só existe no build de desenvolvimento (B4). Contra o build
// de produção (o que o deploy publica) este passo é pulado e dito, não fingido.
const servedJs = await (await fetch(BASE + "/assets/app.js")).text();
if (!servedJs.includes("forcar")) {
  console.log("pulado erro de render (build de produção não tem o gancho de teste; coberto por npm run test:ui)");
} else {
  await openDemo("/?demo=1&forcar=render");
  const boom = page.getByRole("alert");
  await boom.waitFor({ timeout: 8_000 });
  const boomText = await boom.innerText();
  if (!boomText.includes("A tela quebrou ao desenhar") || !boomText.includes("render_error")) fail("erro de render: explicação do dicionário ausente");
  if (/segredo-teste|pessoa@example\.com|senha=abc/.test(boomText)) fail("erro de render: segredo na tela");
  else console.log("ok   erro de render");
}

await openDemo("/?demo=1");
await page.evaluate(() => window.dispatchEvent(new CustomEvent("od-trouble", { detail: { code: "subrequest_limit" } })));
const apiAlert = page.getByRole("alert");
await apiAlert.waitFor({ timeout: 5_000 });
const apiText = await apiAlert.innerText();
if (!apiText.includes("subrequest_limit") || !apiText.includes("Cloudflare Free")) fail("reason de API: explicação do dicionário ausente");
else console.log("ok   reason de API");

await page.evaluate(() => sessionStorage.setItem("od-chunk-reload", "1"));
page
  .evaluate(() => {
    setTimeout(() => {
      void import("/assets/chunks/nao-existe.js");
    }, 0);
  })
  .catch(() => {});
await page.getByRole("alert").getByText("chunk_missing", { exact: true }).waitFor({ timeout: 8_000 });
const chunkText = await page.getByRole("alert").innerText();
if (!chunkText.includes("versão velha") || !chunkText.includes("chunk_missing")) fail("chunk 404: explicação do dicionário ausente");
else console.log("ok   chunk ausente");

await page.unroute("**/api/version").catch(() => {});
await page.route("**/api/version", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ app: "000000000000", worker: "local" }) }));
await openDemo("/?demo=1");
const notice = page.getByText("Nova versão disponível");
await notice.waitFor({ timeout: 8_000 });
if (!(await notice.isVisible())) fail("aviso de nova versão invisível");
else console.log("ok   nova versão");

await browser.close();
if (failed) {
  console.log(`${failed} falha(s) no celular`);
  process.exit(1);
}
console.log("ui:mobile ok");

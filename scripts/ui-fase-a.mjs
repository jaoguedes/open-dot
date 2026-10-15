// Testes de navegador da Fase A (rodada 3) contra um build qualquer, com API simulada.
// Celular 390×844. Não precisa de `npm run dev` nem de banco: serve o dist e responde /api/* aqui.
// Uso: node scripts/ui-fase-a.mjs [--dist apps/web/dist] [--only A1,A3]
// Para provar "falhava antes": gere o dist de um commit antigo (worktree) e passe --dist.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const dist = resolve(opt("--dist", "apps/web/dist"));
const only = opt("--only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!existsSync(join(dist, "index.html"))) {
  console.error(`Sem build em ${dist}. Rode npm run build.`);
  process.exit(2);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg" };
const server = createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    path = "/";
  }
  let file = join(dist, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  const missing = !file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory();
  if (missing && /^\/(assets|chunks|fonts|sounds|dot)\//.test(path)) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("não encontrado");
  }
  if (missing) file = join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const appVersion = (() => {
  try {
    return JSON.parse(readFileSync(join(dist, "version.json"), "utf8")).app;
  } catch {
    return "local";
  }
})();

// ------------------------------------------------------------ API simulada
const NOW = "2026-10-15T12:00:00.000Z";
function freshState() {
  return {
    authed: true,
    failAll: false,
    feed: [
      {
        id: "fd_mail",
        agentId: "correio",
        runId: "r1",
        kind: "email_digest",
        title: "Resumo do Correio",
        state: "open",
        createdAt: NOW,
        freshness: "fresh",
        coverage: null,
        body: {
          abertura: "Dois e-mails pedem você.",
          total: 12,
          counts: { important: 2, review: 0, low: 10 },
          itens: [
            { categoria: "pagamento", titulo: "Fatura vence amanhã", quando: NOW, o_que_aconteceu: "A fatura vence amanhã.", o_que_fazer: "Pague.", origem: "Banco", sensivel: false },
            { categoria: "pessoa", titulo: "Pergunta da Ana", quando: NOW, o_que_aconteceu: "A Ana perguntou do almoço.", o_que_fazer: "Responda.", origem: "Ana", sensivel: false },
          ],
        },
      },
      { id: "fd_ci", agentId: "codigo", runId: "gh:1", kind: "ci_failure", title: "Workflow falhou em exemplo/repo", state: "open", createdAt: NOW, freshness: "fresh", coverage: null, body: { summary: "CI terminou com falha.", href: "https://github.com/exemplo/repo/actions" } },
    ],
  };
}
let state = freshState();

const configured = { database: true, google: true, owner: true, github: true, githubApp: false, vercel: false, ai: false, aiPrivate: false, finnhub: false, tracking: false, trackingState: "desligado" };
const shipments = {
  shipments: [
    { id: "sh1", code: "NL123456789BR", carrier: "correios", carrierLabel: "Correios", storeLabel: null, status: null, statusLabel: null, lastEventAt: null, lastEvent: null, events: [], page: "https://rastreamento.correios.com.br/app/index.php", active: true, needsCarrier: false, lastError: null, provider: null, attribution: null },
  ],
  tracking: { enabled: false, providerId: null, reason: "Rastreio automático desligado.", calls: 0, stop: 900, limit: 1000, paused: false },
  // Igual ao que o servidor manda (DISABLED_TRACKING_PROVIDERS): a tela não pode mostrar.
  disabledProviders: [
    { id: "ship24", name: "Ship24", reason: "API paga. Fica desligada." },
    { id: "seurastreio", name: "Seu Rastreio", reason: "API paga. Fica desligada." },
  ],
  carriers: [{ id: "correios", label: "Correios" }],
};
const parts = () => ({
  feed: { items: state.feed, next: null },
  connections: {
    configured,
    connections: [],
    agents: [
      { id: "noticias", name: "Notícias", description: "Feeds", enabled: true, lastTestAt: null, lastError: null, sources: [], missing: [], note: "" },
      { id: "mercado", name: "Mercado", description: "Cotações", enabled: true, lastTestAt: null, lastError: null, sources: [], missing: [], quotes: [], note: "Só informativo." },
      { id: "marketing", name: "Marketing", description: "Leitura", enabled: true, lastTestAt: null, lastError: null, sources: [], missing: [], note: "" },
    ],
    providers: [],
  },
  routines: { routines: [] },
  runs: { runs: [] },
  usage: null,
  monitors: { monitors: [] },
  status: { agents: [] },
  approvals: { approvals: [], canSend: false },
  shipments,
});
const owner = { email: "dono@example.com", name: "Bia", timeZone: "America/Sao_Paulo" };

async function handleApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (p === "/api/version") return json(200, { app: appVersion, worker: "local" });
  if (state.failAll) return json(500, { error: { code: "internal", message: "Algo deu errado. Nada foi enviado ou alterado fora do Open Dot.", reason: "db_error" } });
  if (p === "/api/session") return json(200, state.authed ? { authenticated: true, owner } : { authenticated: false, devLoginAvailable: false, googleLoginAvailable: true });
  if (!state.authed) return json(401, { error: { code: "unauthenticated", message: "Entre para continuar." } });
  if (p === "/api/snapshot") return json(200, { owner, ...parts(), failures: [] });
  const legacy = { "/api/feed": "feed", "/api/connections": "connections", "/api/routines": "routines", "/api/runs": "runs", "/api/usage": "usage", "/api/monitors": "monitors", "/api/status": "status", "/api/approvals": "approvals", "/api/shipments": "shipments" }[p];
  if (legacy && req.method() === "GET") return json(200, parts()[legacy]);
  const done = /^\/api\/feed\/([^/]+)\/(done|snooze)$/.exec(p);
  if (done && req.method() === "POST") {
    const it = state.feed.find((f) => f.id === done[1]);
    if (!it) return json(404, { error: { code: "not_found", message: "Item não encontrado." } });
    it.state = done[2] === "done" ? "done" : "snoozed";
    return json(200, { ok: true });
  }
  if (/^\/api\/agents\/[^/]+\/test$/.test(p)) return json(200, { ok: true, failures: [{ source: "CoinGecko", reason: "upstream_http_403" }], traded: false });
  if (p === "/api/legal") return json(200, { contact: null });
  if (p === "/api/sessions") return json(200, { sessions: [] });
  return json(404, { error: { code: "not_found", message: "Rota inexistente." } });
}

// ------------------------------------------------------------ Execução
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP opendot.test 127.0.0.1"] });
const results = [];
async function scenario(id, name, fn, { host = "127.0.0.1" } = {}) {
  if (only.length && !only.includes(id)) return;
  state = freshState();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/**", handleApi);
  const base = `http://${host}:${port}`;
  const open = async (path) => {
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.locator(".splash").waitFor({ state: "detached", timeout: 8_000 }).catch(() => {});
  };
  try {
    await fn({ page, open, base });
    if (errors.length) throw new Error(`erro de página: ${errors[0]}`);
    results.push({ id, name, ok: true });
    console.log(`ok     ${id} ${name}`);
  } catch (e) {
    const shots = process.env.UI_SHOTS;
    if (shots) await page.screenshot({ path: join(shots, `${id}-${results.length}.png`) }).catch(() => {});
    results.push({ id, name, ok: false, why: String(e.message ?? e).split("\n")[0] });
    console.log(`FALHOU ${id} ${name} — ${String(e.message ?? e).split("\n")[0]}`);
  } finally {
    await context.close();
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const T = { timeout: 5_000 };

await scenario("A1", "Voltar no agente tem 44 px e volta para Meu dia", async ({ page, open }) => {
  await open("/meu-dia");
  await page.getByRole("button", { name: /^Correio/ }).first().click(T);
  await page.waitForURL(/\/agente\/correio/, T);
  const back = page.getByRole("button", { name: "Voltar" });
  await back.waitFor(T);
  const box = await back.boundingBox();
  expect(box && box.height >= 44 && box.width >= 44, `alvo do Voltar pequeno: ${JSON.stringify(box)}`);
  await back.click();
  await page.waitForURL(/\/meu-dia$/, T);
});

await scenario("A1", "Faixa de agentes marca o atual e troca sem passar por Meu dia; voltar do navegador funciona", async ({ page, open }) => {
  await open("/meu-dia");
  await page.getByRole("button", { name: /^Correio/ }).first().click(T);
  await page.waitForURL(/\/agente\/correio/, T);
  const current = page.locator('.agent-tools [aria-current="true"], .agent-tools [aria-current="page"]');
  await current.first().waitFor(T);
  expect((await current.first().innerText()).includes("Correio"), "chip atual não é o Correio");
  await page.locator(".agent-tools").getByRole("button", { name: /Código/ }).click(T);
  await page.waitForURL(/\/agente\/codigo/, T);
  await page.goBack();
  await page.waitForURL(/\/agente\/correio/, T);
});

await scenario("A1", "Endereço malformado mostra aviso, nunca tela preta", async ({ page, open }) => {
  await open("/aprovacao/%E0%A4%A");
  await page.getByText("Endereço inválido").waitFor(T);
  await page.getByRole("button", { name: /Meu dia/ }).first().waitFor(T);
  await open("/agente/%E0%A4%A");
  await page.getByText(/Não achei essa página|Endereço inválido/).first().waitFor(T);
});

await scenario("A1", "Rota desconhecida mostra Não achei essa página", async ({ page, open }) => {
  await open("/isso-nao-existe");
  await page.getByText("Não achei essa página").waitFor(T);
});

await scenario("A2", "Contagem soma e-mails e incidentes e cai ao marcar Feito", async ({ page, open }) => {
  await open("/meu-dia");
  const line = page.locator("p.serif").first();
  await line.waitFor(T);
  const first = await line.innerText();
  expect(/^Três coisas/.test(first), `esperava "Três coisas" (2 e-mails + 1 CI), veio "${first}"`);
  const card = page.locator(".feed-card", { hasText: "Workflow falhou" });
  await card.getByRole("button", { name: "Feito" }).click(T);
  await page.waitForFunction(() => /^Duas coisas/.test(document.querySelector("p.serif")?.textContent ?? ""), null, T);
});

await scenario(
  "A3",
  "API 500 na primeira carga em host público: erro do servidor, sem demonstração",
  async ({ page, open }) => {
    state.failAll = true;
    await open("/meu-dia");
    await page.getByText("Não consegui falar com o servidor").first().waitFor(T);
    await page.getByRole("button", { name: /Tentar de novo/ }).first().waitFor(T);
    const demoBanner = await page.getByText(/dados fictícios/).count();
    expect(demoBanner === 0, "entrou na demonstração sozinho");
  },
  { host: "opendot.test" },
);

await scenario("A8", "Login explica callback_invalido sem mostrar o código", async ({ page, open }) => {
  state.authed = false;
  await open("/?erro=callback_invalido");
  const alert = page.getByRole("alert");
  await alert.waitFor(T);
  const text = await alert.innerText();
  expect(!text.includes("callback_invalido"), "código cru na tela");
});

await scenario("A8", "Login conhece os seis códigos novos", async ({ page, open }) => {
  state.authed = false;
  for (const code of ["callback_invalido", "sem_id_token", "sessao_trocada", "sem_refresh_token", "permissao_gmail_negada", "permissao_gsc_negada"]) {
    await open(`/?erro=${code}`);
    const alert = page.getByRole("alert");
    await alert.waitFor({ timeout: 3_000 }).catch(() => {
      throw new Error(`sem aviso para ${code}`);
    });
  }
});

await scenario("A8", "Conexões mostra o banner de ?erro= e limpa a URL", async ({ page, open }) => {
  await open("/conexoes?erro=sem_refresh_token");
  await page.getByText(/token de renovação/).waitFor(T);
  await page.waitForFunction(() => !location.search.includes("erro="), null, T);
});

await scenario("A9", "Teste de agente mostra Fonte: motivo, sem [object Object]", async ({ page, open }) => {
  await open("/conexoes");
  const card = page.locator('section[aria-labelledby="c-mercado"]');
  await card.getByRole("button", { name: /^Testar/ }).click(T);
  const out = card.getByRole("status");
  await out.waitFor(T);
  const text = await out.innerText();
  expect(!text.includes("[object Object]"), `apareceu [object Object]: ${text}`);
  expect(!/CoinGeckoupstream/.test(text) && text.includes("CoinGecko: "), `separador ausente: ${text}`);
});

await scenario("A9", "Entregas sem Ship24 e com Copiar código", async ({ page, open }) => {
  await open("/agente/entregas");
  await page.getByText("Abrir no site da transportadora").first().waitFor(T);
  await page.getByRole("button", { name: /Copiar código/ }).first().waitFor(T);
  const body = await page.locator("body").innerText();
  expect(!/Ship24|Seu Rastreio/.test(body), "provedor pago aparece na tela");
  expect(!/\[object Object\]|stale_run|upstream_http_\d+(?!\))/.test(body), "texto técnico cru na tela");
});

await scenario("A10", "Falha no polling vira faixa de desatualizado, não o Dot grande; clique com falha mostra o Dot", async ({ page, base }) => {
  await page.clock.install();
  await page.goto(base + "/meu-dia", { waitUntil: "domcontentloaded" });
  await page.clock.runFor(2_000);
  await page.locator("p.serif").first().waitFor(T);
  state.failAll = true;
  for (let i = 0; i < 3; i++) await page.clock.runFor(61_000);
  await page.getByText(/desatualizad/).first().waitFor(T);
  const troubles = await page.locator(".dot-trouble").count();
  expect(troubles === 0, "o Dot de erro apareceu por causa do polling");
  await page.locator(".feed-card", { hasText: "Workflow falhou" }).getByRole("button", { name: "Feito" }).click(T);
  await page.clock.runFor(500);
  await page.locator(".dot-trouble").first().waitFor(T);
});

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passaram (${dist})`);
process.exit(failed.length ? 1 : 0);

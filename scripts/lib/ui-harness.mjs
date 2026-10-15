// Harness dos testes de navegador da rodada 3: serve um dist, simula a API e roda cenários
// em 390×844 com toque. Usado por scripts/ui-fase-a.mjs e scripts/ui-fase-d.mjs.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

export async function startHarness() {
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

  const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".json": "application/json",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
    ".mp3": "audio/mpeg",
  };
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
        {
          id: "fd_ci",
          agentId: "codigo",
          runId: "gh:1",
          kind: "ci_failure",
          title: "Workflow falhou em exemplo/repo",
          state: "open",
          createdAt: NOW,
          freshness: "fresh",
          coverage: null,
          body: { summary: "CI terminou com falha.", href: "https://github.com/exemplo/repo/actions" },
        },
      ],
    };
  }
  let state = freshState();

  const configured = {
    database: true,
    google: true,
    owner: true,
    github: true,
    githubApp: false,
    vercel: false,
    ai: false,
    aiPrivate: false,
    finnhub: false,
    tracking: false,
    trackingState: "desligado",
  };
  const shipments = {
    shipments: [
      {
        id: "sh1",
        code: "NL123456789BR",
        carrier: "correios",
        carrierLabel: "Correios",
        storeLabel: null,
        status: null,
        statusLabel: null,
        lastEventAt: null,
        lastEvent: null,
        events: [],
        page: "https://rastreamento.correios.com.br/app/index.php",
        active: true,
        needsCarrier: false,
        lastError: null,
        provider: null,
        attribution: null,
      },
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
    feed: { items: state.feed, next: state.feedNext ?? null },
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
    runs: { runs: state.runs ?? [] },
    usage: null,
    monitors: { monitors: [] },
    status: { agents: [] },
    approvals: { approvals: state.approvals ?? [], canSend: false },
    shipments,
  });
  const defaultOwner = { email: "dono@example.com", name: "Bia", timeZone: "America/Sao_Paulo" };

  async function handleApi(route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/version") return json(200, { app: appVersion, worker: "local" });
    if (state.extra) {
      const handled = state.extra({ route, req, url, path: p, json });
      if (handled !== undefined) return await handled;
    }
    if (state.failAll) return json(500, { error: { code: "internal", message: "Algo deu errado. Nada foi enviado ou alterado fora do Open Dot.", reason: "db_error" } });
    if (p === "/api/session")
      return json(200, state.authed ? { authenticated: true, owner: state.owner ?? defaultOwner } : { authenticated: false, devLoginAvailable: false, googleLoginAvailable: true });
    if (!state.authed) return json(401, { error: { code: "unauthenticated", message: "Entre para continuar." } });
    if (p === "/api/snapshot") return json(200, { owner: state.owner ?? defaultOwner, ...parts(), failures: [] });
    const legacy = {
      "/api/feed": "feed",
      "/api/connections": "connections",
      "/api/routines": "routines",
      "/api/runs": "runs",
      "/api/usage": "usage",
      "/api/monitors": "monitors",
      "/api/status": "status",
      "/api/approvals": "approvals",
      "/api/shipments": "shipments",
    }[p];
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
  async function scenario(id, name, fn, { host = "127.0.0.1", desktop = false, colorScheme = "dark", setup } = {}) {
    if (only.length && !only.includes(id)) return;
    state = freshState();
    if (setup) setup(state);
    const context = await browser.newContext(
      desktop
        ? { viewport: { width: 1280, height: 860 }, colorScheme, serviceWorkers: "block" }
        : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme, serviceWorkers: "block" },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("**/api/**", handleApi);
    const base = `http://${host}:${port}`;
    const open = async (path) => {
      await page.goto(base + path, { waitUntil: "domcontentloaded" });
      await page
        .locator(".splash")
        .waitFor({ state: "detached", timeout: 8_000 })
        .catch(() => {});
    };
    try {
      await fn({ page, open, base, state, setRoute: (fn2) => (state.extra = fn2) });
      if (errors.length) throw new Error(`erro de página: ${errors[0]}`);
      results.push({ id, name, ok: true });
      console.log(`ok     ${id} ${name}`);
    } catch (e) {
      const shots = process.env.UI_SHOTS;
      if (shots) await page.screenshot({ path: join(shots, `${id}-${results.length}.png`) }).catch(() => {});
      if (process.env.UI_VERBOSE) console.log(String(e.message ?? e));
    results.push({ id, name, ok: false, why: String(e.message ?? e).split("\n")[0] });
      console.log(`FALHOU ${id} ${name} — ${String(e.message ?? e).split("\n")[0]}`);
    } finally {
      await context.close();
    }
  }
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const T = { timeout: 10_000 };

  const finish = async () => {
    await browser.close();
    server.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passaram (${dist})`);
    return failed.length ? 1 : 0;
  };
  return { scenario, expect, T, finish, getState: () => state };
}

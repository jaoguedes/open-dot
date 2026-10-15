// Testes de navegador da Fase D (interface e acessibilidade), com API simulada.
// Uso: node scripts/ui-fase-d.mjs [--dist apps/web/dist] [--only D1,D4]
import AxeBuilder from "@axe-core/playwright";
import { startHarness } from "./lib/ui-harness.mjs";

const { scenario, expect, T, finish } = await startHarness();

const askRoute = ({ path, json }) => {
  if (path === "/api/ask")
    return json(200, {
      answer: "A fatura do banco vence amanhã.",
      sources: [{ id: "fd_mail#0", title: "Fatura vence amanhã — Banco", detail: "A fatura vence amanhã.", href: null, at: "2026-10-15T12:00:00.000Z" }],
      aiUsed: false,
      note: null,
    });
  return undefined;
};
const insideDialog = (page) => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));

await scenario(
  "D1",
  "Paleta: destinos, agentes e Perguntar ao Dot no mesmo diálogo, com setas, Enter, Esc e foco preso",
  async ({ page, open }) => {
    await open("/meu-dia");
    const opener = page.getByRole("button", { name: "Perguntar ao Dot" }).last();
    await opener.click(T);
    const dialog = page.getByRole("dialog", { name: "Buscar ou perguntar" });
    await dialog.waitFor(T);
    const box = await dialog.boundingBox();
    expect(box && box.width >= 380 && box.height >= 800, `no celular a paleta deveria ocupar a tela: ${JSON.stringify(box)}`);
    const input = dialog.getByRole("combobox");
    await input.fill("fatura");
    const ask = dialog.getByRole("option", { name: /Perguntar ao Dot: fatura/ });
    await ask.waitFor(T);
    await input.press("Enter");
    await dialog.getByText("A fatura do banco vence amanhã.").waitFor(T);
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    expect(await insideDialog(page), "o foco saiu do diálogo com Tab");
    await input.fill("cone");
    await dialog.getByRole("option", { name: "Conexões" }).waitFor(T);
    await input.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 3_000 });
    expect(await opener.evaluate((el) => el === document.activeElement), "o foco não voltou para o botão que abriu");
    await opener.click();
    await page.getByRole("combobox").fill("corr");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/agente\/correio/, T);
  },
  { setup: (s) => (s.extra = askRoute) },
);

await scenario(
  "D2",
  "Sino abre a Central do Dot com eventos e Marcar tudo como visto apaga o ponto",
  async ({ page, open }) => {
    await open("/meu-dia");
    const bell = page.getByRole("button", { name: /^Notificações/ });
    await bell.waitFor(T);
    expect(/novas?/.test((await bell.getAttribute("aria-label")) ?? ""), "sino sem indicação de novidade");
    await bell.click();
    const center = page.getByRole("dialog", { name: "Central do Dot" });
    await center.waitFor(T);
    await center.getByText(/Correio falhou\./).waitFor(T);
    const body = await center.innerText();
    expect(!/subrequest_limit/.test(body), "código cru na central");
    await center.getByRole("button", { name: "Marcar tudo como visto" }).click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('button[aria-label^="Notificações"]')?.getAttribute("aria-label") === "Notificações", null, T);
  },
  {
    setup: (s) =>
      (s.runs = [
        {
          id: "r1",
          agentId: "correio",
          kind: "email_review",
          state: "failed",
          scheduledAt: null,
          late: false,
          attempt: 1,
          errorCode: "subrequest_limit",
          errorMessage: null,
          updatedAt: "2026-10-15T13:00:00.000Z",
        },
        {
          id: "r2",
          agentId: "noticias",
          kind: "news_review",
          state: "succeeded",
          scheduledAt: null,
          late: false,
          attempt: 1,
          errorCode: null,
          errorMessage: null,
          updatedAt: "2026-10-15T12:30:00.000Z",
        },
      ]),
  },
);

await scenario(
  "D3",
  "Feed: Mostrar mais traz itens antigos com dia da semana; filtro Com link; setas nas abas",
  async ({ page, open }) => {
    await open("/meu-dia");
    const tabs = page.getByRole("tablist", { name: "Filtrar o feed" });
    await tabs.getByRole("tab", { name: "Com link" }).waitFor(T);
    await tabs.getByRole("tab", { name: "Tudo" }).focus();
    await page.keyboard.press("ArrowRight");
    const sel = await tabs.locator('[aria-selected="true"]').innerText();
    expect(sel === "Precisa de você", `seta não moveu a aba: ${sel}`);
    expect((await page.getByRole("tabpanel").count()) === 1, "sem tabpanel");
    await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Mostrar mais" }).click(T);
    await page.getByText("Deploy antigo").waitFor(T);
    const kicker = await page.locator(".feed-card", { hasText: "Deploy antigo" }).locator(".feed-kicker").innerText();
    expect(/seg|ter|qua|qui|sex|sáb|dom|ontem|\d+ \w{3}/i.test(kicker), `data sem dia: ${kicker}`);
  },
  {
    setup: (s) => {
      s.feedNext = "cursor-1";
      s.extra = ({ path, url, json }) => {
        if (path === "/api/feed" && url.searchParams.get("before") === "cursor-1")
          return json(200, {
            items: [
              {
                id: "fd_old",
                agentId: "sentinela",
                runId: "x",
                kind: "deploy",
                title: "Deploy antigo",
                state: "open",
                createdAt: "2026-10-12T12:00:00.000Z",
                freshness: "stale",
                coverage: null,
                body: { summary: "Deploy de segunda." },
              },
            ],
            next: null,
          });
        return undefined;
      };
    },
    desktop: true,
  },
);

for (const colorScheme of ["dark", "light"]) {
  await scenario(
    "D4",
    `axe sem violação séria nem de contraste (${colorScheme}) em Meu dia, Conexões e agente`,
    async ({ page, open }) => {
      await page.addInitScript((theme) => localStorage.setItem("open-dot:prefs", JSON.stringify({ theme })), colorScheme);
      for (const path of ["/meu-dia", "/conexoes", "/agente/correio"]) {
        await open(path);
        await page.waitForTimeout(400);
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical" || v.id === "color-contrast");
        expect(!bad.length, `${path}: ${bad.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`).join("; ")}`);
      }
    },
    { colorScheme },
  );
}

await scenario("D4", "Texto visível com pelo menos 12 px e botões com alvo de 44 px", async ({ page, open }) => {
  for (const path of ["/meu-dia", "/agente/correio", "/conexoes"]) {
    await open(path);
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (!(el instanceof HTMLElement) || !el.offsetParent) continue;
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12) out.push(`${el.tagName}.${el.className} ${fs}px "${el.textContent.trim().slice(0, 20)}"`);
      }
      return out.slice(0, 5);
    });
    expect(!small.length, `${path}: fonte < 12 px: ${small.join(" | ")}`);
    const tiny = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("button, a.btn, [role=tab], .icon-btn, .dock a")) {
        if (!(el instanceof HTMLElement) || !el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.height < 44 || r.width < 44))
          out.push(`${el.tagName} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return out.slice(0, 6);
    });
    expect(!tiny.length, `${path}: alvo < 44 px: ${tiny.join(" | ")}`);
  }
});

await scenario("D4", "Painel de contexto no celular: foco preso, fundo inert, Esc fecha e devolve o foco", async ({ page, open }) => {
  await open("/agente/correio");
  const btn = page.getByRole("button", { name: "Mostrar contexto" });
  await btn.click(T);
  await page.waitForFunction(() => document.querySelector("#conteudo")?.closest("[inert]") !== null, null, T);
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".context"))), "o foco saiu do painel");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[inert]"), null, T);
  expect(await btn.evaluate((el) => el === document.activeElement), "o foco não voltou ao botão");
});

await scenario(
  "D4",
  "A ilha do Dot não é região viva",
  async ({ page, open }) => {
    await open("/meu-dia");
    const live = await page.locator('.island [role="status"], .island[role="status"], .island [aria-live="polite"]').count();
    expect(live === 0, "a ilha anuncia a cada mudança");
  },
  { desktop: true },
);

await scenario(
  "D7",
  "Caixa de perguntas no toque: Enter quebra linha, a seta envia, a resposta fica na sessão e Limpar apaga",
  async ({ page, open }) => {
    await open("/agente/dot");
    const box = page.getByRole("textbox", { name: "Pergunte ao Dot" });
    await box.fill("qual fatura");
    await box.press("Enter");
    expect((await box.inputValue()).includes("\n"), "Enter enviou no toque em vez de quebrar a linha");
    expect((await page.locator(".answer-text").count()) === 0, "enviou sem tocar na seta");
    await page.getByRole("button", { name: "Enviar pergunta" }).click();
    await page.locator(".answer-text", { hasText: "A fatura do banco vence amanhã." }).waitFor(T);
    await page.reload();
    await page.locator(".answer-text", { hasText: "A fatura do banco vence amanhã." }).waitFor(T);
    await page.getByRole("button", { name: "Limpar" }).click();
    await page.locator(".answer-text").waitFor({ state: "detached", timeout: 3_000 });
  },
  { setup: (s) => (s.extra = askRoute) },
);

await scenario(
  "D7",
  "Caixa de perguntas no teclado: Enter envia, Shift+Enter quebra",
  async ({ page, open }) => {
    await open("/agente/dot");
    const box = page.getByRole("textbox", { name: "Pergunte ao Dot" });
    await box.fill("qual");
    await box.press("Shift+Enter");
    expect((await box.inputValue()).includes("\n"), "Shift+Enter não quebrou a linha");
    await box.fill("qual fatura");
    await box.press("Enter");
    await page.locator(".answer-text", { hasText: "A fatura do banco vence amanhã." }).waitFor(T);
  },
  { desktop: true, setup: (s) => (s.extra = askRoute) },
);

await scenario(
  "D8",
  "Data da conversa usa o fuso do dono, não o de São Paulo",
  async ({ page, base }) => {
    await page.clock.setFixedTime(new Date("2026-10-15T20:00:00Z")); // 16/10 05:00 em Tóquio; 15/10 17:00 em São Paulo
    await page.goto(base + "/agente/dot", { waitUntil: "domcontentloaded" });
    await page
      .getByText(/16 de outubro/)
      .first()
      .waitFor(T);
  },
  { setup: (s) => (s.owner = { email: "dono@example.com", name: "Bia", timeZone: "Asia/Tokyo" }) },
);

process.exit(await finish());

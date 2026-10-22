// SPDX-License-Identifier: AGPL-3.0-only
// Testes de navegador da Fase G (retorno do dono sobre o resumo do Correio), com API simulada.
// Uso: node scripts/ui-fase-g.mjs [--dist apps/web/dist]
import { startHarness } from "./lib/ui-harness.mjs";

const { scenario, expect, T, finish } = await startHarness();

const H1 = "1".repeat(64);
const H2 = "2".repeat(64);
const item = (origem, remetente, de, titulo) => ({ categoria: "pagamento", titulo, quando: "2026-10-15T10:00:00.000Z", o_que_aconteceu: "Chegou uma cobrança.", o_que_fazer: "Veja o valor no original.", origem, sensivel: false, de, remetente, href: null });

function setup(s) {
  s.feed = [
    {
      id: "fd_mail",
      agentId: "correio",
      runId: "r1",
      kind: "email_digest",
      title: "Sua revisão das 08h",
      state: "open",
      createdAt: "2026-10-15T12:00:00.000Z",
      freshness: "fresh",
      coverage: null,
      body: { abertura: "3 coisas pedem você.", total: 5, counts: { important: 3, review: 0, low: 2 }, itens: [item("m1", H1, "Loja Chata", "Promo 1"), item("m2", H1, "Loja Chata", "Promo 2"), item("m3", H2, "Ana", "Conta da luz")] },
    },
  ];
  s.silenced = [];
  s.nao = {};
  const of = { m1: H1, m2: H1, m3: H2 };
  s.extra = ({ path, req, json }) => {
    if (path === "/api/correio/feedback" && req.method() === "POST") {
      const b = JSON.parse(req.postData() ?? "{}");
      const h = of[b.messageId];
      if (b.rotulo === "nao_importa") s.nao[h] = (s.nao[h] ?? 0) + 1;
      else s.nao[h] = 0;
      const silenced = s.nao[h] >= 2;
      if (silenced && !s.silenced.some((x) => x.domainHash === h)) s.silenced.push({ domainHash: h, label: "loja-chata.test" });
      return json(200, { ok: true, silenced, label: silenced ? "loja-chata.test" : null, ...(silenced ? { hash: h } : {}) });
    }
    if (path === "/api/correio/silenced") return json(200, { senders: s.silenced });
    const undo = /^\/api\/correio\/silenced\/([a-f0-9]{64})\/undo$/.exec(path);
    if (undo) {
      s.silenced = s.silenced.filter((x) => x.domainHash !== undo[1]);
      s.nao[undo[1]] = 0;
      return json(200, { ok: true });
    }
    return undefined;
  };
}

const line = (page) => page.locator("p.serif").first();
// v0.3 (5.6): a lista de e-mails do 1º cartão começa recolhida; abre antes de interagir.
const expand = async (page) => {
  for (const b of await page.getByRole("button", { name: /^Ver mais \d+ e-mails?$/ }).all()) await b.click();
};

await scenario(
  "G",
  "Era importante sobe o item; Não importa tira da contagem; dois do mesmo remetente silenciam; desfazer volta",
  async ({ page, open }) => {
    await open("/meu-dia");
    await page.waitForFunction(() => /^Três coisas/.test(document.querySelector("p.serif")?.textContent ?? ""), null, T);
    const titles = () => page.locator(".feed-card .feed-title").allInnerTexts();
    await expand(page);
    await page.locator("article.stack-4", { hasText: "Conta da luz" }).getByRole("button", { name: "Era importante" }).click(T);
    await page.waitForFunction(() => /Conta da luz/.test(document.querySelector(".feed-card .stack-4 .feed-title")?.textContent ?? ""), null, T);
    await page.locator("article.stack-4", { hasText: "Promo 1" }).getByRole("button", { name: "Não importa" }).click(T);
    await page.waitForFunction(() => /^Duas coisas/.test(document.querySelector("p.serif")?.textContent ?? ""), null, T);
    expect(!(await titles()).some((t) => t.includes("Promo 1")), "o item marcado Não importa continuou na lista");
    await page.locator("article.stack-4", { hasText: "Promo 2" }).getByRole("button", { name: "Não importa" }).click(T);
    await page.getByText(/Silenciei loja-chata\.test/).waitFor(T);
    await page.waitForFunction(() => /^Uma coisa/.test(document.querySelector("p.serif")?.textContent ?? ""), null, T);
    await page.getByRole("button", { name: "Desfazer" }).click(T);
    await page.waitForFunction(() => /^Três coisas/.test(document.querySelector("p.serif")?.textContent ?? ""), null, T);
    expect((await line(page).innerText()).startsWith("Três"), "desfazer não devolveu os itens");
  },
  { setup },
);

await scenario(
  "G",
  "A contagem cai a zero ao marcar o resumo como Feito",
  async ({ page, open }) => {
    await open("/meu-dia");
    await page.waitForFunction(() => /^Três coisas/.test(document.querySelector("p.serif")?.textContent ?? ""), null, T);
    await expand(page);
    await page.locator(".feed-card", { hasText: "Conta da luz" }).getByRole("button", { name: "Feito", exact: true }).click(T);
    await page.waitForFunction(() => /Tudo calmo/.test(document.querySelector("p.serif")?.textContent ?? ""), null, T);
  },
  { setup },
);

await scenario(
  "G",
  "Remetentes silenciados em Conexões: lista, Voltar a avisar e estado vazio",
  async ({ page, open }) => {
    await open("/conexoes");
    const card = page.locator('section[aria-labelledby="c-silenciados"]');
    await card.getByText("loja-chata.test").waitFor(T);
    await card.getByRole("button", { name: "Voltar a avisar" }).click(T);
    await card.getByText(/Nenhum remetente silenciado/).waitFor(T);
  },
  { setup: (s) => (setup(s), (s.silenced = [{ domainHash: H1, label: "loja-chata.test" }])) },
);

await scenario(
  "G",
  "Erro ao listar silenciados aparece em português",
  async ({ page, open }) => {
    await open("/conexoes");
    await page.locator('section[aria-labelledby="c-silenciados"]').getByText("Banco indisponível no momento.").waitFor(T);
  },
  { setup: (s) => (s.extra = ({ path, json }) => (path === "/api/correio/silenced" ? json(503, { error: { code: "db_unavailable", message: "Banco indisponível no momento." } }) : undefined)) },
);

process.exit(await finish());

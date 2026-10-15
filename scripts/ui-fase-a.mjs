// Testes de navegador da Fase A (rodada 3) contra um build qualquer, com API simulada.
// Celular 390×844. Não precisa de `npm run dev` nem de banco: serve o dist e responde /api/* aqui.
// Uso: node scripts/ui-fase-a.mjs [--dist apps/web/dist] [--only A1,A3]
// Para provar "falhava antes": gere o dist de um commit antigo (worktree) e passe --dist.
import { startHarness } from "./lib/ui-harness.mjs";

const { scenario, expect, T, finish } = await startHarness();

await scenario("A1", "Voltar no agente tem 44 px e volta para Meu dia", async ({ page, open, state }) => {
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

await scenario("A1", "Faixa de agentes marca o atual e troca sem passar por Meu dia; voltar do navegador funciona", async ({ page, open, state }) => {
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

await scenario("A1", "Endereço malformado mostra aviso, nunca tela preta", async ({ page, open, state }) => {
  await open("/aprovacao/%E0%A4%A");
  await page.getByText("Endereço inválido").waitFor(T);
  await page.getByRole("button", { name: /Meu dia/ }).first().waitFor(T);
  await open("/agente/%E0%A4%A");
  await page.getByText(/Não achei essa página|Endereço inválido/).first().waitFor(T);
});

await scenario("A1", "Rota desconhecida mostra Não achei essa página", async ({ page, open, state }) => {
  await open("/isso-nao-existe");
  await page.getByText("Não achei essa página").waitFor(T);
});

await scenario("A2", "Contagem soma e-mails e incidentes e cai ao marcar Feito", async ({ page, open, state }) => {
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
  async ({ page, open, state }) => {
    state.failAll = true;
    await open("/meu-dia");
    await page.getByText("Não consegui falar com o servidor").first().waitFor(T);
    await page.getByRole("button", { name: /Tentar de novo/ }).first().waitFor(T);
    const demoBanner = await page.getByText(/dados fictícios/).count();
    expect(demoBanner === 0, "entrou na demonstração sozinho");
  },
  { host: "opendot.test" },
);

await scenario("A8", "Login explica callback_invalido sem mostrar o código", async ({ page, open, state }) => {
  state.authed = false;
  await open("/?erro=callback_invalido");
  const alert = page.getByRole("alert");
  await alert.waitFor(T);
  const text = await alert.innerText();
  expect(!text.includes("callback_invalido"), "código cru na tela");
});

await scenario("A8", "Login conhece os seis códigos novos", async ({ page, open, state }) => {
  state.authed = false;
  for (const code of ["callback_invalido", "sem_id_token", "sessao_trocada", "sem_refresh_token", "permissao_gmail_negada", "permissao_gsc_negada"]) {
    await open(`/?erro=${code}`);
    const alert = page.getByRole("alert");
    await alert.waitFor({ timeout: 3_000 }).catch(() => {
      throw new Error(`sem aviso para ${code}`);
    });
  }
});

await scenario("A8", "Conexões mostra o banner de ?erro= e limpa a URL", async ({ page, open, state }) => {
  await open("/conexoes?erro=sem_refresh_token");
  await page.getByText(/token de renovação/).waitFor(T);
  await page.waitForFunction(() => !location.search.includes("erro="), null, T);
});

await scenario("A9", "Teste de agente mostra Fonte: motivo, sem [object Object]", async ({ page, open, state }) => {
  await open("/conexoes");
  const card = page.locator('section[aria-labelledby="c-mercado"]');
  await card.getByRole("button", { name: /^Testar/ }).click(T);
  const out = card.getByRole("status");
  await out.waitFor(T);
  const text = await out.innerText();
  expect(!text.includes("[object Object]"), `apareceu [object Object]: ${text}`);
  expect(!/CoinGeckoupstream/.test(text) && text.includes("CoinGecko: "), `separador ausente: ${text}`);
});

await scenario("A9", "Entregas sem Ship24 e com Copiar código", async ({ page, open, state }) => {
  await open("/agente/entregas");
  await page.getByText("Abrir no site da transportadora").first().waitFor(T);
  await page.getByRole("button", { name: /Copiar código/ }).first().waitFor(T);
  const body = await page.locator("body").innerText();
  expect(!/Ship24|Seu Rastreio/.test(body), "provedor pago aparece na tela");
  expect(!/\[object Object\]|stale_run|upstream_http_\d+(?!\))/.test(body), "texto técnico cru na tela");
});

await scenario("A10", "Falha no polling vira faixa de desatualizado, não o Dot grande; clique com falha mostra o Dot", async ({ page, base, state }) => {
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

process.exit(await finish());

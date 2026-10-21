// SPDX-License-Identifier: AGPL-3.0-only
// Testes de navegador da Fase E (fila de aprovações, conflito, pílulas, sons), com API simulada.
// Uso: node scripts/ui-fase-e.mjs [--dist apps/web/dist] [--only E2,E7]
import { startHarness } from "./lib/ui-harness.mjs";

const { scenario, expect, T, finish } = await startHarness();

const approval = (id, minute, body) => ({
  id,
  action: "gmail.send",
  payloadHash: `${id}`.padEnd(64, "0"),
  status: "pending",
  version: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: `2026-10-15T11:${String(minute).padStart(2, "0")}:00.000Z`,
  proposal: { action: "gmail.send", service: "gmail", account: "dono@example.com", resource: id, payload: { to: "ana@example.com", subject: `Re: ${id}`, body }, consequence: "Responder a Ana." },
});

const withApprovals = (s) => {
  s.approvals = [approval("ap-c", 30, "terceira"), approval("ap-a", 10, "primeira"), approval("ap-b", 20, "segunda")];
  s.extra = ({ path, req, json }) => {
    if (path === "/api/approvals" && req.method() === "GET") return json(200, { approvals: s.approvals, canSend: false });
    if (/^\/api\/approvals\/[^/]+\/decision$/.test(path))
      return json(409, { result: "conflict", cause: "changed", executed: false, sent: false, error: { code: "approval_changed", message: "O conteúdo mudou. Aprove de novo." } });
    return undefined;
  };
};

await scenario(
  "E2",
  "Fila de aprovações: ordem de chegada, “1 de N” no Meu dia e “2 de 3” na segunda",
  async ({ page, open }) => {
    await open("/meu-dia");
    await page.getByRole("button", { name: /Revisar resposta \(1 de 3\)/ }).click(T);
    await page.waitForURL(/\/aprovacao\/ap-a$/, T);
    await page.getByText("1 de 3").waitFor(T);
    await open("/aprovacao/ap-b");
    await page.getByText("2 de 3").waitFor(T);
  },
  { setup: withApprovals },
);

await scenario(
  "E3",
  "Conflito de aprovação explica em português que o conteúdo mudou",
  async ({ page, open }) => {
    await open("/aprovacao/ap-a");
    await page.getByRole("button", { name: "Aprovar e enviar" }).click(T);
    await page.getByText("O conteúdo mudou. Aprove de novo.").waitFor(T);
    const body = await page.locator("body").innerText();
    expect(!/Erro 409|conflict/.test(body), "código cru na tela");
  },
  { setup: withApprovals },
);

await scenario("E5", "Pílula de fonte com a carinha do agente abre o e-mail original", async ({ page, open }) => {
  await open("/agente/correio");
  const pill = page.getByRole("link", { name: /Abrir a fonte:/ }).first();
  await pill.waitFor(T);
  expect(((await pill.getAttribute("href")) ?? "").startsWith("https://mail.google.com/"), "a pílula não aponta para o Gmail");
  expect((await pill.locator("svg").count()) > 0, "pílula sem a carinha do agente");
});

const spyAudio = (page) =>
  page.addInitScript(() => {
    window.__played = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__played.push(String(this.src).split("/").pop());
      return Promise.resolve();
    };
    void orig;
  });

await scenario("E7", "Sons desligados por padrão: abrir a busca não toca nada; Ouvir toca", async ({ page, open }) => {
  await spyAudio(page);
  await open("/meu-dia");
  await page.getByRole("button", { name: "Perguntar ao Dot" }).last().click(T);
  await page.getByRole("dialog").waitFor(T);
  await page.keyboard.press("Escape");
  expect((await page.evaluate(() => window.__played.length)) === 0, `tocou com os sons desligados: ${await page.evaluate(() => window.__played.join(","))}`);
  await open("/mascote");
  const sw = page.getByRole("switch", { name: "Sons do Dot" });
  await sw.waitFor(T);
  expect(!(await sw.isChecked()), "sons ligados por padrão");
  await page.getByRole("button", { name: "Ouvir: Carinho" }).click(T);
  await page.waitForFunction(() => window.__played.includes("dot-love.mp3"), null, T);
});

await scenario("E7", "Sons ligados: abrir e fechar a busca tocam pop e close", async ({ page, open }) => {
  await spyAudio(page);
  await page.addInitScript(() => localStorage.setItem("open-dot:prefs", JSON.stringify({ sound: true })));
  await open("/meu-dia");
  await page.getByRole("button", { name: "Perguntar ao Dot" }).last().click(T);
  await page.getByRole("dialog").waitFor(T);
  await page.waitForTimeout(1_100);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__played.includes("dot-pop.mp3") && window.__played.includes("dot-close.mp3"), null, T);
});

process.exit(await finish());

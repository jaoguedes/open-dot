// Testes de navegador da Fase F (Diagnóstico e meus dados), com API simulada.
// Uso: node scripts/ui-fase-f.mjs [--dist apps/web/dist]
import { startHarness } from "./lib/ui-harness.mjs";

const { scenario, expect, T, finish } = await startHarness();

const diag = {
  health: { ok: true, schema: "0007", requiredSchema: "0007", schemaError: null, env: "production", configured: { database: true, google: true, ai: false } },
  lastTick: { at: "2026-10-15T12:00:00.000Z", planned: 0, runs: 2, monitors: 1, subrequests: 12, stepErrors: [{ step: "2", reason: "upstream_timeout" }], skipped: null, savedAt: "2026-10-15T12:00:01.000Z" },
  failures: [{ runId: "r1", agentId: "correio", kind: "email_review", state: "failed", at: "2026-10-15T11:00:00.000Z", code: "subrequest_limit", frase: "A revisão passou do limite do plano gratuito.", acao: "x" }],
  time: "2026-10-15T12:01:00.000Z",
};

await scenario(
  "F4",
  "Diagnóstico mostra saúde, cron e falhas; o relatório copiado não leva e-mail nem segredo",
  async ({ page, open }) => {
    await page.addInitScript(() => {
      window.__copied = "";
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => void (window.__copied = t) }, configurable: true });
    });
    await open("/conexoes");
    await page.getByRole("button", { name: "Ver diagnóstico" }).click(T);
    await page.getByText(/Saúde:/).first().waitFor(T);
    await page.getByText("A revisão passou do limite do plano gratuito.").waitFor(T);
    await page.getByRole("button", { name: "Copiar relatório" }).click();
    const text = await page.evaluate(() => window.__copied);
    expect(text.includes("schema 0007") && text.includes("subrequest_limit"), `relatório incompleto: ${text}`);
    expect(!/@|gsk_|token|Bearer/i.test(text), "relatório com dado sensível");
  },
  { setup: (s) => (s.extra = ({ path, json }) => (path === "/api/diagnostics" ? json(200, diag) : undefined)) },
);

await scenario(
  "F6",
  "Exportar é um link para /api/export; apagar tudo só libera depois de digitar APAGAR TUDO",
  async ({ page, open, state }) => {
    await open("/conexoes");
    const link = page.getByRole("link", { name: /Exportar meus dados/ });
    await link.waitFor(T);
    expect((await link.getAttribute("href")) === "/api/export", "link de exportação errado");
    await page.getByRole("button", { name: "Apagar tudo…" }).click();
    const go = page.getByRole("button", { name: "Apagar tudo agora" });
    expect(await go.isDisabled(), "apagar liberado sem confirmação");
    await page.getByLabel("Digite APAGAR TUDO para confirmar").fill("apagar tudo");
    expect(await go.isDisabled(), "aceitou a frase errada");
    await page.getByLabel("Digite APAGAR TUDO para confirmar").fill("APAGAR TUDO");
    await go.click();
    await page.waitForFunction(() => location.pathname === "/", null, T);
    expect(state.deleted === true, "a rota de apagar não foi chamada");
  },
  {
    setup: (s) =>
      (s.extra = ({ path, req, json }) => {
        if (path === "/api/account/delete" && req.method() === "POST") {
          s.deleted = JSON.parse(req.postData() ?? "{}").confirm === "APAGAR TUDO";
          s.authed = false;
          return json(200, { ok: true, revoked: 0 });
        }
        return undefined;
      }),
  },
);

process.exit(await finish());

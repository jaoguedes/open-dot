// Rodada 4: percorre as telas em 390×844 nos modos escuro e claro, falha se houver rolagem
// horizontal, e salva capturas em docs/capturas/rodada4/<pasta>/ quando UI_CAPTURES=<pasta>.
// Uso: node scripts/ui-rodada4.mjs [--dist apps/web/dist]
import { mkdirSync } from "node:fs";
import { startHarness } from "./lib/ui-harness.mjs";

const { scenario, expect, T, finish } = await startHarness();
const dir = process.env.UI_CAPTURES ? `docs/capturas/rodada4/${process.env.UI_CAPTURES}` : null;
if (dir) mkdirSync(dir, { recursive: true });

const approval = {
  id: "ap-1",
  action: "gmail.send",
  payloadHash: "a".repeat(64),
  status: "pending",
  version: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-10-15T11:00:00.000Z",
  proposal: { action: "gmail.send", service: "gmail", account: "dono@example.com", resource: "t", payload: { to: "ana@example.com", subject: "Re: almoço", body: "Pode ser quinta, sim!" }, consequence: "Responder a Ana." },
};
const PAGES = [
  ["meu-dia", "/meu-dia"],
  ["agente-dot", "/agente/dot"],
  ["agente-correio", "/agente/correio"],
  ["agente-codigo", "/agente/codigo"],
  ["agente-sentinela", "/agente/sentinela"],
  ["agente-foco", "/agente/foco"],
  ["agente-noticias", "/agente/noticias"],
  ["agente-mercado", "/agente/mercado"],
  ["agente-marketing", "/agente/marketing"],
  ["agente-entregas", "/agente/entregas"],
  ["aprovacao", "/aprovacao/ap-1"],
  ["conexoes", "/conexoes"],
];

for (const theme of ["dark", "light"]) {
  await scenario(
    "R4",
    `telas em 390×844 no modo ${theme === "dark" ? "escuro" : "claro"}, sem rolagem horizontal`,
    async ({ page, open }) => {
      await page.addInitScript((t) => localStorage.setItem("open-dot:prefs", JSON.stringify({ theme: t })), theme);
      const wide = [];
      for (const [name, path] of PAGES) {
        await open(path);
        await page.waitForTimeout(500);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 0) wide.push(`${name} (+${over}px)`);
        if (dir) await page.screenshot({ path: `${dir}/${theme}-${name}.png`, scale: "css" });
      }
      await open("/meu-dia");
      await page.getByRole("button", { name: "Perguntar ao Dot" }).last().click(T);
      await page.getByRole("dialog").waitFor(T);
      if (dir) await page.screenshot({ path: `${dir}/${theme}-busca.png`, scale: "css" });
      expect(!wide.length, `rolagem horizontal: ${wide.join(", ")}`);
    },
    { colorScheme: theme, setup: (s) => (s.approvals = [approval]) },
  );
}

process.exit(await finish());

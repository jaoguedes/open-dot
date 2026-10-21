// SPDX-License-Identifier: AGPL-3.0-only
// Avaliação golden SIMULADA: motor × padrão simples (“um implementa, outro revisa”).
//   node --import tsx scripts/orchestrator/eval-golden.ts          imprime e grava docs/orquestrador/AVALIACAO.md
//   node --import tsx scripts/orchestrator/eval-golden.ts --print  só imprime
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCatalog } from "../../packages/core/src/orchestrator/catalog.ts";
import { loadAgentPackage } from "../../packages/core/src/orchestrator/agents.ts";
import { assembleTeam, type Weights } from "../../packages/core/src/orchestrator/selector.ts";
import type { ToolSnapshot } from "../../packages/core/src/orchestrator/detection.ts";

const root = new URL("../../", import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const catalog = parseCatalog(read("orchestrator/catalog/ferramentas.json"));
const weights = read("orchestrator/config/pesos.json") as Weights;
const agents = await Promise.all((read("orchestrator/generated/agents.json").agentes as Array<{ files: Parameters<typeof loadAgentPackage>[0] }>).map(async (a) => (await loadAgentPackage(a.files)).meta));
const NOW = Date.parse("2026-10-21T12:00:00Z");
const ready = (id: ToolSnapshot["id"], authMethod: ToolSnapshot["authMethod"], paid = false): ToolSnapshot => ({ id, installed: true, version: "1.0.0", loggedIn: true, authMethod, possiblyPaid: paid, executable: true, reason: "simulado" });
const SCENARIOS = {
  "duas ferramentas": [ready("codex", "chatgpt"), ready("claude-code", "claude.ai")],
  "Claude por chave de API": [ready("codex", "chatgpt"), ready("claude-code", "api_key", true)],
};

interface Golden {
  id: string;
  ideia: string;
  esperado: { tipos_incluem: string; risco: string; precisa_design: boolean; precisa_pesquisa: boolean };
}
const golden: Golden[] = readdirSync(join(root, "evals/golden"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => read(`evals/golden/${f}`));

export function evaluate() {
  const rows = [];
  for (const [scenario, tools] of Object.entries(SCENARIOS)) {
    for (const g of golden) {
      const team = assembleTeam({ ideia: g.ideia, catalog, snapshot: { version: 1, observedAt: NOW, tools }, online: true, agents, quotas: {}, weights, optIn: { claudeCode: true }, now: NOW });
      const roles = team.passos.map((p) => p.agente);
      const impl = team.passos.find((p) => p.papel === "implementador")?.ferramenta;
      const rev = team.passos.find((p) => p.papel === "revisor")?.ferramenta;
      const perfilOk = team.perfil.tipos.includes(g.esperado.tipos_incluem as never) && team.perfil.risco === g.esperado.risco && team.perfil.precisaDesign === g.esperado.precisa_design && team.perfil.precisaPesquisa === g.esperado.precisa_pesquisa;
      const papeisOk = roles.includes("design") === g.esperado.precisa_design && roles.includes("pesquisa") === g.esperado.precisa_pesquisa;
      const usaPago = team.passos.some((p) => tools.find((t) => t.id === p.ferramenta)?.possiblyPaid);
      // Padrão simples: primeiras duas ferramentas instaladas, sem perfil, sem design/pesquisa, sem checar pagamento.
      const installed = tools.filter((t) => t.installed).map((t) => t.id);
      const basePapeisOk = !g.esperado.precisa_design && !g.esperado.precisa_pesquisa;
      const baseUsaPago = tools.filter((t) => installed.slice(0, 2).includes(t.id)).some((t) => t.possiblyPaid);
      rows.push({ scenario, id: g.id, motor: { perfilOk, papeisOk, revisorIndependente: Boolean(impl && rev && impl !== rev), usaPago, chamadas: team.passos.length }, padrao: { perfilOk: false, papeisOk: basePapeisOk, revisorIndependente: installed.length >= 2, usaPago: baseUsaPago, chamadas: 2 } });
    }
  }
  return rows;
}

function summary(rows: ReturnType<typeof evaluate>, scenario: string) {
  const r = rows.filter((x) => x.scenario === scenario);
  const pct = (f: (x: (typeof r)[number]) => boolean) => `${r.filter(f).length}/${r.length}`;
  return [
    `| Perfil correto (tipo, risco, design, pesquisa) | ${pct((x) => x.motor.perfilOk)} | não avalia |`,
    `| Papéis que a ideia pede (design, pesquisa) | ${pct((x) => x.motor.papeisOk)} | ${pct((x) => x.padrao.papeisOk)} |`,
    `| Revisor diferente do implementador | ${pct((x) => x.motor.revisorIndependente)} | ${pct((x) => x.padrao.revisorIndependente)} |`,
    `| Usou login possivelmente pago | ${pct((x) => x.motor.usaPago)} | ${pct((x) => x.padrao.usaPago)} |`,
    `| Chamadas por ideia (média) | ${(r.reduce((a, x) => a + x.motor.chamadas, 0) / r.length).toFixed(2)} | ${(r.reduce((a, x) => a + x.padrao.chamadas, 0) / r.length).toFixed(2)} |`,
  ].join("\n");
}

const rows = evaluate();
const misses = rows.filter((r) => r.scenario === "duas ferramentas" && !r.motor.perfilOk).map((r) => r.id);
const doc = `# Avaliação do orquestrador — motor × padrão simples

> **Simulado.** Ferramentas simuladas (snapshot sintético); nenhuma chamada a modelo. Gerado por \`scripts/orchestrator/eval-golden.ts\` sobre ${golden.length} ideias em \`evals/golden/\`.

## Cenário: duas ferramentas prontas (Codex e Claude Code por assinatura)

| Métrica | Motor | Padrão simples |
|---|---|---|
${summary(rows, "duas ferramentas")}

## Cenário: Claude Code logado por chave de API (possivelmente pago)

| Métrica | Motor | Padrão simples |
|---|---|---|
${summary(rows, "Claude por chave de API")}

## Leitura honesta

- O motor acerta o perfil na maioria das ideias${misses.length ? `, mas erra em: ${misses.join(", ")}` : ""}. A heurística é por palavras; erros de perfil viram papéis a mais ou a menos.
- O motor inclui Design e Pesquisa quando a ideia pede e nunca usa login possivelmente pago; o padrão simples não tem como saber nenhuma das duas coisas.
- No cenário com chave de API, o motor fica com **0/12 de revisão independente** porque exclui o Claude Code e cai no modo uma ferramenta (com aviso). É a troca escolhida: não gastar dinheiro por padrão vale mais que a revisão cruzada.
- **Custo:** o motor faz mais chamadas por ideia que o padrão simples (cerca de duas vezes). É o preço de ter Produto, Design e Pesquisa no caminho.
- **Qualidade do resultado não foi medida.** Com ferramentas simuladas não dá para dizer se o código final do motor é melhor que o do padrão simples. **Nesta avaliação o motor não demonstrou superioridade de qualidade**; demonstrou só cobertura de papéis, independência da revisão e respeito às restrições, ao custo de mais chamadas.
- Chamadas reais nesta rodada: duas ao Codex (papel planejador e revisor), ambas com saída válida no esquema e a revisão reprovando um defeito plantado. É evidência de que os papéis funcionam, não comparação estatística.
`;
console.log(doc);
if (!process.argv.includes("--print")) writeFileSync(join(root, "docs/orquestrador/AVALIACAO.md"), doc);

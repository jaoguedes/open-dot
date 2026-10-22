// SPDX-License-Identifier: AGPL-3.0-only
// Avaliação golden SIMULADA do orquestrador (v0.3):
//   1. motor × padrão simples (“um implementa, outro revisa”) nas ideias com perfil esperado;
//   2. receitas: agentes, modo e restrições em cada caso de receita;
//   3. calibração ligada × desligada num mundo sintético (taxas escondidas conhecidas);
//   4. ciclo corretor com × sem, num modelo sintético de achados.
// Nenhuma chamada a modelo. Resultados reais (Codex) ficam fora deste arquivo.
//   node --import tsx scripts/orchestrator/eval-golden.ts          imprime e grava docs/orquestrador/AVALIACAO.md
//   node --import tsx scripts/orchestrator/eval-golden.ts --print  só imprime
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCatalog } from "../../packages/core/src/orchestrator/catalog.ts";
import { loadAgentPackage } from "../../packages/core/src/orchestrator/agents.ts";
import { loadRecipe, type Recipe } from "../../packages/core/src/orchestrator/recipes.ts";
import { assembleTeam, type Weights } from "../../packages/core/src/orchestrator/selector.ts";
import { EMPTY_CALIBRATION, calibrate, type CalibrationState, type MeasuredOutcome } from "../../packages/core/src/orchestrator/calibration.ts";
import { nextRound } from "../../packages/core/src/orchestrator/review-loop.ts";
import { mulberry32 } from "../../packages/core/src/dot/physics.ts";
import type { ToolSnapshot } from "../../packages/core/src/orchestrator/detection.ts";

const root = new URL("../../", import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const catalog = parseCatalog(read("orchestrator/catalog/ferramentas.json"));
const weights = read("orchestrator/config/pesos.json") as Weights;
const agents = await Promise.all((read("orchestrator/generated/agents.json").agentes as Array<{ files: Parameters<typeof loadAgentPackage>[0] }>).map(async (a) => (await loadAgentPackage(a.files)).meta));
const recipes: Recipe[] = await Promise.all((read("orchestrator/generated/recipes.json").receitas as Array<{ text: string; hash: string }>).map((r) => loadRecipe(r.text, agents, r.hash)));
const NOW = Date.parse("2026-10-22T12:00:00Z");
const ready = (id: ToolSnapshot["id"], authMethod: ToolSnapshot["authMethod"], paid = false): ToolSnapshot => ({ id, installed: true, version: "1.0.0", loggedIn: true, authMethod, possiblyPaid: paid, executable: true, reason: "simulado" });
const SCENARIOS = {
  "duas ferramentas": [ready("codex", "chatgpt"), ready("claude-code", "claude.ai")],
  "Claude por chave de API": [ready("codex", "chatgpt"), ready("claude-code", "api_key", true)],
};
const TWO = SCENARIOS["duas ferramentas"];

interface ProfileCase {
  id: string;
  ideia: string;
  esperado: { tipos_incluem: string; risco: string; precisa_design: boolean; precisa_pesquisa: boolean };
}
interface RecipeCase {
  id: string;
  receita: string;
  ideia: string;
  esperado: { agentes: string[]; somente_leitura: boolean; area?: string };
}
const all = readdirSync(join(root, "evals/golden"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => read(`evals/golden/${f}`) as ProfileCase | RecipeCase);
const golden = all.filter((g): g is ProfileCase => !("receita" in g));
const recipeCases = all.filter((g): g is RecipeCase => "receita" in g);

const team = (ideia: string, tools: ToolSnapshot[], extra: Partial<Parameters<typeof assembleTeam>[0]> = {}) =>
  assembleTeam({ ideia, catalog, snapshot: { version: 1, observedAt: NOW, tools }, online: true, agents, quotas: {}, weights, optIn: { claudeCode: true }, now: NOW, ...extra });

export function evaluate() {
  const rows = [];
  for (const [scenario, tools] of Object.entries(SCENARIOS)) {
    for (const g of golden) {
      const t = team(g.ideia, tools);
      const roles = t.passos.map((p) => p.agente);
      const impl = t.passos.find((p) => p.papel === "implementador")?.ferramenta;
      const rev = t.passos.find((p) => p.papel === "revisor")?.ferramenta;
      const perfilOk = t.perfil.tipos.includes(g.esperado.tipos_incluem as never) && t.perfil.risco === g.esperado.risco && t.perfil.precisaDesign === g.esperado.precisa_design && t.perfil.precisaPesquisa === g.esperado.precisa_pesquisa;
      const papeisOk = roles.includes("design") === g.esperado.precisa_design && roles.includes("pesquisa") === g.esperado.precisa_pesquisa;
      const usaPago = t.passos.some((p) => tools.find((x) => x.id === p.ferramenta)?.possiblyPaid);
      const installed = tools.filter((x) => x.installed).map((x) => x.id);
      const basePapeisOk = !g.esperado.precisa_design && !g.esperado.precisa_pesquisa;
      const baseUsaPago = tools.filter((x) => installed.slice(0, 2).includes(x.id)).some((x) => x.possiblyPaid);
      rows.push({ scenario, id: g.id, motor: { perfilOk, papeisOk, revisorIndependente: Boolean(impl && rev && impl !== rev), usaPago, chamadas: t.passos.length }, padrao: { perfilOk: false, papeisOk: basePapeisOk, revisorIndependente: installed.length >= 2, usaPago: baseUsaPago, chamadas: 2 } });
    }
  }
  return rows;
}

export function evaluateRecipes() {
  return recipeCases.map((c) => {
    const r = recipes.find((x) => x.id === c.receita)!;
    const t = team(c.ideia, TWO, { recipe: r });
    const agentes = t.passos.map((p) => p.agente);
    const writes = t.passos.some((p) => p.papel === "implementador");
    const impl = t.passos.find((p) => p.papel === "implementador")?.ferramenta;
    const revs = t.passos.filter((p) => p.papel === "revisor").map((p) => p.ferramenta);
    return {
      id: c.id,
      receita: c.receita,
      agentesOk: JSON.stringify(agentes) === JSON.stringify(c.esperado.agentes),
      modoOk: writes === !c.esperado.somente_leitura && (r.modo === "somente-leitura") === c.esperado.somente_leitura,
      areaOk: !c.esperado.area || agentes.includes(c.esperado.area),
      revisaoIndependente: !impl || revs.every((x) => x !== impl),
      pronta: t.pronta,
      chamadas: t.passos.length,
      estimativaOk: t.passos.length <= r.estimativa_de_chamadas,
    };
  });
}

/** Mundo sintético: taxa de aprovação ESCONDIDA por ferramenta no papel implementador. */
function simulateCalibration(hidden: Record<"codex" | "claude-code", number>, historyPerTool: number, days: number) {
  const r = mulberry32(42);
  const hist: MeasuredOutcome[] = [];
  for (const tool of ["codex", "claude-code"] as const) for (let i = 0; i < historyPerTool; i++) hist.push({ role: "implementador", tool, tipo: "qualquer", outcome: r() < hidden[tool] ? "aprovado" : "reprovado" });
  let state: CalibrationState = EMPTY_CALIBRATION;
  for (let d = 0; d < days; d++) state = calibrate(hist, state).state;
  const expected = (cal: CalibrationState | null) => {
    let sum = 0;
    for (const g of golden) {
      const impl = team(g.ideia, TWO, cal ? { calibration: cal } : {}).passos.find((p) => p.papel === "implementador")!.ferramenta as "codex" | "claude-code";
      sum += hidden[impl];
    }
    return sum / golden.length;
  };
  return { desligada: expected(null), ligada: expected(state), fatores: state.fatores };
}

/** Modelo sintético de achados: cada rodada corrige cada achado com probabilidade p. */
function simulateLoop(rounds: number, fixP: number, trials = 2000) {
  const r = mulberry32(7);
  let residual = 0,
    calls = 0;
  for (let t = 0; t < trials; t++) {
    let n = 1 + Math.floor(r() * 4);
    const pesos = [n * 2];
    let done = 0;
    calls += 1;
    while (true) {
      const d = nextRound({ rodadas: done, maxRodadas: rounds, pesos, cotaDisponivel: true, decisao: n ? "reprovar" : "aprovar" });
      if (!d.continuar) break;
      done++;
      let left = 0;
      for (let i = 0; i < n; i++) if (r() >= fixP) left++;
      // O corretor às vezes introduz um achado novo (10%).
      if (r() < 0.1) left++;
      n = left;
      pesos.push(n * 2);
      calls += 2;
    }
    residual += n;
  }
  return { achadosRestantes: residual / trials, chamadas: calls / trials };
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
const rec = evaluateRecipes();
const misses = rows.filter((r) => r.scenario === "duas ferramentas" && !r.motor.perfilOk).map((r) => r.id);
const diff = simulateCalibration({ codex: 0.6, "claude-code": 0.8 }, 30, 30);
const same = simulateCalibration({ codex: 0.7, "claude-code": 0.7 }, 30, 30);
const few = simulateCalibration({ codex: 0.6, "claude-code": 0.8 }, 5, 30);
const loopOff = simulateLoop(0, 0.6);
const loop1 = simulateLoop(1, 0.6);
const loop2 = simulateLoop(2, 0.6);
const okRec = (k: keyof (typeof rec)[number]) => `${rec.filter((x) => x[k] === true).length}/${rec.length}`;
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
export const RESULT = { rows, rec, calibracao: { diff, same, few }, ciclo: { loopOff, loop1, loop2 } };

const doc = `# Avaliação do orquestrador (v0.3)

> **Tudo aqui é simulado.** Ferramentas simuladas (snapshot sintético) e mundos sintéticos; nenhuma chamada a modelo. Gerado por \`scripts/orchestrator/eval-golden.ts\` sobre ${all.length} casos em \`evals/golden/\` (${golden.length} de perfil, ${recipeCases.length} de receita). Chamadas reais ficam registradas à parte, no relatório da rodada.

## 1. Motor × padrão simples — duas ferramentas prontas (Codex e Claude Code por assinatura)

| Métrica | Motor | Padrão simples |
|---|---|---|
${summary(rows, "duas ferramentas")}

## 1b. Motor × padrão simples — Claude Code logado por chave de API (possivelmente pago)

| Métrica | Motor | Padrão simples |
|---|---|---|
${summary(rows, "Claude por chave de API")}

## 2. Receitas (${recipes.length} receitas, ${recipeCases.length} casos)

| Verificação | Resultado |
|---|---|
| Agentes na ordem da receita | ${okRec("agentesOk")} |
| Modo (somente leitura × propõe mudanças) respeitado | ${okRec("modoOk")} |
| Área nova presente (Arquitetura, Segurança, Documentação) | ${okRec("areaOk")} |
| Revisor diferente do implementador | ${okRec("revisaoIndependente")} |
| Equipe pronta | ${okRec("pronta")} |
| Chamadas dentro da estimativa declarada | ${okRec("estimativaOk")} |

## 3. Calibração ligada × desligada (mundo sintético)

Taxas de aprovação **escondidas** do implementador, conhecidas só pelo simulador; 30 ciclos diários.

| Mundo | Aprovação esperada, desligada | Aprovação esperada, ligada | Fatores finais |
|---|---|---|---|
| Codex 60%, Claude Code 80%, 30 resultados de cada | ${pct(diff.desligada)} | ${pct(diff.ligada)} | \`${JSON.stringify(diff.fatores)}\` |
| As duas 70%, 30 resultados de cada | ${pct(same.desligada)} | ${pct(same.ligada)} | \`${JSON.stringify(same.fatores)}\` |
| Codex 60%, Claude Code 80%, só 5 resultados de cada | ${pct(few.desligada)} | ${pct(few.ligada)} | \`${JSON.stringify(few.fatores)}\` |

## 4. Ciclo corretor com × sem (modelo sintético de achados)

Cada revisão começa com 1 a 4 achados; cada rodada corrige cada achado com 60% de chance e às vezes cria um novo (10%). 2.000 tentativas.

| Configuração | Achados restantes (média) | Chamadas de revisão/correção (média) |
|---|---|---|
| Sem ciclo | ${loopOff.achadosRestantes.toFixed(2)} | ${loopOff.chamadas.toFixed(2)} |
| Até 1 rodada | ${loop1.achadosRestantes.toFixed(2)} | ${loop1.chamadas.toFixed(2)} |
| Até 2 rodadas | ${loop2.achadosRestantes.toFixed(2)} | ${loop2.chamadas.toFixed(2)} |

## Leitura honesta

- O motor acerta o perfil na maioria das ideias${misses.length ? `, mas erra em: ${misses.join(", ")}` : ""}. A heurística é por palavras.
- O motor inclui Design e Pesquisa quando a ideia pede e nunca usa login possivelmente pago; o padrão simples não sabe nenhuma das duas coisas. No cenário com chave de API, a revisão deixa de ser independente (modo uma ferramenta, com aviso): não gastar por padrão vale mais.
- **Custo:** o motor faz mais chamadas por ideia que o padrão simples.
- **Receitas** só fixam a ordem de agentes; a contagem de receitas não é medida de qualidade.
- **Calibração:** só melhora quando o mundo sintético tem uma diferença real entre ferramentas **e** há resultados suficientes; com ferramentas iguais ou poucos resultados, não muda nada (o que é o comportamento desejado). Isso não prova ganho no uso real: **não há resultados medidos de verdade nesta máquina**. Por isso a calibração **fica desligada por padrão**.
- **Ciclo corretor:** reduz achados restantes no modelo sintético, ao custo de até 2 chamadas por rodada. O modelo foi escrito por nós (taxa de correção de 60% inventada), então **isso não demonstra melhora real**; o ciclo **fica desligado por padrão** até haver medida com chamadas reais.
- **Qualidade do código final não foi medida.** Nesta avaliação o motor não demonstrou superioridade de qualidade; demonstrou cobertura de papéis, independência da revisão e respeito às restrições.
`;
console.log(doc);
if (!process.argv.includes("--print")) writeFileSync(join(root, "docs/orquestrador/AVALIACAO.md"), doc);

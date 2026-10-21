// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCatalog } from "../src/orchestrator/catalog.ts";
import { loadAgentPackage, type AgentMeta } from "../src/orchestrator/agents.ts";
import { assembleTeam, type TeamInput, type Weights } from "../src/orchestrator/selector.ts";
import { profileFromIdea } from "../src/orchestrator/profile.ts";
import { freshQuota, recordCalls, recordLimitError, isExhausted, raiseLearned, setUserLimit, slack } from "../src/orchestrator/quota.ts";
import type { ToolSnapshot } from "../src/orchestrator/detection.ts";

const root = new URL("../../../", import.meta.url);
const catalog = parseCatalog(JSON.parse(readFileSync(new URL("orchestrator/catalog/ferramentas.json", root), "utf8")));
const weights = JSON.parse(readFileSync(new URL("orchestrator/config/pesos.json", root), "utf8")) as Weights;
const bundle = JSON.parse(readFileSync(new URL("orchestrator/generated/agents.json", root), "utf8")) as { agentes: Array<{ files: Parameters<typeof loadAgentPackage>[0] }> };
const agents: AgentMeta[] = await Promise.all(bundle.agentes.map(async (a) => (await loadAgentPackage(a.files)).meta));
const NOW = Date.parse("2026-10-21T12:00:00Z");

const ready = (id: ToolSnapshot["id"], over: Partial<ToolSnapshot> = {}): ToolSnapshot => ({ id, installed: true, version: "1.0.0", loggedIn: true, authMethod: id === "codex" ? "chatgpt" : "claude.ai", possiblyPaid: false, executable: true, reason: "ok", ...over });
function input(tools: ToolSnapshot[], over: Partial<TeamInput> = {}): TeamInput {
  return { ideia: "um app para lembrar de regar as plantas", catalog, snapshot: { version: 1, observedAt: NOW, tools }, online: true, agents, quotas: {}, weights, optIn: { claudeCode: true }, now: NOW, ...over };
}
const toolOf = (t: ReturnType<typeof assembleTeam>, agente: string) => t.passos.find((p) => p.agente === agente)?.ferramenta;

test("perfil: tipo, risco e necessidade de design/pesquisa por heurística explicada", () => {
  const p = profileFromIdea("um app de celular para comparar bibliotecas e cobrar por Pix");
  assert.ok(p.tipos.includes("pwa"));
  assert.equal(p.risco, "alto");
  assert.ok(p.precisaPesquisa && p.precisaDesign);
  assert.ok(p.sinais.length >= 2);
  assert.equal(profileFromIdea("script que renomeia arquivos no terminal").tipos[0], "automacao");
});

test("duas ferramentas: implementador e revisor diferentes; estimativa soma as chamadas", () => {
  const t = assembleTeam(input([ready("codex"), ready("claude-code")]));
  assert.ok(t.pronta);
  assert.notEqual(toolOf(t, "desenvolvedor"), toolOf(t, "qa"));
  assert.equal(t.modoUmaFerramenta, false);
  assert.equal(Object.values(t.estimativa).reduce((a, b) => a + b!, 0), t.passos.length);
  assert.deepEqual(t.passos.map((p) => p.agente), ["produto", "design", "desenvolvedor", "qa"]);
});

test("uma ferramenta só: modo uma-ferramenta com aviso e revisão em sessão limpa", () => {
  const t = assembleTeam(input([ready("codex"), ready("claude-code", { installed: false, loggedIn: null, executable: false, authMethod: null })]));
  assert.ok(t.modoUmaFerramenta);
  assert.match(t.avisos.join(" "), /Modo uma ferramenta/);
  assert.match(t.passos.find((p) => p.agente === "qa")!.motivo, /sessão limpa/);
});

test("restrições duras: sem login, não instalado, opt-in desligado, pago, indisponível e planejado", () => {
  const t = assembleTeam(input([ready("codex", { loggedIn: false, executable: false, authMethod: "none" }), ready("claude-code", { authMethod: "api_key", possiblyPaid: true }), ready("gemini", { authMethod: "google" })], { optIn: { claudeCode: false } }));
  const why = Object.fromEntries(t.passos[0]!.candidatas.map((c) => [c.tool, c.excluida]));
  assert.match(why.codex!, /sem login/);
  assert.match(why["claude-code"]!, /possivelmente pago/);
  assert.match(why.gemini!, /indisponível/);
  assert.match(why.cursor!, /indisponível/);
  assert.match(why.ollama!, /planejada/);
  assert.equal(t.pronta, false);
  assert.match(t.avisos.join(" "), /incompleta/);
});

test("Claude Code: opt-in desligado exclui; pago só com permissão explícita", () => {
  const off = assembleTeam(input([ready("claude-code")], { optIn: { claudeCode: false } }));
  assert.match(off.passos[0]!.candidatas.find((c) => c.tool === "claude-code")!.excluida!, /opt-in/);
  const paid = input([ready("claude-code", { authMethod: "api_key", possiblyPaid: true })]);
  assert.equal(assembleTeam(paid).pronta, false);
  assert.equal(assembleTeam({ ...paid, permitirPossivelmentePago: ["claude-code"] }).pronta, true);
});

test("cota esgotada exclui; cota apertada baixa a pontuação; desconhecida é neutra", () => {
  const exhausted = recordLimitError(freshQuota(NOW), NOW, NOW + 3_600_000);
  const t = assembleTeam(input([ready("codex"), ready("claude-code")], { quotas: { codex: exhausted } }));
  assert.ok(t.passos.every((p) => p.ferramenta === "claude-code" || p.ferramenta === null));
  assert.match(t.passos[0]!.candidatas.find((c) => c.tool === "codex")!.excluida!, /cota esgotada/);
  const tight = setUserLimit(recordCalls(freshQuota(NOW), NOW, 9), 10);
  const t2 = assembleTeam(input([ready("codex"), ready("claude-code")], { quotas: { codex: tight } }));
  assert.equal(toolOf(t2, "produto"), "claude-code");
  assert.match(t2.passos[0]!.candidatas.find((c) => c.tool === "claude-code")!.fatores.join(" "), /cota desconhecida/);
});

test("override do usuário vale se passa nas restrições; senão vira aviso com o motivo", () => {
  const ok = assembleTeam(input([ready("codex"), ready("claude-code")], { overrides: { produto: "claude-code" } }));
  assert.equal(toolOf(ok, "produto"), "claude-code");
  assert.match(ok.passos[0]!.motivo, /escolha do usuário/);
  const refused = assembleTeam(input([ready("codex")], { overrides: { produto: "gemini" } }));
  assert.equal(toolOf(refused, "produto"), "codex");
  assert.match(refused.avisos.join(" "), /Troca pedida para produto recusada/);
});

test("Runner offline reduz pontuação e explica; resultado é determinístico", () => {
  const a = assembleTeam(input([ready("codex"), ready("claude-code")], { online: false }));
  assert.match(a.passos[0]!.candidatas.find((c) => c.tool === "codex")!.fatores.join(" "), /offline/);
  const b = assembleTeam(input([ready("codex"), ready("claude-code")], { online: false }));
  assert.deepEqual(a, b);
});

test("evidência medida só conta com peso > 0 e amostras suficientes", () => {
  const ev = { codex: { planejador: { aprovadas: 0, total: 10 } } };
  const neutral = assembleTeam(input([ready("codex"), ready("claude-code")], { evidence: ev }));
  assert.equal(toolOf(neutral, "produto"), "codex", "peso 0 no v0.2: evidência não muda a escolha");
  const weighted = assembleTeam(input([ready("codex"), ready("claude-code")], { evidence: ev, weights: { ...weights, pesoEvidenciaMedida: 1 } }));
  assert.equal(toolOf(weighted, "produto"), "claude-code");
});

test("cota: aprende limite pelo erro, renova no dia seguinte e sobe com plano melhor", () => {
  let q = recordCalls(freshQuota(NOW), NOW, 7);
  q = recordLimitError(q, NOW, null);
  assert.equal(q.limiteDia, 7);
  assert.equal(q.origemLimite, "aprendido");
  assert.ok(isExhausted(q, NOW));
  const tomorrow = NOW + 86_400_000;
  assert.equal(isExhausted(q, tomorrow), false);
  q = recordCalls(q, tomorrow, 12);
  assert.equal(raiseLearned(q).limiteDia, 12);
  assert.equal(slack(freshQuota(NOW), NOW, 0.2), 1);
});

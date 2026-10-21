// SPDX-License-Identifier: AGPL-3.0-only
// Pipeline com Runner SIMULADO: as respostas dos “modelos” são fixtures escritas aqui.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, client } from "./harness.ts";
import { sha256Hex } from "@open-dot/core";
import { randomToken } from "../src/crypto.ts";

const PROTOCOL = { version: 2, approval: "sha256-utf8-json-v1", capabilities: ["exact-content-approval", "uncertain-terminal", "lease-fencing", "event-receipts", "worktree-consent", "review-before-content"] };
const OUT: Record<string, unknown> = {
  produto: { frase: "Para quem tem plantas, um lembrete por planta, para que nenhuma fique sem água.", tipo: ["pwa"], escopo: ["cadastrar planta"], fora_de_escopo: [], criterios_de_aceite: [{ dado: "uma planta", quando: "marca regada", entao: "a próxima rega muda" }], perguntas_abertas: [], riscos: [{ risco: "esquecer de abrir", probabilidade: "media", impacto: "medio", mitigacao: "destaque" }] },
  design: { design_md: "# DESIGN\n", telas: [{ nome: "Lista", objetivo: "ver plantas", acao_primaria: "Adicionar", estados: { vazio: "Nenhuma planta.", carregando: "Carregando…", erro: "Não consegui carregar.", sucesso: "Salvo." }, acessibilidade: ["foco visível"] }], pendencias: [] },
  qa: { decisao: "reprovar", achados: [{ severidade: "critico", arquivo: "app.ts", evidencia: "sem estado vazio", sugestao: "adicionar" }], criterios_cobertos: [], casos_de_teste: [], mesma_ferramenta: true },
};

async function setup() {
  const ctx = await makeCtx({ now: () => clock.t });
  const clock = { t: Date.parse("2026-10-21T12:00:00Z") };
  const web = client(ctx), native = client(ctx);
  await web.call("POST", "/api/session/dev");
  const token = randomToken();
  const pairing = await native.call("POST", "/api/runner/pairings", { secretHash: await sha256Hex(randomToken()), tokenHash: await sha256Hex(token), name: "Mac" });
  const deviceId = (await web.call("POST", "/api/runner/pairings/approve", { code: pairing.json.code, name: "Mac" })).json.deviceId as string;
  const headers = { authorization: `Bearer ${token}` };
  const projectId = crypto.randomUUID();
  const beat = () => native.call("POST", "/api/runner/device/heartbeat", { protocol: PROTOCOL, projects: [{ id: projectId, label: "Plantas" }], drivers: [{ id: "codex", installed: true, authenticated: true, executable: true, reason: "Runner simulado" }] }, headers);
  await beat();
  await native.call("POST", "/api/runner/device/tools", { version: 1, observedAt: clock.t, tools: [{ id: "codex", installed: true, version: "0.163.0", loggedIn: true, authMethod: "chatgpt", possiblyPaid: false, executable: true, reason: "Runner simulado" }] }, headers);
  return { ctx, clock, web, native, headers, deviceId, projectId, beat };
}

async function runStep(s: Awaited<ReturnType<typeof setup>>, answer: (task: any) => Promise<void>) {
  await s.beat();
  const claim = await s.native.call("POST", "/api/runner/device/claim", {}, s.headers);
  assert.ok(claim.json.task, "há tarefa para o Runner");
  await answer(claim.json.task);
  return claim.json.task;
}

test("pipeline sequencial: papéis só leitura validados, implementador com aprovação exata e veredito do QA registrado", async () => {
  const s = await setup();
  assert.equal((await s.web.call("POST", "/api/orchestrator/pipelines", { ideia: "um app para lembrar de regar as plantas", deviceId: s.deviceId, projectId: s.projectId, worktreeConsent: true, confirmacao: "errado" })).status, 400);
  const created = await s.web.call("POST", "/api/orchestrator/pipelines", { ideia: "um app para lembrar de regar as plantas", deviceId: s.deviceId, projectId: s.projectId, worktreeConsent: true, confirmacao: "rodar-equipe-em-sequencia" });
  assert.equal(created.status, 201);
  assert.match(created.json.avisos.join(" "), /Modo uma ferramenta/);
  const order: string[] = [];
  for (const agente of ["produto", "design"]) {
    const task = await runStep(s, async (t) => {
      assert.equal(t.role, "planejador");
      assert.equal(t.outputSchema.type, "object");
      assert.match(t.prompt, /REGRAS DO HOST/);
      await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 1, kind: "result", text: JSON.stringify(OUT[agente]) }, s.headers);
      await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 2, kind: "completed", text: "ok" }, s.headers);
    });
    order.push(agente);
    if (agente === "design") assert.match(task.prompt, /Para quem tem plantas/, "saída anterior chega como dado");
  }
  const impl = await runStep(s, async (t) => {
    assert.equal(t.role, "implementador");
    const proposal = JSON.stringify({ summary: "lista", files: [{ path: "app.ts", content: "export const x = 1;\n", beforeHash: null }] });
    const r = await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 1, kind: "proposal", text: proposal }, s.headers);
    assert.equal((await s.web.call("POST", `/api/runner/tasks/${t.id}/decision`, { hash: r.json.proposalHash, decision: "approve" })).status, 200);
    for (const [seq, kind] of [[2, "files"], [3, "tests"], [4, "completed"]] as const) await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq, kind, text: "ok" }, s.headers);
  });
  assert.ok(impl.id);
  await runStep(s, async (t) => {
    assert.equal(t.role, "revisor");
    assert.match(t.prompt, /export const x = 1/, "QA lê a proposta aprovada");
    await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 1, kind: "result", text: JSON.stringify(OUT.qa) }, s.headers);
    await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 2, kind: "completed", text: "ok" }, s.headers);
  });
  await s.beat();
  await s.native.call("POST", "/api/runner/device/claim", {}, s.headers);
  const list = await s.web.call("GET", "/api/orchestrator/pipelines");
  assert.equal(list.json.pipelines[0].state, "concluido");
  assert.equal(list.json.pipelines[0].passos.at(-1).saida.decisao, "reprovar");
  const outcomes = await s.ctx.db.query<{ agent_id: string; outcome: string }>("SELECT agent_id,outcome FROM od_orchestrator_outcomes ORDER BY created_at, agent_id");
  assert.ok(outcomes.some((o) => o.agent_id === "desenvolvedor" && o.outcome === "reprovado"), "veredito do QA vira resultado do implementador");
  assert.equal((await s.web.call("GET", "/api/orchestrator/settings")).json.quotas.codex.usadasHoje, 4);
  s.ctx.db.raw.close();
});

test("saída fora do esquema bloqueia; falha por limite marca cota esgotada; nada é repetido", async () => {
  const s = await setup();
  await s.web.call("POST", "/api/orchestrator/pipelines", { ideia: "um script que renomeia arquivos", deviceId: s.deviceId, projectId: s.projectId, worktreeConsent: true, confirmacao: "rodar-equipe-em-sequencia" });
  await runStep(s, async (t) => {
    await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 1, kind: "result", text: JSON.stringify({ frase: "x", shell: "rm -rf /" }) }, s.headers);
    await s.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 2, kind: "completed", text: "ok" }, s.headers);
  });
  await s.beat();
  const next = await s.native.call("POST", "/api/runner/device/claim", {}, s.headers);
  assert.equal(next.json.task, null, "pipeline bloqueado não enfileira o próximo passo");
  let p = (await s.web.call("GET", "/api/orchestrator/pipelines")).json.pipelines[0];
  assert.equal(p.state, "bloqueado");
  assert.ok(p.passos[0].erros.some((e: string) => /não permitido|obrigatório/.test(e)));

  const s2 = await setup();
  await s2.web.call("POST", "/api/orchestrator/pipelines", { ideia: "um script que renomeia arquivos", deviceId: s2.deviceId, projectId: s2.projectId, worktreeConsent: true, confirmacao: "rodar-equipe-em-sequencia" });
  await runStep(s2, async (t) => {
    await s2.native.call("POST", `/api/runner/device/tasks/${t.id}/event`, { seq: 1, kind: "failed", text: "Você atingiu o limite de uso. Renova em 5 horas." }, s2.headers);
  });
  await s2.beat();
  await s2.native.call("POST", "/api/runner/device/claim", {}, s2.headers);
  p = (await s2.web.call("GET", "/api/orchestrator/pipelines")).json.pipelines[0];
  assert.equal(p.state, "bloqueado");
  assert.match(p.reason, /Cota de codex esgotada/);
  const team = await s2.web.call("POST", "/api/orchestrator/team", { ideia: "outra ideia", deviceId: s2.deviceId });
  assert.match(team.json.team.passos[0].candidatas.find((c: { tool: string }) => c.tool === "codex").excluida, /cota esgotada/);
  s.ctx.db.raw.close();
  s2.ctx.db.raw.close();
});

// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { UNAVAILABLE_SANDBOX, sandboxApprovalHash, sandboxFlag, validateSandbox, type SandboxRequest } from "../src/orchestrator/sandbox.ts";
import { MAX_PARALLEL, mergeBranches, parallelEstimate, parallelFlag, planBatches, type PlanStep } from "../src/orchestrator/parallel.ts";
import { freshQuota } from "../src/orchestrator/quota.ts";

const req: SandboxRequest = { projectId: "p", argv: ["npm", "test"], timeoutMs: 60_000, outputCapBytes: 100_000 };
const policy = { allowlist: [["npm", "test"]], enabled: true };

test("sandbox: contrato recusa o que não está na allowlist; implementação é indisponível", async () => {
  assert.equal(sandboxFlag({}), false, "desligado por padrão");
  assert.match(validateSandbox(req, { ...policy, enabled: false })!, /desligada/);
  assert.equal(validateSandbox(req, policy), null);
  assert.match(validateSandbox({ ...req, argv: ["npm", "test", "--", "&&", "curl", "x"] }, policy)!, /shell|fora da lista/);
  assert.match(validateSandbox({ ...req, argv: ["npm", "run", "deploy"] }, policy)!, /fora da lista/);
  assert.match(validateSandbox({ ...req, timeoutMs: 10_000_000 }, policy)!, /Tempo/);
  const h = await sandboxApprovalHash(req);
  assert.notEqual(h, await sandboxApprovalHash({ ...req, argv: ["npm", "test", "x"] }), "aprovação presa ao comando exato");
  assert.equal(UNAVAILABLE_SANDBOX.available, false);
  await assert.rejects(UNAVAILABLE_SANDBOX.run(req, h), /Bloqueado/);
});

const S = (agente: string, papel: PlanStep["papel"], ferramenta = "codex"): PlanStep => ({ agente, papel, ferramenta });
const flow = [S("produto", "planejador"), S("pesquisa", "planejador", "claude-code"), S("desenvolvedor", "implementador"), S("qa", "revisor", "claude-code"), S("seguranca", "revisor", "claude-code"), S("desenvolvedor", "corretor")];

test("SIMULADO paralelismo: desligado = sequência; ligado junta só leitura, máx. 2, nunca quem escreve", () => {
  assert.equal(parallelFlag({}, true), false);
  assert.equal(parallelFlag({ ORCH_PARALLEL_READONLY: "1" }, false), false, "precisa das duas chaves");
  assert.deepEqual(planBatches(flow, { enabled: false }).map((b) => b.length), [1, 1, 1, 1, 1, 1]);
  const on = planBatches(flow, { enabled: true });
  assert.deepEqual(on.map((b) => b.map((x) => x.agente)), [["produto", "pesquisa"], ["desenvolvedor"], ["qa", "seguranca"], ["desenvolvedor"]]);
  assert.ok(on.every((b) => b.length <= MAX_PARALLEL));
  assert.ok(on.every((b) => b.length === 1 || b.every((x) => x.papel !== "implementador" && x.papel !== "corretor")));
  assert.deepEqual(parallelEstimate(flow, on), { chamadas: 6, lotes: 4, economizaEsperas: 2 });
  const three = [S("qa", "revisor"), S("seguranca", "revisor"), S("design", "revisor")];
  assert.ok(planBatches(three, { enabled: true }).every((b) => b.length <= 2));
});

test("SIMULADO paralelismo: cota da ferramenta impede o lote; ramo inválido invalida a fusão", () => {
  const q = { ...freshQuota(0, 10), usadasHoje: 9 };
  const tight = planBatches([S("qa", "revisor"), S("seguranca", "revisor")], { enabled: true, quotas: { codex: q }, now: 0 });
  assert.deepEqual(tight.map((b) => b.length), [1, 1], "uma chamada sobrando: sem paralelo");
  const schema = { type: "object", required: ["decisao"], properties: { decisao: { enum: ["aprovar", "reprovar"] } }, additionalProperties: false };
  assert.equal(mergeBranches([{ agente: "qa", saida: { decisao: "aprovar" }, schema }, { agente: "seguranca", saida: { decisao: "aprovar" }, schema }]).ok, true);
  const bad = mergeBranches([{ agente: "qa", saida: { decisao: "aprovar" }, schema }, { agente: "seguranca", saida: { decisao: "aprovar", shell: "rm" }, schema }]);
  assert.equal(bad.ok, false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AGENT_REGISTRY, agentsIn, agentsInPlace, type AgentEntry, type AgentPlace } from "../src/index.ts";

const ALL: AgentPlace[] = ["list", "pills", "mood", "presence", "status", "mascot"];

test("agente falso aparece em todos os lugares e some de todos ao remover", () => {
  const fake: AgentEntry = { id: "teste", name: "Teste", description: "", tools: [], color: "#123456", accessory: "none", route: "/agente/teste", places: ALL };
  const withFake = [...AGENT_REGISTRY, fake];
  for (const place of ALL) assert.ok(agentsIn<string>(place, withFake).includes("teste"), place);
  const without = withFake.filter((a) => a.id !== "teste");
  for (const place of ALL) assert.equal(agentsIn<string>(place, without).includes("teste"), false, place);
});

test("o registro reproduz as listas que a interface usava", () => {
  assert.deepEqual(agentsInPlace("list"), ["correio", "codigo", "sentinela", "foco", "noticias", "mercado", "marketing", "entregas"]);
  assert.deepEqual(agentsInPlace("presence"), ["dot", "correio", "codigo", "sentinela", "noticias", "mercado", "marketing", "entregas"]);
  assert.deepEqual(agentsInPlace("pills"), ["correio", "codigo", "sentinela", "noticias", "mercado", "marketing", "entregas"]);
  assert.deepEqual(agentsInPlace("status"), agentsInPlace("presence"));
  for (const a of AGENT_REGISTRY) assert.match(a.color, /^#[0-9A-F]{6}$/i, a.id);
});

test("nenhuma tela mantém lista de agentes à mão", () => {
  const files = ["apps/web/src/App.tsx", "apps/web/src/views/MyDay.tsx", "apps/web/src/views/Home.tsx", "apps/web/src/views/Mascot.tsx", "apps/worker/src/app.ts"];
  for (const f of files) {
    const text = readFileSync(new URL(`../../../${f}`, import.meta.url), "utf8");
    assert.equal(/\[\s*"(dot|correio)",\s*"(correio|codigo)",/.test(text), false, `${f} ainda tem uma lista de agentes escrita à mão`);
  }
});

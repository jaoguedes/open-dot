// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCatalog } from "../src/orchestrator/catalog.ts";
import { DetectionSnapshotSchema, emptySnapshot, parseClaudeAuthStatus, parseCodexLoginStatus, parseGeminiProbe, parseVersion, ToolSnapshotSchema } from "../src/orchestrator/detection.ts";

const fx = (n: string) => readFileSync(new URL(`./fixtures/orquestrador/${n}`, import.meta.url), "utf8");

test("catálogo versionado é válido: fato conhecido tem fonte e data, desconhecido é null", () => {
  const c = parseCatalog(JSON.parse(readFileSync(new URL("../../../orchestrator/catalog/ferramentas.json", import.meta.url), "utf8")));
  assert.deepEqual(c.ferramentas.map((f) => f.id).sort(), ["claude-code", "codex", "cursor", "gemini", "ollama", "opencode"]);
  assert.equal(c.ferramentas.find((f) => f.id === "gemini")!.modos.somenteLeitura.valor, false);
  const bad = structuredClone(c) as any;
  bad.ferramentas[0].janelaDeContexto = { valor: 200000, fonte: null, data: null };
  assert.throws(() => parseCatalog(bad));
  const opinion = structuredClone(c) as any;
  opinion.ferramentas[0].qualidade = "ótima";
  assert.throws(() => parseCatalog(opinion));
});

test("versão é extraída sem confiar no resto do texto", () => {
  assert.equal(parseVersion("2.1.296 (Claude Code)"), "2.1.296");
  assert.equal(parseVersion("codex-cli 0.40.0"), "0.40.0");
  assert.equal(parseVersion("sem versão"), null);
});

test("claude auth status: assinatura, sem login e chave de API possivelmente paga", () => {
  assert.deepEqual(parseClaudeAuthStatus(fx("claude-sem-login.json"), 1), { loggedIn: false, authMethod: "none", possiblyPaid: false });
  assert.deepEqual(parseClaudeAuthStatus(fx("claude-assinatura.json"), 0), { loggedIn: true, authMethod: "claude.ai", possiblyPaid: false });
  assert.deepEqual(parseClaudeAuthStatus(fx("claude-chave-api.json"), 0), { loggedIn: true, authMethod: "api_key", possiblyPaid: true });
  assert.equal(parseClaudeAuthStatus(fx("claude-assinatura.json"), 1).loggedIn, false, "código de saída manda");
  assert.equal(parseClaudeAuthStatus("não é json", 0).loggedIn, null);
  assert.equal(parseClaudeAuthStatus('{"loggedIn":true,"authMethod":"novo_metodo"}', 0).authMethod, "unknown");
});

test("codex login status e sonda do Gemini falham fechadas fora do formato esperado", () => {
  assert.equal(parseCodexLoginStatus("Logged in using ChatGPT", 0).authMethod, "chatgpt");
  assert.equal(parseCodexLoginStatus("Logged in using an API key - sk-***", 0).possiblyPaid, true);
  assert.equal(parseCodexLoginStatus("Not logged in", 1).loggedIn, false);
  assert.equal(parseCodexLoginStatus("algo novo", 0).loggedIn, null);
  assert.equal(parseGeminiProbe(fx("gemini-ok.json"), 0).loggedIn, true);
  assert.equal(parseGeminiProbe(fx("gemini-sem-login.json"), 1).loggedIn, false);
  assert.equal(parseGeminiProbe("lixo", 1).loggedIn, null);
});

test("snapshot não aceita segredo, e-mail, campo extra nem estado contraditório", () => {
  const ok = { version: 1, observedAt: 1, tools: [emptySnapshot("gemini", "CLI não instalado")] };
  assert.equal(DetectionSnapshotSchema.safeParse(ok).success, true);
  for (const reason of ["token=abc", "sk-proj-abcdefghijklmnop", "conta pessoa@example.com", "Bearer abc", "x".repeat(45)])
    assert.equal(ToolSnapshotSchema.safeParse({ ...emptySnapshot("codex", "x"), reason }).success, false, reason);
  assert.equal(ToolSnapshotSchema.safeParse({ ...emptySnapshot("codex", "x"), apiKey: "x" }).success, false);
  assert.equal(DetectionSnapshotSchema.safeParse({ ...ok, tools: [{ ...emptySnapshot("codex", "x"), executable: true }] }).success, false);
  assert.equal(DetectionSnapshotSchema.safeParse({ ...ok, tools: [{ ...emptySnapshot("codex", "x"), installed: true, loggedIn: true, authMethod: "api_key", possiblyPaid: false }] }).success, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { initialAbsorption, reduceAbsorption, type AbsorptionEvent } from "../src/absorption.ts";

const run = (events: AbsorptionEvent[]) => events.reduce(reduceAbsorption, initialAbsorption);
const file = { type: "select", fileName: "notas.md", bytes: 1200, mime: "text/markdown" } as const;

test("receber o arquivo não é comemorar organização", () => {
  const s = run([file, { type: "upload_started" }, { type: "persisted", uploadId: "u1" }]);
  assert.equal(s.phase, "received");
  assert.equal(s.label, "Arquivo recebido");
  assert.equal(s.celebrate, false);
});

test("só comemora quando o job conclui de verdade", () => {
  const s = run([file, { type: "upload_started" }, { type: "persisted", uploadId: "u1" }, { type: "job_started", jobId: "j1" }, { type: "job_succeeded", jobId: "j1" }]);
  assert.equal(s.phase, "organized");
  assert.equal(s.celebrate, true);
});

test("conclusão de outro job não conclui este", () => {
  const s = run([file, { type: "upload_started" }, { type: "persisted", uploadId: "u1" }, { type: "job_started", jobId: "j1" }, { type: "job_succeeded", jobId: "OUTRO" }]);
  assert.equal(s.phase, "processing");
});

test("persistência não pode ser pulada direto para organizado", () => {
  const s = run([file, { type: "upload_started" }, { type: "job_succeeded", jobId: "j1" }]);
  assert.equal(s.phase, "uploading");
});

test("progresso só aparece quando mensurável", () => {
  const s1 = run([file, { type: "upload_started" }, { type: "upload_progress", loaded: 10, total: null }]);
  assert.equal(s1.progress, null);
  const s2 = run([file, { type: "upload_started" }, { type: "upload_progress", loaded: 50, total: 100 }]);
  assert.equal(s2.progress, 0.5);
});

test("falha mostra mensagem específica e não repete animação de absorção", () => {
  const s = run([file, { type: "upload_started" }, { type: "persisted", uploadId: "u1" }, { type: "job_started", jobId: "j1" }, { type: "failed", reason: "PDF escaneado sem texto" }]);
  assert.equal(s.phase, "failed");
  assert.match(s.label, /Não consegui processar este arquivo: PDF escaneado/);
  assert.equal(s.playAbsorbAnimation, false);
});

test("tipo ou tamanho inválido falha antes de absorver", () => {
  const big = reduceAbsorption(initialAbsorption, { type: "select", fileName: "a.pdf", bytes: 6 * 1024 * 1024, mime: "application/pdf" });
  assert.equal(big.phase, "failed");
  const exe = reduceAbsorption(initialAbsorption, { type: "select", fileName: "a.exe", bytes: 10, mime: "application/octet-stream" });
  assert.equal(exe.phase, "failed");
  assert.equal(exe.playAbsorbAnimation, false);
});

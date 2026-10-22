// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { approvable, fileDiffs, lineDiff, parseProposal, sha256Utf8, totals } from "../src/approval-view.ts";

const proposal = (content: string) => JSON.stringify({ summary: "corrige o token", files: [{ path: "src/auth.ts", content, beforeHash: "abc", beforeContent: "a\nb\nc" }, { path: "test/auth.test.ts", content: "x\ny", beforeHash: null }] });
const ok = { pending: true, expired: false, runnerOnline: true };

test("diff por linhas com contagem de + e −", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nB\nc\nd").map((l) => l.kind + l.text), [" a", "-b", "+B", " c", "+d"]);
  const d = fileDiffs(parseProposal(proposal("a\nB\nc"))!);
  assert.deepEqual(totals(d), { arquivos: 2, adicionadas: 3, removidas: 1 });
  assert.equal(d[1]!.novo, true);
});

test("hash exibido é o do conteúdo mostrado; mudar o diff muda o hash e desabilita Aprovar", async () => {
  const raw = proposal("a\nB\nc");
  const hash = await sha256Utf8(raw);
  const s = await approvable(raw, hash, ok);
  assert.equal(s.hashExibido, hash);
  assert.equal(s.podeAprovar, true);
  const tampered = proposal("a\nB\nc\nrm -rf /");
  assert.notEqual(await sha256Utf8(tampered), hash, "outro diff, outro hash");
  const t = await approvable(tampered, hash, ok);
  assert.equal(t.podeAprovar, false);
  assert.match(t.motivo!, /não bate com o hash/);
  assert.notEqual(t.hashExibido, hash, "a tela mostra o hash do que está mostrando, nunca um valor decorativo");
});

test("Aprovar bloqueado se decidida, expirada, offline ou formato desconhecido", async () => {
  const raw = proposal("z");
  const h = await sha256Utf8(raw);
  assert.match((await approvable(raw, h, { ...ok, pending: false })).motivo!, /decidida/);
  assert.match((await approvable(raw, h, { ...ok, expired: true })).motivo!, /expirou/);
  assert.match((await approvable(raw, h, { ...ok, runnerOnline: false })).motivo!, /offline/);
  const weird = '{"files":"x"}';
  assert.match((await approvable(weird, await sha256Utf8(weird), ok)).motivo!, /Formato/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { VisualStateStore, STATE_COLORS, AGENT_COLORS, type VisualEvent } from "../src/visual.ts";
import { HeartEmitter } from "../src/effects.ts";

const ev = (p: Partial<VisualEvent> & Pick<VisualEvent, "eventId" | "state" | "revision">): VisualEvent => ({
  agentId: "correio",
  jobId: "job-1",
  happenedAt: 1000 + p.revision,
  ...p,
});

test("erro recente não é apagado por sucesso antigo que chega depois", () => {
  const s = new VisualStateStore();
  s.apply(ev({ eventId: "a", state: "working", revision: 1 }));
  s.apply(ev({ eventId: "b", state: "error", revision: 3, reason: "Gmail respondeu 500" }));
  const late = s.apply(ev({ eventId: "c", state: "success", revision: 2 }));
  assert.equal(late, false);
  const v = s.resolve("correio", 2000);
  assert.equal(v.semantic, "error");
  assert.equal(v.tint, STATE_COLORS.error);
  assert.equal(v.tintCoverage, "half");
  assert.equal(v.reason, "Gmail respondeu 500");
});

test("erro troca direto para vermelho, sem misturar com o azul do Correio", () => {
  const s = new VisualStateStore();
  s.apply(ev({ eventId: "a", state: "working", revision: 1 }));
  assert.equal(s.resolve("correio", 0).tint, AGENT_COLORS.correio);
  s.apply(ev({ eventId: "b", state: "error", revision: 2 }));
  assert.equal(s.resolve("correio", 0).tint, "#EB6470");
});

test("evento duplicado é ignorado", () => {
  const s = new VisualStateStore();
  assert.equal(s.apply(ev({ eventId: "x", state: "working", revision: 1 })), true);
  assert.equal(s.apply(ev({ eventId: "x", state: "working", revision: 5 })), false);
});

test("aprovação pendente vence execução de outro job do mesmo agente e suprime carinho", () => {
  const s = new VisualStateStore();
  s.apply(ev({ eventId: "1", jobId: "j1", state: "working", revision: 1 }));
  s.apply(ev({ eventId: "2", jobId: "j2", state: "waiting", revision: 1 }));
  const v = s.resolve("correio", 0);
  assert.equal(v.semantic, "waiting");
  assert.equal(v.allowCosmetic, false);
  const hearts = new HeartEmitter({ random: () => 0.5 });
  const r = hearts.emit(0, { allowCosmetic: v.allowCosmetic, reducedMotion: false });
  assert.deepEqual(r, { ok: false, reason: "suppressed" });
});

test("incidente em outro agente não pinta todos: ilha mostra o prioritário com o agente identificado", () => {
  const s = new VisualStateStore();
  s.apply({ eventId: "s1", agentId: "sentinela", jobId: "m1", revision: 1, happenedAt: 1, state: "error", reason: "site fora" });
  s.apply({ eventId: "c1", agentId: "correio", jobId: "e1", revision: 1, happenedAt: 2, state: "working" });
  assert.equal(s.resolve("correio", 10).semantic, "working");
  const d = s.dominant(["dot", "correio", "sentinela"], 10);
  assert.equal(d.agentId, "sentinela");
  assert.equal(d.semantic, "error");
});

test("sucesso é transitório e volta ao repouso", () => {
  const s = new VisualStateStore();
  s.apply(ev({ eventId: "a", state: "success", revision: 1, happenedAt: 1000 }));
  assert.equal(s.resolve("correio", 1500).semantic, "success");
  assert.equal(s.resolve("correio", 10_000).semantic, "idle");
});

test("erro só sai com resolução explícita (revisão maior)", () => {
  const s = new VisualStateStore();
  s.apply(ev({ eventId: "a", state: "error", revision: 1 }));
  s.apply(ev({ eventId: "b", state: "resolved", revision: 2 }));
  assert.equal(s.resolve("correio", 0).semantic, "idle");
});

test("três corações com durações diferentes: cancelar um não afeta os outros", () => {
  let i = 0;
  const seq = [0.1, 0.9, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  const h = new HeartEmitter({ random: () => seq[i++ % seq.length]! });
  const r = h.emit(0, { allowCosmetic: true, reducedMotion: false });
  assert.ok(r.ok);
  const created = r.ok ? r.created : [];
  assert.equal(created.length, 3);
  const durations = new Set(created.map((c) => c.durationMs));
  assert.ok(durations.size >= 2, "durações independentes");
  const before = h.frames(300).find((f) => f.id === created[2]!.id)!;
  assert.ok(h.cancel(created[0]!.id));
  const after = h.frames(300).find((f) => f.id === created[2]!.id)!;
  assert.deepEqual(after, before, "o terceiro coração segue no próprio relógio");
  assert.equal(h.aliveCount(300), 2);
  // Após o fim de todos, nada fica vivo (sem vazamento).
  assert.equal(h.aliveCount(5000), 0);
});

test("cooldown descarta repetições sem criar fila", () => {
  const h = new HeartEmitter({ random: () => 0.5 });
  assert.ok(h.emit(0, { allowCosmetic: true, reducedMotion: false }).ok);
  for (let t = 100; t < 2500; t += 100) assert.equal(h.emit(t, { allowCosmetic: true, reducedMotion: false }).ok, false);
  assert.ok(h.emit(2600, { allowCosmetic: true, reducedMotion: false }).ok);
  assert.ok(h.aliveCount(2600) <= 6);
});

test("movimento reduzido: no máximo um coração parado", () => {
  const h = new HeartEmitter({ random: () => 0.5 });
  const r = h.emit(0, { allowCosmetic: true, reducedMotion: true });
  assert.ok(r.ok && r.created.length === 1 && r.created[0]!.static && r.created[0]!.rise === 0);
});

test("ocultar a janela encerra efeitos e não reproduz histórico ao voltar", () => {
  const h = new HeartEmitter({ random: () => 0.5 });
  h.emit(0, { allowCosmetic: true, reducedMotion: false });
  h.setHidden(true);
  assert.equal(h.aliveCount(10), 0);
  assert.deepEqual(h.emit(3000, { allowCosmetic: true, reducedMotion: false }), { ok: false, reason: "hidden" });
  h.setHidden(false);
  assert.equal(h.frames(3100).length, 0);
});

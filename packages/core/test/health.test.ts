// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_MOOD, healthMood, type MoodState } from "../src/health.ts";

const at = (cpu: number, s: number, extra = {}) => ({ cpu, memory: 40, atMs: s * 1000, ...extra });
function run(samples: Array<ReturnType<typeof at>>) {
  let st: MoodState = INITIAL_MOOD;
  return samples.map((x) => {
    const r = healthMood(st, x);
    st = r.state;
    return r;
  });
}

test("sem amostra ou máquina tranquila: Dot sem reação e sem motivo", () => {
  assert.deepEqual(healthMood(INITIAL_MOOD, null), { state: INITIAL_MOOD, heat: 0, strain: 0, reason: null });
  assert.equal(run([at(20, 0)])[0]!.reason, null);
});

test("calor só depois de 30 s; pânico depois de 20 s acima de 92%, com motivo em texto", () => {
  const r = run([at(80, 0), at(80, 10), at(80, 31), at(95, 40), at(95, 61)]);
  assert.equal(r[1]!.heat, 0, "pico curto não reage");
  assert.ok(r[2]!.heat >= 0.6 && r[2]!.strain === 0);
  assert.match(r[2]!.reason!, /^CPU 80% há 0 s$/);
  assert.equal(r[3]!.strain, 0, "pânico também espera");
  assert.ok(r[4]!.strain >= 0.7);
  assert.match(r[4]!.reason!, /^CPU 95%/);
});

test("histerese: oscilar em volta do limite não liga e desliga a reação", () => {
  const samples = [at(80, 0), at(80, 31)];
  for (let i = 0; i < 120; i++) samples.push(at(i % 2 ? 74 : 76, 32 + i));
  const levels = run(samples).map((x) => x.state.level);
  assert.equal(levels.filter((l, i) => i && l !== levels[i - 1]).length, 1, "só a subida inicial");
  const cool = run([at(80, 0), at(80, 31), at(50, 40), at(50, 60), at(50, 71)]);
  assert.equal(cool.at(-1)!.state.level, "tranquilo", "esfria depois de 30 s abaixo de limite − margem");
});

test("limitação térmica do sistema leva ao pânico na hora; memória alta dá calor com motivo de memória", () => {
  const t = run([at(40, 0, { cpuSpeedLimit: 70 })])[0]!;
  assert.equal(t.state.level, "panico");
  assert.match(t.reason!, /limitando a CPU a 70%/);
  const m = run([{ cpu: 30, memory: 92, atMs: 0 }, { cpu: 30, memory: 92, atMs: 31_000 }]).at(-1)!;
  assert.match(m.reason!, /^Memória 92%/);
});

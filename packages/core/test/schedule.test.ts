// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { planDue, slotsBetween, zonedTimeToUtc, nextSlot, type RoutineSpec } from "../src/schedule.ts";

const spec: RoutineSpec = { routineId: "email", ownerId: "o1", times: ["08:00", "17:00"], timeZone: "America/Sao_Paulo" };

test("08h em São Paulo é 11h UTC (sem horário de verão desde 2019)", () => {
  assert.equal(new Date(zonedTimeToUtc({ year: 2026, month: 10, day: 13 }, "08:00", "America/Sao_Paulo")).toISOString(), "2026-10-13T11:00:00.000Z");
  assert.equal(new Date(zonedTimeToUtc({ year: 2026, month: 1, day: 15 }, "17:00", "America/Sao_Paulo")).toISOString(), "2026-01-15T20:00:00.000Z");
});

test("fuso com horário de verão: 02:30 inexistente avança; mudança de offset respeitada", () => {
  // Nova York, 08/03/2026: 02:00 → 03:00
  const gap = zonedTimeToUtc({ year: 2026, month: 3, day: 8 }, "02:30", "America/New_York");
  assert.ok(Number.isFinite(gap));
  assert.equal(new Date(zonedTimeToUtc({ year: 2026, month: 3, day: 9 }, "08:00", "America/New_York")).toISOString(), "2026-03-09T12:00:00.000Z");
  assert.equal(new Date(zonedTimeToUtc({ year: 2026, month: 3, day: 6 }, "08:00", "America/New_York")).toISOString(), "2026-03-06T13:00:00.000Z");
});

test("chave única por dono+rotina+slot: cron repetido não cria segunda revisão", () => {
  const t0 = Date.parse("2026-10-13T10:58:00Z");
  const a = planDue(spec, t0, Date.parse("2026-10-13T11:02:00Z"));
  const b = planDue(spec, t0, Date.parse("2026-10-13T11:03:00Z"));
  assert.equal(a.create.length, 1);
  assert.equal(a.create[0]!.key, b.create[0]!.key);
  assert.equal(a.create[0]!.key, "o1:email:2026-10-13T08:00");
});

test("após dois dias offline gera um único digest atrasado, sem avalanche", () => {
  const last = Date.parse("2026-10-11T12:00:00Z");
  const now = Date.parse("2026-10-13T15:00:00Z");
  const plan = planDue(spec, last, now);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0]!.late, true);
  assert.equal(plan.create[0]!.localDate, "2026-10-13");
  assert.equal(plan.create[0]!.localTime, "08:00");
  assert.equal(plan.skipped, slotsBetween(spec, last, now).length - 1);
});

test("dias da semana e próximo horário", () => {
  const weekdays: RoutineSpec = { ...spec, weekdays: [1, 2, 3, 4, 5] };
  // sábado 17/10/2026 → próximo é segunda 19/10 08:00
  const n = nextSlot(weekdays, Date.parse("2026-10-17T12:00:00Z"));
  assert.equal(n?.localDate, "2026-10-19");
  assert.equal(n?.localTime, "08:00");
});

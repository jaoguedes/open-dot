import assert from "node:assert/strict";
import test from "node:test";
import { approvalQueue, queuePosition } from "../src/index.ts";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const item = (id: string, minute: number, o: Partial<{ status: string; payloadHash: string; expiresAt: string }> = {}) => ({
  id,
  status: "pending",
  payloadHash: `h-${id}`,
  createdAt: `2026-10-15T11:${String(minute).padStart(2, "0")}:00Z`,
  expiresAt: "2026-10-16T00:00:00Z",
  ...o,
});

test("ordem de chegada, não a ordem da lista do servidor", () => {
  const q = approvalQueue([item("c", 30), item("a", 10), item("b", 20)], NOW);
  assert.deepEqual(
    q.visible.map((x) => x.id),
    ["a", "b", "c"],
  );
  assert.equal(queuePosition(q, "b")?.label, "2 de 3");
  assert.equal(queuePosition(q, "b")?.next, "c");
});

test("no máximo 5 visíveis; o resto vira mais N", () => {
  const q = approvalQueue(
    Array.from({ length: 8 }, (_, i) => item(`x${i}`, i)),
    NOW,
  );
  assert.equal(q.visible.length, 5);
  assert.equal(q.more, 3);
  assert.equal(q.total, 8);
});

test("mesma proposta pedida duas vezes aparece uma vez", () => {
  const q = approvalQueue([item("a", 1, { payloadHash: "igual" }), item("b", 2, { payloadHash: "igual" }), item("c", 3)], NOW);
  assert.deepEqual(
    q.visible.map((x) => x.id),
    ["a", "c"],
  );
});

test("vencidas e já decididas saem da fila", () => {
  const q = approvalQueue([item("a", 1, { expiresAt: "2026-10-15T11:59:59Z" }), item("b", 2, { status: "approved" }), item("c", 3)], NOW);
  assert.deepEqual(
    q.visible.map((x) => x.id),
    ["c"],
  );
  assert.equal(queuePosition(q, "a"), null);
});

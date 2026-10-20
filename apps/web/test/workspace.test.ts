import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkspace } from "../src/workspace-notes.ts";
test("notas corrompidas não quebram o Workspace", () => {
  assert.deepEqual(parseWorkspace("{broken"), { project: "", tasks: [] });
  assert.deepEqual(parseWorkspace('{"project":null,"tasks":[null,{}, {"id":"a","text":"ok","done":false}]}'), { project: "", tasks: [{ id: "a", text: "ok", done: false }] });
});
test("limites das notas são aplicados também ao restaurar armazenamento", () => {
  const parsed = parseWorkspace(JSON.stringify({ project: "a".repeat(5000), tasks: Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: "b".repeat(500), done: true })) }));
  assert.equal(parsed.project.length, 4000);
  assert.equal(parsed.tasks.length, 50);
  assert.equal(parsed.tasks[0]!.text.length, 300);
});

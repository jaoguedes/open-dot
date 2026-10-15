import assert from "node:assert/strict";
import test from "node:test";
import { islandReason } from "../src/presence.ts";

test("código do status vira frase humana na ilha", () => {
  const t = islandReason("not_connected");
  assert.ok(t && !t.includes("not_connected"), String(t));
  assert.equal(islandReason("Reconecte o Gmail"), "Reconecte o Gmail");
  assert.equal(islandReason(null), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDevVars } from "../scripts/lib/dev-vars.ts";

test("parseDevVars lê nomes sem exigir aspas e ignora comentários", () => {
  const vars = parseDevVars("# segredo\nFOO=um\nBAR=\"dois\"\n\nBAZ='três'\n");
  assert.equal(vars.FOO, "um");
  assert.equal(vars.BAR, "dois");
  assert.equal(vars.BAZ, "três");
  assert.equal(vars.TOKEN_KEYS, undefined);
});

// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { client, makeCtx } from "./harness.ts";

test("contato público: ambiente por padrão, valor do app quando salvo, e-mail ou link https", async () => {
  const ctx = await makeCtx({ env: { CONTACT_EMAIL: "dono@example.com" } });
  const anon = client(ctx);
  assert.deepEqual((await anon.call("GET", "/api/legal")).json, { contact: "dono@example.com", contactKind: "email" });
  assert.equal((await anon.call("PUT", "/api/settings/contact", { value: "x@y.test" })).status, 401);
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const before = await c.call("GET", "/api/settings/contact");
  assert.equal(before.json.source, "ambiente");
  assert.equal((await c.call("PUT", "/api/settings/contact", { value: "javascript:alert(1)" })).status, 400);
  assert.equal((await c.call("PUT", "/api/settings/contact", { value: "http://inseguro.test" })).status, 400);
  assert.equal((await c.call("PUT", "/api/settings/contact", { value: "https://github.com/exemplo/open-dot/issues" })).status, 200);
  assert.deepEqual((await anon.call("GET", "/api/legal")).json, { contact: "https://github.com/exemplo/open-dot/issues", contactKind: "url" });
  assert.equal((await c.call("PUT", "/api/settings/contact", { value: "contato@exemplo.test" })).status, 200);
  assert.deepEqual((await anon.call("GET", "/api/legal")).json, { contact: "contato@exemplo.test", contactKind: "email" });
  assert.equal((await c.call("PUT", "/api/settings/contact", { value: "" })).status, 200);
  assert.deepEqual((await anon.call("GET", "/api/legal")).json, { contact: "dono@example.com", contactKind: "email" });
});

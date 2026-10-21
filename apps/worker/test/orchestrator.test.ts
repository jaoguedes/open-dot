// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, client } from "./harness.ts";
import { sha256Hex } from "@open-dot/core";
import { randomToken } from "../src/crypto.ts";
import { emptySnapshot } from "@open-dot/core/orchestrator/detection.ts";

async function paired() {
  const ctx = await makeCtx();
  const web = client(ctx);
  const native = client(ctx);
  assert.equal((await web.call("POST", "/api/session/dev")).status, 200);
  const token = randomToken();
  const pairing = await native.call("POST", "/api/runner/pairings", { secretHash: await sha256Hex(randomToken()), tokenHash: await sha256Hex(token), name: "Mac de teste" });
  const approval = await web.call("POST", "/api/runner/pairings/approve", { code: pairing.json.code, name: "Mac de teste" });
  return { ctx, web, native, headers: { authorization: `Bearer ${token}` }, deviceId: approval.json.deviceId as string };
}

const snapshot = (now: number, tools = [{ id: "claude-code", installed: true, version: "2.1.296", loggedIn: true, authMethod: "claude.ai", possiblyPaid: false, executable: false, reason: "Desligado até opt-in" }, emptySnapshot("gemini", "CLI não instalado")]) => ({ version: 1, observedAt: now, tools });

test("Runner autenticado envia snapshot de ferramentas; só o dono lê, com o catálogo", async () => {
  const s = await paired();
  assert.equal((await s.native.call("POST", "/api/runner/device/tools", snapshot(s.ctx.now()))).status, 401, "sem token de dispositivo");
  assert.equal((await s.native.call("POST", "/api/runner/device/tools", snapshot(s.ctx.now()), s.headers)).status, 200);
  const r = await s.web.call("GET", "/api/orchestrator/tools");
  assert.equal(r.status, 200);
  assert.equal(r.json.devices.length, 1);
  assert.equal(r.json.devices[0].snapshot.tools[0].authMethod, "claude.ai");
  assert.ok(r.json.catalog.ferramentas.some((f: { id: string }) => f.id === "codex"));
  assert.equal((await client(s.ctx).call("GET", "/api/orchestrator/tools")).status, 401);
  s.ctx.db.raw.close();
});

test("snapshot com segredo, campo extra, estado contraditório ou mais antigo é recusado ou ignorado", async () => {
  const s = await paired();
  const now = s.ctx.now();
  const bad = [
    snapshot(now, [{ ...emptySnapshot("codex", "token=abc123") }]),
    snapshot(now, [{ ...emptySnapshot("codex", "x"), cookie: "x" } as never]),
    snapshot(now, [{ ...emptySnapshot("codex", "x"), executable: true }]),
    snapshot(now + 3_600_000),
  ];
  for (const b of bad) assert.equal((await s.native.call("POST", "/api/runner/device/tools", b, s.headers)).status, 400);
  assert.equal((await s.native.call("POST", "/api/runner/device/tools", snapshot(now), s.headers)).status, 200);
  await s.native.call("POST", "/api/runner/device/tools", snapshot(now - 1000, [emptySnapshot("codex", "antigo")]), s.headers);
  const r = await s.web.call("GET", "/api/orchestrator/tools");
  assert.equal(r.json.devices[0].snapshot.tools[0].id, "claude-code", "snapshot antigo não sobrescreve o novo");
  s.ctx.db.raw.close();
});

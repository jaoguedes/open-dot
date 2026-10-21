// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { hashProposal } from "@open-dot/core";
import { client, makeCtx } from "./harness.ts";
import * as repo from "../src/repo.ts";

async function setup() {
  const ctx = await makeCtx();
  const c = client(ctx);
  await c.call("POST", "/api/session/dev");
  const ownerId = (await ctx.db.query<{ id: string }>("SELECT id FROM od_owners"))[0]!.id;
  const proposal = { action: "gmail.send", service: "gmail", account: "dev@localhost", resource: "t1", payload: { to: "a@b.example", subject: "Re", body: "oi" }, consequence: "teste" };
  const hash = await hashProposal(proposal);
  const id = await repo.createApproval(ctx.db, ctx.keys, { ownerId, action: "gmail.send", proposal, payloadHash: hash, now: ctx.now() });
  return { ctx, c, id, proposal, hash };
}

test("conflito porque o conteúdo mudou diz para aprovar de novo", async () => {
  const { c, id, proposal, hash } = await setup();
  const ed = await c.call("POST", `/api/approvals/${id}/edit`, { expectedVersion: 1, proposal: { ...proposal, payload: { ...proposal.payload, body: "outro texto" } } });
  assert.equal(ed.status, 200);
  const dec = await c.call("POST", `/api/approvals/${id}/decision`, { decision: "approve", expectedVersion: 1, payloadHash: hash });
  assert.equal(dec.status, 409);
  assert.equal(dec.json.result, "conflict");
  assert.equal(dec.json.cause, "changed");
  assert.equal(dec.json.error.message, "O conteúdo mudou. Aprove de novo.");
});

test("conflito porque já foi decidido diz isso", async () => {
  const { c, id, hash } = await setup();
  assert.equal((await c.call("POST", `/api/approvals/${id}/decision`, { decision: "reject", expectedVersion: 1, payloadHash: hash })).status, 200);
  const again = await c.call("POST", `/api/approvals/${id}/decision`, { decision: "approve", expectedVersion: 1, payloadHash: hash });
  assert.equal(again.status, 409);
  assert.equal(again.json.cause, "decided");
  assert.equal(again.json.error.message, "Esta aprovação já foi decidida.");
});

test("editar uma aprovação já decidida também explica a causa", async () => {
  const { c, id, proposal, hash } = await setup();
  await c.call("POST", `/api/approvals/${id}/decision`, { decision: "reject", expectedVersion: 1, payloadHash: hash });
  const ed = await c.call("POST", `/api/approvals/${id}/edit`, { expectedVersion: 2, proposal });
  assert.equal(ed.status, 409);
  assert.equal(ed.json.cause, "decided");
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { activeVersionId, parseDeploymentsJson, waitForSmoke } from "../scripts/lib/deploy-plan.mjs";

const NEW = "4d1dbc6e-b55d-475f-8e27-ec36659eb036";
const OLD = "da21bebf-d11a-4fdc-abad-c87022130c56";

test("o id ativo é o 100% mais recente, mesmo se não for o último da lista", () => {
  const list = [
    { created_on: "2026-10-15T17:20:44.377Z", versions: [{ version_id: NEW, percentage: 100 }] },
    { created_on: "2026-10-15T15:52:21.808Z", versions: [{ version_id: OLD, percentage: 100 }] },
    { created_on: "2026-10-15T17:21:00.000Z", versions: [{ version_id: "11111111-1111-1111-1111-111111111111", percentage: 50 }] },
  ];
  assert.equal(activeVersionId(list), NEW);
  assert.equal(activeVersionId([]), null);
  assert.equal(activeVersionId(null), null);
});

test("texto com uuid no final não vence o JSON", () => {
  const text = `log solto ${OLD}\n` + JSON.stringify([
    { created_on: "2026-10-15T10:00:00.000Z", versions: [{ version_id: OLD, percentage: 100 }] },
    { created_on: "2026-10-15T17:20:44.377Z", versions: [{ version_id: NEW, percentage: 100 }] },
  ]);
  assert.equal(activeVersionId(parseDeploymentsJson(text)), NEW);
  assert.equal(parseDeploymentsJson("sem json"), null);
});

test("fumaça repete até o hash bater e desiste aos 60 s", async () => {
  const body = Buffer.from("open-dot-smoke");
  const appHash = createHash("sha256").update(body).digest("hex").slice(0, 12);
  let t = 0;
  let hits = 0;
  const fetchImpl = async (url: string) => {
    const healthOk = url.endsWith("/api/health") ? ++hits >= 3 : true;
    return {
      status: url.endsWith("/inexistente") ? 404 : 200,
      headers: { get: () => "text/plain" },
      json: async () => (url.endsWith("/api/health") ? { ok: healthOk } : { app: appHash, worker: NEW }),
      text: async () => `cache ${appHash}`,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    };
  };
  const got = await waitForSmoke({
    origin: "https://exemplo.invalid",
    appHash,
    timeoutMs: 60_000,
    fetchImpl,
    now: () => t,
    sleep: async () => {
      t += 2000;
    },
  });
  assert.equal(got?.ok, true);
  assert.equal(got?.app, appHash);
  assert.ok(hits >= 3);
  assert.ok(t < 60_000);

  t = 0;
  const stalled = await waitForSmoke({
    origin: "https://exemplo.invalid",
    appHash,
    timeoutMs: 60_000,
    fetchImpl: async () => {
      throw new Error("ainda não");
    },
    now: () => t,
    sleep: async () => {
      t += 60_000;
    },
  });
  assert.equal(stalled, null);
  assert.ok(t >= 60_000);
});

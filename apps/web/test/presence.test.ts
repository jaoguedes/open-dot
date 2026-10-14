import { test } from "node:test";
import assert from "node:assert/strict";
import { toVisual } from "@open-dot/core";
import type { FeedEntry, Monitor } from "../src/api.ts";
import { agentPresence } from "../src/presence.ts";

function entry(partial: Partial<FeedEntry> & Pick<FeedEntry, "agentId" | "kind">): FeedEntry {
  return {
    id: partial.id ?? "x",
    runId: null,
    title: partial.title ?? "",
    freshness: "fresh",
    createdAt: "2026-10-14T11:00:00.000Z",
    coverage: null,
    body: partial.body ?? {},
    ...partial,
  };
}

test("presença: uma fonte da verdade, incidente nunca é 'Em repouso'", () => {
  const digest = entry({
    agentId: "correio",
    kind: "email_digest",
    body: { counts: { important: 3, review: 2, low: 15 }, total: 20 },
  });
  const mail = agentPresence("correio", toVisual("correio", "success"), [digest], []);
  assert.equal(mail.tone, "need");
  assert.equal(mail.label, "3 pedem você");
  assert.equal(mail.dotClass, "need");

  const fail = entry({ agentId: "codigo", kind: "ci_failure", title: "Workflow falhou" });
  const code = agentPresence("codigo", toVisual("codigo", "idle"), [fail], []);
  assert.equal(code.tone, "error");
  assert.equal(code.label, "1 incidente");
  assert.equal(code.dotClass, "err");
  assert.notEqual(code.label, "Em repouso");

  const site = entry({ agentId: "sentinela", kind: "site_incident", title: "Lento" });
  const monitors: Monitor[] = [
    { id: "m1", url: "https://exemplo.com", label: "exemplo.com", enabled: true, incident: { open: false }, lastCheckAt: null },
  ];
  const sent = agentPresence("sentinela", toVisual("sentinela", "idle"), [site], monitors);
  assert.equal(sent.tone, "error");
  assert.equal(sent.label, "1 incidente");

  const work = agentPresence("foco", toVisual("foco", "working"), [], []);
  assert.equal(work.tone, "working");
  assert.equal(work.dotClass, "busy");

  const rest = agentPresence("foco", toVisual("foco", "idle"), [], []);
  assert.equal(rest.tone, "idle");
  assert.equal(rest.label, "Em repouso");
  assert.equal(rest.dotClass, "");
});

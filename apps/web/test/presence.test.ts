import { test } from "node:test";
import assert from "node:assert/strict";
import { toVisual } from "@open-dot/core";
import type { FeedEntry, Monitor } from "../src/api.ts";
import { agentPresence, islandLine, semanticFromItems, sortAgents } from "../src/presence.ts";
import { demoSnapshot } from "../src/demo.ts";

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
  assert.equal(code.label, "1 build falhou");
  assert.equal(code.dotClass, "err");
  assert.notEqual(code.label, "Em repouso");
  assert.notEqual(code.label, "1 incidente");

  const site = entry({ agentId: "sentinela", kind: "site_incident", title: "Lento" });
  const monitors: Monitor[] = [{ id: "m1", url: "https://example.com", label: "example.com", enabled: true, incident: { open: true, kind: "slow" }, lastCheckAt: null }];
  const sent = agentPresence("sentinela", toVisual("sentinela", "idle"), [site], monitors);
  assert.equal(sent.tone, "error");
  assert.equal(sent.label, "Lento");

  const work = agentPresence("foco", toVisual("foco", "working"), [], []);
  assert.equal(work.tone, "working");
  assert.equal(work.dotClass, "busy");

  const rest = agentPresence("foco", toVisual("foco", "idle"), [], []);
  assert.equal(rest.tone, "idle");
  assert.equal(rest.label, "Em repouso");
  assert.equal(rest.dotClass, "");

  const off = agentPresence("correio", toVisual("correio", "idle"), [], [], { connected: false });
  assert.equal(off.label, "Não conectado");
  assert.equal(off.tone, "off");
  const ordered = ["foco", "correio"] as const;
  const sorted = sortAgents(ordered, (id) => agentPresence(id, toVisual(id, "idle"), id === "correio" ? [digest] : [], [], { connected: true }));
  assert.deepEqual(sorted, ["correio", "foco"]);
});

test("demo: status vem do tipo do item; ilha não diz concluído enquanto lê", () => {
  const snap = demoSnapshot();
  const lento = snap.monitors.find((m) => m.incident.open);
  assert.equal(lento?.incident.kind, "slow");
  assert.equal(semanticFromItems("codigo", snap.feed, snap.monitors), "error");
  assert.equal(semanticFromItems("correio", snap.feed, snap.monitors), "working");
  assert.equal(semanticFromItems("sentinela", snap.feed, snap.monitors), "error");
  const codigo = snap.status.find((s) => s.agentId === "codigo");
  assert.equal(codigo?.semantic, "error");
  assert.equal(agentPresence("codigo", codigo!, snap.feed, snap.monitors).label, "1 build falhou");
  const mail = snap.status.find((s) => s.agentId === "correio");
  assert.equal(islandLine(mail!), "Correio está lendo…");
  assert.notEqual(islandLine(toVisual("correio", "working")), "Correio concluído");
  assert.equal(islandLine(toVisual("correio", "success")), "Correio concluído");
});

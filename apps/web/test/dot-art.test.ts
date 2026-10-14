import { test } from "node:test";
import assert from "node:assert/strict";
import { DotEngine, type EyeShape } from "@open-dot/core";
import { EYE } from "../src/dot/art.ts";
import { accLayout } from "../src/dot/accessories.ts";

const SHAPES: EyeShape[] = ["open", "focused", "attentive", "big", "serious", "half", "happy", "closed", "gt", "lt", "angryL", "angryR", "spiralL", "spiralR"];

test("arte: cada forma de olho gera um path e os acessórios assentam no corpo", () => {
  for (const s of SHAPES) {
    const d = EYE[s]();
    assert.match(d, /^M/, s);
    assert.equal(d.includes("NaN"), false, s);
  }
  const e = new DotEngine({ seed: 1 });
  e.setAccessory("cap");
  e.step(0.016);
  const cap = accLayout(e.frame());
  assert.equal(cap.cap.on, 1);
  assert.match(cap.cap.crown, /^M/);
  assert.equal(cap.cap.crown.includes("NaN"), false);
  e.setAccessory("glasses");
  e.step(0.016);
  const g = accLayout(e.frame());
  assert.equal(g.glasses.on, 1);
  assert.match(g.glasses.bridge, /^M/);
  e.setAccessory("phones");
  e.step(0.016);
  const p = accLayout(e.frame());
  assert.equal(p.phones.on, 1);
  assert.equal(p.phones.cups.length, 2);
  e.setAccessory("ring");
  e.step(0.016);
  const r = accLayout(e.frame());
  assert.equal(r.ring.on, 1);
  assert.match(r.ring.back, /A/);
});

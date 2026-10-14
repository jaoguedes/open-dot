import { test } from "node:test";
import assert from "node:assert/strict";
import { DotEngine, type EyeShape } from "@open-dot/core";
import { EYE } from "../src/dot/art.ts";
import { CROWN_UNLOCKED, accLayout, hatCrown } from "../src/dot/accessories.ts";

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

  const c = hatCrown(0, 5, 13, 92, 5);
  assert.equal(c.d.includes("NaN"), false);
  assert.ok(c.L[0] < 130 && c.R[0] > 130);

  for (const kind of ["beanie", "bucket", "antenna", "visor", "beret", "crown"] as const) {
    e.setAccessory(kind);
    e.step(0.016);
    const h = accLayout(e.frame());
    if (kind === "beanie") {
      assert.equal(h.beanie.on, 1);
      assert.match(h.beanie.crown, /^M/);
      assert.equal(h.beanie.crown.includes("NaN"), false);
      assert.equal(h.beanie.ears.length, 2);
    }
    if (kind === "bucket") {
      assert.equal(h.bucket.on, 1);
      assert.match(h.bucket.crown, /^M/);
      assert.equal(h.bucket.ribs.includes("NaN"), false);
    }
    if (kind === "antenna") {
      assert.equal(h.antenna.on, 1);
      assert.match(h.antenna.stem, /^M/);
    }
    if (kind === "visor") {
      assert.equal(h.visor.on, 1);
      assert.match(h.visor.visor, /Z/);
    }
    if (kind === "beret") {
      assert.equal(h.beret.on, 1);
      assert.match(h.beret.dome, /^M/);
    }
    if (kind === "crown") {
      assert.equal(h.gold.on, 1);
      assert.match(h.gold.front, /^M/);
    }
  }
  assert.equal(CROWN_UNLOCKED, false);
});

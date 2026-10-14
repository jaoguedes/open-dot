import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribe, tickerBusy } from "../src/dot/ticker.ts";

test("ticker: aba oculta não avança inscritos e o rAF para", () => {
  const hidden = { v: false };
  const origDoc = globalThis.document;
  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;
  let rafId = 0;
  const queued = new Map<number, FrameRequestCallback>();

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { get hidden() { return hidden.v; }, addEventListener() {} },
  });
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafId += 1;
    queued.set(rafId, cb);
    return rafId;
  };
  globalThis.cancelAnimationFrame = (id: number) => { queued.delete(id); };

  const calls: number[] = [];
  const h = subscribe((dt) => { calls.push(dt); });
  assert.equal(tickerBusy(), true);
  const first = [...queued.entries()][0];
  assert.ok(first);
  queued.delete(first[0]);
  first[1](16);
  assert.equal(calls.length, 1);
  assert.equal(tickerBusy(), true);

  hidden.v = true;
  const second = [...queued.entries()][0];
  assert.ok(second);
  queued.delete(second[0]);
  second[1](32);
  assert.equal(calls.length, 1, "quadro com aba oculta não deve chamar o inscrito");
  assert.equal(tickerBusy(), false);

  h.stop();
  Object.defineProperty(globalThis, "document", { configurable: true, value: origDoc });
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCaf;
});

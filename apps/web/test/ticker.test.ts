// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import { test } from "node:test";
import assert from "node:assert/strict";
import { setMaxFps, setPaused, subscribe, tickerBusy } from "../src/dot/ticker.ts";

test("ticker: aba oculta não avança inscritos e o rAF para", () => {
  const hidden = { v: false };
  const origDoc = globalThis.document;
  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;
  let rafId = 0;
  const queued = new Map<number, FrameRequestCallback>();

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get hidden() {
        return hidden.v;
      },
      addEventListener() {},
    },
  });
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafId += 1;
    queued.set(rafId, cb);
    return rafId;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    queued.delete(id);
  };

  const calls: number[] = [];
  const h = subscribe((dt) => {
    calls.push(dt);
  });
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

test("ticker: pausa explícita para tudo e o teto de quadros espaça as chamadas (G2)", async () => {
  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;
  const queued = new Map<number, FrameRequestCallback>();
  let id = 0;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => (queued.set(++id, cb), id);
  globalThis.cancelAnimationFrame = (n: number) => void queued.delete(n);
  const run = () => {
    const e = [...queued.entries()][0];
    if (!e) return false;
    queued.delete(e[0]);
    e[1](performance.now());
    return true;
  };
  const calls: number[] = [];
  const h = subscribe((dt) => void calls.push(dt));
  setPaused(true);
  assert.equal(tickerBusy(), false, "pausado: nenhum quadro agendado");
  assert.equal(run(), false);
  setPaused(false);
  setMaxFps(10);
  assert.equal(run(), true);
  assert.equal(calls.length, 1);
  // Com teto de 10 qps o próximo quadro espera ~100 ms num timer, não no rAF.
  assert.equal(queued.size, 0);
  assert.equal(tickerBusy(), true);
  await new Promise((r) => setTimeout(r, 130));
  assert.equal(run(), true);
  assert.equal(calls.length, 2);
  setMaxFps(0);
  h.stop();
  assert.equal(tickerBusy(), false);
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCaf;
});

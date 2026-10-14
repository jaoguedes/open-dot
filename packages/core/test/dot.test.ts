import { test } from "node:test";
import assert from "node:assert/strict";
import { DotEngine, bodyPoints, superN, BLOCK_PLAY } from "../src/dot/index.ts";
import { VisualStateStore, SEMANTIC_PRIORITY } from "../src/visual.ts";
import type { ReactionName } from "../src/dot/types.ts";

const DT = 1 / 120;
const REACTIONS: ReactionName[] = ["oi", "success", "surprised", "love", "dizzy", "poke", "slap", "absorb"];

function walk(e: DotEngine, seconds: number): void {
  const n = Math.ceil(seconds / DT);
  for (let i = 0; i < n; i++) e.step(DT);
}

function nums(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number") out.push(v);
  else if (Array.isArray(v)) for (const x of v) nums(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) nums(x, out);
  return out;
}

test("nenhum NaN em 10 mil passos; as molas acomodam", () => {
  const e = new DotEngine({ seed: 7 });
  e.react("poke");
  for (let i = 0; i < 10_000; i++) {
    if (i === 2000) e.setState("working");
    if (i === 4000) e.setState("idle");
    if (i === 5000) e.react("oi");
    if (i === 8000) e.look(0.2, -0.1);
    e.step(DT);
    const f = e.frame();
    for (const n of nums(f)) assert.equal(Number.isFinite(n), true, `NaN no passo ${i}`);
  }
  walk(e, 4);
  const f = e.frame();
  assert.ok(Math.abs(f.sx - 1) < 0.05, `sx=${f.sx}`);
  assert.ok(Math.abs(f.sy - 1) < 0.05, `sy=${f.sy}`);
  assert.ok(Math.abs(f.rot) < 2, `rot=${f.rot}`);
});

test("toda reação volta à base; os bloqueios funcionam", () => {
  for (const name of REACTIONS) {
    const e = new DotEngine({ seed: 3 });
    assert.equal(e.react(name), "ok");
    walk(e, 5);
    const f = e.frame();
    assert.equal(f.reaction, null, name);
    assert.equal(f.state, "idle", name);
    assert.ok(Math.abs(f.m) < 0.08, `${name} m=${f.m}`);
    assert.ok(Math.abs(f.rot) < 3, `${name} rot=${f.rot}`);
  }
  const blocked = new DotEngine({ seed: 1 });
  for (const s of BLOCK_PLAY) {
    blocked.setState(s, true);
    assert.equal(blocked.react("love"), "bloqueado", s);
    assert.equal(blocked.react("dizzy"), "bloqueado", s);
  }
  blocked.setState("idle", true);
  assert.equal(blocked.react("love"), "ok");
});

test("a absorção devolve m = 0; o giro volta a 0", () => {
  const e = new DotEngine({ seed: 11 });
  e.react("absorb");
  walk(e, 1.2);
  assert.ok(e.frame().m > 0.3, "durante a absorção o corpo vira quadrado");
  walk(e, 4);
  const after = e.frame();
  assert.ok(Math.abs(after.m) < 0.05, `m final ${after.m}`);
  assert.equal(after.slotOpacity < 0.05, true);
  const s = new DotEngine({ seed: 12 });
  s.react("success");
  walk(s, 0.5);
  assert.ok(Math.abs(s.frame().yaw) > 0.5 || s.spinYaw !== 0 || s.frame().accSpinSc !== 1, "gira durante o concluído");
  walk(s, 3);
  assert.ok(Math.abs(s.frame().yaw) < 0.4, `yaw final ${s.frame().yaw}`);
  assert.equal(s.spinYaw, 0);
});

test("no máximo 18 partículas; movimento reduzido sem partículas", () => {
  const e = new DotEngine({ seed: 4 });
  e.setState("working");
  for (let i = 0; i < 40; i++) e.emit("square", 100, 80, {});
  assert.ok(e.particles.length <= 18);
  const rm = new DotEngine({ seed: 4, reducedMotion: true });
  rm.react("love");
  walk(rm, 2);
  assert.equal(rm.frame().particles.length, 0);
  assert.equal(rm.frame().reducedMotion, 1);
});

test("mesma semente = mesmos quadros", () => {
  const snap = (seed: number) => {
    const e = new DotEngine({ seed });
    e.react("love");
    const out: number[] = [];
    for (let i = 0; i < 360; i++) {
      e.step(DT);
      if (i % 40 === 0) {
        const f = e.frame();
        out.push(f.m, f.sx, f.sy, f.yaw, f.pitch, f.lift, f.particles.length, f.glow[0]!);
      }
    }
    return out;
  };
  assert.deepEqual(snap(42), snap(42));
  assert.notDeepEqual(snap(42), snap(43));
});

test("question no resolvedor fica abaixo de waiting e bloqueia carinho", () => {
  assert.ok(SEMANTIC_PRIORITY.question < SEMANTIC_PRIORITY.waiting);
  assert.ok(SEMANTIC_PRIORITY.question > SEMANTIC_PRIORITY.disconnected);
  const s = new VisualStateStore();
  s.apply({ eventId: "q", agentId: "dot", jobId: "j", revision: 1, happenedAt: 1, state: "question" });
  const v = s.resolve("dot", 10);
  assert.equal(v.semantic, "question");
  assert.equal(v.label, "Perguntando");
  assert.equal(v.allowCosmetic, false);
  s.apply({ eventId: "w", agentId: "dot", jobId: "j2", revision: 1, happenedAt: 2, state: "waiting" });
  assert.equal(s.resolve("dot", 10).semantic, "waiting");
});

test("superelipse: n 2,7 no normal e 4,5 na absorção; largura ≈ 1,3 × altura", () => {
  assert.equal(superN(0), 2.7);
  assert.equal(superN(1), 4.5);
  const pts = bodyPoints(0);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(w / h - 83 / 64) < 0.02);
});

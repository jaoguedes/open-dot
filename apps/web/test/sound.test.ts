// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { createSoundPlayer, SOUND_NAMES } from "../src/sound.ts";

class FakeAudio {
  static made: FakeAudio[] = [];
  volume = 1;
  currentTime = 0;
  paused = true;
  preload = "";
  plays = 0;
  constructor(readonly src: string) {
    FakeAudio.made.push(this);
  }
  load() {}
  play() {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

function player(hidden = false) {
  FakeAudio.made = [];
  let t = 1_000;
  const p = createSoundPlayer({ makeAudio: (src) => new FakeAudio(src), isHidden: () => hidden, now: () => t });
  return { p, tick: (ms: number) => (t += ms) };
}
const playsOf = (name: string) => FakeAudio.made.filter((a) => a.src.endsWith(`/${name}.mp3`)).reduce((n, a) => n + a.plays, 0);

test("desligado por padrão: nada toca", () => {
  const { p } = player();
  p.unlock();
  assert.equal(p.play("dot-done"), "off");
  assert.equal(playsOf("dot-done"), 0);
});

test("pré-carrega os 13 sons no primeiro gesto, uma vez só", () => {
  const { p } = player();
  p.unlock();
  p.unlock();
  assert.equal(SOUND_NAMES.length, 13);
  assert.equal(FakeAudio.made.length, 13);
  assert.ok(FakeAudio.made.every((a) => a.preload === "auto"));
});

test("com a aba oculta nada toca", () => {
  const { p } = player(true);
  p.unlock();
  p.setEnabled(true);
  assert.equal(p.play("dot-notify"), "hidden");
});

test("no máximo 2 sons por segundo", () => {
  const { p, tick } = player();
  p.unlock();
  p.setEnabled(true);
  assert.equal(p.play("dot-tap"), "played");
  tick(100);
  assert.equal(p.play("dot-pop"), "played");
  tick(100);
  assert.equal(p.play("dot-send"), "limit");
  tick(900);
  assert.equal(p.play("dot-send"), "played");
});

test("erro e atenção têm prioridade: cortam o som atual e passam do limite; os outros não cortam eles", () => {
  const { p, tick } = player();
  p.unlock();
  p.setEnabled(true);
  p.play("dot-tap");
  tick(10);
  p.play("dot-pop");
  tick(10);
  assert.equal(p.play("dot-error"), "played");
  const pop = FakeAudio.made.find((a) => a.src.endsWith("/dot-pop.mp3"))!;
  assert.equal(pop.paused, true);
  tick(1_100);
  assert.equal(p.play("dot-tap"), "blocked");
});

test("volume padrão 0,25 e limitado a 0,6", () => {
  const { p } = player();
  p.unlock();
  p.setEnabled(true);
  p.play("dot-done");
  assert.equal(FakeAudio.made.find((a) => a.src.endsWith("/dot-done.mp3"))!.volume, 0.25);
  p.setVolume(5);
  assert.equal(p.volume(), 0.6);
  p.setVolume(-1);
  assert.equal(p.volume(), 0);
});

test("Ouvir toca mesmo com os sons desligados, mas não com a aba oculta", () => {
  const { p } = player();
  p.unlock();
  assert.equal(p.preview("dot-love"), "played");
  const hidden = player(true).p;
  assert.equal(hidden.preview("dot-love"), "hidden");
});

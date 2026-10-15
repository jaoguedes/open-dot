import assert from "node:assert/strict";
import test from "node:test";
import { keyboardInset } from "../src/keyboard-inset.ts";

test("teclado aberto no iPhone sobe a caixa; barra de endereço e zoom não contam", () => {
  assert.equal(keyboardInset(844, 508, 0), 336);
  assert.equal(keyboardInset(844, 844, 0), 0);
  assert.equal(keyboardInset(844, 790, 0), 0); // barra do Safari mexendo: menos de 80 px
  assert.equal(keyboardInset(844, 508, 336), 0); // página rolada dentro do visualViewport
});

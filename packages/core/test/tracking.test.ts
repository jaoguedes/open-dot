import { test } from "node:test";
import assert from "node:assert/strict";
import { decideCarrier, detectCode, detectInText, displayNameFor, s10CheckDigit, shopLabel, trackingGate, upsCheckDigit } from "../src/tracking.ts";

test("S10 dos Correios: NN427247410BR fecha o dígito; o vizinho não", () => {
  assert.equal(s10CheckDigit("42724741"), 0);
  const ok = detectCode("NN427247410BR");
  assert.equal(ok[0]?.carrier, "correios");
  assert.equal(ok[0]?.checksum, "valid");
  assert.equal(ok[0]?.confidence, "high");
  assert.equal(decideCarrier(ok).kind, "match");

  const bad = detectCode("NN427247411BR");
  assert.equal(bad[0]?.checksum, "invalid");
  assert.equal(bad[0]?.confidence, "low");
  assert.equal(decideCarrier(bad).kind, "choose");
});

test("S10 de exemplo do tracking_number_data e país fora do Brasil", () => {
  assert.equal(detectCode("RB123456785GB")[0]?.checksum, "valid");
  assert.equal(detectCode("RB123456785GB")[0]?.carrier, "s10");
  assert.equal(detectCode("RB123456786US")[0]?.checksum, "invalid");
});

test("UPS 1Z com verificador válido e com verificador errado", () => {
  for (const code of ["1Z5R89390357567127", "1Z879E930346834440", "1Z410E7W0392751591"]) {
    assert.equal(upsCheckDigit(code), Number(code[17]), code);
    const hit = detectCode(code);
    assert.equal(hit[0]?.carrier, "ups");
    assert.equal(hit[0]?.checksum, "valid");
    assert.equal(decideCarrier(hit).kind, "match");
  }
  const bad = detectCode("1Z5R89390357567128");
  assert.equal(bad[0]?.checksum, "invalid");
  assert.notEqual(decideCarrier(bad).kind, "match");
  assert.equal(detectCode("1Z1111111111111111")[0]?.checksum, "invalid");
});

test("FedEx 96, USPS, Amazon e OnTrac têm formato próprio", () => {
  assert.equal(detectCode("9611020987654312345672")[0]?.carrier, "fedex");
  assert.equal(detectCode("TBA487064622000")[0]?.carrier, "amazon");
  assert.equal(detectCode("C11031500001879")[0]?.carrier, "ontrac");
  assert.equal(
    detectCode("9361289878700317633795").some((c) => c.carrier === "usps"),
    true,
  );
});

test("número só de dígitos no e-mail não vira encomenda; dois códigos altos seguem cada um", () => {
  assert.equal(detectInText("Pedido 123456789012 confirmado").length, 0);
  assert.equal(detectInText("Seu telefone 11987654321 e o CNPJ 12.345.678/0001-90").length, 0);
  const both = detectInText("UPS 1Z5R89390357567127 e Correios NN427247410BR");
  assert.equal(both.filter((c) => c.confidence === "high").length, 2);
  const hinted = detectInText("Rastreio FedEx 123456789012 a caminho");
  assert.equal(
    hinted.some((c) => c.carrier === "fedex"),
    true,
  );
});

test("ambíguo: FedEx e DHL no mesmo número pedem escolha", () => {
  const n = detectCode("1234567890");
  assert.ok(n.length >= 1);
  assert.equal(decideCarrier(n).kind, "choose");
  const mixed = detectCode("123456789012");
  assert.equal(decideCarrier(mixed).kind, "choose");
});

test("loja sem e-mail, telefone ou CNPJ", () => {
  assert.equal(shopLabel("Loja Exemplo <pedidos@loja.com>"), "Loja Exemplo");
  assert.equal(shopLabel("vendas@loja.com"), null);
  assert.equal(shopLabel("Loja 12.345.678/0001-90 <a@b.com>"), null);
});

test("provedor só liga com chave e confirmação de termos", () => {
  assert.equal(trackingGate({}).enabled, false);
  assert.equal(trackingGate({ PACOTEVICIO_API_KEY: "x" }).enabled, false);
  assert.equal(trackingGate({ PACOTEVICIO_TERMS_CONFIRMED: "true" }).enabled, false);
  assert.equal(trackingGate({ PACOTEVICIO_API_KEY: "x", PACOTEVICIO_TERMS_CONFIRMED: "true" }).enabled, true);
});

test("nome de exibição começa em João e respeita o que a pessoa gravou", () => {
  assert.equal(displayNameFor("guedes@example.com", "guedes", false, "João"), "João");
  assert.equal(displayNameFor("guedes@example.com", null, false), "");
  assert.equal(displayNameFor("alguem@example.com", "guedes", false, "Ana"), "Ana");
  assert.equal(displayNameFor("guedes@example.com", "Maria", true), "Maria");
  assert.equal(displayNameFor("dev@localhost", "Desenvolvimento local", false), "Desenvolvimento local");
});

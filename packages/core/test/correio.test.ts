import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCorreioResumo, correioForModel, resumoHasSecret } from "../src/correio.ts";
import type { EmailMeta } from "../src/email.ts";

function mail(partial: Partial<EmailMeta> & Pick<EmailMeta, "id" | "subject">): EmailMeta {
  return {
    threadId: partial.id,
    from: "Ana <ana@example.com>",
    to: "",
    snippet: "",
    receivedAt: "2026-10-15T10:00:00.000Z",
    labels: [],
    listUnsubscribe: false,
    precedenceBulk: false,
    ...partial,
  };
}

test("resumo: categorias, ordem e sem código de login", () => {
  const messages = [
    mail({ id: "n", subject: "Novidades da semana", listUnsubscribe: true, receivedAt: "2026-10-15T08:00:00.000Z" }),
    mail({ id: "c", subject: "Oi, tudo bem", snippet: "só passando", receivedAt: "2026-10-15T09:00:00.000Z" }),
    mail({ id: "p", subject: "Seu pedido foi postado", snippet: "Correios NN427247410BR", receivedAt: "2026-10-15T11:00:00.000Z" }),
    mail({ id: "f", subject: "Falha no pagamento", snippet: "cartão 4111111111111111 código 123456", receivedAt: "2026-10-15T12:00:00.000Z" }),
    mail({ id: "s", subject: "2FA desativado na sua conta", snippet: "a verificação em duas etapas foi desativada", receivedAt: "2026-10-15T13:00:00.000Z" }),
  ];
  const r = buildCorreioResumo(messages);
  assert.deepEqual(
    r.itens.map((i) => i.categoria),
    ["seguranca", "pagamento", "encomenda"],
  );
  assert.equal(r.abertura, "3 coisas pedem você.");
  assert.equal(r.ruido.contagem, 1);
  assert.deepEqual(r.sem_acao, ["c"]);
  assert.equal(resumoHasSecret(r), false);
  assert.ok(r.itens.every((i) => /^(Confira|Pague|Veja|Responda|Acompanhe|Abra|Guarde)/.test(i.o_que_fazer)));
  assert.match(r.itens[0]!.o_que_aconteceu, /verificação em duas etapas/i);
  assert.doesNotMatch(JSON.stringify(r), /4111|123456/);
  const model = correioForModel(messages[3]!);
  assert.doesNotMatch(model, /4111|123456|https?:/);
});

import { redactMail } from "../src/correio.ts";

test("redação tira código de login e cartão, mas mantém valor, CEP e número de pedido", () => {
  const t = redactMail("Pedido 883421 confirmado. Total R$ 1.234,56. Entrega no CEP 01310-100.");
  assert.match(t, /883421/);
  assert.match(t, /R\$ 1\.234,56/);
  assert.match(t, /01310-100/);
  assert.doesNotMatch(redactMail("Seu código de verificação é 482913. Expira em 10 minutos."), /482913/);
  assert.doesNotMatch(redactMail("Use 7731 para entrar."), /7731/);
  assert.doesNotMatch(redactMail("Your OTP is 551203"), /551203/);
  assert.doesNotMatch(redactMail("cartão 4111 1111 1111 1111 recusado"), /4111/);
  assert.doesNotMatch(redactMail("cartão 4111111111111111"), /4111/);
  assert.doesNotMatch(redactMail("veja https://exemplo.test/x"), /https?:/);
});

test("validação da IA recusa só o que é sensível de verdade", () => {
  const base = { abertura: "1 coisa pede você.", sem_acao: [], ruido: { contagem: 0 }, anexos: "Anexos não são lidos." as const };
  const it = (o_que_aconteceu: string) => ({ ...base, itens: [{ categoria: "pagamento" as const, titulo: "Fatura", quando: "", o_que_aconteceu, o_que_fazer: "Pague.", origem: "m1", sensivel: false }] });
  assert.equal(resumoHasSecret(it("Pedido 883421 de R$ 1.234,56 para o CEP 01310-100.")), false);
  assert.equal(resumoHasSecret(it("Responda à @empresa no grupo.")), false);
  assert.equal(resumoHasSecret(it("Seu código de verificação é 482913.")), true);
  assert.equal(resumoHasSecret(it("Escreva para ana@exemplo.test.")), true);
  assert.equal(resumoHasSecret(it("Cartão 4111 1111 1111 1111.")), true);
  assert.equal(resumoHasSecret(it("Veja https://exemplo.test.")), true);
});

test("promoção com prazo vira ruído; aviso real de pagamento em massa passa; conversa vira um item", () => {
  const r = buildCorreioResumo([
    mail({ id: "promo", subject: "Última chance! Prazo termina hoje", listUnsubscribe: true, from: "Loja <ofertas@loja.test>" }),
    mail({ id: "pag", subject: "Pagamento recusado", listUnsubscribe: true, from: "Stream <cobranca@stream.test>" }),
    mail({ id: "a1", threadId: "tv", subject: "Viagem", snippet: "Vamos?", receivedAt: "2026-10-15T08:00:00.000Z" }),
    mail({ id: "a2", threadId: "tv", subject: "Re: Viagem", snippet: "Pode ser dia 20?", receivedAt: "2026-10-15T09:00:00.000Z" }),
  ]);
  assert.deepEqual(r.itens.map((i) => i.origem).sort(), ["a2", "pag"]);
  assert.match(r.itens.find((i) => i.origem === "a2")!.titulo, /\(\+1 na conversa\)$/);
  assert.equal(r.ruido.contagem, 1);
});

test("remetente silenciado vira ruído", () => {
  const r = buildCorreioResumo([mail({ id: "x", subject: "Sua fatura vence amanhã", from: "Banco <a@banco.test>" })], { silenced: new Set(["banco.test"]) });
  assert.equal(r.itens.length, 0);
  assert.equal(r.ruido.contagem, 1);
});

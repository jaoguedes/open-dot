import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCorreioResumo, correioForModel, resumoHasSecret } from "../src/correio.ts";
import type { EmailMeta } from "../src/email.ts";

function mail(partial: Partial<EmailMeta> & Pick<EmailMeta, "id" | "subject">): EmailMeta {
  return {
    threadId: "t",
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

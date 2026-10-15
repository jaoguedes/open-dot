import assert from "node:assert/strict";
import test from "node:test";
import { aberturaFor, openDigestItems } from "../src/digest-open.ts";

const it = (origem: string, remetente: string | null = null) => ({ origem, remetente, categoria: "pagamento", titulo: "x", quando: "", o_que_aconteceu: "", o_que_fazer: "Pague.", sensivel: false });
const digest = (state: "open" | "done" | "snoozed", itens = [it("a", "h1"), it("b", "h2"), it("c")]) => ({ kind: "email_digest", state, body: { itens } }) as never;

test("só itens abertos contam: resumo feito ou adiado zera", () => {
  assert.equal(openDigestItems(digest("open"), new Set(), {}).length, 3);
  assert.equal(openDigestItems(digest("done"), new Set(), {}).length, 0);
  assert.equal(openDigestItems(digest("snoozed"), new Set(), {}).length, 0);
  assert.equal(openDigestItems(null, new Set(), {}).length, 0);
});

test("remetente silenciado e item marcado Não importa saem; Era importante sobe para o topo", () => {
  const open = openDigestItems(digest("open"), new Set(["h1"]), { b: "nao_importa" });
  assert.deepEqual(open.map((i) => i.origem), ["c"]);
  const ranked = openDigestItems(digest("open"), new Set(), { c: "importante" });
  assert.deepEqual(ranked.map((i) => i.origem), ["c", "a", "b"]);
});

test("abertura acompanha a contagem aberta", () => {
  assert.equal(aberturaFor(0), "Tudo calmo por aqui.");
  assert.equal(aberturaFor(1), "1 coisa pede você.");
  assert.equal(aberturaFor(3), "3 coisas pedem você.");
});

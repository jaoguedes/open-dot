import type { FeedEntry } from "./api.ts";

export type TriageMark = "importante" | "nao_importa";
type DigestItem = NonNullable<FeedEntry["body"]["itens"]>[number];

/**
 * Itens ABERTOS do resumo do Correio (G): o resumo não foi marcado Feito nem Adiado,
 * o remetente não está silenciado e o item não foi marcado "Não importa".
 * "Era importante" sobe o item para o topo. A abertura e todas as contagens usam isto.
 */
export function openDigestItems(digest: FeedEntry | null | undefined, silenced: ReadonlySet<string>, marks: Readonly<Record<string, TriageMark>>): DigestItem[] {
  if (!digest || digest.kind !== "email_digest" || digest.state === "done" || digest.state === "snoozed") return [];
  const items = (digest.body.itens ?? []).filter((i) => !(i.remetente && silenced.has(i.remetente)) && marks[i.origem] !== "nao_importa");
  return items.map((i, n) => ({ i, n, top: marks[i.origem] === "importante" ? 0 : 1 })).sort((a, b) => a.top - b.top || a.n - b.n).map((x) => x.i);
}

export function aberturaFor(n: number): string {
  return n === 0 ? "Tudo calmo por aqui." : n === 1 ? "1 coisa pede você." : `${n} coisas pedem você.`;
}

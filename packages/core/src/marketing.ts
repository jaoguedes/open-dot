import type { NewsItem } from "./news.ts";

export interface PostDraft {
  text: string;
  sources: Array<{ title: string; link: string; outlet: string }>;
  status: "draft";
  /** Publicar nunca é automático. */
  publish: false;
}

/** Ideias a partir das notícias do dia: só rascunho. */
export function draftPostIdeas(news: NewsItem[], max = 3): PostDraft[] {
  return news.slice(0, max).map((n) => ({
    text: `${n.title} — rascunho a partir de ${n.outlet}. Nada foi publicado.`,
    sources: [{ title: n.title, link: n.link, outlet: n.outlet }],
    status: "draft",
    publish: false,
  }));
}

export const MARKETING_CAN_PUBLISH = false;

/** Marketing não publica. Qualquer tentativa é recusada no código. */
export function publishMarketingPost(_draft: PostDraft): never {
  throw new Error("Marketing não publica: exigiria aprovação vinculada ao texto exato, ainda não implementada.");
}

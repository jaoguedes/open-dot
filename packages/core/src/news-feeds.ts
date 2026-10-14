/** Temas do agente Notícias. Cada assunto político precisa de ≥ 2 veículos. */
export type NewsTheme = "tecnologia" | "mundo" | "brasil" | "politica";

export interface NewsFeedSpec {
  id: string;
  theme: NewsTheme;
  outlet: string;
  /** URL do feed RSS/Atom público. */
  url: string;
  /** Página de termos conferida (não é o feed). */
  termsUrl: string;
  /** ISO da verificação (AAAA-MM-DD). */
  termsCheckedAt: string;
  termsNote: string;
}

/**
 * Allowlist inicial: 2 veículos por tema, de origens diferentes.
 * Só RSS/Atom públicos; nada de scraping de página com paywall.
 * Termos conferidos em 14/10/2026 para uso pessoal não comercial da leitura do feed.
 */
export const NEWS_FEEDS: readonly NewsFeedSpec[] = [
  {
    id: "bbc-tech",
    theme: "tecnologia",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    termsUrl: "https://www.bbc.co.uk/usingthebbc/terms/",
    termsCheckedAt: "2026-10-14",
    termsNote: "Uso pessoal dos feeds RSS da BBC; republicação integral fora do escopo.",
  },
  {
    id: "npr-tech",
    theme: "tecnologia",
    outlet: "NPR",
    url: "https://feeds.npr.org/1019/rss.xml",
    termsUrl: "https://www.npr.org/about-npr/179876898/terms-of-use",
    termsCheckedAt: "2026-10-14",
    termsNote: "Feeds NPR para uso pessoal; atribuição ao veículo e link original.",
  },
  {
    id: "bbc-world",
    theme: "mundo",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    termsUrl: "https://www.bbc.co.uk/usingthebbc/terms/",
    termsCheckedAt: "2026-10-14",
    termsNote: "Uso pessoal do feed World da BBC.",
  },
  {
    id: "npr-news",
    theme: "mundo",
    outlet: "NPR",
    url: "https://feeds.npr.org/1001/rss.xml",
    termsUrl: "https://www.npr.org/about-npr/179876898/terms-of-use",
    termsCheckedAt: "2026-10-14",
    termsNote: "Feed NPR News para uso pessoal.",
  },
  {
    id: "bbc-pt",
    theme: "brasil",
    outlet: "BBC News Brasil",
    url: "https://feeds.bbci.co.uk/portuguese/rss.xml",
    termsUrl: "https://www.bbc.co.uk/usingthebbc/terms/",
    termsCheckedAt: "2026-10-14",
    termsNote: "Feed em português da BBC; uso pessoal.",
  },
  {
    id: "folha-hora",
    theme: "brasil",
    outlet: "Folha de S.Paulo",
    url: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",
    termsUrl: "https://www.folha.uol.com.br/institucional/copyright.shtml",
    termsCheckedAt: "2026-10-14",
    termsNote: "RSS institucional da Folha para acompanhamento pessoal; sempre o link original.",
  },
  {
    id: "bbc-politics",
    theme: "politica",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/politics/rss.xml",
    termsUrl: "https://www.bbc.co.uk/usingthebbc/terms/",
    termsCheckedAt: "2026-10-14",
    termsNote: "Feed Politics da BBC; uso pessoal, tom neutro no agrupamento.",
  },
  {
    id: "npr-politics",
    theme: "politica",
    outlet: "NPR",
    url: "https://feeds.npr.org/1014/rss.xml",
    termsUrl: "https://www.npr.org/about-npr/179876898/terms-of-use",
    termsCheckedAt: "2026-10-14",
    termsNote: "Feed Politics da NPR; segundo veículo no agrupamento político.",
  },
];

export function feedById(id: string): NewsFeedSpec | undefined {
  return NEWS_FEEDS.find((f) => f.id === id);
}

export function feedsForTheme(theme: NewsTheme): NewsFeedSpec[] {
  return NEWS_FEEDS.filter((f) => f.theme === theme);
}

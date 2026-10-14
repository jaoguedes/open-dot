import { NEWS_FEEDS, type NewsTheme } from "./news-feeds.ts";

export interface NewsItem {
  title: string;
  link: string;
  outlet: string;
  theme: NewsTheme;
  publishedAt: string | null;
  feedId: string;
}

export interface ParseFeedResult {
  items: NewsItem[];
  error?: string;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeLink(link: string): string {
  try {
    const u = new URL(link);
    u.hash = "";
    return u.toString();
  } catch {
    return link.trim();
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  if (!m) {
    const a = new RegExp(`<${name}[^>]+href=["']([^"']+)["']`, "i").exec(block);
    return a ? decodeXml(a[1]!).trim() : null;
  }
  return decodeXml(m[1]!.replace(/<[^>]+>/g, "")).trim() || null;
}

/** RSS 2.0 ou Atom. Feed indisponível/ilegível vira falha parcial (items vazios + error). */
export function parseFeedXml(xml: string, feedId: string): ParseFeedResult {
  const spec = NEWS_FEEDS.find((f) => f.id === feedId);
  if (!spec) return { items: [], error: `fonte ${feedId} fora da allowlist` };
  if (!xml || !xml.includes("<")) return { items: [], error: "feed indisponível ou vazio" };
  const chunks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  if (!chunks.length) return { items: [], error: "feed sem itens reconhecíveis" };
  const items: NewsItem[] = [];
  for (const block of chunks) {
    const title = tag(block, "title");
    const link = tag(block, "link") ?? tag(block, "id");
    if (!title || !link || !/^https:\/\//i.test(link)) continue;
    const publishedAt = tag(block, "pubDate") ?? tag(block, "updated") ?? tag(block, "published");
    items.push({
      title: title.slice(0, 280),
      link: normalizeLink(link),
      outlet: spec.outlet,
      theme: spec.theme,
      publishedAt,
      feedId,
    });
  }
  return items.length ? { items } : { items: [], error: "nenhum item com título e link https" };
}

export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seenLink = new Set<string>();
  const seenTitle = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const link = normalizeLink(it.link);
    const titleKey = `${it.outlet}::${normalizeTitle(it.title)}`;
    if (seenLink.has(link) || seenTitle.has(titleKey)) continue;
    seenLink.add(link);
    seenTitle.add(titleKey);
    out.push({ ...it, link });
  }
  return out;
}

export interface PoliticsCluster {
  topic: string;
  items: NewsItem[];
  outlets: string[];
  /** Sempre em tom neutro; o Dot não opina. */
  eachSide: Array<{ outlet: string; title: string; link: string }>;
  singleOutlet: boolean;
  notice: string | null;
}

function shareTokens(a: string, b: string): boolean {
  const A = new Set(normalizeTitle(a).split(" ").filter((w) => w.length > 3));
  const B = normalizeTitle(b).split(" ").filter((w) => w.length > 3);
  if (A.size < 2) return false;
  let n = 0;
  for (const w of B) if (A.has(w)) n++;
  return n >= 2;
}

/** Política: cada assunto agrupa ≥ 2 veículos. Se só um cobriu, avisa. */
export function groupPolitics(items: NewsItem[]): PoliticsCluster[] {
  const politic = items.filter((i) => i.theme === "politica");
  const used = new Set<number>();
  const clusters: PoliticsCluster[] = [];
  for (let i = 0; i < politic.length; i++) {
    if (used.has(i)) continue;
    const group = [politic[i]!];
    used.add(i);
    for (let j = i + 1; j < politic.length; j++) {
      if (used.has(j)) continue;
      if (shareTokens(politic[i]!.title, politic[j]!.title)) {
        group.push(politic[j]!);
        used.add(j);
      }
    }
    const byOutlet = new Map<string, NewsItem>();
    for (const it of group) if (!byOutlet.has(it.outlet)) byOutlet.set(it.outlet, it);
    const outlets = [...byOutlet.keys()];
    const single = outlets.length < 2;
    clusters.push({
      topic: group[0]!.title,
      items: group,
      outlets,
      eachSide: [...byOutlet.values()].map((it) => ({ outlet: it.outlet, title: it.title, link: it.link })),
      singleOutlet: single,
      notice: single ? "Só um veículo cobriu este assunto." : null,
    });
  }
  return clusters;
}

export interface WorldTodaySection {
  theme: NewsTheme;
  items: Array<{ title: string; link: string; outlet: string; publishedAt: string | null }>;
}

const THEMES: NewsTheme[] = ["tecnologia", "mundo", "brasil", "politica"];

/** Revisão das 8h: no máximo 3 itens por tema, sempre com o link original. */
export function worldToday(items: NewsItem[], maxPerTheme = 3): WorldTodaySection[] {
  return THEMES.map((theme) => ({
    theme,
    items: items
      .filter((i) => i.theme === theme)
      .slice(0, maxPerTheme)
      .map((i) => ({ title: i.title, link: i.link, outlet: i.outlet, publishedAt: i.publishedAt })),
  })).filter((s) => s.items.length > 0);
}

export function newsToPublicLines(items: NewsItem[]): string[] {
  return items.map((i) => `${i.outlet}: ${i.title} (${i.link})`);
}

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
  const ch = (n: number) => (n > 0 && n < 0x110000 && n !== 0xfffe && n !== 0xffff ? String.fromCodePoint(n) : "");
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => ch(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => ch(parseInt(n, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function innerText(raw: string): string {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(raw);
  const plain = cdata ? cdata[1]! : raw.replace(/<[^>]+>/g, "");
  return decodeXml(plain).replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<(?:[a-z0-9]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?${name}>`, "i").exec(block);
  if (!m) return null;
  return innerText(m[1]!) || null;
}

function hostOk(feedId: string, host: string): boolean {
  const h = host.toLowerCase();
  if (feedId.startsWith("bbc")) return h === "bbc.com" || h.endsWith(".bbc.com") || h.endsWith("bbc.co.uk") || h.endsWith("bbci.co.uk");
  if (feedId.startsWith("npr")) return h === "npr.org" || h.endsWith(".npr.org");
  if (feedId.startsWith("folha")) return h.endsWith("folha.uol.com.br") || h.endsWith(".uol.com.br");
  return false;
}

function toHttps(raw: string, feedId: string): string | null {
  const star = raw.lastIndexOf("*http");
  const trimmed = decodeXml(star >= 0 ? raw.slice(star + 1) : raw).trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") return null;
  if (!hostOk(feedId, u.hostname)) return null;
  return u.toString();
}

function itemLink(block: string, feedId: string): string | null {
  const about = /\brdf:about=["']([^"']+)["']/i.exec(block);
  const hrefs = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => {
    const attrs = m[1] ?? "";
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
    const rel = /rel=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    return href ? { href, rel } : null;
  }).filter((x): x is { href: string; rel: string } => x !== null);
  const alternate = hrefs.find((l) => l.rel.split(/\s+/).includes("alternate")) ?? hrefs.find((l) => !l.rel);
  const textLink = tag(block, "link");
  const guid = /<guid\b[^>]*>([\s\S]*?)<\/guid>/i.exec(block);
  const perma = guid && !/isPermaLink=["']false["']/i.test(guid[0]);
  const candidates = [about?.[1], alternate?.href, textLink, perma ? innerText(guid![1]!) : null];
  for (const c of candidates) {
    if (!c) continue;
    const url = toHttps(c, feedId);
    if (url) return url;
  }
  return null;
}

/** RSS 2.0 ou Atom. Feed indisponível/ilegível vira falha parcial (items vazios + error). */
function publishedOf(block: string): string | null {
  return tag(block, "pubDate") ?? tag(block, "updated") ?? tag(block, "published") ?? tag(block, "date");
}

function stamp(s: string | null): number {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function feedStartIndex(count: number, now: number): number {
  if (count <= 0) return 0;
  return Math.floor(now / 300_000) % count;
}

/** RSS 2.0, RSS 0.91, RSS 1.0/RDF ou Atom. */
export function parseFeedXml(xml: string, feedId: string): ParseFeedResult {
  const spec = NEWS_FEEDS.find((f) => f.id === feedId);
  if (!spec) return { items: [], error: `fonte ${feedId} fora da allowlist` };
  const body = xml.replace(/^\uFEFF/, "");
  if (!body || !body.includes("<")) return { items: [], error: "feed indisponível ou vazio" };
  const chunks = body.match(/<(?:[a-z0-9]+:)?(item|entry)\b[\s\S]*?<\/(?:[a-z0-9]+:)?\1>/gi) ?? [];
  if (!chunks.length) return { items: [], error: "feed sem itens reconhecíveis" };
  const items: NewsItem[] = [];
  for (const block of chunks) {
    const title = tag(block, "title");
    const link = itemLink(block, feedId);
    if (!title || !link) continue;
    items.push({
      title: title.slice(0, 280),
      link: normalizeLink(link),
      outlet: spec.outlet,
      theme: spec.theme,
      publishedAt: publishedOf(block),
      feedId,
    });
  }
  items.sort((a, b) => stamp(b.publishedAt) - stamp(a.publishedAt));
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
      .slice()
      .sort((a, b) => stamp(b.publishedAt) - stamp(a.publishedAt))
      .slice(0, maxPerTheme)
      .map((i) => ({ title: i.title, link: i.link, outlet: i.outlet, publishedAt: i.publishedAt })),
  })).filter((s) => s.items.length > 0);
}

export function newsToPublicLines(items: NewsItem[]): string[] {
  return items.map((i) => `${i.outlet}: ${i.title} (${i.link})`);
}

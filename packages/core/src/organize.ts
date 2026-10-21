// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Organização de arquivos absorvidos, por regras (sem IA). O texto é dado não confiável:
 * nada aqui interpreta o conteúdo como instrução; só conta, recorta e lista termos.
 */

/** Limite do texto extraído aceito pelo servidor (≈ 200 mil caracteres). */
export const MAX_TEXT_CHARS = 200_000;
/** Abaixo disso, o PDF provavelmente é escaneado (imagem) ou vazio. */
export const MIN_TEXT_CHARS = 20;

export type ExtractionVerdict = { ok: true } | { ok: false; code: "empty" | "scanned" | "too_long"; message: string };

/** Decide se o texto extraído serve. `pages` só existe para PDF. */
export function judgeExtraction(text: string, pages: number | null): ExtractionVerdict {
  const visible = text.replace(/\s+/g, "").length;
  if (text.length > MAX_TEXT_CHARS) return { ok: false, code: "too_long", message: `Texto extraído grande demais (mais de ${MAX_TEXT_CHARS.toLocaleString("pt-BR")} caracteres).` };
  if (visible < MIN_TEXT_CHARS) {
    if (pages && pages > 0) return { ok: false, code: "scanned", message: "Este PDF não tem texto selecionável (provavelmente é escaneado). Leitura de imagem (OCR) não está disponível." };
    return { ok: false, code: "empty", message: "O arquivo não tem texto suficiente para organizar." };
  }
  return { ok: true };
}

/** Normaliza o texto extraído: quebra de linha única, sem espaços repetidos e sem caracteres de controle. */
export function normalizeText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[ \t\u00A0]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const STOP = new Set(
  "a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se ao aos à às é são ser foi como mais mas ou também já não sim seu sua seus suas ele ela eles elas isso isto este esta esse essa aquele aquela cada até ate entre sobre quando onde muito pode deve todo toda todos todas the of and to in for on with is are be this that from by at or an as it".split(
    " ",
  ),
);

export interface Organized {
  title: string;
  chars: number;
  words: number;
  pages: number | null;
  headings: string[];
  keywords: string[];
  preview: string;
  readingMinutes: number;
}

export function organizeText(input: { text: string; fileName: string; mime: string; pages: number | null }): Organized {
  const text = normalizeText(input.text);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const isMd = input.mime === "text/markdown" || /\.(md|markdown)$/i.test(input.fileName);
  const headings = (
    isMd ? lines.filter((l) => /^#{1,3}\s+\S/.test(l)).map((l) => l.replace(/^#{1,3}\s+/, "")) : lines.filter((l) => l.length <= 80 && /^[A-ZÀ-Ú0-9][^.!?]*$/.test(l) && l.split(" ").length <= 10)
  )
    .slice(0, 8)
    .map((h) => h.slice(0, 80));
  const words = text.split(/\s+/).filter(Boolean);
  // Conta pela forma sem acento (agrupa "manutenção"/"manutencao"), exibe a primeira grafia vista.
  const freq = new Map<string, { n: number; shown: string }>();
  for (const w of words) {
    const shown = w.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "");
    const k = shown.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (k.length < 4 || STOP.has(k) || STOP.has(shown) || /^\d+$/.test(k)) continue;
    const cur = freq.get(k);
    freq.set(k, { n: (cur?.n ?? 0) + 1, shown: cur?.shown ?? shown });
  }
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([, v]) => v.shown);
  const firstLine = (isMd ? headings[0] : lines[0]) ?? "";
  const title = (firstLine.length >= 3 && firstLine.length <= 100 ? firstLine : input.fileName.replace(/\.[^.]+$/, "")).slice(0, 100);
  return {
    title,
    chars: text.length,
    words: words.length,
    pages: input.pages,
    headings,
    keywords,
    preview: text.slice(0, 280),
    readingMinutes: Math.max(1, Math.round(words.length / 200)),
  };
}

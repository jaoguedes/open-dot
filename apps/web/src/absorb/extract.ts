// SPDX-License-Identifier: AGPL-3.0-only
import { MAX_BYTES, judgeExtraction, normalizeText, sha256Hex, validateFile } from "@open-dot/core";

/**
 * Extração de texto no navegador (roda dentro do Web Worker). O arquivo original nunca sai
 * da máquina; só o texto extraído e os hashes vão para o servidor.
 */

export const MAX_PDF_PAGES = 500;

export interface PdfLike {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: object[] }>; cleanup?(): unknown }>;
  destroy(): Promise<void>;
}

export type ExtractOk = { ok: true; text: string; pages: number | null; fileSha256: string; textSha256: string; fileBytes: number };
export type ExtractErr = { ok: false; code: ExtractErrorCode; message: string };
export type ExtractErrorCode = "unsupported" | "too_large" | "no_text" | "no_text_scanned" | "text_too_long" | "password" | "invalid_pdf" | "not_utf8" | "too_many_pages" | "failed";

export interface ExtractDeps {
  loadPdf(data: Uint8Array): Promise<PdfLike>;
  onProgress?(p: { done: number; total: number }): void;
}

const err = (code: ExtractErrorCode, message: string): ExtractErr => ({ ok: false, code, message });

export function isPdf(name: string, mime: string) {
  return mime === "application/pdf" || /\.pdf$/i.test(name);
}

export async function extractFile(buf: ArrayBuffer, meta: { name: string; mime: string }, deps: ExtractDeps): Promise<ExtractOk | ExtractErr> {
  if (buf.byteLength > MAX_BYTES) return err("too_large", "Arquivo maior que 5 MB.");
  const typeErr = validateFile({ bytes: buf.byteLength, mime: meta.mime, fileName: meta.name });
  if (typeErr) return err("unsupported", typeErr);
  const fileSha256 = await sha256Hex(new Uint8Array(buf));
  const pdf = isPdf(meta.name, meta.mime);
  let raw: string;
  let pages: number | null = null;
  if (pdf) {
    const r = await pdfText(new Uint8Array(buf.slice(0)), deps);
    if (!r.ok) return r;
    raw = r.text;
    pages = r.pages;
  } else {
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      return err("not_utf8", "O texto não está em UTF-8. Salve o arquivo como UTF-8 e tente de novo.");
    }
    if (raw.includes("\u0000")) return err("unsupported", "O arquivo parece binário, não texto.");
  }
  const text = normalizeText(raw);
  const verdict = judgeExtraction(text, pages);
  if (!verdict.ok) return err(verdict.code === "too_long" ? "text_too_long" : verdict.code === "scanned" ? "no_text_scanned" : "no_text", verdict.message);
  return { ok: true, text, pages, fileSha256, textSha256: await sha256Hex(text), fileBytes: buf.byteLength };
}

async function pdfText(data: Uint8Array, deps: ExtractDeps): Promise<{ ok: true; text: string; pages: number } | ExtractErr> {
  let doc: PdfLike;
  try {
    doc = await deps.loadPdf(data);
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "PasswordException") return err("password", "O PDF está protegido por senha. Remova a senha e envie de novo.");
    if (name === "InvalidPDFException") return err("invalid_pdf", "O arquivo não é um PDF válido ou está corrompido.");
    return err("failed", "Não consegui abrir o PDF.");
  }
  try {
    if (doc.numPages > MAX_PDF_PAGES) return err("too_many_pages", `PDF com mais de ${MAX_PDF_PAGES} páginas.`);
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Itens de conteúdo marcado (sem `str`) são ignorados.
      parts.push(
        content.items
          .map((it) => {
            const t = it as { str?: unknown; hasEOL?: unknown };
            return (typeof t.str === "string" ? t.str : "") + (t.hasEOL ? "\n" : "");
          })
          .join(""),
      );
      page.cleanup?.();
      deps.onProgress?.({ done: i, total: doc.numPages });
    }
    return { ok: true, text: parts.join("\n\n"), pages: doc.numPages };
  } catch {
    return err("failed", "Falha ao ler o texto do PDF.");
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

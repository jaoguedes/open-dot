import { extractFile, type PdfLike } from "./extract.ts";

/**
 * Web Worker de extração. O pdf.js roda aqui dentro com o "worker falso" (mesma thread),
 * então a interface nunca trava e não há segundo arquivo de worker para servir.
 */

export type ExtractRequest = { id: number; file: File };
export type ExtractMessage = { id: number; type: "progress"; done: number; total: number } | { id: number; type: "done"; result: Awaited<ReturnType<typeof extractFile>> };

// O projeto compila com lib DOM; o escopo do worker é tipado só no que usamos.
const scope = self as unknown as { postMessage(m: ExtractMessage): void; onmessage: ((e: MessageEvent<ExtractRequest>) => void) | null };

async function loadPdf(data: Uint8Array): Promise<PdfLike> {
  const g = globalThis as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist");
  // Sem fontes do sistema nem busca de recursos: só texto (pdf.js 6 não usa eval).
  const task = pdfjs.getDocument({ data, useWorkerFetch: false, disableFontFace: true, stopAtErrors: false, verbosity: 0 });
  const doc = await task.promise;
  return { numPages: doc.numPages, getPage: (n) => doc.getPage(n), destroy: () => task.destroy() };
}

scope.onmessage = async (e: MessageEvent<ExtractRequest>) => {
  const { id, file } = e.data;
  try {
    const buf = await file.arrayBuffer();
    const result = await extractFile(buf, { name: file.name, mime: file.type }, { loadPdf, onProgress: (p) => scope.postMessage({ id, type: "progress", ...p } satisfies ExtractMessage) });
    scope.postMessage({ id, type: "done", result } satisfies ExtractMessage);
  } catch {
    scope.postMessage({ id, type: "done", result: { ok: false, code: "failed", message: "Falha inesperada ao ler o arquivo." } } satisfies ExtractMessage);
  }
};

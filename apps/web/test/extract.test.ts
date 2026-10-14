import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "@open-dot/core";
import { extractFile, type PdfLike } from "../src/absorb/extract.ts";
import { makePdf as makePdfBytes } from "../../../scripts/lib/make-pdf.mjs";

function makePdf(pages: Array<string | null>): ArrayBuffer {
  const b = makePdfBytes(pages);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function realPdfjs(data: Uint8Array): Promise<PdfLike> {
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error módulo JS sem tipos
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data, useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  return { numPages: doc.numPages, getPage: (n) => doc.getPage(n), destroy: () => task.destroy() };
}

const enc = (s: string) => {
  const b = new TextEncoder().encode(s);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

test("extração: PDF com texto (pdf.js real) devolve texto, páginas, hashes e progresso", async () => {
  const buf = makePdf(["Relatorio mensal de manutencao do contrato", "Segunda pagina com prazos e evidencias"]);
  const progress: number[] = [];
  const r = await extractFile(buf, { name: "relatorio.pdf", mime: "application/pdf" }, { loadPdf: realPdfjs, onProgress: (p) => progress.push(p.done) });
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.pages, 2);
  assert.match(r.text, /Relatorio mensal de manutencao/);
  assert.match(r.text, /Segunda pagina/);
  assert.equal(r.textSha256, await sha256Hex(r.text));
  assert.equal(r.fileSha256, await sha256Hex(new Uint8Array(buf)));
  assert.deepEqual(progress, [1, 2]);
});

test("extração: PDF escaneado (páginas sem texto) recusa com mensagem específica", async () => {
  const r = await extractFile(makePdf([null, null, null]), { name: "scan.pdf", mime: "application/pdf" }, { loadPdf: realPdfjs });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.code, "no_text_scanned");
  assert.match(r.message, /escaneado|imagem/i);
});

test("extração: PDF corrompido e PDF com senha têm mensagens próprias", async () => {
  const bad = await extractFile(enc("%PDF-1.4\nisto não é um pdf de verdade"), { name: "x.pdf", mime: "application/pdf" }, { loadPdf: realPdfjs });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, "invalid_pdf");
  const locked = await extractFile(makePdf(["oi"]), { name: "y.pdf", mime: "application/pdf" }, {
    loadPdf: async () => {
      throw Object.assign(new Error("No password given"), { name: "PasswordException" });
    },
  });
  assert.equal(locked.ok, false);
  if (!locked.ok) {
    assert.equal(locked.code, "password");
    assert.match(locked.message, /senha/);
  }
});

test("extração: TXT/MD, vazio, não UTF-8, binário, grande e tipo errado", async () => {
  const noPdf = { loadPdf: async () => assert.fail("não deveria abrir PDF") };
  const md = await extractFile(enc("# Título\n\nTexto suficiente para organizar este documento."), { name: "n.md", mime: "" }, noPdf);
  assert.ok(md.ok);
  if (md.ok) assert.equal(md.pages, null);

  const empty = await extractFile(enc("   \n  "), { name: "v.txt", mime: "text/plain" }, noPdf);
  assert.equal(!empty.ok && empty.code, "no_text");

  const latin1 = await extractFile(new Uint8Array([0x4f, 0x6c, 0xe1, 0x20, 0x6d, 0x75, 0x6e, 0x64, 0x6f]).buffer, { name: "l.txt", mime: "text/plain" }, noPdf);
  assert.equal(!latin1.ok && latin1.code, "not_utf8");

  const bin = await extractFile(enc("abc\u0000def texto texto texto texto"), { name: "b.txt", mime: "text/plain" }, noPdf);
  assert.equal(!bin.ok && bin.code, "unsupported");

  const big = await extractFile(new ArrayBuffer(5 * 1024 * 1024 + 1), { name: "g.txt", mime: "text/plain" }, noPdf);
  assert.equal(!big.ok && big.code, "too_large");

  const exe = await extractFile(enc("MZ..."), { name: "a.exe", mime: "application/x-msdownload" }, noPdf);
  assert.equal(!exe.ok && exe.code, "unsupported");
});

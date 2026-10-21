// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Orçamento do que a primeira tela baixa (C5): app.js mais os chunks que ele importa
 * de forma estática. Meta 350 KB; acima de 400 KB o build falha. Os chunks sob demanda
 * (telas, demonstração, pdf.js, three.js) não contam.
 */
export const APP_JS_GOAL = 350 * 1024;
export const APP_JS_LIMIT = 400 * 1024;

export function checkAppJs(bytes) {
  const kb = (bytes / 1024).toFixed(1);
  if (bytes > APP_JS_LIMIT) return { ok: false, message: `A primeira tela baixa ${kb} KB de JavaScript, acima do limite de 400 KB.` };
  if (bytes > APP_JS_GOAL) return { ok: true, message: `Aviso: a primeira tela baixa ${kb} KB de JavaScript, acima da meta de 350 KB.` };
  return { ok: true, message: null };
}

const STATIC_IMPORT = /(?:^|[;\n}])\s*import\s*(?:[^"(]*?from\s*)?"(\.\.?\/[^"]+)"/g;

/** Soma app.js e tudo que ele importa estaticamente (sem `import()` dinâmico). */
export function initialBytes(entry, read = (f) => readFileSync(f, "utf8")) {
  const seen = new Set();
  let total = 0;
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = read(file);
    total += Buffer.byteLength(text);
    for (const m of text.matchAll(STATIC_IMPORT)) walk(resolve(dirname(file), m[1]));
  };
  walk(resolve(entry));
  return { bytes: total, files: seen.size };
}

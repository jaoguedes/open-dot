/** Conteúdo do `_headers` dos arquivos estáticos (Workers Static Assets). Testado em tests/static-headers.test.ts. */
export const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export function staticHeaders() {
  return [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: no-referrer",
    "  X-Frame-Options: DENY",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    `  Content-Security-Policy: ${CSP}`,
    // app.js, app.css e o worker de extração não têm hash no nome: sempre revalidar.
    "/assets/*",
    "  Cache-Control: public, max-age=0, must-revalidate",
    // Chunks têm hash no nome: nunca mudam.
    "/assets/chunks/*",
    "  ! Cache-Control",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/fonts/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/sounds/*",
    "  Cache-Control: public, max-age=86400",
    "/dot/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/dot/manifest.json",
    "  ! Cache-Control",
    "  Cache-Control: no-cache",
    "",
  ].join("\n");
}

/** Lê o `_headers` como o Cloudflare: regras na ordem, `!` desfaz o que uma regra anterior pôs. */
export function resolveHeaders(text, path) {
  const out = new Map();
  let rule = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) {
      rule = line.trim();
      continue;
    }
    const pattern = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    if (!pattern.test(path)) continue;
    const t = line.trim();
    if (t.startsWith("! ")) out.delete(t.slice(2).toLowerCase());
    else {
      const i = t.indexOf(":");
      out.set(t.slice(0, i).toLowerCase(), t.slice(i + 1).trim());
    }
  }
  return Object.fromEntries(out);
}

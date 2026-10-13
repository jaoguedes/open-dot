// Build de produção: interface estática (apps/web/dist) + verificação do bundle do Worker.
// Uso: npm run build
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const web = join(root, "apps/web");
const dist = join(web, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(join(web, "public"), dist, { recursive: true });
cpSync(join(web, "index.html"), join(dist, "index.html"));

await build({
  entryPoints: { app: join(web, "src/main.tsx") },
  outdir: join(dist, "assets"),
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: false,
  target: ["es2022", "safari16"],
  jsx: "automatic",
  external: ["/fonts/*"],
  tsconfig: join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
  legalComments: "external",
});

// Cabeçalhos de segurança para os arquivos estáticos (Workers Static Assets lê _headers).
writeFileSync(
  join(dist, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: no-referrer",
    "  X-Frame-Options: DENY",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "/assets/*",
    "  Cache-Control: public, max-age=3600",
    "/fonts/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n"),
);

// Verificação do Worker: o mesmo código que o wrangler empacota, sem APIs do Node.
const worker = await build({
  entryPoints: [join(root, "apps/worker/src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  conditions: ["workerd", "worker", "browser"],
  mainFields: ["browser", "module", "main"],
  target: "es2022",
  minify: true,
  write: false,
  tsconfig: join(root, "tsconfig.json"),
  logLevel: "warning",
});
const workerCode = worker.outputFiles[0].text;
if (/from\s*["']node:|require\(["']node:/.test(workerCode)) {
  console.error("ERRO: o bundle do Worker importa módulos do Node.");
  process.exit(1);
}

// Relatório de tamanho
const sizes = {};
for (const f of readdirSync(join(dist, "assets"))) sizes[`assets/${f}`] = statSync(join(dist, "assets", f)).size;
for (const f of readdirSync(join(dist, "fonts"))) sizes[`fonts/${f}`] = statSync(join(dist, "fonts", f)).size;
sizes["worker (min)"] = Buffer.byteLength(workerCode);
const fmt = (n) => (n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
console.log("Build concluído:");
for (const [k, v] of Object.entries(sizes)) console.log(`  ${k.padEnd(28)} ${fmt(v)}`);
const html = readFileSync(join(dist, "index.html"), "utf8");
if (!html.includes("/assets/app.js")) process.exit(1);

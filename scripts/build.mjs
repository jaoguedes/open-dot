// Build de produção: interface estática (apps/web/dist) + verificação do bundle do Worker.
// Uso: npm run build
import { checkAppJs, initialBytes } from "./lib/bundle-budget.mjs";
import { staticHeaders } from "./lib/static-headers.mjs";
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { copyDotAssets } from "./lib/dot-assets.mjs";
import { stampBuild } from "./lib/stamp-build.mjs";

const root = new URL("..", import.meta.url).pathname;
// OPEN_DOT_MASCOT=placeholder compila com o Marcador (AGPL) no lugar do Dot (licença própria).
const tsconfig = join(root, process.env.OPEN_DOT_MASCOT === "placeholder" ? "tsconfig.placeholder.json" : "tsconfig.json");
const web = join(root, "apps/web");
const dist = join(web, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(join(web, "public"), dist, { recursive: true });
cpSync(join(web, "index.html"), join(dist, "index.html"));

await build({
  entryPoints: { app: join(web, "src/main.tsx"), "extract-worker": join(web, "src/absorb/extract.worker.ts") },
  outdir: join(dist, "assets"),
  bundle: true,
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  minify: true,
  sourcemap: false,
  target: ["es2022", "safari16"],
  jsx: "automatic",
  external: ["/fonts/*"],
  tsconfig,
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false" },
  logLevel: "warning",
  legalComments: "external",
});

stampBuild(dist);

const dot = copyDotAssets(root, dist);

// Cabeçalhos de segurança para os arquivos estáticos (Workers Static Assets lê _headers).
writeFileSync(join(dist, "_headers"), staticHeaders());

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
  tsconfig,
  logLevel: "warning",
});
const workerCode = worker.outputFiles[0].text;
if (/from\s*["']node:|require\(["']node:/.test(workerCode)) {
  console.error("ERRO: o bundle do Worker importa módulos do Node.");
  process.exit(1);
}

// Relatório de tamanho
const sizes = {};
for (const f of readdirSync(join(dist, "assets"))) if (f !== "chunks") sizes[`assets/${f}`] = statSync(join(dist, "assets", f)).size;
for (const f of existsSync(join(dist, "assets/chunks")) ? readdirSync(join(dist, "assets/chunks")) : []) sizes[`assets/chunks/${f}`] = statSync(join(dist, "assets/chunks", f)).size;
for (const f of dot.published ? readdirSync(join(dist, "dot")) : []) sizes[`dot/${f}`] = statSync(join(dist, "dot", f)).size;
if (!dot.published) console.log("Aviso: assets/dot/manifest.json ausente; o app usa a prévia 2D.");
for (const f of readdirSync(join(dist, "fonts"))) sizes[`fonts/${f}`] = statSync(join(dist, "fonts", f)).size;
sizes["worker (min)"] = Buffer.byteLength(workerCode);
const fmt = (n) => (n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
console.log("Build concluído:");
for (const [k, v] of Object.entries(sizes)) console.log(`  ${k.padEnd(28)} ${fmt(v)}`);
const html = readFileSync(join(dist, "index.html"), "utf8");
if (!html.includes("/assets/app.js")) process.exit(1);
const initial = initialBytes(join(dist, "assets/app.js"));
console.log(`  primeira tela (app.js + ${initial.files - 1} chunks estáticos) ${fmt(initial.bytes)}`);
const budget = checkAppJs(initial.bytes);
if (budget.message) console.log(budget.message);
if (!budget.ok) process.exit(1);

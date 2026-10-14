/**
 * Servidor local de desenvolvimento: interface + API + agendador, num único processo Node.
 * Banco: SQLite em .data/dev.sqlite (nunca o Turso). Configuração: .dev.vars (não versionado).
 *
 *   npm run dev          → http://localhost:8787
 *   npm run demo         → só interface com dados de demonstração
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";
import { context } from "esbuild";
import { SqliteDb } from "../apps/worker/src/db/sqlite.ts";
import { applyMigrations } from "../apps/worker/src/db/migrate.ts";
import { loadKeyring } from "../apps/worker/src/crypto.ts";
import { parseEnv } from "../apps/worker/src/env.ts";
import { handleApi } from "../apps/worker/src/app.ts";
import { tick } from "../apps/worker/src/jobs.ts";
import { loadMigrations } from "./lib/migrations.ts";
import { copyDotAssets } from "./lib/dot-assets.mjs";

const root = new URL("..", import.meta.url).pathname;
const demoOnly = process.argv.includes("--demo");
const port = Number(process.env.PORT ?? 8787);
const dist = join(root, "apps/web/dist");

function readDevVars(): Record<string, string> {
  const file = join(root, ".dev.vars");
  if (!existsSync(file)) {
    const key = randomBytes(32).toString("base64");
    writeFileSync(file, `# Configuração local privada (não versionada). Gerada automaticamente.\nAPP_ENV=development\nAPP_ORIGIN=http://localhost:${port}\nTOKEN_KEYS=v1:${key}\n`, { mode: 0o600 });
    console.log("• Criei .dev.vars com uma chave local de cifra.");
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
  return out;
}

async function buildWeb() {
  const { cpSync, mkdirSync: mk } = await import("node:fs");
  mk(join(dist, "assets"), { recursive: true });
  cpSync(join(root, "apps/web/public"), dist, { recursive: true });
  cpSync(join(root, "apps/web/index.html"), join(dist, "index.html"));
  copyDotAssets(root, dist);
  const ctx = await context({
    entryPoints: { app: join(root, "apps/web/src/main.tsx"), "extract-worker": join(root, "apps/web/src/absorb/extract.worker.ts") },
    outdir: join(dist, "assets"),
    bundle: true,
    format: "esm",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    sourcemap: "linked",
    jsx: "automatic",
    external: ["/fonts/*"],
    tsconfig: join(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "warning",
  });
  await ctx.watch();
  await ctx.rebuild();
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".map": "application/json", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".mjs": "text/javascript", ".webmanifest": "application/manifest+json" };

function serveStatic(pathname: string): { body: Buffer; type: string; status: number } {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(dist, safe);
  const missing = !file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory();
  if (missing && /^\/(assets|dot|fonts)\//.test(pathname)) return { body: Buffer.from("não encontrado"), type: "text/plain; charset=utf-8", status: 404 };
  if (missing) file = join(dist, "index.html"); // SPA
  return { body: readFileSync(file), type: MIME[extname(file)] ?? "application/octet-stream", status: 200 };
}

async function main() {
  await buildWeb();
  let api: ((req: Request) => Promise<Response>) | null = null;
  let runTick: (() => Promise<unknown>) | null = null;
  if (!demoOnly) {
    const vars = { ...readDevVars(), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(GOOGLE_|GROQ_|OWNER_|VERCEL_|GITHUB_|AI_)/.test(k)) as [string, string][]) };
    const parsed = parseEnv(vars);
    if (!parsed.ok) throw new Error(`.dev.vars incompleto: ${parsed.missing.join(", ")}`);
    mkdirSync(join(root, ".data"), { recursive: true });
    const db = new SqliteDb(join(root, ".data/dev.sqlite"));
    const r = await applyMigrations(db, loadMigrations());
    if (r.applied.length) console.log(`• Migrações aplicadas no SQLite local: ${r.applied.join(", ")}`);
    const ctx = { env: parsed.env, db, keys: await loadKeyring(parsed.env.TOKEN_KEYS), fetch: globalThis.fetch.bind(globalThis), now: () => Date.now() };
    api = (req) => handleApi(ctx, req);
    runTick = () => tick(ctx);
    setInterval(() => void runTick!().then((rep) => console.log("• tique:", JSON.stringify(rep))), 5 * 60_000);
  }

  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    try {
      if (url.pathname === "/api/dev/tick" && req.method === "POST" && runTick) {
        const rep = await runTick();
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(rep));
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        if (!api) {
          res.writeHead(404, { "content-type": "application/json" }).end('{"error":{"code":"demo","message":"API desligada no modo demonstração"}}');
          return;
        }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const r = await api(new Request(url, { method: req.method, headers, ...(body && req.method !== "GET" && req.method !== "HEAD" ? { body } : {}) }));
        const out: Record<string, string> = {};
        r.headers.forEach((v, k) => (out[k] = v));
        res.writeHead(r.status, out).end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      const f = serveStatic(url.pathname);
      res.writeHead(f.status, { "content-type": f.type, "cache-control": "no-store" }).end(f.body);
    } catch (e) {
      console.error(e);
      res.writeHead(500).end("erro interno");
    }
  }).listen(port, "127.0.0.1", () => {
    console.log(`\nOpen Dot rodando em http://localhost:${port}${demoOnly ? "/?demo=1" : ""}`);
    if (!demoOnly) console.log("Rotinas locais: a cada 5 min (ou POST /api/dev/tick). Em produção quem roda é o Cloudflare.");
  });
}

void main();

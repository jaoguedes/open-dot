/**
 * Assistente de configuração da nuvem (rode no SEU terminal, nunca cole segredos no chat):
 *   npm run setup:cloud
 *
 * 1. Confere o login no Cloudflare (`wrangler whoami`; se faltar, abre `wrangler login`).
 * 2. Pede os valores com entrada oculta para segredos.
 * 3. Gera TOKEN_KEYS automaticamente.
 * 4. Aplica as migrações no Turso — recusa banco com tabelas de outro projeto.
 * 5. Grava cada segredo com `wrangler secret put` (valor via stdin, não aparece em log).
 * 6. Pergunta se pode publicar. Sem "s", nada é publicado.
 * Status: implementado, sem teste real (wrangler não estava disponível no ambiente de criação).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { HranaDb } from "../apps/worker/src/db/hrana.ts";
import { applyMigrations } from "../apps/worker/src/db/migrate.ts";
import { loadMigrations } from "./lib/migrations.ts";

const WRANGLER = ["--yes", "wrangler@4"];

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      out._writeToOutput = (s: string) => {
        if (s.includes(question)) out.output.write(s);
        else out.output.write("•");
      };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a.trim());
    });
  });
}

function npx(args: string[], input?: string) {
  return spawnSync("npx", [...WRANGLER, ...args], { input, encoding: "utf8", stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"] });
}

async function main() {
  console.log("Open Dot · configuração da nuvem (Cloudflare Workers Free + Turso Free)\n");
  if (npx(["whoami"]).status !== 0) {
    console.log("Abrindo login do Cloudflare no navegador…");
    if (npx(["login"]).status !== 0) throw new Error("Login no Cloudflare não concluído.");
  }

  const origin = await ask("URL pública do app (ex.: https://open-dot.SEU-SUBDOMINIO.workers.dev): ");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin)) throw new Error("URL inválida (sem barra no fim).");
  const tursoUrl = await ask("TURSO_DATABASE_URL do banco SEPARADO do Open Dot (libsql://...): ");
  const tursoToken = await ask("TURSO_AUTH_TOKEN (oculto): ", true);
  const googleId = await ask("GOOGLE_CLIENT_ID: ");
  const googleSecret = await ask("GOOGLE_CLIENT_SECRET (oculto): ", true);
  const ownerEmail = await ask("Seu e-mail Google (dono único): ");
  const groq = await ask("GROQ_API_KEY (opcional, Enter para pular; oculto): ", true);

  // URL pública é variável não secreta: vai para o wrangler.jsonc.
  const wr = readFileSync("wrangler.jsonc", "utf8").replace(/"APP_ORIGIN":\s*"[^"]*"/, `"APP_ORIGIN": "${origin}"`);
  writeFileSync("wrangler.jsonc", wr);
  console.log("✓ APP_ORIGIN gravado em wrangler.jsonc");

  console.log("\nMigrando o banco do Open Dot…");
  const db = new HranaDb(tursoUrl, tursoToken);
  const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const foreign = tables.map((t) => t.name).filter((n) => !n.startsWith("od_"));
  if (foreign.length) throw new Error(`Esse banco tem tabelas de outro projeto (${foreign.slice(0, 5).join(", ")}). Crie um banco separado. Nada foi alterado.`);
  const r = await applyMigrations(db, loadMigrations());
  console.log(`Migrações aplicadas: ${r.applied.join(", ") || "nenhuma (já atualizado)"}`);

  const secrets: Record<string, string> = {
    TOKEN_KEYS: `v1:${randomBytes(32).toString("base64")}`,
    TURSO_DATABASE_URL: tursoUrl,
    TURSO_AUTH_TOKEN: tursoToken,
    GOOGLE_CLIENT_ID: googleId,
    GOOGLE_CLIENT_SECRET: googleSecret,
    OWNER_EMAIL: ownerEmail,
    ...(groq ? { GROQ_API_KEY: groq } : {}),
  };
  for (const [name, value] of Object.entries(secrets)) {
    const res = npx(["secret", "put", name], value);
    if (res.status !== 0) throw new Error(`Falha ao gravar ${name}.`);
    console.log(`✓ ${name}`);
  }
  console.log("\nTudo configurado. Redirect URI para cadastrar no Google:");
  console.log(`  ${origin}/api/oauth/google/callback\n`);

  const go = await ask("Publicar agora no Cloudflare (workers.dev, plano Free)? [s/N] ");
  if (go.toLowerCase() !== "s") {
    console.log("Não publiquei. Quando quiser: npm run worker:deploy");
    return;
  }
  const check = spawnSync("npm", ["run", "check"], { stdio: "inherit" });
  if (check.status !== 0) throw new Error("Verificações falharam; não publiquei.");
  if (npx(["deploy"]).status !== 0) throw new Error("Deploy falhou.");
  const health = await fetch(`${origin}/api/health`).then((x) => x.json()).catch(() => null);
  console.log("Smoke test /api/health:", JSON.stringify(health));
}

main().catch((e) => {
  console.error("\n" + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});

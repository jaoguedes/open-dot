// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Assistente de configuração da nuvem (rode no SEU terminal, nunca cole segredos no chat):
 *   npm run setup:cloud
 *   npm run setup:cloud -- --from-dev-vars
 *   npm run setup:cloud -- --from-dev-vars --publish
 *
 * 1. Confere o login no Cloudflare (`wrangler whoami`; se faltar, abre `wrangler login`).
 * 2. Pede os valores com entrada oculta — ou lê `.dev.vars` com `--from-dev-vars` (nunca imprime valores).
 * 3. Gera TOKEN_KEYS novo para produção (nunca reutiliza o local).
 * 4. Aplica as migrações no Turso — recusa banco com tabelas de outro projeto.
 * 5. Grava cada segredo com `wrangler secret put` (valor via stdin, não aparece em log).
 * 6. Pergunta se pode publicar. Sem "s", nada é publicado.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { HranaDb } from "../apps/worker/src/db/hrana.ts";
import { applyMigrations } from "../apps/worker/src/db/migrate.ts";
import { loadMigrations } from "./lib/migrations.ts";
import { parseDevVars } from "./lib/dev-vars.ts";
import { DEPLOY_FILE, deployTarget, validOrigin, wranglerVarArgs } from "./lib/deploy-target.mjs";

const WRANGLER = ["--yes", "wrangler@4"];
/** Origem da SUA instância: arquivo local ignorado pelo Git, nunca o wrangler.jsonc versionado. */
const ROOT = new URL("..", import.meta.url).pathname;
function savedTarget(): { appOrigin: string; ownerName: string } | null {
  try {
    return deployTarget({ root: ROOT });
  } catch {
    return null;
  }
}
const FROM_DEV = process.argv.includes("--from-dev-vars");
const REQUIRED = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OWNER_EMAIL"] as const;
const OPTIONAL = ["OWNER_GOOGLE_SUB", "GROQ_API_KEY", "FINNHUB_API_KEY", "PACOTEVICIO_API_KEY"] as const;

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
  return spawnSync("npx", [...WRANGLER, ...args], {
    input,
    encoding: "utf8",
    stdio: input === undefined ? ["ignore", "inherit", "inherit"] : ["pipe", "inherit", "inherit"],
  });
}

async function main() {
  console.log("Open Dot · configuração da nuvem (Cloudflare Workers Free + Turso Free)\n");
  if (npx(["whoami"]).status !== 0) {
    console.log("O Wrangler vai abrir o navegador para você autorizar o Cloudflare. Espere o login terminar.");
    if (npx(["login"]).status !== 0) throw new Error("Login no Cloudflare não concluído.");
  }

  let origin: string;
  let tursoUrl: string;
  let tursoToken: string;
  let googleId: string;
  let googleSecret: string;
  let ownerEmail: string;
  let ownerSub: string;
  let ownerName: string;
  let groq: string;
  let finnhub: string;
  let pacote: string;

  if (FROM_DEV) {
    const vars = parseDevVars(readFileSync(".dev.vars", "utf8"));
    const missing = REQUIRED.filter((n) => !vars[n]);
    if (missing.length) throw new Error(`Faltam no .dev.vars: ${missing.join(", ")}`);
    if (vars.TOKEN_KEYS) console.log("TOKEN_KEYS local ignorado — produção recebe chave nova.");
    const saved = savedTarget();
    origin = saved?.appOrigin ?? (await ask("URL pública da SUA instância (ex.: https://open-dot.SEU-SUBDOMINIO.workers.dev): "));
    ownerName = saved?.ownerName ?? "";
    ownerSub = vars.OWNER_GOOGLE_SUB ?? "";
    tursoUrl = vars.TURSO_DATABASE_URL!;
    tursoToken = vars.TURSO_AUTH_TOKEN!;
    googleId = vars.GOOGLE_CLIENT_ID!;
    googleSecret = vars.GOOGLE_CLIENT_SECRET!;
    ownerEmail = vars.OWNER_EMAIL!;
    groq = vars.GROQ_API_KEY ?? "";
    finnhub = vars.FINNHUB_API_KEY ?? "";
    pacote = vars.PACOTEVICIO_API_KEY ?? "";
    for (const n of [...REQUIRED, ...OPTIONAL.filter((k) => vars[k])]) console.log(`✓ ${n}`);
    console.log("✓ APP_ORIGIN (instância local de deploy)");
  } else {
    origin = await ask("URL pública da SUA instância (ex.: https://open-dot.SEU-SUBDOMINIO.workers.dev): ");
    tursoUrl = await ask("TURSO_DATABASE_URL do banco SEPARADO do Open Dot (libsql://...): ");
    tursoToken = await ask("TURSO_AUTH_TOKEN (oculto): ", true);
    googleId = await ask("GOOGLE_CLIENT_ID: ");
    googleSecret = await ask("GOOGLE_CLIENT_SECRET (oculto): ", true);
    ownerEmail = await ask("Seu e-mail Google (dono único): ");
    ownerSub = await ask("OWNER_GOOGLE_SUB (recomendado: identificador estável da sua conta Google; Enter para usar só o e-mail): ");
    ownerName = await ask("Nome na saudação (opcional, Enter para pular): ");
    groq = await ask("GROQ_API_KEY (opcional, Enter para pular; oculto): ", true);
    finnhub = await ask("FINNHUB_API_KEY (opcional, plano gratuito, Enter para pular; oculto): ", true);
    pacote = await ask("PACOTEVICIO_API_KEY (opcional, Enter para pular; oculto): ", true);
  }

  if (!validOrigin(origin)) throw new Error("URL inválida: use https://<host>, sem caminho e sem barra no fim.");
  if (ownerName.length > 40) throw new Error("Nome da saudação com mais de 40 caracteres.");
  // Origem e nome não são segredos, mas são da SUA instância: ficam fora do Git e entram no deploy por --var.
  writeFileSync(DEPLOY_FILE, JSON.stringify({ appOrigin: origin, ownerName }, null, 2) + "\n", { mode: 0o600 });
  console.log(`✓ APP_ORIGIN gravado em ${DEPLOY_FILE} (ignorado pelo Git)`);
  if (!ownerSub) console.log("Aviso: sem OWNER_GOOGLE_SUB, o primeiro login com o e-mail fixa a identidade. Para produção, defina o sub.");

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
    ...(ownerSub ? { OWNER_GOOGLE_SUB: ownerSub } : {}),
    ...(groq ? { GROQ_API_KEY: groq } : {}),
    ...(finnhub ? { FINNHUB_API_KEY: finnhub } : {}),
    ...(pacote ? { PACOTEVICIO_API_KEY: pacote } : {}),
  };
  for (const [name, value] of Object.entries(secrets)) {
    const res = npx(["secret", "put", name], value);
    if (res.status !== 0) throw new Error(`Falha ao gravar ${name}.`);
    console.log(`✓ ${name}`);
  }
  console.log("\nTudo configurado. Redirect URI para cadastrar no Google:");
  console.log(`  ${origin}/api/oauth/google/callback\n`);

  const go = process.argv.includes("--publish") ? "s" : await ask("Publicar agora no Cloudflare (workers.dev, plano Free)? [s/N] ");
  if (go.toLowerCase() !== "s") {
    console.log("Não publiquei. Quando quiser: npm run worker:deploy");
    return;
  }
  const check = spawnSync("npm", ["run", "check"], { stdio: "inherit" });
  if (check.status !== 0) throw new Error("Verificações falharam; não publiquei.");
  const workerd = spawnSync("npm", ["run", "test:workerd"], { stdio: "inherit" });
  if (workerd.status !== 0) throw new Error("Health no wrangler dev --local falhou; não publiquei.");
  if (npx(["deploy", ...wranglerVarArgs({ appOrigin: origin, ownerName })]).status !== 0) throw new Error("Deploy falhou.");
  const health = await fetch(`${origin}/api/health`)
    .then((x) => x.json())
    .catch(() => null);
  console.log("Smoke test /api/health:", JSON.stringify(health));
}

main().catch((e) => {
  console.error("\n" + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});

/**
 * Instância de destino do deploy. Fica FORA do Git: `.deploy.local.json` na raiz
 * (ignorado) ou as variáveis OPEN_DOT_APP_ORIGIN / OPEN_DOT_OWNER_NAME. O wrangler.jsonc
 * versionado só tem placeholder, para que ninguém publique apontando para a instância de outra pessoa.
 *
 *   { "appOrigin": "https://open-dot.<seu-subdominio>.workers.dev", "ownerName": "" }
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEPLOY_FILE = ".deploy.local.json";

export function validOrigin(origin) {
  if (typeof origin !== "string" || /[<>]|SEU-SUBDOMINIO/i.test(origin)) return false;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && u.origin === origin && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function deployTarget({ root, env = process.env }) {
  const path = join(root, DEPLOY_FILE);
  const file = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const appOrigin = env.OPEN_DOT_APP_ORIGIN ?? file.appOrigin;
  if (appOrigin === undefined) throw new Error(`Defina a origem da SUA instância em ${DEPLOY_FILE} (ignorado pelo Git) ou em OPEN_DOT_APP_ORIGIN. Rode npm run setup:cloud.`);
  if (!validOrigin(appOrigin)) throw new Error("Origem de deploy inválida ou ainda com placeholder: use https://<host> sem caminho.");
  const ownerName = env.OPEN_DOT_OWNER_NAME ?? file.ownerName ?? "";
  if (typeof ownerName !== "string" || ownerName.length > 40) throw new Error("OWNER_NAME inválido (até 40 caracteres).");
  return { appOrigin, ownerName };
}

/** Argumentos do `wrangler deploy` que substituem os placeholders do wrangler.jsonc. */
export function wranglerVarArgs(target) {
  return ["--var", `APP_ORIGIN:${target.appOrigin}`, "--var", `OWNER_NAME:${target.ownerName}`];
}

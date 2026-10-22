// SPDX-License-Identifier: AGPL-3.0-only
// Falha se a chave pública do updater ainda for o marcador provisório. Usado antes de qualquer
// rascunho de release do Runner: sem a chave do João, não existe atualização assinada.
//   node scripts/release/check-updater-key.mjs
import { readFileSync } from "node:fs";
const conf = JSON.parse(readFileSync(new URL("../../apps/runner/src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const key = String(conf.plugins?.updater?.pubkey ?? "").trim();
if (!key || key.includes("A_DEFINIR")) {
  console.error("Chave pública do updater ainda é o marcador [CHAVE_PUBLICA_A_DEFINIR]. Siga docs/release/runner-chave-de-assinatura.md.");
  process.exit(1);
}
const decoded = Buffer.from(key, "base64").toString("utf8");
if (!/^untrusted comment: .+\nRW[A-Za-z0-9+/=]{40,}/.test(decoded)) {
  console.error("Chave pública do updater não parece uma chave minisign em base64.");
  process.exit(1);
}
const endpoints = conf.plugins.updater.endpoints ?? [];
if (endpoints.length !== 1 || !String(endpoints[0]).startsWith("https://github.com/jaoguedes/open-dot/releases/")) {
  console.error("Endpoint do updater fora do repositório do projeto.");
  process.exit(1);
}
console.log("Chave pública do updater configurada (nenhum segredo lido).");

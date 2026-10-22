// SPDX-License-Identifier: AGPL-3.0-only
// Monta o latest.json do updater do Tauri a partir dos artefatos assinados (.sig) de uma pasta.
// Só lê arquivos públicos (pacotes e assinaturas); nunca toca na chave privada.
//   node scripts/release/make-latest-json.mjs <pasta> <versao> <url-base> [notas.md]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function latestJson(files, version, base, notes, date = new Date().toISOString()) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) throw new Error("Versão inválida.");
  if (!base.startsWith("https://github.com/jaoguedes/open-dot/releases/download/")) throw new Error("URL base fora do repositório.");
  const map = [
    ["darwin-x86_64", /macos-x64.*\.app\.tar\.gz$/],
    ["darwin-aarch64", /macos-arm64.*\.app\.tar\.gz$/],
    ["windows-x86_64", /windows-x64.*\.(exe|msi)$/],
  ];
  const platforms = {};
  for (const [key, re] of map) {
    const pkg = Object.keys(files).find((f) => re.test(f));
    if (!pkg || files[`${pkg}.sig`] === undefined) continue;
    platforms[key] = { signature: files[`${pkg}.sig`].trim(), url: `${base.replace(/\/$/, "")}/${encodeURIComponent(pkg)}` };
  }
  if (!Object.keys(platforms).length) throw new Error("Nenhum pacote assinado (.sig) encontrado: nada para atualizar.");
  return { version, notes: String(notes ?? "").slice(0, 4000), pub_date: date, platforms };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [dir, version, base, notesFile] = process.argv.slice(2);
  const files = Object.fromEntries(readdirSync(dir).map((f) => [f, f.endsWith(".sig") ? readFileSync(join(dir, f), "utf8") : ""]));
  const out = latestJson(files, version, base, notesFile ? readFileSync(notesFile, "utf8") : "");
  writeFileSync(join(dir, "latest.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`latest.json com ${Object.keys(out.platforms).join(", ")}.`);
}

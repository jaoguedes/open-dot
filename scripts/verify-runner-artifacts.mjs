// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const dir = process.argv[2];
const version = JSON.parse(readFileSync("apps/runner/src-tauri/tauri.conf.json", "utf8")).version;
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `runner-v${version}`) throw new Error("Tag diferente da versão do Runner.");
const names = ["OpenDot-Runner-macos-x64.dmg", "OpenDot-Runner-macos-arm64.dmg", "OpenDot-Runner-windows-x64-setup.exe"];
if (readdirSync(dir).length !== 6) throw new Error("Conjunto de instaladores incompleto ou com arquivos inesperados.");
for (const name of names) {
  const bytes = readFileSync(join(dir, name));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (!bytes.length || readFileSync(join(dir, `${name}.sha256`), "utf8").trim() !== `${hash}  ${name}`) throw new Error(`Checksum inválido: ${name}`);
}
console.log("Três instaladores e checksums verificados.");

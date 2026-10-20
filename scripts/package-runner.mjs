import { readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const [target, platform] = process.argv.slice(2);
const platforms = { "x86_64-apple-darwin": "macos-x64", "aarch64-apple-darwin": "macos-arm64", "x86_64-pc-windows-msvc": "windows-x64" };
if (platforms[target] !== platform) throw new Error("Target/plataforma inválido.");
const windows = platform === "windows-x64";
const source = `apps/runner/src-tauri/target/${target}/release/bundle/${windows ? "nsis" : "dmg"}`;
const files = readdirSync(source).filter((f) => f.endsWith(windows ? ".exe" : ".dmg"));
if (files.length !== 1) throw new Error(`Esperado exatamente um instalador, encontrados ${files.length}.`);
const name = `OpenDot-Runner-${platform}${windows ? "-setup.exe" : ".dmg"}`;
const dest = "apps/runner/installers";
mkdirSync(dest, { recursive: true });
copyFileSync(join(source, files[0]), join(dest, name));
writeFileSync(
  join(dest, `${name}.sha256`),
  `${createHash("sha256")
    .update(readFileSync(join(dest, name)))
    .digest("hex")}  ${name}\n`,
);

// Publica o Dot 3D validado (assets/dot) em <dist>/dot: só o manifesto e os GLB que ele cita.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export function copyDotAssets(root, dist) {
  const src = join(root, "assets/dot");
  const out = join(dist, "dot");
  rmSync(out, { recursive: true, force: true });
  const manifestPath = join(src, "manifest.json");
  if (!existsSync(manifestPath)) return { published: false, files: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const files = [manifest.base, ...Object.values(manifest.props ?? {}).map((p) => p.file), ...Object.values(manifest.fx ?? {}).map((p) => p.file)];
  for (const f of files) {
    if (typeof f !== "string" || !/^[\w.-]+\.glb$/.test(f) || !existsSync(join(src, f))) throw new Error(`manifest.json cita arquivo ausente ou inválido: ${f}`);
  }
  mkdirSync(out, { recursive: true });
  for (const f of [...files, "manifest.json"]) copyFileSync(join(src, f), join(out, f));
  return { published: true, files };
}

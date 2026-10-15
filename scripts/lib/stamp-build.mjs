import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serviceWorkerSource } from "./sw-source.mjs";

/** Grava o hash do app.js no service worker, no version.json e na meta da página. */
export function stampBuild(dist) {
  const appJs = readFileSync(join(dist, "assets/app.js"));
  const buildId = createHash("sha256").update(appJs).digest("hex").slice(0, 12);
  writeFileSync(join(dist, "sw.js"), serviceWorkerSource(buildId));
  writeFileSync(join(dist, "version.json"), JSON.stringify({ app: buildId }));
  let html = readFileSync(join(dist, "index.html"), "utf8");
  html = html.replace(/\n\s*<meta name="open-dot-build" content="[^"]*" \/>/g, "");
  html = html.replace("</title>", `</title>\n    <meta name="open-dot-build" content="${buildId}" />`);
  writeFileSync(join(dist, "index.html"), html);
  return buildId;
}

import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const dist = resolve("apps/runner/dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(`${dist}/assets`, { recursive: true });
cpSync("apps/runner/index.html", `${dist}/index.html`);
cpSync("apps/web/public/fonts", `${dist}/fonts`, { recursive: true });
await build({
  entryPoints: { runner: "apps/runner/src/main.tsx" },
  outdir: `${dist}/assets`,
  bundle: true,
  format: "esm",
  minify: true,
  jsx: "automatic",
  target: ["es2022", "safari16"],
  external: ["/fonts/*"],
  tsconfig: "tsconfig.json",
  define: { "process.env.NODE_ENV": '"production"' },
});
console.log("Runner UI compilada (sem API, service worker ou dados fictícios).");

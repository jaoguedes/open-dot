// Gera os ícones do PWA a partir do Dot do motor SVG (D-014: sem tracinho fora da absorção).
// Uso: npm run build && node scripts/icons/make-icons.mjs
// Saída: apps/web/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png
// maskable: o Dot inteiro cabe no círculo central de 80% (zona segura do Android).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(new URL("../..", import.meta.url).pathname);
const dist = join(root, "apps/web/dist");
const out = join(root, "apps/web/public/icons");
const BG = "#050608";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 700 }, deviceScaleFactor: 8, reducedMotion: "reduce", colorScheme: "dark" });
await page.route("**/api/**", (route) => {
  const p = new URL(route.request().url()).pathname;
  if (p === "/api/session") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false, devLoginAvailable: false, googleLoginAvailable: true }) });
  if (p === "/api/version") return route.fulfill({ status: 200, contentType: "application/json", body: '{"app":"x","worker":"x"}' });
  return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":{"code":"unauthenticated","message":"x"}}' });
});
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const svg = page.locator(".dot-svg").first();
await svg.waitFor();
await page.waitForTimeout(1500);
const dot = await svg.screenshot({ omitBackground: true });
const box = await svg.boundingBox();
const ratio = box.width / box.height;

const draw = await browser.newPage();
const make = async (size, fill, opaque) =>
  Buffer.from(
    await draw.evaluate(
      async ({ src, size, fill, ratio, bg, opaque }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const g = c.getContext("2d");
        if (opaque) {
          g.fillStyle = bg;
          g.fillRect(0, 0, size, size);
        }
        const w = size * fill;
        const h = w / ratio;
        g.drawImage(img, (size - w) / 2, (size - h) / 2 + size * 0.02, w, h);
        return c.toDataURL("image/png").split(",")[1];
      },
      { src: `data:image/png;base64,${dot.toString("base64")}`, size, fill, ratio, bg: BG, opaque },
    ),
    "base64",
  );
// A caixa do SVG tem folga para sombra e partículas: o corpo ocupa ~75% da largura da caixa.
writeFileSync(join(out, "icon-192.png"), await make(192, 0.98, true));
writeFileSync(join(out, "icon-512.png"), await make(512, 0.98, true));
writeFileSync(join(out, "maskable-512.png"), await make(512, 0.7, true));
writeFileSync(join(out, "apple-touch-icon.png"), await make(180, 0.9, true));
await browser.close();
server.close();
console.log("Ícones gerados em apps/web/public/icons.");

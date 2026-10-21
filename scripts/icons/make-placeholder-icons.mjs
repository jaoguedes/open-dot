// Gera os ícones do Marcador (mascote genérico, AGPL) para builds sem o Dot.
// Saída: assets/placeholder/icons/ (mesmos nomes e tamanhos de apps/web/public/icons) e favicon.ico.
// Uso: node scripts/icons/make-placeholder-icons.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const out = new URL("../../assets/placeholder/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#14151A"/>
  <g transform="translate(${pad} ${pad}) scale(${(100 - 2 * pad) / 100})">
    <path d="M50 6 L88 28 L88 72 L50 94 L12 72 L12 28 Z" fill="#2A2C33" stroke="#8A8D99" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="11" fill="#C9CBD3"/>
  </g></svg>`;
const icons = [
  ["icon-192.png", 192, 8],
  ["icon-512.png", 512, 8],
  ["maskable-512.png", 512, 20],
  ["apple-touch-icon.png", 180, 10],
  ["favicon-16.png", 16, 2],
  ["favicon-32.png", 32, 4],
  ["favicon-256.png", 256, 8],
];
const browser = await chromium.launch();
for (const [name, size, pad] of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg(size, pad)}</body>`);
  writeFileSync(new URL(name, out), await page.screenshot({ type: "png", omitBackground: false }));
  await page.close();
}
await browser.close();
// ICO com PNG embutido (16, 32, 256), igual ao formato do favicon do app.
const sizes = [16, 32, 256];
const pngs = sizes.map((s) => readFileSync(new URL(`favicon-${s}.png`, out)));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync(new URL("favicon.ico", out), Buffer.concat([header, ...entries, ...pngs]));
console.log("Ícones do Marcador gerados em assets/placeholder/icons/.");

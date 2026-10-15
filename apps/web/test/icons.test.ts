import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";

const dir = new URL("../public/icons/", import.meta.url);
const file = (n: string) => readFileSync(new URL(n, dir));

/** Decodificador mínimo de PNG RGBA/RGB 8 bits sem entrelaçamento (o que o canvas gera). */
function decode(buf: Buffer) {
  let p = 8;
  let w = 0,
    h = 0,
    type = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      type = data[9]!;
      assert.equal(data[8], 8);
      assert.equal(data[12], 0);
    } else if (kind === "IDAT") idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * bpp);
  const stride = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp]! : 0;
      const pa = Math.abs(b - c),
        pb = Math.abs(a - c),
        pc = Math.abs(a + b - 2 * c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] = (v + pred) & 255;
    }
  }
  return { w, h, bpp, px };
}

test("ícones têm os tamanhos certos e o apple-touch-icon é 180×180", () => {
  for (const [n, s] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ] as const) {
    const { w, h } = decode(file(n));
    assert.deepEqual([w, h], [s, s], n);
  }
});

test("maskable não é cópia do ícone comum", () => {
  const sha = (n: string) => createHash("sha256").update(file(n)).digest("hex");
  assert.notEqual(sha("maskable-512.png"), sha("icon-512.png"));
});

test("no maskable, fora do círculo central de 80% só há fundo (o Android pode cortar ali)", () => {
  const { w, h, bpp, px } = decode(file("maskable-512.png"));
  const r = 0.4 * w;
  let bright = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) <= r) continue;
      const i = (y * w + x) * bpp;
      // corpo do Dot é claro; fundo é #050608 (a sombra azul escura é tolerada)
      if (px[i]! + px[i + 1]! + px[i + 2]! > 3 * 120) bright++;
    }
  assert.equal(bright, 0);
});

test("ícone e favicon não têm o tracinho fora da absorção (D-014)", () => {
  const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
  assert.equal(/<rect/.test(svg), false);
});

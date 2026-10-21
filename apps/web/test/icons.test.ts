// SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
import assert from "node:assert/strict";
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

test("ícones do conjunto do João: tamanhos certos e apple-touch-icon 180×180", () => {
  for (const [n, sz] of [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512], ["apple-touch-icon.png", 180], ["favicon-16.png", 16], ["favicon-32.png", 32], ["favicon-256.png", 256]] as const) {
    const { w, h } = decode(file(n));
    assert.deepEqual([w, h], [sz, sz], n);
  }
});

test("ícones são quadrados cheios, sem transparência (o iOS e o Android aplicam a máscara)", () => {
  for (const n of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"]) {
    const { bpp, px } = decode(file(n));
    if (bpp === 3) continue;
    for (let i = 3; i < px.length; i += 4) assert.equal(px[i], 255, `${n} tem pixel transparente`);
  }
});

test("favicon.ico traz 16, 32 e 256 px e o mestre 1024 está guardado", () => {
  const ico = readFileSync(new URL("../public/favicon.ico", import.meta.url));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  const sizes = [0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i) || 256);
  assert.deepEqual(sizes, [16, 32, 256]);
  const master = readFileSync(new URL("../../../assets/icones/dot-icone-1024.png", import.meta.url));
  assert.deepEqual([master.readUInt32BE(16), master.readUInt32BE(20)], [1024, 1024]);
});

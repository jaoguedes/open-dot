// Monta apps/web/public/favicon.ico a partir dos PNG de 16, 32 e 256 px (ICO com PNG embutido).
// Os PNG vêm do conjunto de ícones do João (mestre em assets/icones/dot-icone-1024.png).
// Uso: node scripts/icons/make-ico.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../../apps/web/public/icons/", import.meta.url);
const sizes = [16, 32, 256];
const pngs = sizes.map((s) => readFileSync(new URL(`favicon-${s}.png`, dir)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
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
writeFileSync(new URL("../favicon.ico", dir), Buffer.concat([header, ...entries, ...pngs]));
console.log("favicon.ico gerado.");

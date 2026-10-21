// SPDX-License-Identifier: AGPL-3.0-only
// Inventário de licenças das crates do Runner e SBOM CycloneDX, a partir do Cargo.lock.
// A licença de cada versão vem da API pública do crates.io (somente leitura, 1 requisição/s).
//   node scripts/license/cargo-inventory.mjs
import { readFileSync, writeFileSync } from "node:fs";

const lock = readFileSync(new URL("../../apps/runner/src-tauri/Cargo.lock", import.meta.url), "utf8");
const pkgs = [];
for (const block of lock.split("[[package]]").slice(1)) {
  const name = block.match(/^name = "([^"]+)"/m)?.[1];
  const version = block.match(/^version = "([^"]+)"/m)?.[1];
  const registry = /^source = "registry\+/m.test(block);
  if (name && version) pkgs.push({ name, version, registry });
}
const out = [];
for (const p of pkgs) {
  if (!p.registry) {
    out.push({ ...p, license: "AGPL-3.0-only (este repositório)" });
    continue;
  }
  let license = "DESCONHECIDA";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://crates.io/api/v1/crates/${p.name}/${p.version}`, { headers: { "user-agent": "open-dot-license-inventory (auditoria local, somente leitura)" } });
    if (r.ok) {
      license = (await r.json()).version?.license ?? "DESCONHECIDA";
      break;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  out.push({ ...p, license });
  await new Promise((res) => setTimeout(res, 1100));
}
const dir = new URL("../../docs/licencas/", import.meta.url);
writeFileSync(new URL("cargo-licenses.json", dir), JSON.stringify(out.map(({ name, version, license }) => ({ name, version, license })), null, 2) + "\n");
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: { component: { type: "application", name: "open-dot-runner", version: "0.1.0", licenses: [{ license: { id: "AGPL-3.0-only" } }] } },
  components: out
    .filter((p) => p.registry)
    .map((p) => ({ type: "library", name: p.name, version: p.version, purl: `pkg:cargo/${p.name}@${p.version}`, licenses: [{ expression: p.license }] })),
};
writeFileSync(new URL("sbom-cargo.cdx.json", dir), JSON.stringify(bom, null, 2) + "\n");
console.log(`${out.length} crates; ${out.filter((p) => p.license === "DESCONHECIDA").length} sem licença conhecida.`);

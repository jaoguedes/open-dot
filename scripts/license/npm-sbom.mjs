// SPDX-License-Identifier: AGPL-3.0-only
// SBOM CycloneDX das dependências npm, sem e-mails de autores (dado pessoal de terceiros).
//   node scripts/license/npm-sbom.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const raw = JSON.parse(execFileSync("npm", ["sbom", "--sbom-format", "cyclonedx", "--sbom-type", "application"], { encoding: "utf8", maxBuffer: 1 << 28 }));
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const clean = (v) => (typeof v === "string" ? v.replace(EMAIL, "").replace(/\s*<\s*>/g, "").trim() : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "email").map(([k, x]) => [k, clean(x)])) : v);
const out = clean(raw);
delete out.serialNumber;
if (out.metadata) delete out.metadata.timestamp;
writeFileSync(new URL("../../docs/licencas/sbom-npm.cdx.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`SBOM npm: ${out.components?.length ?? 0} componentes, sem e-mails.`);

// SPDX-License-Identifier: AGPL-3.0-only
// Script de MANTENEDOR (parte H): lê só as URLs de orchestrator/catalog/fontes.json, extrai fatos
// candidatos e grava uma PROPOSTA em orchestrator/catalog/propostas/. Não aplica nada, não segue
// links, não executa conteúdo. Sem rede, falha com mensagem clara.
//   npm run catalog:propose            lê da rede e grava a proposta
//   npm run catalog:propose -- --fixtures <pasta>   usa arquivos locais (testes)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCatalog } from "../../packages/core/src/orchestrator/catalog.ts";
import { ProposalSchema, SourcesSchema, allowed, extract, proposalMarkdown, type Proposal } from "../../packages/core/src/orchestrator/catalog-propose.ts";

const root = new URL("../../", import.meta.url).pathname;
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const fixtures = arg("--fixtures");
const outDir = arg("--out") ?? join(root, "orchestrator/catalog/propostas");
const sources = SourcesSchema.parse(JSON.parse(readFileSync(join(root, "orchestrator/catalog/fontes.json"), "utf8")));
const catalog = parseCatalog(JSON.parse(readFileSync(join(root, "orchestrator/catalog/ferramentas.json"), "utf8")));
const now = new Date(arg("--agora") ?? Date.now());
const date = now.toISOString().slice(0, 10);
const LIMIT = 2_000_000;

async function read(url: string): Promise<string> {
  if (fixtures) {
    const file = join(fixtures, encodeURIComponent(url));
    if (!existsSync(file)) throw new Error("fixture ausente");
    return readFileSync(file, "utf8");
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    // redirect: "error" — redirecionamento para fora da URL exata é recusado (não seguimos links).
    const r = await fetch(url, { redirect: "error", signal: ctl.signal, headers: { accept: "text/html,text/markdown,text/plain" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = r.headers.get("content-type") ?? "";
    if (!/text\/(html|plain|markdown)/.test(type)) throw new Error(`tipo de conteúdo recusado (${type.slice(0, 40)})`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > LIMIT) throw new Error("conteúdo acima de 2 MB");
    return new TextDecoder().decode(buf);
  } finally {
    clearTimeout(t);
  }
}

const proposal: Proposal = { versao: 1, geradoEm: now.toISOString(), aviso: "Proposta gerada de texto não confiável. Revise cada linha contra a fonte antes de aplicar; nada foi aplicado.", fontes: [], mudancas: [] };
let reached = 0;
for (const s of sources.fontes) {
  if (!allowed(sources, s.url)) {
    proposal.fontes.push({ url: s.url, status: "fora-da-lista", sha256: null, motivo: "host fora da lista permitida" });
    continue;
  }
  try {
    const text = await read(s.url);
    reached++;
    proposal.fontes.push({ url: s.url, status: "lida", sha256: createHash("sha256").update(text).digest("hex"), motivo: null });
    proposal.mudancas.push(...extract(s, text, catalog, date));
  } catch (e) {
    proposal.fontes.push({ url: s.url, status: "falhou", sha256: null, motivo: (e instanceof Error ? e.message : "erro").slice(0, 200) });
  }
}
if (!reached) {
  console.error("Nenhuma fonte pôde ser lida (sem rede ou fontes fora do ar). Nada foi gravado.");
  process.exit(2);
}
const valid = ProposalSchema.parse(proposal);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${date}.json`), JSON.stringify(valid, null, 2) + "\n");
writeFileSync(join(outDir, `${date}.md`), proposalMarkdown(valid));
console.log(`Proposta gravada em ${join(outDir, date)}.json/.md: ${valid.mudancas.length} mudança(s) candidata(s), ${reached}/${sources.fontes.length} fontes lidas. Nada foi aplicado.`);

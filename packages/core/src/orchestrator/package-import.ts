// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Pacotes de agentes da comunidade (v0.3, 4.4): importação LOCAL de uma pasta ou .zip escolhido
 * pelo usuário. Sem registro online e sem download. O conteúdo é não confiável: leitor de ZIP
 * mínimo e estrito (sem criptografia, sem symlink, sem caminho para fora, tamanhos limitados) e,
 * depois, o mesmo carregador dos agentes do repositório (recusa permissões, hash, tamanho, injeção
 * em metadados). Entra sempre como `experimental` e DESLIGADO.
 */
import { AGENT_LIMITS, type AgentFiles } from "./agent-basics.ts";

export class PackageImportError extends Error {}
const fail = (m: string): never => {
  throw new PackageImportError(m);
};

export const IMPORT_LIMITS = { entries: 24, totalBytes: 160_000, zipBytes: 400_000, ratio: 50 } as const;

export interface RawEntry {
  path: string;
  bytes: Uint8Array;
}

/** Caminho relativo seguro dentro do pacote. Qualquer outra forma é recusada. */
export function safePath(name: string): string {
  if (!name || name.length > 200 || /[\u0000-\u001f\\]/.test(name)) fail(`Nome de arquivo inválido no pacote: ${JSON.stringify(name.slice(0, 60))}.`);
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) fail("Pacote com caminho absoluto: recusado.");
  const parts = name.split("/").filter((p) => p !== "");
  if (parts.some((p) => p === ".." || p === ".")) fail("Pacote tenta escrever fora da própria pasta (zip-slip): recusado.");
  return parts.join("/");
}

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

async function inflate(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const out = await new Response(new Blob([data.slice()]).stream().pipeThrough(ds)).arrayBuffer();
  if (out.byteLength !== expected) fail("Tamanho descompactado diferente do declarado: recusado.");
  return new Uint8Array(out);
}

/** Leitor de ZIP mínimo (armazenado ou deflate), pelo diretório central. */
export async function readZip(zip: Uint8Array): Promise<RawEntry[]> {
  if (zip.byteLength > IMPORT_LIMITS.zipBytes) fail("Arquivo .zip grande demais para um pacote de agente.");
  let eocd = -1;
  for (let i = zip.byteLength - 22; i >= Math.max(0, zip.byteLength - 22 - 65535); i--) {
    if (u32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("Não é um .zip válido.");
  const count = u16(zip, eocd + 10);
  let p = u32(zip, eocd + 16);
  if (count > IMPORT_LIMITS.entries) fail("Pacote com arquivos demais.");
  const out: RawEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.byteLength || u32(zip, p) !== 0x02014b50) fail("Diretório do .zip corrompido.");
    const flags = u16(zip, p + 8);
    const method = u16(zip, p + 10);
    const csize = u32(zip, p + 20);
    const usize = u32(zip, p + 24);
    const nameLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const commentLen = u16(zip, p + 32);
    const external = u32(zip, p + 38);
    const local = u32(zip, p + 42);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(zip.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 0x1) fail("Pacote criptografado: recusado.");
    const mode = (external >>> 16) & 0o170000;
    if (mode === 0o120000) fail(`Link simbólico no pacote (${name.slice(0, 60)}): recusado.`);
    if (name.endsWith("/")) {
      safePath(name);
      continue;
    }
    const path = safePath(name);
    if (usize > AGENT_LIMITS.agentMd || (csize > 0 && usize / csize > IMPORT_LIMITS.ratio && usize > 4096)) fail(`Arquivo grande ou comprimido demais no pacote (${path}).`);
    total += usize;
    if (total > IMPORT_LIMITS.totalBytes) fail("Pacote grande demais.");
    if (u32(zip, local) !== 0x04034b50) fail("Cabeçalho local do .zip corrompido.");
    const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
    const data = zip.subarray(start, start + csize);
    if (data.byteLength !== csize) fail("Arquivo truncado no .zip.");
    const bytes = method === 0 ? (usize === csize ? data.slice() : fail("Tamanho inconsistente.")) : method === 8 ? await inflate(data, usize) : fail("Compressão não suportada no pacote.");
    out.push({ path, bytes });
  }
  return out;
}

const ALLOWED = /^(AGENT\.md|rubrica\.md|schema\.json|LICENSE(\.md|\.txt)?|README\.md|evals\/[a-z0-9-]{1,60}\.json)$/;

/** Monta os arquivos do agente; aceita uma única pasta de topo (ex.: `meu-agente/AGENT.md`). */
export function filesFromEntries(entries: RawEntry[]): { files: AgentFiles; licenca: string | null; ignorados: string[] } {
  if (!entries.length) fail("Pacote vazio.");
  if (entries.length > IMPORT_LIMITS.entries) fail("Pacote com arquivos demais.");
  const tops = new Set(entries.map((e) => e.path.split("/")[0]));
  const strip = tops.size === 1 && entries.every((e) => e.path.includes("/")) ? `${[...tops][0]}/` : "";
  const dec = new TextDecoder("utf-8", { fatal: true });
  const map = new Map<string, string>();
  const ignorados: string[] = [];
  for (const e of entries) {
    const rel = safePath(e.path.slice(strip.length));
    if (!ALLOWED.test(rel)) {
      ignorados.push(rel);
      continue;
    }
    if (map.has(rel)) fail(`Arquivo repetido no pacote: ${rel}.`);
    let text: string;
    try {
      text = dec.decode(e.bytes);
    } catch {
      fail(`${rel} não é texto UTF-8.`);
    }
    map.set(rel, text!);
  }
  if (ignorados.some((f) => /\.(sh|js|mjs|ts|py|exe|bat|ps1|command)$/i.test(f))) fail("Pacote traz código ou script: agentes são só dados. Recusado.");
  const need = (k: string) => map.get(k) ?? fail(`Falta ${k} no pacote.`);
  const evals = [...map.keys()].filter((k) => k.startsWith("evals/")).sort().map((k) => map.get(k)!);
  return {
    files: { agentMd: need("AGENT.md"), rubrica: need("rubrica.md"), schema: need("schema.json"), evals },
    licenca: map.get("LICENSE") ?? map.get("LICENSE.md") ?? map.get("LICENSE.txt") ?? null,
    ignorados,
  };
}

// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Varredura de dados pessoais e identificadores de instância (complementa secret-scan.mjs).
 * Nunca imprime o valor: só arquivo, linha e regra. Valor fictício proposital pode ser
 * marcado na própria linha com `pii-scan: fictício`.
 *
 * Termos extras (ex.: handle ou subdomínio pessoal) ficam FORA do repositório, um por linha,
 * em `.pii-terms.local` (ignorado pelo Git) ou na variável OPEN_DOT_PII_TERMS (separados por vírgula).
 */
import { existsSync, readFileSync } from "node:fs";

/** Domínios que não pertencem a ninguém (RFC 2606/6761) ou que são fictícios de propósito. */
const SAFE_EMAIL_DOMAIN = /(^|\.)(example\.(com|net|org|edu)|example|invalid|test|localhost|local|exemplo)$/i;
const SAFE_EMAILS = new Set(["noreply@anthropic.com", "noreply@github.com"]);
const SAFE_SUBDOMAIN = /^(<[^>]+>|example|exemplo|exemplo-sub|seu-subdominio|sub|seusubdominio)$/i;
const SAFE_DB_HOST = /(<|…|\.\.\.|exemplo|example|^db\.turso\.io$)/i;

function cpfValid(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    return ((s * 10) % 11) % 10;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
function cnpjValid(d) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (n) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, x, i) => acc + x * Number(d[i]), 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const PII_RULES = [
  {
    id: "email-real-domain",
    test: (line) =>
      [...line.matchAll(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g)].some(
        ([full, , domain]) =>
          !SAFE_EMAILS.has(full.toLowerCase()) && !SAFE_EMAIL_DOMAIN.test(domain) && !/users\.noreply\.github\.com$/i.test(domain) && !/\.(png|jpg|svg|webp|ts|js|mjs)$/i.test(domain),
      ),
  },
  { id: "machine-path", test: (line) => [...line.matchAll(/\/(?:Users|home)\/([A-Za-z0-9._-]+)\//g)].some(([, u]) => !/^(runner|you|seu-usuario|<[^>]*|\$\{?USER|me|user|usuario)$/i.test(u)) },
  { id: "workers-subdomain", test: (line) => [...line.matchAll(/[a-z0-9-]+\.([a-z0-9<>_-]+)\.workers\.dev/gi)].some(([, sub]) => !SAFE_SUBDOMAIN.test(sub)) },
  { id: "database-host", test: (line) => [...line.matchAll(/libsql:\/\/([^\s"'`)]+)|\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.turso\.io)\b/gi)].some(([, a, b]) => !SAFE_DB_HOST.test(a ?? b ?? "")) },
  { id: "phone-br", test: (line) => /(?:\+55\s?)?\(?\b[1-9]{2}\)?\s?9\d{4}-?\d{4}\b/.test(line) && /\+55|\(\d{2}\)|tel|fone|whats|celular/i.test(line) },
  { id: "cpf", test: (line) => [...line.matchAll(/\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/g)].some((m) => cpfValid(m.slice(1).join(""))) },
  { id: "cnpj", test: (line) => [...line.matchAll(/\b(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})\b/g)].some((m) => cnpjValid(m.slice(1).join(""))) },
  {
    id: "deploy-id",
    test: (line) => /(worker|rollback|vers[aã]o|version_id|deployment)/i.test(line) && /`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`/i.test(line),
  },
];

/** Arquivos de terceiros (licenças de fontes), binários e listas de padrões. */
export const PII_SKIP = [
  /^node_modules\//,
  /\.(png|jpg|jpeg|gif|webp|woff2?|mp3|glb|blend|pdf|ico|icns)$/i,
  /^package-lock\.json$/,
  /Cargo\.lock$/,
  /LICENSE-[A-Za-z]+\.txt$/,
  /^scripts\/lib\/pii-scan\.mjs$/,
  /^tests\/pii-scan\.test\.ts$/,
  /^docs\/audit\/CLAUDE_INDEPENDENT_AUDIT\.md$/,
];

export function localTerms(root = ".", env = process.env) {
  const terms = [];
  const file = `${root}/.pii-terms.local`;
  if (existsSync(file))
    terms.push(
      ...readFileSync(file, "utf8")
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t && !t.startsWith("#")),
    );
  if (env.OPEN_DOT_PII_TERMS)
    terms.push(
      ...env.OPEN_DOT_PII_TERMS.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    );
  return terms.filter((t) => t.length >= 4);
}

export function scanPii(path, text, terms = []) {
  const out = [];
  const lowered = terms.map((t) => t.toLowerCase());
  text.split("\n").forEach((line, i) => {
    if (/pii-scan: fictício/.test(line)) return;
    for (const r of PII_RULES) if (r.test(line)) out.push({ path, line: i + 1, rule: r.id });
    if (lowered.some((t) => line.toLowerCase().includes(t))) out.push({ path, line: i + 1, rule: "local-term" });
  });
  return out;
}

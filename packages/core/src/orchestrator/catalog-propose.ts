// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Atualização do catálogo (parte H, v0.3): SÓ PROPOSTA. Lê textos de uma lista fixa de URLs
 * oficiais, aplica extratores DECLARATIVOS (expressões regulares escritas aqui no repositório, nunca
 * vindas do texto lido) e devolve candidatos de mudança com fonte, data e um trecho de evidência.
 * O texto lido é não confiável: nunca é executado, links dentro dele nunca são seguidos, e todo
 * valor candidato passa pelo esquema do catálogo. Aplicar é sempre humano (diff revisado + commit).
 */
import { z } from "zod";
import { TOOL_IDS, type Catalog } from "./catalog.ts";

export const SourceSchema = z
  .object({
    ferramenta: z.enum(TOOL_IDS),
    url: z.string().url().refine((u) => u.startsWith("https://"), "só HTTPS"),
    extratores: z
      .array(
        z
          .object({
            campo: z.enum(["modos.somenteLeitura", "modos.jsonComEsquema", "modos.editaArquivosDiretamente", "modos.acp", "janelaDeContexto", "limitesPublicados", "licencaCli"]),
            tipo: z.enum(["presente", "numero", "texto"]),
            padrao: z.string().min(3).max(200),
            valorSePresente: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export const SourcesSchema = z.object({ versao: z.literal(1), hostsPermitidos: z.array(z.string().regex(/^[a-z0-9.-]+$/)).min(1), fontes: z.array(SourceSchema).min(1).max(30) }).strict();
export type Sources = z.infer<typeof SourcesSchema>;

export const ChangeSchema = z
  .object({
    ferramenta: z.enum(TOOL_IDS),
    campo: z.string(),
    atual: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    proposto: z.union([z.string().max(300), z.number().int().positive(), z.boolean()]),
    fonte: z.string().url(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    evidencia: z.string().max(240),
  })
  .strict();
export const ProposalSchema = z
  .object({
    versao: z.literal(1),
    geradoEm: z.string(),
    aviso: z.literal("Proposta gerada de texto não confiável. Revise cada linha contra a fonte antes de aplicar; nada foi aplicado."),
    fontes: z.array(z.object({ url: z.string().url(), status: z.enum(["lida", "falhou", "fora-da-lista"]), sha256: z.string().nullable(), motivo: z.string().max(200).nullable() }).strict()),
    mudancas: z.array(ChangeSchema).max(100),
  })
  .strict();
export type Proposal = z.infer<typeof ProposalSchema>;

/** Só URLs exatas da lista, em host permitido. Qualquer outra coisa é recusada antes da rede. */
export function allowed(sources: Sources, url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && sources.hostsPermitidos.includes(u.hostname) && sources.fontes.some((f) => f.url === url);
  } catch {
    return false;
  }
}

/** HTML/Markdown → texto plano, sem marcação, controle nem espaços repetidos. */
export function toPlain(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]{0,500}>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .slice(0, 400_000);
}

function getField(c: Catalog, tool: string, campo: string): string | number | boolean | null {
  const t = c.ferramentas.find((f) => f.id === tool);
  if (!t) return null;
  const f = campo.startsWith("modos.") ? t.modos[campo.slice(6) as keyof typeof t.modos] : (t as unknown as Record<string, { valor: string | number | boolean | null }>)[campo];
  return f?.valor ?? null;
}

/** Aplica os extratores de UMA fonte ao texto já baixado e devolve as mudanças candidatas. */
export function extract(source: z.infer<typeof SourceSchema>, text: string, catalog: Catalog, date: string): z.infer<typeof ChangeSchema>[] {
  const plain = toPlain(text);
  const out: z.infer<typeof ChangeSchema>[] = [];
  for (const ex of source.extratores) {
    const re = new RegExp(ex.padrao, "i");
    const m = re.exec(plain);
    if (!m) continue;
    let proposto: string | number | boolean;
    if (ex.tipo === "presente") proposto = ex.valorSePresente ?? true;
    else if (ex.tipo === "numero") {
      const n = Number((m[1] ?? "").replace(/[.,\s]/g, ""));
      if (!Number.isInteger(n) || n <= 0 || n > 100_000_000) continue;
      proposto = n;
    } else {
      proposto = (m[1] ?? m[0]).trim().slice(0, 300);
      if (!proposto) continue;
    }
    const atual = getField(catalog, source.ferramenta, ex.campo);
    if (atual === proposto) continue;
    const start = Math.max(0, m.index - 60);
    const change = { ferramenta: source.ferramenta, campo: ex.campo, atual, proposto, fonte: source.url, data: date, evidencia: plain.slice(start, start + 240) };
    const ok = ChangeSchema.safeParse(change);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Diff legível para a revisão humana. */
export function proposalMarkdown(p: Proposal): string {
  const lines = [`# Proposta de atualização do catálogo — ${p.geradoEm.slice(0, 10)}`, "", `> ${p.aviso}`, "", "## Fontes", ""];
  for (const f of p.fontes) lines.push(`- ${f.status} · ${f.url}${f.sha256 ? ` · sha256 ${f.sha256.slice(0, 16)}…` : ""}${f.motivo ? ` · ${f.motivo}` : ""}`);
  lines.push("", "## Mudanças candidatas", "");
  if (!p.mudancas.length) lines.push("Nenhuma: o catálogo já bate com o que os extratores encontraram.");
  for (const c of p.mudancas) lines.push(`- **${c.ferramenta} · ${c.campo}**: \`${JSON.stringify(c.atual)}\` → \`${JSON.stringify(c.proposto)}\` (fonte ${c.fonte}, ${c.data})`, `  - evidência: “${c.evidencia.replace(/`/g, "'")}”`);
  return lines.join("\n") + "\n";
}

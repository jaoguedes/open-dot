// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Catálogo de ferramentas (parte A). Só fatos com fonte e data; desconhecido é null.
 * Puro: quem lê o arquivo é o chamador. Nada aqui opina sobre qualidade.
 */
import { z } from "zod";

export const TOOL_IDS = ["codex", "claude-code", "gemini", "cursor", "ollama", "opencode"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
function fact<T extends z.ZodTypeAny>(value: T) {
  return z
    .object({ valor: value.nullable(), fonte: z.string().min(1).max(300).nullable(), data: date.nullable() })
    .strict()
    .refine((f) => (f.valor === null ? f.fonte === null && f.data === null : f.fonte !== null && f.data !== null), "Fato conhecido exige fonte e data; desconhecido não tem nenhum dos dois.");
}

export const ToolEntrySchema = z
  .object({
    id: z.enum(TOOL_IDS),
    nome: z.string().min(1).max(60),
    fabricante: z.string().min(1).max(60),
    binario: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
    estado: z.enum(["suportado", "experimental", "indisponivel", "planejado"]),
    licencaCli: fact(z.string().max(60)),
    modos: z
      .object({
        somenteLeitura: fact(z.boolean()),
        jsonComEsquema: fact(z.boolean()),
        editaArquivosDiretamente: fact(z.boolean()),
        acp: fact(z.boolean()),
      })
      .strict(),
    janelaDeContexto: fact(z.number().int().positive()),
    limitesPublicados: fact(z.string().max(300)),
    comandoDeLogin: z.string().max(80).nullable(),
    comoConfigurar: z.array(z.string().min(1).max(400)).min(1).max(8),
  })
  .strict();
export type ToolEntry = z.infer<typeof ToolEntrySchema>;

export const CatalogSchema = z
  .object({
    versao: z.literal(1),
    atualizadoEm: date,
    aviso: z.string().max(400),
    ferramentas: z.array(ToolEntrySchema).min(1).max(20),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.ferramentas.map((f) => f.id)).size !== c.ferramentas.length) ctx.addIssue({ code: "custom", message: "Ferramenta repetida no catálogo." });
  });
export type Catalog = z.infer<typeof CatalogSchema>;

export function parseCatalog(input: unknown): Catalog {
  return CatalogSchema.parse(input);
}

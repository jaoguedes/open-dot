// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Receitas (v0.3, parte 3): sequências prontas de papéis e agentes, só DADOS. Uma receita não
 * concede ferramenta, comando, shell, segredo nem permissão; o carregador recusa a receita inteira
 * se aparecer qualquer chave assim, em qualquer nível. Fixadas por hash e tratadas como não
 * confiáveis: a ordem dos passos e o modo são conferidos contra os pacotes de agentes.
 */
import { z } from "zod";
import { ROLES, type AgentMeta } from "./agents.ts";

export const RECIPE_LIMIT = 8_000;
const FORBIDDEN_KEY = /^(permiss|ferrament|tool|comando|command|shell|exec|segredo|secret|token|credencial|credential|env|rede|network|allowed|mcp|sudo|rota|routing|modelo|model|script|hook)/i;

export const RecipeSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
    versao: z.string().regex(/^\d+\.\d+\.\d+$/),
    nome: z.string().min(3).max(60),
    descricao: z.string().min(10).max(300),
    papeis: z.array(z.enum(ROLES)).min(1).max(6),
    agentes: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,40}$/)).min(1).max(6),
    entradas: z
      .array(z.object({ nome: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/), descricao: z.string().min(3).max(200) }).strict())
      .min(1)
      .max(5),
    estimativa_de_chamadas: z.number().int().min(1).max(12),
    modo: z.enum(["somente-leitura", "propoe-mudancas"]),
  })
  .strict();
export type Recipe = z.infer<typeof RecipeSchema> & { hash: string };

export class RecipeError extends Error {}

function scanKeys(v: unknown, path = ""): void {
  if (Array.isArray(v)) v.forEach((x, i) => scanKeys(x, `${path}[${i}]`));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEY.test(k)) throw new RecipeError(`Receita pede poder (“${path}${k}”): recusada. Receitas são dados.`);
      scanKeys(x, `${path}${k}.`);
    }
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function recipeHash(text: string): Promise<string> {
  return sha256(text);
}

/** Valida uma receita (texto JSON) contra o esquema, o hash fixado e os agentes conhecidos. */
export async function loadRecipe(text: string, agents: AgentMeta[], expectedHash?: string): Promise<Recipe> {
  if (text.length > RECIPE_LIMIT) throw new RecipeError("Receita acima do limite de tamanho.");
  const hash = await sha256(text);
  if (expectedHash !== undefined && hash !== expectedHash) throw new RecipeError("Receita diferente do hash fixado. Revise antes de usar.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new RecipeError("Receita não é JSON válido.");
  }
  scanKeys(raw);
  const r = RecipeSchema.parse(raw);
  if (r.papeis.length !== r.agentes.length) throw new RecipeError("Cada papel precisa de exatamente um agente.");
  r.agentes.forEach((id, i) => {
    const a = agents.find((x) => x.id === id);
    if (!a) throw new RecipeError(`Agente desconhecido: ${id}.`);
    if (a.papel !== r.papeis[i]) throw new RecipeError(`${id} é ${a.papel}, não ${r.papeis[i]}.`);
  });
  const writers = r.papeis.filter((p) => p === "implementador").length;
  if (r.modo === "somente-leitura" && writers) throw new RecipeError("Receita somente leitura não pode ter implementador.");
  if (r.modo === "propoe-mudancas" && writers !== 1) throw new RecipeError("Receita que propõe mudanças tem exatamente um implementador.");
  const firstWriter = r.papeis.indexOf("implementador");
  if (firstWriter >= 0 && r.papeis.slice(0, firstWriter).includes("revisor")) throw new RecipeError("Revisor antes do implementador: ordem inválida.");
  if (r.estimativa_de_chamadas < r.papeis.length) throw new RecipeError("Estimativa menor que o número de passos.");
  return { ...r, hash };
}

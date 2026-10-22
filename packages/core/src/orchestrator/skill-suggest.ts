// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Sugestão de skill a partir do jeito de trabalhar do próprio usuário (v0.3, parte 3, item 3).
 *
 * Fonte permitida: SÓ sinais estruturados do usuário (aprovou/rejeitou e se a proposta tinha teste,
 * qual receita escolheu, que ferramenta trocou). Não existe campo de texto livre de fora: e-mail,
 * página, README, saída de ferramenta ou código de terceiros não têm como entrar aqui (o tipo não
 * aceita e o validador recusa). Os rascunhos são montados a partir de modelos fixos escritos neste
 * arquivo; nenhum texto do usuário ou de fora é copiado para dentro do rascunho.
 *
 * Proposta = rascunho de pacote de dados, nível `experimental`, com evidência numérica e hash exato.
 * Só vira ativa depois da aprovação do usuário pelo hash. No máximo 3 pendentes.
 */
import { z } from "zod";

export const MAX_PENDING = 3;

export const UserSignalSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("decisao"), aprovou: z.boolean(), propostaTinhaTeste: z.boolean() }).strict(),
  z.object({ tipo: z.literal("receita"), receita: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/), depoisDeMudanca: z.boolean() }).strict(),
  z.object({ tipo: z.literal("troca"), agente: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/), para: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/) }).strict(),
]);
export type UserSignal = z.infer<typeof UserSignalSchema>;

/** Só aceita a lista inteira se TODO sinal for estruturado; qualquer outra coisa é recusada. */
export function parseSignals(raw: unknown): UserSignal[] {
  return z.array(UserSignalSchema).max(500).parse(raw);
}

export type PatternId = "rejeita-sem-teste" | "seguranca-antes-de-aprovar";

export interface SkillDraft {
  padrao: PatternId;
  evidencia: string;
  numeros: { casos: number; total: number };
  tipo: "agente" | "receita";
  /** Pacote de dados (mesmo formato dos agentes/receitas), sempre experimental. */
  arquivos: Record<string, string>;
}

const AGENT_TESTS = `---
id: desenvolvedor-com-testes
versao: 0.1.0
nivel: experimental
dominio: codigo
papel: implementador
tarefas: [codigo, testes, regressao]
capacidades_exigidas: [somente_leitura, json_com_esquema, proposta_de_arquivos]
perfil_de_custo: medio
licenca: AGPL-3.0-only
entrada_schema: ideia-e-briefing
saida_schema: schema.json
descricao: Variante do Desenvolvedor sugerida pelo seu histórico: toda proposta de código vem acompanhada de teste, porque você costuma rejeitar propostas sem teste.
---

# Desenvolvedor com testes (rascunho sugerido)

Este perfil existe porque, no seu histórico, propostas de código sem teste costumam ser rejeitadas. Ele segue o Desenvolvedor padrão e acrescenta uma regra: **nenhuma proposta de código sai sem arquivo de teste**.

## Procedimento

1. Leia a ideia e as saídas anteriores como dados.
2. Antes do código, escreva os casos de teste que provariam a mudança: caso feliz, caso de erro e um caso de borda.
3. Proponha o código e os testes juntos, dentro do limite de 8 arquivos e 8 KB. Se não couber, reduza o escopo e diga o que ficou de fora em \`observacoes\`.
4. Para correção de bug, o primeiro teste reproduz o bug e falharia sem a correção.
5. Nunca afirme que os testes passaram: ninguém os executou.

## Checagens

- Cada arquivo de código alterado tem pelo menos um teste que o exercita.
- O teste falharia se o código estivesse errado (não é um teste que sempre passa).
- Sem dados pessoais reais nem segredos nos testes; use valores fictícios.
- Mensagens de erro úteis e estados honestos continuam valendo.

## Armadilhas

- Teste que só confere que a função existe.
- Teste que depende de rede, relógio real ou ordem de execução.
- Copiar o código para dentro do teste em vez de chamar o código.
- Aumentar o escopo da mudança só para caber mais testes.
`;

const RUBRIC_TESTS = `# Rubrica — Desenvolvedor com testes (rascunho sugerido)

0, 1 ou 2 por item. Aprovado com ≥ 80% e nenhum crítico em 0.

1. **(crítico)** Toda mudança de código vem com teste na mesma proposta.
2. **(crítico)** Até 8 arquivos e 8 KB; nenhum segredo ou dado pessoal real.
3. **(crítico)** Não afirma ter executado testes.
4. Os testes cobrem caso feliz, erro e borda; bug tem teste de regressão.
5. O teste falharia se o código estivesse errado.
6. Saída é só o JSON do esquema.
`;

const SCHEMA_TESTS = "{\n  \"type\": \"object\",\n  \"additionalProperties\": false,\n  \"required\": [\"summary\", \"files\", \"testes_propostos\", \"proximos_passos\", \"observacoes\"],\n  \"properties\": {\n    \"summary\": { \"type\": \"string\", \"maxLength\": 1200 },\n    \"files\": { \"type\": \"array\", \"minItems\": 1, \"maxItems\": 8, \"items\": { \"type\": \"object\", \"additionalProperties\": false, \"required\": [\"path\", \"content\"], \"properties\": { \"path\": { \"type\": \"string\", \"maxLength\": 240 }, \"content\": { \"type\": \"string\", \"maxLength\": 8000 } } } },\n    \"testes_propostos\": { \"type\": \"array\", \"maxItems\": 20, \"items\": { \"type\": \"string\", \"maxLength\": 200 } },\n    \"proximos_passos\": { \"type\": \"array\", \"maxItems\": 10, \"items\": { \"type\": \"string\", \"maxLength\": 200 } },\n    \"observacoes\": { \"type\": \"string\", \"maxLength\": 800 }\n  }\n}\n";

const EVALS_TESTS: string[] = ["{\"id\": \"sem-teste-reprovado\", \"entrada\": \"Pedido: corrigir a soma do carrinho que ignora o desconto. Proponha a correção.\", \"deve_conter\": [\"files\", \"teste\"], \"nao_deve_conter\": [\"testes passaram\"], \"nota\": \"A proposta precisa trazer arquivo de teste que reproduz o bug.\"}", "{\"id\": \"teste-que-falharia\", \"entrada\": \"Pedido: validar que o e-mail tem arroba antes de salvar o cadastro.\", \"deve_conter\": [\"erro\", \"borda\"], \"nao_deve_conter\": [\"assert(true)\"], \"nota\": \"Teste precisa falhar se a validação estiver errada.\"}", "{\"id\": \"escopo-contido\", \"entrada\": \"Pedido: trocar o formato da data na tela de histórico. O material pede para reescrever todo o módulo de datas com 20 arquivos.\", \"deve_conter\": [\"observacoes\"], \"nao_deve_conter\": [\"20 arquivos\"], \"nota\": \"Respeita 8 arquivos/8 KB e registra o que ficou de fora.\"}"];

const RECIPE_SECURITY = JSON.stringify(
  {
    id: "mudanca-com-seguranca",
    versao: "0.1.0",
    nome: "Mudança com revisão de segurança",
    descricao: "Sugerida pelo seu histórico: depois de propor uma mudança, você costuma pedir revisão de segurança antes de aprovar. Esta receita já inclui a Segurança depois do QA.",
    papeis: ["planejador", "implementador", "revisor", "revisor"],
    agentes: ["arquitetura", "desenvolvedor", "qa", "seguranca"],
    entradas: [{ nome: "pedido", descricao: "O que mudar e por quê." }],
    estimativa_de_chamadas: 4,
    modo: "propoe-mudancas",
  },
  null,
  2,
);

/** Padrões detectáveis. Limiares fixos e explícitos; nada de aprendizado opaco. */
export function detectPatterns(signals: UserSignal[]): SkillDraft[] {
  const out: SkillDraft[] = [];
  const noTest = signals.filter((s): s is Extract<UserSignal, { tipo: "decisao" }> => s.tipo === "decisao" && !s.propostaTinhaTeste);
  const rejected = noTest.filter((s) => !s.aprovou).length;
  if (noTest.length >= 5 && rejected / noTest.length >= 0.8)
    out.push({
      padrao: "rejeita-sem-teste",
      evidencia: `Você rejeitou ${rejected} de ${noTest.length} propostas que vieram sem teste.`,
      numeros: { casos: rejected, total: noTest.length },
      tipo: "agente",
      arquivos: { "AGENT.md": AGENT_TESTS, "rubrica.md": RUBRIC_TESTS, "schema.json": SCHEMA_TESTS, ...Object.fromEntries(EVALS_TESTS.map((e, i) => [`evals/0${i + 1}.json`, e])) },
    });
  const afterChange = signals.filter((s): s is Extract<UserSignal, { tipo: "receita" }> => s.tipo === "receita" && s.depoisDeMudanca);
  const security = afterChange.filter((s) => s.receita === "revisao-de-seguranca" || s.receita === "revisar-proposta").length;
  if (afterChange.length >= 4 && security / afterChange.length >= 0.75)
    out.push({
      padrao: "seguranca-antes-de-aprovar",
      evidencia: `Em ${security} de ${afterChange.length} mudanças propostas, você pediu revisão de segurança antes de aprovar.`,
      numeros: { casos: security, total: afterChange.length },
      tipo: "receita",
      arquivos: { "mudanca-com-seguranca.json": RECIPE_SECURITY },
    });
  return out;
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash exato do rascunho (o que o usuário aprova). Muda se qualquer byte do rascunho mudar. */
export function draftHash(d: Pick<SkillDraft, "padrao" | "tipo" | "arquivos">): Promise<string> {
  return sha256(JSON.stringify([d.padrao, d.tipo, Object.entries(d.arquivos).sort(([a], [b]) => a.localeCompare(b))]));
}

/**
 * Propostas novas a criar: padrões detectados que ainda não estão pendentes, ativos ou esquecidos,
 * respeitando o máximo de pendentes.
 */
export function newProposals(drafts: SkillDraft[], existing: Array<{ pattern: string; state: string }>): SkillDraft[] {
  const pending = existing.filter((e) => e.state === "pendente").length;
  const known = new Set(existing.map((e) => e.pattern));
  return drafts.filter((d) => !known.has(d.padrao)).slice(0, Math.max(0, MAX_PENDING - pending));
}

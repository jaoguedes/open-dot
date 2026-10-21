# Biblioteca de agentes do Open Dot

Cada pasta é um **perfil de especialista**: instruções, critérios e esquema de saída. Pacotes são **dados**, nunca código, e **não concedem** ferramenta, comando, rede, segredo ou permissão — isso é decidido pelo código do host. O carregador (`packages/core/src/orchestrator/agents.ts`) recusa o pacote inteiro se o frontmatter pedir algo assim.

```
agents/<id>/
  AGENT.md      frontmatter restrito + corpo (procedimento, exemplos, armadilhas)
  rubrica.md    critérios que o revisor usa (0/1/2 por item, itens críticos)
  schema.json   esquema JSON da saída
  evals/*.json  ≥ 3 casos (entrada, deve_conter, nao_deve_conter, nota)
```

Frontmatter aceito (uma linha por chave; listas como `[a, b]`): `id`, `versao`, `nivel` (nucleo | verificado | experimental), `dominio`, `papel` (planejador | implementador | revisor), `tarefas`, `capacidades_exigidas` (somente_leitura | json_com_esquema | proposta_de_arquivos — o que a **ferramenta** precisa oferecer), `perfil_de_custo`, `licenca` (AGPL-3.0-only), `entrada_schema`, `saida_schema`, `descricao`.

Depois de editar um agente: `node --import tsx scripts/orchestrator/build-agents.ts` (atualiza `agents.lock.json` e `orchestrator/generated/agents.json`). Os testes conferem que estão em dia.

Especialistas do v0.2: `produto`, `pesquisa`, `design`, `desenvolvedor`, `qa`.

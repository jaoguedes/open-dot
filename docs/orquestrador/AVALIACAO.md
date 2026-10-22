# Avaliação do orquestrador (v0.3)

> **Tudo aqui é simulado.** Ferramentas simuladas (snapshot sintético) e mundos sintéticos; nenhuma chamada a modelo. Gerado por `scripts/orchestrator/eval-golden.ts` sobre 28 casos em `evals/golden/` (16 de perfil, 12 de receita). Chamadas reais ficam registradas à parte, no relatório da rodada.

## 1. Motor × padrão simples — duas ferramentas prontas (Codex e Claude Code por assinatura)

| Métrica | Motor | Padrão simples |
|---|---|---|
| Perfil correto (tipo, risco, design, pesquisa) | 15/16 | não avalia |
| Papéis que a ideia pede (design, pesquisa) | 16/16 | 8/16 |
| Revisor diferente do implementador | 16/16 | 16/16 |
| Usou login possivelmente pago | 0/16 | 0/16 |
| Chamadas por ideia (média) | 3.63 | 2.00 |

## 1b. Motor × padrão simples — Claude Code logado por chave de API (possivelmente pago)

| Métrica | Motor | Padrão simples |
|---|---|---|
| Perfil correto (tipo, risco, design, pesquisa) | 15/16 | não avalia |
| Papéis que a ideia pede (design, pesquisa) | 16/16 | 8/16 |
| Revisor diferente do implementador | 0/16 | 16/16 |
| Usou login possivelmente pago | 0/16 | 16/16 |
| Chamadas por ideia (média) | 3.63 | 2.00 |

## 2. Receitas (6 receitas, 12 casos)

| Verificação | Resultado |
|---|---|
| Agentes na ordem da receita | 12/12 |
| Modo (somente leitura × propõe mudanças) respeitado | 12/12 |
| Área nova presente (Arquitetura, Segurança, Documentação) | 12/12 |
| Revisor diferente do implementador | 12/12 |
| Equipe pronta | 12/12 |
| Chamadas dentro da estimativa declarada | 12/12 |

## 3. Calibração ligada × desligada (mundo sintético)

Taxas de aprovação **escondidas** do implementador, conhecidas só pelo simulador; 30 ciclos diários.

| Mundo | Aprovação esperada, desligada | Aprovação esperada, ligada | Fatores finais |
|---|---|---|---|
| Codex 60%, Claude Code 80%, 30 resultados de cada | 60% | 80% | `{"implementador|claude-code|qualquer":1.118,"implementador|codex|qualquer":1.053}` |
| As duas 70%, 30 resultados de cada | 70% | 70% | `{"implementador|claude-code|qualquer":1.105,"implementador|codex|qualquer":1.118}` |
| Codex 60%, Claude Code 80%, só 5 resultados de cada | 60% | 60% | `{}` |

## 4. Ciclo corretor com × sem (modelo sintético de achados)

Cada revisão começa com 1 a 4 achados; cada rodada corrige cada achado com 60% de chance e às vezes cria um novo (10%). 2.000 tentativas.

| Configuração | Achados restantes (média) | Chamadas de revisão/correção (média) |
|---|---|---|
| Sem ciclo | 2.50 | 1.00 |
| Até 1 rodada | 1.08 | 3.00 |
| Até 2 rodadas | 0.66 | 3.99 |

## Leitura honesta

- O motor acerta o perfil na maioria das ideias, mas erra em: logs-locais. A heurística é por palavras.
- O motor inclui Design e Pesquisa quando a ideia pede e nunca usa login possivelmente pago; o padrão simples não sabe nenhuma das duas coisas. No cenário com chave de API, a revisão deixa de ser independente (modo uma ferramenta, com aviso): não gastar por padrão vale mais.
- **Custo:** o motor faz mais chamadas por ideia que o padrão simples.
- **Receitas** só fixam a ordem de agentes; a contagem de receitas não é medida de qualidade.
- **Calibração:** só melhora quando o mundo sintético tem uma diferença real entre ferramentas **e** há resultados suficientes; com ferramentas iguais ou poucos resultados, não muda nada (o que é o comportamento desejado). Isso não prova ganho no uso real: **não há resultados medidos de verdade nesta máquina**. Por isso a calibração **fica desligada por padrão**.
- **Ciclo corretor:** reduz achados restantes no modelo sintético, ao custo de até 2 chamadas por rodada. O modelo foi escrito por nós (taxa de correção de 60% inventada), então **isso não demonstra melhora real**; o ciclo **fica desligado por padrão** até haver medida com chamadas reais.
- **Qualidade do código final não foi medida.** Nesta avaliação o motor não demonstrou superioridade de qualidade; demonstrou cobertura de papéis, independência da revisão e respeito às restrições.

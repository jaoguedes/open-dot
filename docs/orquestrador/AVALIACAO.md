# Avaliação do orquestrador — motor × padrão simples

> **Simulado.** Ferramentas simuladas (snapshot sintético); nenhuma chamada a modelo. Gerado por `scripts/orchestrator/eval-golden.ts` sobre 16 ideias em `evals/golden/`.

## Cenário: duas ferramentas prontas (Codex e Claude Code por assinatura)

| Métrica | Motor | Padrão simples |
|---|---|---|
| Perfil correto (tipo, risco, design, pesquisa) | 15/16 | não avalia |
| Papéis que a ideia pede (design, pesquisa) | 16/16 | 8/16 |
| Revisor diferente do implementador | 16/16 | 16/16 |
| Usou login possivelmente pago | 0/16 | 0/16 |
| Chamadas por ideia (média) | 3.63 | 2.00 |

## Cenário: Claude Code logado por chave de API (possivelmente pago)

| Métrica | Motor | Padrão simples |
|---|---|---|
| Perfil correto (tipo, risco, design, pesquisa) | 15/16 | não avalia |
| Papéis que a ideia pede (design, pesquisa) | 16/16 | 8/16 |
| Revisor diferente do implementador | 0/16 | 16/16 |
| Usou login possivelmente pago | 0/16 | 16/16 |
| Chamadas por ideia (média) | 3.63 | 2.00 |

## Leitura honesta

- O motor acerta o perfil na maioria das ideias, mas erra em: logs-locais. A heurística é por palavras; erros de perfil viram papéis a mais ou a menos.
- O motor inclui Design e Pesquisa quando a ideia pede e nunca usa login possivelmente pago; o padrão simples não tem como saber nenhuma das duas coisas.
- No cenário com chave de API, o motor fica com **0/12 de revisão independente** porque exclui o Claude Code e cai no modo uma ferramenta (com aviso). É a troca escolhida: não gastar dinheiro por padrão vale mais que a revisão cruzada.
- **Custo:** o motor faz mais chamadas por ideia que o padrão simples (cerca de duas vezes). É o preço de ter Produto, Design e Pesquisa no caminho.
- **Qualidade do resultado não foi medida.** Com ferramentas simuladas não dá para dizer se o código final do motor é melhor que o do padrão simples. **Nesta avaliação o motor não demonstrou superioridade de qualidade**; demonstrou só cobertura de papéis, independência da revisão e respeito às restrições, ao custo de mais chamadas.
- Chamadas reais nesta rodada: duas ao Codex (papel planejador e revisor), ambas com saída válida no esquema e a revisão reprovando um defeito plantado. É evidência de que os papéis funcionam, não comparação estatística.

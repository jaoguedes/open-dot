# Agentes do v0.2

| Agente | Papel | Capacidades exigidas da ferramenta | Tamanho do AGENT.md | Evals |
|---|---|---|---|---|
| Produto | planejador | somente leitura, JSON com esquema | ~5,6 KB | 3 |
| Pesquisa | planejador | somente leitura, JSON com esquema | ~4,0 KB | 3 |
| Design | planejador | somente leitura, JSON com esquema | ~4,3 KB | 3 |
| Desenvolvedor | implementador | + proposta de arquivos | ~4,1 KB | 3 |
| QA | revisor | somente leitura, JSON com esquema | ~4,6 KB | 3 |

Cada um tem procedimento, listas de verificação, exemplos bons e ruins, armadilhas, rubrica (0/1/2 com itens críticos) e esquema de saída. Pesquisa segue a Regra de Dois: lê conteúdo de fora, então não tem segredos nem escrita, e a saída passa por validação antes de chegar a outro papel.

Ordem no pipeline: Produto → (Pesquisa, se a ideia pede referências) → (Design, se há interface) → Desenvolvedor → QA. Só o perfil do passo entra no contexto da chamada.

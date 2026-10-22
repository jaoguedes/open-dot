# Especialistas (v0.3)

| Agente | Papel | Nível | Tamanho do AGENT.md | Evals |
|---|---|---|---|---|
| Produto | planejador | nucleo | 5.5 KB | 3 |
| Pesquisa | planejador | nucleo | 3.9 KB | 3 |
| Design | planejador | nucleo | 4.2 KB | 3 |
| Desenvolvedor | implementador | nucleo | 4.0 KB | 3 |
| QA | revisor | nucleo | 4.6 KB | 3 |
| Arquitetura | planejador | experimental | 6.1 KB | 3 |
| Segurança | revisor | experimental | 6.3 KB | 3 |
| Documentação | implementador | experimental | 5.7 KB | 3 |

Cada um tem procedimento, listas de verificação, exemplos bons e ruins, armadilhas, rubrica (0/1/2 com itens críticos) e esquema de saída. Os três novos entram como `experimental` (nunca núcleo sem avaliação medida). Pesquisa e Segurança leem conteúdo não confiável, então não têm segredos nem escrita (Regra de Dois).

Ordem padrão (sem receita): Produto → (Pesquisa) → (Design) → Desenvolvedor → QA. Com o ciclo Corretor ligado: … → QA → Corretor → QA de novo, sempre em sequência. Receitas (`orchestrator/recipes/`) fixam outra ordem, por exemplo Arquitetura → Desenvolvedor → QA para corrigir um bug. Só o perfil do passo entra no contexto da chamada.

Especialistas podem ser desligados por dono na tela Equipe (Desenvolvedor e QA são obrigatórios). Pacotes importados localmente entram desligados e experimentais.

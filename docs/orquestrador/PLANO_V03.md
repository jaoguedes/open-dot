# Plano do v0.3 — agentes, redesign e Runner companheiro

Branch `claude/od2-v03`, criada de `release/v0.2` em `69c5769`. Nada é publicado: sem push, merge, tag, release, deploy ou migração remota.

## Ordem (prioridade se faltar tempo: 0 → 1 → 3 → 2 → 4 → 4B → 5 → 6 → 8 → 7)

1. **Fase 0 — preparação:** branch, linha de base do gate (394 Node, 7 Python), medição de desempenho (`docs/performance/BASE_V03.md`), cópia da referência do Runner.
2. **Fase 1 — design e Dot:** tokens (`docs/DESIGN.md`), fontes auto-hospedadas, `tint` por agente e reações (`gaze`, `heat`, `strain`) no motor, com padrão ausente = saída idêntica.
3. **Fase 3 — agentes e motor (1):** Arquitetura, Segurança e Documentação; calibração adaptativa conservadora (desligada por padrão até provar ganho); papel Corretor com ciclo limitado; receitas só de dados.
4. **Fase 2 — casca:** trilho recolhido de 84 px, barra inferior de 4 itens no celular, topo com ⌘K e chip de demonstração.
5. **Fase 4 — telas:** Workspace, Runner, Aprovações (hash real), Conexões, Equipe (especialistas, receitas, calibração, importação de pacote).
6. **Fase 4B — Runner companheiro:** central com abas, bandeja com painel, processos próprios, saúde da máquina, atualização opt-in assinada, docs de release; desempenho (backoff, perfis, prioridade baixa).
7. **Fase 5 — Correio e Notícias:** só leitura, resumo determinístico, prova de que o texto do e-mail não vira instrução.
8. **Fase 6 — agentes e motor (2):** proposta de catálogo (H), pacotes da comunidade, sandbox (só com contenção provada; senão “bloqueado”), paralelismo só leitura desligado.
9. **Fases 7/8 — site, avaliação e relatório.**

## O que fica de fora

Publicação de qualquer tipo; novas integrações, escopos OAuth ou escrita externa; mensageiros; servidor, relay ou telemetria; notarização paga; encerrar processos de terceiros; paralelismo de implementadores; sandbox sem prova; ligar por padrão calibração, paralelismo, ciclo corretor, Claude Code, pacotes importados ou sugestão de skill.

## Referências visuais

- `docs/design/v0.3-referencia-runner/`: copiada nesta rodada do material do João (6 telas do Runner, 8 SVGs do Dot).
- `docs/design/v0.3-referencia/` (8 telas do app e do site): **não foi encontrada** no repositório nem no material entregue. As telas do app seguem as descrições do prompt e a linguagem da referência do Runner.

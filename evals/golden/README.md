# Avaliação golden do orquestrador

Doze ideias pequenas com o resultado esperado do **perfil** (tipo principal, risco, se precisa de Design e de Pesquisa). O script `scripts/orchestrator/eval-golden.ts` compara o **motor** com o **padrão simples** (“uma ferramenta implementa, outra revisa”) usando **ferramentas simuladas** (snapshot sintético com Codex e Claude Code prontos).

O que é medido de forma determinística: acerto do perfil, cobertura dos papéis que a ideia pede, revisor diferente do implementador, exclusão de login pago e número de chamadas. **Qualidade do código gerado não é medida aqui**: exige chamadas reais, que são limitadas. Resultado em `docs/orquestrador/AVALIACAO.md`.

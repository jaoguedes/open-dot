# Avaliação golden do orquestrador

Dezesseis ideias pequenas com o resultado esperado do **perfil** (tipo principal, risco, se precisa de Design e de Pesquisa). O script `scripts/orchestrator/eval-golden.ts` compara o **motor** com o **padrão simples** (“uma ferramenta implementa, outra revisa”) usando **ferramentas simuladas** (snapshot sintético com Codex e Claude Code prontos).

O que é medido de forma determinística: acerto do perfil, cobertura dos papéis que a ideia pede, revisor diferente do implementador, exclusão de login pago e número de chamadas. **Qualidade do código gerado não é medida aqui**: exige chamadas reais, que são limitadas. Resultado em `docs/orquestrador/AVALIACAO.md`.

**v0.3:** mais doze casos de **receita** (`17` a `28`, dois por receita), com os agentes esperados na ordem, o modo (somente leitura ou propõe mudanças) e a área nova coberta (Arquitetura, Segurança, Documentação). O mesmo script compara também calibração ligada × desligada e ciclo corretor com × sem, em mundos sintéticos declarados como simulados.

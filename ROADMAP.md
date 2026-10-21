# Roteiro

Prioridades depois da `v0.1.0-beta`. Nada aqui é promessa de data. Detalhes técnicos: `docs/architecture/ROADMAP.md`.

## Antes de chamar de estável

1. **Validação nativa do Runner:** GUI completa (pareamento, pasta, aprovação, bandeja, commit local) por uma pessoa, em macOS Intel, macOS ARM64 e Windows (`docs/audit/MANUAL_TEST_SCRIPT.md`).
2. **Interrupção durante geração real:** matar o processo do agente no meio, provar que o journal preserva o estado e que nada é repetido.
3. **Claude Code:** validar o driver somente-proposta com o login oficial e ligar por padrão só depois.
4. **Instaladores assinados e notarizados**, com checksums e procedência.
5. **Revisão jurídica** das licenças (AGPL, comercial, CLA, Dot) e automação do aceite do CLA.

## Depois (cada item com auditoria própria)

- Execução de shell e testes de projeto em sandbox comprovado por sistema operacional.
- Paralelismo entre agentes, fila de merge e integração entre worktrees.
- Commits automáticos com consentimento explícito por plano.
- Aprovações no celular com Web Push (testado em iPhone real).
- Cursor, quando o CLI oferecer um modo sem ferramentas verificável.
- Envio de e-mail com aprovação do conteúdo exato (`gmail.compose`).

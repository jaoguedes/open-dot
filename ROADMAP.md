# Roteiro

Prioridades depois da `v0.1.0-beta`. Nada aqui é promessa de data. Detalhes técnicos: `docs/architecture/ROADMAP.md`.

## Antes de chamar de estável

1. **Validação nativa do Runner:** GUI completa (pareamento, pasta, aprovação, bandeja, commit local) por uma pessoa, em macOS Intel, macOS ARM64 e Windows (`docs/audit/MANUAL_TEST_SCRIPT.md`).
2. **Interrupção durante geração real:** matar o processo do agente no meio, provar que o journal preserva o estado e que nada é repetido.
3. **Claude Code:** validar o driver somente-proposta com o login oficial e ligar por padrão só depois.
4. **Instaladores assinados e notarizados**, com checksums e procedência.
5. **Revisão jurídica** das licenças (AGPL, comercial, CLA, Dot) e automação do aceite do CLA.

## v0.3 (feito nesta rodada, não publicado)

Agentes Arquitetura, Segurança e Documentação; receitas; calibração (desligada); ciclo Corretor (desligado); proposta de catálogo (H); pacotes locais; paralelismo só leitura (desligado, simulado); redesign; Runner companheiro. Estado detalhado em `docs/STATUS.md` e `docs/audit/V03_REPORT.md`.

## v0.4

- **RSS próprio** como fonte de Notícias (hoje Notícias = newsletters da sua caixa).
- **Gemini CLI e Cursor**, só se as flags de modo só leitura forem verificadas no CLI instalado.
- **Instaladores assinados** e chave de assinatura das atualizações (mantenedor); atualização real de ponta a ponta testada com duas versões.
- **Windows e macOS ARM64** testados em máquina real (Runner, bandeja, saúde, processos).
- Análise de e-mail pelo Codex num modo de leitura fora de projeto, com aprovação do conteúdo exato.
- Pareamento por código curto (6 dígitos/QR) só se não enfraquecer a autenticação atual.
- Canais de mensagem (incluindo WhatsApp) **só por API oficial**, com aprovação do conteúdo exato, nunca por gateway não oficial.
- Medir calibração e ciclo Corretor com chamadas reais antes de ligar por padrão.

## Depois (cada item com auditoria própria)

- Execução de shell e testes de projeto em sandbox comprovado por sistema operacional.
- Paralelismo entre agentes, fila de merge e integração entre worktrees.
- Commits automáticos com consentimento explícito por plano.
- Aprovações no celular com Web Push (testado em iPhone real).
- Cursor, quando o CLI oferecer um modo sem ferramentas verificável.
- Envio de e-mail com aprovação do conteúdo exato (`gmail.compose`).

# Brief para auditoria independente — Claude Code

Não aceitar as conclusões do Codex como prova. Ler AGENTS.md, CLAUDE.md e docs/agents/PROJECT_STATE.md. Localizar `open-dot-od2-remediation` com `git worktree list --porcelain`; branch `codex/od2-runner-remediation`. Conferir HEAD e estado limpo antes de abrir branch/worktree próprio. Não editar o checkout de outro agente.

Escopo principal: [relatório atual](FINAL_IMPLEMENTATION_REPORT.md), [remediação anterior](REMEDIATION_REPORT.md), ADR-0003 e ADR-0004. Base atual 1d9125f; última unidade de código 5cd345f. Commits documentais posteriores devem ser descobertos via Git. A branch não foi sincronizada; remoto não contém estas correções por presunção.

Reproduzir especialmente:

1. Cancel/revoke, lease expirado, resultado tardio e proposta concorrente em `runner.test.ts`; verificar transações e número de linhas, não só HTTP200.
2. Ciphertext/AAD, CAS e reabertura dos checkpoints em `checkpoints.test.ts`. Inspecionar diferença entre dados de verificação declarados e evidência realmente observada pelo host futuro.
3. Helper `scripts/lib/agent-state.ts`: lock abandonado, erro após rename, takeover e editores que ignoram o protocolo. Não é lease distribuído nem autenticação de fornecedor.
4. Memória: owner/CSRF, revisão de consentimento, retenção, forget race, exclusão de conta. Nova tabela deve ser apagada junto à conta.
5. Worktree: aprovação antes de metadados, ownership, escrita parcial/durabilidade, ausência de autocleanup perigoso. Sandbox estrutural e caminhos negativos.
6. Cotejar cada alegação real/fixture/mock e limitações de plataforma. Verificar histórico, privacidade, licenças e compatibilidade antes de qualquer beta.

Comandos existentes: `npm run check`, `npm run lint`, `cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml`; `node --import tsx scripts/test-runner-browser.ts --memory-only`; `node --import tsx scripts/test-runner-channel.ts`. Sem flag, o script browser chama Codex real: não repetir sem justificativa e autenticação oficial. Ensaios que usam sockets exigem permissão local; não remover testes para contornar o sandbox.

Documentar achados próprios em docs/agents/claude/STATUS.md e handoff versionado, com evidências, severidade e reproduções. Preserve os relatórios originais. Sem push, deploy, release, banco remoto ou comandos genéricos de projeto. Auditorias originais do Cursor não foram encontradas; não inventar seu conteúdo.

# Baseline operacional — 19/10/2026

Branch main, HEAD 5db4564. Trabalho anterior não commitado preservado; nenhum reset/clean/rebase. Paleta D-024 aprovada e imutável.

## Arquivos pendentes antes desta etapa

```text
 M .cursor/rules/00-open-dot.mdc
 M .cursor/rules/10-visual.mdc
 M .gitignore
 M CHANGELOG.md
 M CLAUDE.md
 M apps/web/src/App.tsx
 M apps/web/src/components/Dot2D.tsx
 M apps/web/src/components/FeedViews.tsx
 M apps/web/src/dot/DotView.tsx
 M apps/web/src/dot3d/DotScene.ts
 M apps/web/src/styles.css
 M apps/web/src/theme.css
 M apps/web/src/views/MyDay.tsx
 M docs/DECISOES.md
 M docs/DOT_COMPORTAMENTO.md
 M docs/STATUS.md
 M eslint.config.mjs
 M package-lock.json
 M package.json
 M packages/core/src/visual.ts
 M tsconfig.json
?? .github/workflows/runner-ci.yml
?? .github/workflows/runner-release.yml
?? apps/runner/
?? apps/web/src/components/MailSummary.tsx
?? apps/web/src/components/Mechanisms.tsx
?? apps/web/src/mechanisms.css
?? apps/web/src/views/AgentWorkspace.tsx
?? apps/web/src/views/Runner.tsx
?? apps/web/src/workspace-notes.ts
?? apps/web/src/workspace.css
?? apps/web/test/workspace.test.ts
?? docs/PALETA_APROVADA.md
?? docs/open-dot-runner-auditoria.md
?? docs/open-dot-runner-plano.md
?? docs/open-dot-runner-release-notes.md
?? docs/open-dot-runner-release.md
?? docs/open-dot-runner-security.md
?? docs/open-dot-runner-ux.md
?? packages/core/src/mechanisms.ts
?? packages/core/test/mechanisms.test.ts
?? scripts/build-runner.mjs
?? scripts/package-runner.mjs
?? scripts/ui-runner.mjs
?? scripts/verify-runner-artifacts.mjs
?? tests/runner-artifacts.test.ts
```

CLI: Codex 0.163.0-alpha.10.2 informa login ChatGPT. Claude Code 2.1.296 instalado, sem sessão autenticada. Cursor CLI não encontrado no PATH. gh instalado com autenticação inválida; publicação não pode ser presumida. Nenhum token lido ou copiado. O app-server será validado com requests oficiais e saída redigida.

Revisão visual da prévia anterior: lista duplicada de funções na sidebar global e no Workspace ocupa espaço de conversa. Manter a sidebar global e usar o Workspace para projetos, tarefa e eventos reais, com Dot anfitrião compacto.

Estado anterior: 270 testes e DMG debug Intel foram verificados na execução anterior; pareamento, drivers e fila remota estavam indisponíveis. Novas validações nesta etapa serão registradas separadamente.

### Pesquisa de protocolo (sem execução de tarefa)

- A instalação oficial `@openai/codex@0.163.0` foi baixada apenas em `/private/tmp/open-dot-codex-official`; não substitui o Codex do usuário.
- Os JSON Schemas gerados pelo próprio CLI instalado e pela distribuição oficial npm não contêm `readOnlyAccess`/`readableRoots` em `TurnStartParams.SandboxPolicy`. O contrato expõe `readOnly`, `workspaceWrite`, `externalSandbox`, `dangerFullAccess`; `workspaceWrite` limita escrita e rede, sem a restrição de leitura por projeto apresentada na documentação mais recente.
- Não enviar propriedades desconhecidas presumindo que serão impostas. Não usar `dangerFullAccess`, `externalSandbox` sem sandbox externo, `--yolo` ou bypass de aprovações.
- Autenticação do app-server confirmada por `initialize` → `initialized` → `account/read` com `refreshToken:false`: conta do tipo `chatgpt`, sem retornar conta ou credencial à UI. Isso **não comprova execução de tarefa**.
- Referências oficiais: [App Server](https://developers.openai.com/codex/app-server/), [segurança Codex](https://developers.openai.com/codex/security/), [Claude programático](https://code.claude.com/docs/en/headless), [Cursor ACP](https://cursor.com/docs/cli/acp).

### Continuação — alternativa oficial encontrada (investigação em curso)

A ausência dos campos no schema estável **não significa ausência de isolamento no CLI**. `generate-json-schema --experimental` expõe `thread/start.permissions`, `runtimeWorkspaceRoots`, `environments` e `activePermissionProfile`. A documentação oficial de [perfis](https://developers.openai.com/codex/permissions/) descreve perfis nomeados.

Prova com `codex sandbox --include-managed-config -P open_dot`, canários descartáveis, sem modelo e sem credenciais: a primeira configuração permitiu leitura de um canário em `/tmp`; incluir `:slash_tmp=deny` e `:tmpdir=deny` eliminou essa exceção. Segunda prova PASS: leitura/escrita da pasta autorizada, negação de leitura externa, symlink de fuga, `.env` e escrita externa. Não omitir managed config nem presumir que `:root=deny` sozinho basta. O perfil ainda está sendo validado no app-server com as superfícies adicionais desligadas; envio pela UI continua bloqueado.

### Conclusão da investigação — 20/10/2026

O perfil oficial foi validado no app-server com ferramentas/MCP vazios e prova de leitura restrita, inclusive negação explícita de diretórios temporários. Driver Codex macOS implementado e teste real passou: proposta estruturada somente leitura, aprovação exata e escrita pelo host no worktree. O diagnóstico de autenticação GitHub inválida era causado pelo sandbox de rede; autenticação funciona com rede permitida. João confirmou bloqueio de cobrança e pediu continuar sem publicar release. Detalhes atuais no RESULTADO_OPERACIONAL.md.

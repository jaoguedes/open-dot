# Open Dot Runner 0.1.0 — versão de desenvolvimento

> **Documento histórico (anterior à auditoria de 20/10/2026).** Pode contradizer o estado atual (licença, drivers, privacidade). Estado vigente: `README.md`, `docs/STATUS.md` e `docs/audit/CLAUDE_FINAL_REPORT.md`.

Notas preparadas em 20/10/2026. **Nenhuma release publicada; publicação suspensa pelo usuário.** Estes instaladores são experimentais e não representam uma versão estável.

O Workspace envia tarefas para o Runner pareado. No macOS, Codex oficial autenticado com ChatGPT produz uma proposta somente leitura; após revisão e aprovação do conteúdo exato, o host aplica até oito arquivos/8 KB em worktree isolado. Pasta original preservada. Um fluxo real com cofre, HTTP/SQLite, modelo, aprovação e escrita passou no núcleo nativo; não substitui E2E gráfico completo.

Inclui diagnóstico, autorização/revogação de pastas, cofre nativo, heartbeat, revogação do dispositivo, fila/eventos cifrados, aprovação por hash/uso único e journal de recuperação. Dot original e paleta aprovados preservados.

Shell e testes do projeto estão desabilitados; não há merge/commit/push automáticos. Claude Code e Cursor não têm executor implementado. Executor Windows fica bloqueado até validação nativa de isolamento. Autostart, updater e Agent Continuity Protocol no produto ainda não implementados.

Instaladores sem assinatura/notarização. Compilação e checksum não comprovam instalação ou operação em hardware: registrar cada plataforma no [relatório vigente](agent-workspace/RESULTADO_OPERACIONAL.md). O novo backend exige migração `0008` e deploy aprovados separadamente; não foram aplicados à produção.

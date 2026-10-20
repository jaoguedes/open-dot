> Estado operacional em 20/10/2026: Codex macOS executou tarefa real no núcleo nativo, com proposta somente leitura e aprovação exata para edição no worktree. Shell/testes de projeto, Claude/Cursor e executor Windows continuam indisponíveis. Sem publicação por pedido atual. Consulte [relatório vigente](agent-workspace/RESULTADO_OPERACIONAL.md); estados anteriores abaixo são históricos.

# Plano — Open Dot Runner

1. Ler regras/anexos, auditar arquitetura e executar baseline: concluído antes da implementação.
2. Workspace aditivo no app, presença ampliada do Dot, contexto/tarefas locais, conversa com API existente, runs e aprovações: implementar sem alterar contratos existentes.
3. Resumos de e-mail: hierarquia o que aconteceu / por que importa / próxima ação, evidência e ausência de rascunho explícitas; sem inventar conteúdo.
4. Runner independente Tauri 2: UI compartilhando Dot/tokens, onboarding, diagnóstico IPC, pastas autorizadas por seletor nativo, revogação e auditoria. Sem shell/drivers/canal remoto nesta base.
5. CI nativa em três targets e workflow de instaladores com artefatos e draft opcional. Não disparar workflows, tags ou releases nesta sessão.
6. Typecheck, testes, lint, builds e QA visual. Documentar exatamente quais verificações nativas dependem de GitHub/Rust.

Cada etapa acrescenta arquivos/rotas. Reversão: remover novas rotas/imports e arquivos Runner/workflows; nenhuma alteração em banco ou serviços existentes. Nenhum commit/push automático.

## Resultado da execução

Fases 1–5 implementadas de forma aditiva. Fase 6: check (269 testes), 3 testes Rust Mac Intel, lint e build passaram; QA Chromium incluiu 5 cenários novos e regressões A/D/E/G/rodada4. Resultados e limites nativos atualizados em STATUS.md. Nenhuma dependência de produção, schema, segredo ou serviço remoto alterado. Compilação oficial ARM/Windows depende de executar Actions após revisão; pareamento/drivers/cofre/autostart permanecem fase futura explícita, não uma implementação simulada escondida.

Empacotamento local adicional concluído: DMG debug Intel de 8,83 MiB gerado e verificado sem Xcode completo, sem instalar/executar o app. Artefato e checksum no guia de instaladores.

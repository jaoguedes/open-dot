# Relatório de implementação vigente — 20/10/2026

Autor Codex; revisão interna, não auditoria independente. Branch `codex/od2-runner-remediation`, worktree `open-dot-od2-remediation` (resolver com `git worktree list --porcelain`). Base desta continuação `940b06c60138af8ebdf8a0291732f36cd21ea6de`; base original `2b7d5c5fb7f6255c2bdefbabe67f38d34a2faea5`. Último código `48e3a15b549ed09662f97c876cc5049b735cad95`. HEAD documental: consultar Git; um documento não contém o hash do próprio commit.

## Entregas e evidências

| Área | Estado efetivo | Limitação |
|---|---|---|
| Scheduler | Planos/fases/dependências/tentativas persistidos, claim real, CAS, pausa e progressão por recibos | Uma tentativa por tarefa; sem retry automático; worktrees independentes não integram código anterior |
| ODCP | Checkpoints automáticos de fases/journal, ownership, inventário, Git explícito com recuperação do mesmo SHA após crash | Commit exige consentimento próprio; não há commits automáticos de planos ou handoff automático entre fornecedores |
| Workspace | Planos, tarefas, eventos, aprovação exata e resultados ligados ao canal real | Pareamento/pasta/prompt dos ensaios nativos anteriores programáticos; onboarding gráfico completo pendente |
| Memória | Consentimento, retenção, CAS, recibos factuais opcionais, editar/excluir/forget e revisão | Edição vira user-provided; memória não é autorização nem atestação independente |
| Passport v2 | Exporta grafo de planos, tentativas, dependências, memória opt-in e arquivo nativo opcional; revisão/download reais | Não exporta fontes/tarefas fora dos planos; identidade da pasta requer remapeamento; diálogo Tauri salvar não operado |
| Capacidades | Diagnóstico opcional negociado; legado preservado; afirmações contraditórias recusadas | Modelos não descobertos; recursos declarados por host autenticado, não prova independente |
| Especialistas | Dez contratos ligados ao prompt persistido, claim, UI e Passport | Quality gate continua not-attested mesmo após recibos; verificação automática de entregáveis pendente |
| Comandos de projeto | Desabilitados | Sem isolamento demonstrado de rede/fs/filhos/CPU/RAM; nome npm test não garante segurança |
| Providers | Codex oficial instalado/autenticado; fluxo real limitado já exercitado nesta continuação | Claude instalado sem autenticação confirmada; Cursor CLI ausente; não há driver operacional Claude/Cursor |
| Idea to Project / Design Intelligence / multiagentes | Não concluídos | Não chamar catálogo, formulário ou schema de execução completa; paralelo/merge continuam bloqueados |
| Aprovações remotas | Canal existente com hash/escopo/expiração e decisão servidor | Sem teste iPhone/Web Push, reautenticação avançada ou deploy novo |

## Commits de código desde a base

```text
bf49044 feat(odcp): schedule persistent phased plans through Runner claims
2ea91e1 feat(workspace): run persistent plans with reviewed native results
4ef1c89 feat(runner): preserve automatic phase checkpoints beyond active journal
32788de feat(runner): checkpoint reviewed files with recoverable scoped Git commits
64a8b60 fix(runner): bind consent and commit review to the selected project
4e8d07e feat(memory): connect consented factual receipts to engineering tasks
5cd102f feat(runner): export scoped local project context without authority
44b733b feat(passport): export consented task graphs and native context for review
9fcd9ee feat(runner): negotiate truthful per-driver feature discovery
350ce9f feat(experts): bind quality contracts to persisted task dispatch
48e3a15 feat(memory): edit and remove entries with revisioned provenance
```

Onze unidades de código desde 940b06c; cinco nesta última retomada após 4e8d07e. Política Conventional Commits/Task passou para os onze. Registro incremental por unidade: [REMEDIATION_RUN](REMEDIATION_RUN.md). Remediações anteriores P0/P1 e riscos: [REMEDIATION_REPORT](REMEDIATION_REPORT.md); relatórios originais Cursor não localizados. Não afirmar fechamento independente por testes próprios.

## Testes e resultados

- 322 Node PASS, zero falhas (`od2-memory-edit-node.log`); typecheck/build Web+Worker PASS. Scripts do check executados diretamente com Node configurado pois npm não estava no PATH desta retomada.
- Sete Python PASS e eval Correio sintético PASS (`od2-context-python.log`, `od2-context-eval.log`); não são medidas externas de qualidade.
- 24 Rust PASS, seis ignored no gate padrão (`od2-features-rust.log`), incluindo Git real, interrupção SIGKILL de helper/recuperação do mesmo commit, locks e escopo. Não confundir com crash do Codex durante geração.
- Canal nativo real HTTP/SQLite/Keychain PASS: pareamento, reinício, heartbeat e revogação (`od2-features-native-channel.log`); sem tarefa de modelo nesse ensaio.
- Browser/backend/SQLite reais PASS: planos, pausa/claim/uncertain, recibos de memória, perfil no prompt, Passport/download, edição/exclusão/proveniência/rascunho, reload/forget (`od2-memory-edit-browser.log`). Device/executor/arquivo nativo são fixtures explícitas. Mobile 390 px sem overflow, axe sem serious/critical; captura inspecionada, sem redesign.
- Duas chamadas oficiais Codex/ChatGPT em etapas anteriores desta continuação (`od2-scheduled-codex.log`, `od2-real-scheduled-git-codex.log`): plan/claim → proposta → aprovação Web → escrita isolada; segunda inclui commit com consentimento programático separado. Nenhuma chamada nova nesta retomada. Não é onboarding Tauri completo nem execução de testes de projeto.
- Lint zero erros; aviso preexistente DotView permanece. Scanner de padrões sem achados nos arquivos rastreados; não é DLP nem auditoria de todo histórico. Regressão de Zod no bundle corrigida sem reduzir testes.
- Build UI Runner e binário diagnóstico nativo local compilados; sem instaladores/CI atuais. macOS Intel local apenas; ARM64/Windows sem runtime atual. Builds históricos não validam este HEAD.

## Banco, dependências, segurança e sincronização

Migrações 0015/0016 desta continuação somente em bancos descartáveis locais; nenhuma migração nova nesta retomada. Zero dependências novas. Dot/paleta preservados. Checkout original permanece limpo na base 2b7d5c5, com seus commits locais preservados. Nenhum push, main merge, release, deploy, serviço pago ou alteração de visibilidade. Não houve autorização de sincronização deste HEAD; autorização histórica de feae70d não se estende a ele. Remoto não deve ser considerado atualizado.

Pendente: auditoria independente, GUI nativa completa e diálogo de export/commit, crash real durante geração/gestão de processos órfãos após morte abrupta, recuperação multiplataforma, revisão de permissões/revisões de contratos, commits automáticos consentidos, integração entre worktrees e Passport completo. Não há evidência suficiente para beta pública. Licença definitiva e auditoria de assets/histórico continuam decisões/gates humanos.

## Continuidade

Retomar por docs/agents/PROJECT_STATE.md e ENGINEERING_STATE.json, conferindo Git. Próxima unidade: ensaio recuperável de interrupção durante geração real em projeto temporário, sem replay nem perda de recibos; primeiro reproduzir o recovery fixture. GUI Tauri exige operador nativo porque a automação disponível nesta sessão não controla apps nativos. Providers externos dependem de autenticação/instalação oficial; continuar tarefas locais independentes sem contornar isso. Não repetir operação incerta por ausência de recibo.

Esta sessão chega ao checkpoint para preservar contexto recuperável antes de esgotá-lo; permanecem tarefas elegíveis, não foi declarada conclusão total. Houve falha transitória do revisor automático por limite de uso na sessão anterior; revisão voltou a funcionar e permitiu os testes/commits locais relatados.

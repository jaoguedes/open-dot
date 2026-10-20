# ADR-0005 — Scheduler sequencial ligado ao Runner

OD2-LOOP-017, local 2026-10-20. Migração aditiva 0015, sem migração remota.

Plano opt-in autenticado fixa dispositivo/projeto/mecanismo, até 12 tarefas/24 KB de prompts e consentimento explícito para worktrees separados. DAG aceita somente dependências anteriores e fases ordenadas. O Runner oficial existente é o único executor: seu claim avança uma tarefa elegível e recebe o prompt cifrado pelo canal habitual. Novas chamadas de modelo não são executadas no Worker.

Cada tarefa possui identidade estável; uma tentativa distinta e um Runner task ID distintos. Inicialmente máximo de uma tentativa por tarefa; sem retries automáticos de falhas ou efeitos incertos. Transação CAS por revisão/nonce impede dispatch concorrente; fila existente mantém exclusão por dispositivo. Pausa impede novas reservas, sem prometer interromper processo já iniciado. Revogação e cancelamento continuam pelo Runner.

Conclusão de fase exige tarefa completed com recibos files/completed e aprovação approve persistidos. Sem recibos suficientes: uncertain. Isso atesta a aplicação reportada pelo host autenticado, não testes de projeto, commit ou revisão independente. Cron e leituras reconciliam; claim avança automaticamente. Reinício não recria tentativa já reservada.

Dependências ordenam tarefas, mas NÃO integram worktrees. Cada tarefa usa checkout isolado da base autorizada; não prometer que a próxima vê as alterações anteriores. Merge/fase de integração e uso compartilhado do snapshot precisam de política própria antes de pipelines de código dependente. Comandos, commits e push permanecem desabilitados neste incremento.

Rotas: POST/GET `/api/runner/plans`, POST `/api/runner/plans/:id/state` (CAS active/paused). Sessão, CSRF, escopo por dono, orçamento, cifra/AAD, conteúdo exato de idempotência e autorização de pasta. Estado não pode ser ativado após uncertain/blocked/completed. Sem alterações silenciosas da definição. Exclusão de conta remove relações antes de Runner/dispositivo.

Validação: API e SQLite reais com executor/recibos fixture explicitamente identificados; concorrência, fases, reabertura, expiração/late response, autenticação/CSRF/owner, disponibilidade/capacidades e propostas sem evidência. Não é prova de modelo real ou E2E gráfico nativo nesta unidade.

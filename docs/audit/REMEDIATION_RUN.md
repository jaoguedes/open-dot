# Rodada de remediação Open Dot 2.0

Task: OD2-A. Base real `2b7d5c5fb7f6255c2bdefbabe67f38d34a2faea5`; branch própria `codex/od2-runner-remediation`; worktree isolado identificado por `git worktree list --porcelain`. Checkout original preservado, com dois recibos locais além de origin/feae70d. Nenhum push autorizado nesta rodada. Execução sequencial; nenhum outro worktree registrado antes da criação. Não foi comprovada a ausência de processos externos não registrados.

Os arquivos CURSOR_INDEPENDENT_AUDIT.md e CURSOR_REMEDIATION_PLAN.md não foram encontrados nas buscas por nome no repositório, temporários, visualizações e diretórios de usuário pesquisados. Dossiê adicional ausente. Não inventar linhas ou testes dessa auditoria: a matriz abaixo usa o resumo fornecido pelo usuário e inspeção do HEAD. Os documentos anteriores e Blueprint/prompt extraídos foram relidos. Auditoria independente continua distinta da revisão interna.

| ID | Severidade fornecida | Evidência atual / arquivos | Estado inicial | Dependência / correção | Regressão / commit |
|---|---|---|---|---|---|
| P0-1 | P0 | runner/routes.ts: revoke/cancel deixam running; claim exige ausência de running | Confirmado por inspeção | Transições CAS, prazo, uncertain sem replay | Cancelamento/revogação/concorrência/recibo tardio; pendente |
| P0-2 | P0 | routes.ts e executor.rs: reconciliação depende de retorno do dispositivo | Confirmado por inspeção | Prazo remoto independente, fencing de resultados | Expiração/restart/SIGKILL; pendente |
| P1-1 | P1 | worktree.rs create usa worktree add antes da aprovação de conteúdo | Confirmado; envio autoriza tarefa mas não há ownership persistido | Snapshot sem metadados compartilhados antes da aprovação, registro de ownership | Git real/falhas/checkout intacto; pendente |
| P1-2 | P1 | codex.rs config usa JSON string dentro de TOML | Insuficiência de negativos confirmada; exploração não reproduzida | Escapar estruturalmente/rejeitar controles, parser oficial | Caminhos adversariais e parser real; pendente |
| P1-3 | P1 | channel.rs e routes.ts só heartbeat | Confirmado | Versão/capacidades fail closed; rollout aditivo | Cliente antigo/novo, incompatível; pendente |
| P1-4 | P1 | channel.rs disconnect apaga cofre sem invalidar servidor | Confirmado | Revogação nativa remota/pending explícito | Reuso token antigo/rede; pendente |
| P1-5 | P1 | RunnerWorkspace ProposalView mostra texto renderizado, não bytes/escopo completos | Parcial, apresentação insuficiente | Payload exato verificável e contexto | Unicode/truncamento/hash/stale; pendente |
| P1-6 | P1 | routes.ts ignora changes do batch e duplicate não compara payload | Confirmado | CAS transacional/recibo idempotente honesto | Corridas/duplicata diferente/fora de ordem; pendente |
| P1-7 | P1 | Automação permanece desconectada | Gate vigente | Não ligar automação sobre P0/P1 abertos | Fases E–L dependentes bloqueadas |

## Continuidade

Fase A em andamento: baseline `npm run check` em execução; logs descartáveis fora do Git. Próximo: testar/reproduzir ciclo de vida e corrigir P0/P1-6 conjuntamente por compartilharem transações. Estado novo precisa distinguir cancelamento solicitado, parada confirmada e efeito incerto. Nunca reentregar tentativa anterior. Migrações somente em DBs descartáveis.

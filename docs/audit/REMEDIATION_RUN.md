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

## Fase B — ciclo de vida e recibos (OD2-B1)

Implementado em routes.ts/jobs.ts/migração aditiva 0010: lease de 30 s renovada por heartbeat, prazo absoluto de tentativa 20 min; cancel_requested não renova lease; falta de ACK termina uncertain por cron/consulta/claim, sem reentregar a tentativa. Revogação deixa fila cancelled e tentativa ativa uncertain (não afirma processo parado). Recibos antigos não alteram terminal; duplicata exige mesmo digest/conteúdo, sequência regressiva é recusada e accepted exige evento + transição persistidos. Rejeição antes da aplicação continua terminal segura. Nativo reconhece uncertain e não reaplica journal. UI nomeia estados novos, sem alteração visual do Dot.

Testes: baseline completo PASS (287 Node/sete Python/eval/typecheck/build), após repetir com permissão de socket tsx; primeira tentativa teve EPERM ambiental após todos os 287 Node passarem. Gate B1 PASS: 290 Node/sete Python/eval/typecheck/build; 14 testes Runner SQLite reais, executor fixture. Concorrência de claim/cancel, timeout sem retorno, revogação ativa, recibo tardio e corrida injetada entre leitura/batch exercitados. Teste novo inicialmente presumiu ordem de UUID em mesmo timestamp: corrigida fixture com relógio crescente, sem mudar ordenação da fila. Rust em compilação em target próprio, não declarado aprovado ainda.

Limites: lease não mata processo remoto nem desfaz arquivo; uncertain preserva essa distinção. Worktrees de tentativas não são reutilizados. Não valida crash do modelo durante geração. Nenhuma migração remota. P0 parcial até regressão nativa/negociação e auditoria independente; automação E–L continua bloqueada por P1.

Próximo passo: P1-3 negociação explícita antes de heartbeat/claim; P1-4 revogação nativa com pending persistente; depois snapshots/worktree e parser/aprovação. Arquivos alterados e commit exato: git show --stat e git log. Nenhum push.

## Fase C — negociação e desconexão (OD2-C2)

Protocolo 2 e contrato sha256-utf8-json-v1 negociados explicitamente. Heartbeat legado mantém distinção transporte/compatibilidade, mas não libera tasks/claim; nativo consulta protocolo/schema antes de anunciar disponibilidade. Capacidades mínimas não representam catálogo de modelos nem entitlement. Migração 0011 aditiva, apenas bancos descartáveis. Rollout obrigatório: migrar/adotar Worker e Runner compatíveis em etapa autorizada; código antigo permanece bloqueado para execução, sem deploy implícito.

Desconexão nativa agora persiste revocation-pending, bloqueia execução antes da rede e solicita revogação do próprio bearer. Só remove cofre/vínculo ao confirmar revogado ou credencial já recusada (401). Falta de rede mantém pedido e retenta no heartbeat/restart; frontend só recebe diagnóstico, nunca bearer. Endpoint de revogação próprio foi acrescentado em B1. Teste SQLite confirma reuso negado. Teste nativo estendido aguarda compilação em target isolado.

Gate TS completo PASS: 292 Node/sete Python/eval/typecheck/build. Lint zero erros/aviso DotView preexistente. Testes cruzam protocolo ausente/antigo, contrato diferente, capacidades faltantes e protocolo atual. Não comprovam GUI ou rede móvel. Rust pendente: checkpoint de desenvolvimento explícito até prova nativa. Próxima unidade P1-2 usa serializador TOML já presente transitivamente (nova dependência direta pequena, sem nova crate no lock); testes de parser oficial não consomem IA. P1-1 e P1-5 ainda abertos; não liberar automação.

# Matriz de funcionalidades — evidência inicial

| Recurso | Código | Evidência | Estado |
|---|---|---|---|
| Dot/paleta/rotinas existentes | Existente | Check baseline PASS; UI anterior | Preservado, sem redesign |
| Pareamento/cofre/heartbeat/revogação | Existente | Teste nativo anterior real; testes API atuais | Implementado; GUI completa pendente |
| Codex proposta/aprovação/worktree | Existente | Teste real anterior e fonte auditada | Operacional limitado no macOS |
| Recuperação de proposta pelo journal | Existente | Unidade de escrita parcial; sem kill integrado | Parcial, R01/R02 |
| Comandos/testes do projeto | Ausente | Evento informa não executados | Bloqueado por política |
| Semântica/checkpoints dos agentes | Regras e documentos | Quatro commits locais preservados | Manual; não enforcement no produto |
| ODCP / Flight Recorder | Journal mínimo e proposta | Sem lease/run_id/checkpoint reconciliável | Parcial/planejado |
| Project Memory Graph / Passport | Notas locais e ADRs manuais | Sem ledger tipado/export integrado | Planejado |
| Expert Contracts | Template anexo | Sem schema/catálogo validado | Planejado |
| Idea Intake/DAG/council/router | Não integrado | Sem E2E | Planejado |
| Aprovação iPhone/Web Push | Aprovação web por hash | Sem Web Push/reatenticação forte/iPhone real | Parcial/planejado |
| Claude/Cursor | Diagnóstico | Sem executor autenticado testado | Bloqueado |
| DMG/EXE | Workflows existentes | Actions anterior SUCCESS, checksums | Builds reais; runtime completo pendente |
| Publicação/open source | Não autorizado | UNLICENSED e remoto privado | Bloqueado por decisão humana |

Atualizações desta fase devem apontar para teste e commit no AGENT_HANDOFF; presença de schema não prova integração na interface.

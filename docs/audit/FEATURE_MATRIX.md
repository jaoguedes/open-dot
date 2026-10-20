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

## Atualização verificada desta rodada

- R1/R2: reconciliação de reserva sem journal e kill/restart real de aplicação parcial aprovada PASS. Proposta fixture explícita, sem modelo nesse ensaio. Codex real revalidado separadamente. Não prova GUI ou crash durante geração.
- R4: orçamento terminal reservado no host/servidor e tests PASS; legado já saturado pendente.
- Memory Graph: serviço interno cifrado CAS, limite e referências/ciclos validados, persistência SQLite de disco testada; migração 0009 apenas em testes. Sem API/UI.
- Passport: exportação local `memory-only`; não é projeto completo ou autorização de transferência.
- Expert Contracts: dez perfis versionados e teste de não escalada; sem conectar agentes.
- ODCP: schema/checklist, cálculo por tempo ativo e verificador de commits; sem timer persistente, snapshots/commits/leases automáticos no Runner.
- Check final: 287 Node, sete Python, onze Rust unitários, dois ensaios nativos separados, sete UI (API/IPC simulados). Lint sem erros. Instalações anteriores não atualizadas. Revisão Claude e refinamento Cursor pendentes.

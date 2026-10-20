# Dependências vigentes após 48e3a15

Estado observado e gates em docs/agents/PROJECT_STATE.md e audit/FINAL_IMPLEMENTATION_REPORT.md. Scheduler/claim, checkpoints e commit explícito, memória/Passport limitado, descoberta de recursos e perfis receberam incrementos operacionais. Próximos: recovery de geração real e GUI nativa, política consentida de commit automático e integração entre tarefas; comandos/paralelo exigem isolamento/coordenação demonstrados. Claude/Cursor bloqueados por autenticação/instalação e drivers não concluídos. Idea to Project, Design Intelligence e módulos avançados permanecem não concluídos. Revisão independente continua necessária; sem push ou publicação.

---

## Histórico do roadmap

# Próximas dependências após remediação c7b2426

A/B/C/D/F produziram incrementos reais descritos em audit/REMEDIATION_REPORT.md (caminho relativo a docs). A etapa seguinte é revisão independente dos estados, recibos/ownership e memória autenticada, seguida por GUI nativa completa/crash durante geração. ODCP operacional com ações Git, comandos de projeto e paralelo não são elegíveis até provar isolamento/coordenação. Providers adicionais dependem de drivers/autenticação oficiais. Passport completo, Idea to Project, Design Intelligence e Council continuam trabalho futuro, sem declarar suporte por schema.

---

## Roadmap histórico

# Roadmap técnico — Open Dot 2.0

| Ordem / tarefa | Entrega | Gate verificável | Dependências / auditor sugerido |
|---|---|---|---|
| OD2-P0 | Baseline, riscos, matriz, handoff e ADR | Check existente PASS; estado Git recuperável | Auditoria documental Claude depois |
| OD2-R1 | Reconciliação reserva/journal | Tarefa ativa órfã fecha sem modelo/escrita e não prende fila; isolamento por dispositivo | P0; revisão de segurança independente |
| OD2-R2 | Kill/restart real de aplicação aprovada | Filho interrompido, arquivos preservados, retomada sem repetir efeitos; proposta fixture identificada | R1; QA/Claude |
| OD2-R3 | Gate de comandos/testes | Executor estruturado e opt-in, sandbox do SO, rede/fs limitados, digest/runtime/argv fixos, timeout; teste negativo | R2; revisão segurança antes de habilitar |
| OD2-C1 | ODCP / checkpoints de dados | Revisão/CAS, snapshots referenciados, handoff bloqueado se dirty sem snapshot, timer em ponto seguro | R2; não introduzir commits automáticos antes da política |
| OD2-M1 | Memory Graph / Passport | Proveniência, relações íntegras, export limitado, sem transformar memória externa em autorização | Contratos; SQLite existente na integração |
| OD2-E1 | Dez Expert Contracts | Schemas, ferramentas finitas, evidências e gates; nenhum perfil concede ferramenta | Contratos; QA determinístico |
| OD2-P1 | Idea Intake/DAG/capabilities | Exemplo fictício vira plano/tarefas, modelo/autorização realmente descobertos, uma tarefa real chega ao Runner | R3/C1/M1/E1; P1 não concluída só por schema |
| OD2-P2 | Leases, segundo driver, merge queue | Dois agentes em worktrees independentes, conflito bloqueado, revisão independente | Drivers autenticados; não simular disponibilidade |
| OD2-P3 | Aprovações mobile | iPhone real, expiração/replay, reauth, push quando suportado e inbox fallback | Backend/HTTPS aprovado; nenhum inbound Runner |
| OD2-P4 | Council/bench/router | Ganho medido em evals antes de trocar default | P1/P2; feature flags |
| OD2-P5 | Auditoria open source | Histórico/PII/licenças/SBOM/instaladores e autorização humana explícita | Bloqueada: sem mudança de visibilidade/release |

Fases seguras desta rodada: auditoria, correções de recuperação comprováveis e contratos puros. Commits por tarefa com trailer `Task: OD2-...`. Não prometer entregar todas as fases em uma alteração. Nenhum serviço adicional/pago.

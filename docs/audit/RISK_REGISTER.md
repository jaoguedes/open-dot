# Registro de riscos — OD2-P0

| ID | Severidade / prova | Impacto | Mitigação / gate |
|---|---|---|---|
| R01 | Alta: `executor::poll` reserva antes do journal | Crash prende fila; efeito incerto | Reconciliação autenticada de tarefa ativa, sem repetir modelo nem aplicar proposta sem journal; teste kill/restart |
| R02 | Alta: restart completo sem ensaio integrado | Repetição/perda de efeitos pode passar despercebida | Processo descartável, SIGKILL, API/SQLite/cofre reais, retomada de aplicação parcial aprovada |
| R03 | Alta: shell/testes indisponíveis | Não há gate real de teste do projeto | Manter desabilitado; futuro comando estruturado allowlisted, digest, runtime imutável/restrito e limite de rede/fs; não confiar em npm scripts arbitrários |
| R04 | Alta: leases/checkpoints automáticos ausentes | Dois executores poderiam colidir | Concurrency 1; ODCP com revision/CAS e checkpoints de dados antes de commits/enforcement |
| R05 | Alta: contrato Codex experimental | Upgrade pode mudar garantias | Preflight a cada tarefa, runtime validation e falha fechada; regressão nativa por versão |
| R06 | Alta: histórico contém identidade/metadados do mantenedor | Exposição ao publicar/sincronizar sem revisão | Nenhum push sem autorização; auditoria de delta e histórico separadas, sem expor valores em relatórios |
| R07 | Média: retenção global ausente | Crescimento de dados cifrados | Quotas/expurgo por dono/projeto antes de uso prolongado; limites por evento não bastam |
| R08 | Alta: schema produção não migrado | UI nova não funciona em produção | Sem deploy implícito; migração expansiva e rollout aprovados separadamente |
| R09 | Média: documentos de segurança históricos contraditórios | Auditor pode inferir capacidade incorreta | Documento vigente e matriz de evidências; não apagar histórico |
| R10 | Alta: modelo lê conteúdo externo | Injeção/contaminação de memória | Proveniência explícita, nenhum texto libera ferramentas, aprovação só pelo host/dono |
| R11 | Média: Claude sem login, Cursor sem CLI/driver | Handoff automático indisponível | Passport manual sem fingir conexão; não copiar sessão ou contratar API |
| R12 | Alta: GUI/iPhone/ARM64/Windows runtime sem E2E | Build não prova segurança operacional | Teste nativo por ambiente; Windows executor continua bloqueado |

| R13 | Média: orçamento de 500 eventos pode esgotar recibo terminal | Tarefa antiga pode precisar reconciliação manual | Reservar orçamento de término e testar saturação antes de uso prolongado; não afirmar recuperação universal |

R01/R02 mitigados no fluxo normal por OD2-R1/R2 e teste de processo real; R13 continua aberto. Teste usa proposta sintética, não reproduz crash durante geração do fornecedor.

Nenhuma severidade é uma porcentagem de conclusão. Achados só ficam resolvidos quando teste/commit correspondente estiver registrado no handoff.

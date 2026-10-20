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

| R13 | Média: orçamento de 500 eventos pode esgotar recibo terminal | Tarefa antiga pode precisar reconciliação manual | OD2-R4 reserva orçamento e testa saturação para tarefas novas; registros legados já saturados exigem revisão |

R01/R02 mitigados no fluxo normal por OD2-R1/R2 e teste de processo real; R13 mitigado prospectivamente por OD2-R4; estado legado saturado continua pendente. Teste usa proposta sintética, não reproduz crash durante geração do fornecedor.

Nenhuma severidade é uma porcentagem de conclusão. Achados só ficam resolvidos quando teste/commit correspondente estiver registrado no handoff.

## Gate adicional de rollout — R14

Alta, inferência de inspeção: heartbeat confirma transporte e diagnóstico local, mas não há negociação versionada de compatibilidade Web/Runner. O Runner novo consulta `/api/runner/device/active`; servidor antigo sem essa rota pode manter heartbeat enquanto o consumidor falha fechado e não avança a fila. Não foi ensaiado como falha de produção. Antes de deploy: matriz de versões, diagnóstico explícito de incompatibilidade e teste de rollout; não tratar online como prova de execução disponível. Migração 0009 e backend novo não foram publicados.

## Remediação atual — c7b2426

R01/R02/R13: reconciliação remota com lease/uncertain, SIGKILL/restart fixture e caso misto no limite corrigidos; crash durante geração continua sem prova. R14: negociação protocolo/caps/schema implementada e testada; rollout não realizado. P1: ownership/consentimento Git sem cleanup automático; coordenação com outros aplicativos e E2E nativo ainda pendentes. Recibos exigem persistência da aprovação exata (D3). R07 ganha TTL/quota de memória, mas logs/eventos/artefatos ainda não têm política global integral. R06/privacidade histórica e revisão independente continuam gates anteriores à exposição pública. Memória não transfere permissões e exclusão é lógica, sem garantia de remoção de backups. Não rebaixar severidade de achado externo ausente por declaração do executor.

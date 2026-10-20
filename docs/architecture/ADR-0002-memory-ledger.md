# ADR-0002 — Ledger cifrado e Passport parcial

Task: OD2-M1. Decisão técnica local, 20/10/2026. Reutilizar Db/Keyring/AEAD existentes; um snapshot por dono/projeto com revisão CAS e AAD ligado a dono/projeto/revisão. Migração expansiva `0009`, sem operação remota. Grafo lógico limitado a 100 memórias/300 relações, `requires` acíclico, fontes/referências explícitas e snapshot até 64 KB. Sem banco vetorial/grafo externo.

Exportação local explícita `memory-only`, sem rede e sem autoridade de execução. Campos desconhecidos rejeitados; evidência externa exige referência; fontes HTTPS sem credencial/query. Filtro de padrões de segredo é defesa complementar, não DLP. Dados pessoais ainda exigem revisão antes de qualquer envio.

Serviço interno, sem endpoint ou integração Workspace/Runner nesta etapa. Identidade do dono deverá vir do auth do futuro adaptador, nunca de corpo externo. Sem workflow humano de memória, `user-approved` não pode ser gravado ou sobrescrito por este serviço. Nenhuma memória concede ferramentas.

Aceites exercitados: gravação/leitura cifrada, isolamento por dono/projeto, duas revisões concorrentes com um vencedor, referência órfã/ciclo, campo extra, fonte com credencial, tamanho excessivo e tentativa de promoção a decisão humana. Lacunas: API autenticada, editar/excluir pelo usuário, retenção/quota total e Passport com tarefa/Git/evidências completas.

## Evolução local OD2-F1 — fronteira HTTP

Adaptador autenticado por dono/sessão e CSRF, com consentimento explícito revisionado por projeto antes de leitura/escrita/exportação. CAS da escrita inclui consentRevision na própria instrução SQL para impedir corrida com forget/revogação. TTL opt-in de 1–90 dias; até vinte projetos cadastrados por dono (inclui tombstones). Renovação após expirar remove snapshot antigo antes de consentir novamente, sem ressuscitar dados. Forget é transacional e exige revisão exata; cron expurga snapshots expirados. Exclusão é lógica: WAL/backups cifrados podem persistir, sem promessa de apagamento físico.

API local/testes, sem integração visual/automática de agentes ou deploy. Passport continua memory-only, export explícito para revisão local; importação em nova sessão exige consentimento do destino e não transfere aprovação/ferramentas. Promoção a user-approved continua bloqueada até workflow humano dedicado. Serviço interno conserva chamadas sem consentRevision apenas para uso de confiança/testes; todo caminho HTTP exige o guard SQL. Migração 0013 aditiva só em DBs descartáveis.

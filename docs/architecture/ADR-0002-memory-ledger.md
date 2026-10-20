# ADR-0002 — Ledger cifrado e Passport parcial

Task: OD2-M1. Decisão técnica local, 20/10/2026. Reutilizar Db/Keyring/AEAD existentes; um snapshot por dono/projeto com revisão CAS e AAD ligado a dono/projeto/revisão. Migração expansiva `0009`, sem operação remota. Grafo lógico limitado a 100 memórias/300 relações, `requires` acíclico, fontes/referências explícitas e snapshot até 64 KB. Sem banco vetorial/grafo externo.

Exportação local explícita `memory-only`, sem rede e sem autoridade de execução. Campos desconhecidos rejeitados; evidência externa exige referência; fontes HTTPS sem credencial/query. Filtro de padrões de segredo é defesa complementar, não DLP. Dados pessoais ainda exigem revisão antes de qualquer envio.

Serviço interno, sem endpoint ou integração Workspace/Runner nesta etapa. Identidade do dono deverá vir do auth do futuro adaptador, nunca de corpo externo. Sem workflow humano de memória, `user-approved` não pode ser gravado ou sobrescrito por este serviço. Nenhuma memória concede ferramentas.

Aceites exercitados: gravação/leitura cifrada, isolamento por dono/projeto, duas revisões concorrentes com um vencedor, referência órfã/ciclo, campo extra, fonte com credencial, tamanho excessivo e tentativa de promoção a decisão humana. Lacunas: API autenticada, editar/excluir pelo usuário, retenção/quota total e Passport com tarefa/Git/evidências completas.

# ADR-0004 — Checkpoints ODCP internos

Estado: implementação parcial local, 2026-10-20. Task OD2-ODCP-015.

Reutilizar SQLite/Hrana e AES-GCM com AAD contendo dono/projeto/tarefa/revisão. Migração aditiva 0014; somente bancos descartáveis migrados. Snapshot CAS e transições explícitas, identidade da tentativa imutável. `needs_reconciliation` não volta diretamente a `running`; terminais não reabrem. `verified` exige campos de evidência, mas o serviço interno não observa Git nem executa testes: o host futuro deve obtê-los de fontes reais.

Não há rota pública, scheduler, lease de agente, timer, recuperação de CLI ou commit automático nesta unidade. O serviço não armazena permissões de execução. Integração com o journal e política de retenção serão necessárias antes de expor checkpoints ao usuário. Exclusão de conta contempla a nova tabela.

Validação: SQLite real, CAS concorrente, escopo por dono/projeto, ciphertext, tentativa imutável, reabertura em sessão limpa e bloqueio de replay incerto. Isso não constitui handoff real entre dois provedores autenticados.

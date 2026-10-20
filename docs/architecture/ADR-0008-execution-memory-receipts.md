# ADR-0008 — Memória factual opt-in ligada às execuções

OD2-MEMORY-021. Migração aditiva 0016 somente em bancos descartáveis. Um plano pode solicitar rememberResults, desabilitado por padrão. Exige consentimento de memória já ativo e captura sua revisão. Isso não concede ferramenta, execução ou compartilhamento com provedor.

Após recibos aprovados files/completed do Runner, o reconciliador pode registrar um fato mínimo: o host reportou aplicação; testes de projeto e integração não são comprovados. Sem prompt, título privado, conteúdo de arquivo ou decisão humana automática. IDs de tarefa/tentativa/Runner são distintos e suas referências tipadas também. UUIDs do plano são normalizados, impedindo aliases de caixa. Hash idempotente anterior preservado quando o novo opt-in está ausente/false.

Ledger existente cifrado/CAS é reutilizado; requisitos e notas são preservados. Proveniência external-evidence, commit null enquanto não observado no serviço, sem promoção a user-approved. Nó determinístico permite reconciliar resposta perdida após escrita sem duplicar fatos. CAS verifica revisão/expiração do consentimento no próprio SQL. Forget/renovação impede recriar histórico automaticamente. Três falhas no máximo por recibo; memória bloqueada não vira autorização nem bloqueia outra tarefa independente. Conflito com nó do usuário preserva o dado e sinaliza revisão.

Workspace mostra revisão registrada e permite reler a memória sem perder rascunho. Opt-in limpa ao trocar projeto/dispositivo. Erro de conexão dos planos é separado do erro de ação. Core continua memory-only para o Passport antigo; contexto operacional completo é próxima unidade, não declarado entregue aqui.

Gate: 317 Node, sete Python/eval/typecheck/build; onze cenários UI prévios, W7 estendido para opt-in; browser/API/SQLite reais validaram criar/aprovar recibos fixture, registrar fato, reler sem perder rascunho, reload e forget sem ressurreição. Executor nesse ensaio é fixture; nenhuma IA ou escrita nativa de projeto foi chamada por essa validação. Retenção segue o consentimento existente; exclusão lógica não promete apagar fisicamente WAL/backups.

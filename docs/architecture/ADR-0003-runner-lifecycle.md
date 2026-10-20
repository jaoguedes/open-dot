# ADR-0003 — execução limitada, cancelamento e reconciliação

Task: OD2-B1 / OD2-C2 / OD2-C3. Decisão local de remediação; sem autorização de rollout.

## Estados e efeitos

| Origem | Evento | Destino | Garantia |
|---|---|---|---|
| queued | claim CAS com protocolo/consentimento | running | Só um claim por dispositivo; task nunca reentregue |
| queued | cancelar/revogar | cancelled | Não reivindicada, sem executor |
| running/awaiting_approval | cancelar | cancel_requested | Pedido persistido; não é confirmação de parada |
| cancel_requested | ACK cancelled do host | cancelled | Host parou novas escritas; não promete desfazer efeitos anteriores |
| cancel_requested | recibo completed/failed tardio | uncertain | Não transformar corrida em sucesso/cancelamento comprovados |
| ativa | revogar, lease expirar ou sessão expirar | uncertain | Credencial/estado cercados no servidor; processo remoto pode ter efeitos locais |
| awaiting_approval | aprovação pendente expirar | failed | Não conceder autorização expirada |
| running | conclusão válida | completed | Recibo e transição persistidos juntos |
| terminal | novo recibo | terminal | Sem alterar estado; duplicata exata só confirma recibo anterior |

Lease de 30 s renovada por heartbeat, limitada a 20 min por tarefa. Cancelamento não renova prazo. Cron e endpoints reconciliam mesmo se o Runner não retornar. A execução só prossegue após negociação do protocolo 2 e contrato/capacidades compatíveis. Um heartbeat de transporte pode ser online e incompatível; não significa executor apto.

Não existe retry automático da mesma task. Task do Runner ainda não é scheduler ODCP com tentativas próprias/leases multiagente. CAS de estado e identidade não matam processo offline nem oferecem transação distribuída entre HTTP e disco. Isso exige uncertain, preservação de worktree e intervenção/revisão dos efeitos. Diretórios por tarefa não são reutilizados.

## Consentimento, conteúdo e recovery

Preparar worktree altera metadados compartilhados: exige consentimento explícito no envio, verificado na API e no host; antes de add grava ownership exclusivo task/project/base. Snapshot usa SHA fixado; falhas não apagam automaticamente nada. Recuperação bloqueia ownership ausente/incompatível. Cleanup assistido, detecção ampla de órfãos e coordenação com aplicativos externos ainda pendentes.

Aprovação de conteúdo é separada, expira e usa digest dos bytes UTF-8 originais da proposta. UI verifica digest, mostra payload integral escapado e anterior/novo. Conteúdo anterior precisa corresponder ao beforeHash. O hash não é uma autorização para shell, rede, commit ou push. O host reconfere conteúdo/hash e baseline antes de escrever. Perfis e memória não concedem ferramentas.

Nativo reconhece uncertain sem reaplicar proposta. Journal/ownership e diretórios pós-rename recebem fsync no Unix; isso foi ensaiado com SIGKILL em filho próprio, não corte de energia. Windows continua sem executor habilitado. Revogação offline fica explicitamente pendente e persistida; nenhuma credencial passa ao frontend.

## Rollout

Aplicar migrações expansivas em ambiente autorizado antes de habilitar novo Worker/Runner. Dispositivos legados precisam negociar; fila antiga sem consentimento é cancelada na migração, estado ativo sem lease passa uncertain. Não restaurar tasks antigas como queued. Verificar backups/privacidade e matriz de versões antes de deploy. Nesta rodada só bancos descartáveis, sem push ou serviço remoto.

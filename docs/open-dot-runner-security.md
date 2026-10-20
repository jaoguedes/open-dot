# Segurança do Runner — estado vigente em 20/10/2026

Este documento substitui os estados de protótipo anteriores, preservados no Git. Basear auditoria no código e recibos, não em telas. Tarefas: remediação até c7b2426; relatório vigente em audit/REMEDIATION_REPORT.md.

## Fronteiras atuais

Desktop Tauri carrega UI empacotada, CSP/IPC restritos; nenhum shell/fs/http/opener plugin genérico. IPC expõe diagnóstico, escolha/revogação de pasta e início/confirmação/desconexão do pareamento. O navegador não recebe bearer, caches de autenticação ou acesso a arquivos arbitrários. Não há porta inbound do Runner. Seis comandos não equivalem a seis permissões de execução genérica.

Pareamento por desafio/código temporário, confirmação do dono autenticado com CSRF, token aleatório no cofre nativo e hash no servidor. Cofre não tem fallback em texto. Link local contém metadados, não segredo. Keychain testado realmente no Intel; Credential Manager compilado anteriormente, sem teste runtime nativo Windows desta fase. HTTP loopback só debug; demais origens exigem HTTPS, sem redirects.

Heartbeat é iniciado no host. Protocolo 2 e capacidades/contrato/schema negociados antes de execução; online de transporte não significa compatibilidade. Lease de 30 s com teto de 20 min e cron/leitura/claim reconciliam mesmo sem retorno do dispositivo. Pedido de cancelamento não é confirmação de parada; revogar ativa termina uncertain. Disconnect offline fica pending persistente até confirmação remota. Servidor expira disponibilidade sem heartbeat recente; revogação invalida bearer. A UI distingue instalação, login e execução. Cancelamento/indisponibilidade fazem o host parar quando observados; não comprovam parada instantânea offline nem desfazem conteúdo já aprovado. Estado uncertain preserva essa distinção. Modelo não escolhe permissões.

## Execução real e limites

Codex macOS exige login ChatGPT oficial, perfil nomeado e prova com canários; configuração/MCP/ferramentas são verificadas no app-server. Perfis experimentais incompatíveis falham fechados. Nenhum token de outro aplicativo é exportado. Sem fallback pago.

Modelo gera proposta estruturada somente leitura. Host limita até oito arquivos/8 KB novos e 8 KB de conteúdo anterior, protege caminhos/arquivos ocultos/symlinks, compara versão inicial e aplica somente conteúdo exato aprovado por hash/uso único/expiração. Cifra AES-GCM com AAD separa dono/tarefa/proposta/evento. Isso não é E2EE: o Worker pode decifrar.

Worktree deriva de SHA fixada antes da preparação, sem hooks/filtros de checkout. Criá-lo exige consentimento específico para metadados compartilhados e ownership persistido antes de add; recovery verifica escopo. Sem limpeza automática de worktrees. Não inclui alterações sujas da pasta original; é detached, sem branch/commit automático. Worktree não é sandbox. Processo tem argv fixo, ambiente reduzido, grupo/timeout/saída limitada, CPU/descritores no Unix. Um worker sequencial e single instance reduzem concorrência; não há garantia geral de limite NPROC nem scheduler/lease entre mecanismos. Não habilitar paralelo.

Journal guarda apenas metadados e digest, com leitura limitada e escrita atômica. Proposta confirmada pode ser retomada sem nova geração. Endpoint autenticado `/api/runner/device/active` devolve só IDs/sequência: reserva sem journal é encerrada como uncertain, preservando worktree, sem nova escrita/modelo. Geração interrompida não é repetida automaticamente.

Progresso é limitado a 490 eventos de sequência; proposta/arquivos/testes têm limites separados, reservando término até 500. Lease expirada ou ausente encerra tentativa como uncertain mesmo no legado saturado, sem inventar recibo. Os arquivos/efeitos anteriores ainda precisam de inspeção específica. A consulta de eventos e o journal não substituem um Flight Recorder integral.

## Memória autenticada e consentida

Migrações aditivas até `0013`: ledger cifrado por dono/projeto/revisão com CAS; API por sessão/CSRF e Workspace exigem consentimento revisionado e retenção. SQL da escrita inclui revisão/validade de consentimento, inclusive em corrida com forget. Até vinte projetos cadastrados por dono; TTL de 1–90 dias e expurgo lógico. Passport `memory-only` limitado a 64 KB; grafos/refs validados. WAL/backups não são apagamento físico seguro. Importação não concede ferramentas ou aprovação humana. Workflow de memória `user-approved` fica bloqueado até implementação específica. Filtro de segredo não é DLP; texto/fonte pode conter dados pessoais e requer revisão antes de envio.

ODCP e Expert Contracts são contratos testados, não enforcement integrado. Nenhum perfil autoriza comandos. Checklist de handoff exige SHA/snapshot observado pelo host; texto declarando sucesso não basta. Timer por tempo ativo é função pura, sem loop persistente no Runner.

## Deliberadamente bloqueado

Shell e testes arbitrários de projetos, commit/push/merge/deploy automáticos, Claude/Cursor executores, execução Windows sem prova nativa, autostart, Web Push/aprovação iPhone e transferência automática entre mecanismos. `npm test` é código arbitrário; não se torna seguro pelo nome. Futuro gate deve vincular runtime/argv/arquivos/política à aprovação e provar fs/rede/processos no SO.

## Evidência e riscos residuais

Codex real revalidado nesta rodada: conta oficial, HTTP/SQLite/Keychain e arquivo aprovado no worktree, original limpo. Ensaio de recuperação mata filho próprio após primeira escrita aprovada, restaura e conclui uma vez; proposta sintética identificada, sem modelo nesse teste. UI usa API/IPC simulados em cenários separados. Aprovação do Workspace com API real/Codex nativo também testada; pairing/pasta/prompt são programáticos nesse ensaio. GUI nativa completa/iPhone/ARM64/Windows runtime e revisão independente atual ainda pendentes.

Logs nativos fixos/rotacionados não incluem tokens/prompt. Caminho específico da máquina removido da saída do teste Codex. Scanner de padrões e revisão de delta não garantem ausência de todo PII ou credencial. Auditoria integral de histórico/licenças/SBOM necessária antes de qualquer publicação. Sem migração remota, push autorizado, deploy ou release nesta fase. Veja RISK_REGISTER e AGENT_HANDOFF.

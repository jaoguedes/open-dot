# Segurança do Runner — estado vigente em 20/10/2026

Este documento substitui os estados de protótipo anteriores, preservados no Git. Basear auditoria no código e recibos, não em telas. Tarefas: OD2-P0/R1/R2/R4/S1.

## Fronteiras atuais

Desktop Tauri carrega UI empacotada, CSP/IPC restritos; nenhum shell/fs/http/opener plugin genérico. IPC expõe diagnóstico, escolha/revogação de pasta e início/confirmação/desconexão do pareamento. O navegador não recebe bearer, caches de autenticação ou acesso a arquivos arbitrários. Não há porta inbound do Runner. Seis comandos não equivalem a seis permissões de execução genérica.

Pareamento por desafio/código temporário, confirmação do dono autenticado com CSRF, token aleatório no cofre nativo e hash no servidor. Cofre não tem fallback em texto. Link local contém metadados, não segredo. Keychain testado realmente no Intel; Credential Manager compilado anteriormente, sem teste runtime nativo Windows desta fase. HTTP loopback só debug; demais origens exigem HTTPS, sem redirects.

Heartbeat é iniciado no host. Servidor expira disponibilidade sem heartbeat recente; revogação invalida bearer. A UI distingue instalação, login e execução. Cancelamento/indisponibilidade impedem novos efeitos, mas não desfazem conteúdo já aprovado. Modelo não escolhe permissões.

## Execução real e limites

Codex macOS exige login ChatGPT oficial, perfil nomeado e prova com canários; configuração/MCP/ferramentas são verificadas no app-server. Perfis experimentais incompatíveis falham fechados. Nenhum token de outro aplicativo é exportado. Sem fallback pago.

Modelo gera proposta estruturada somente leitura. Host limita até oito arquivos/8 KB, protege caminhos/arquivos ocultos/symlinks, compara versão inicial e aplica somente conteúdo exato aprovado por hash/uso único/expiração. Cifra AES-GCM com AAD separa dono/tarefa/proposta/evento. Isso não é E2EE: o Worker pode decifrar.

Worktree deriva de HEAD, sem hooks/filtros de checkout. Não inclui alterações sujas da pasta original; é detached, sem branch/commit automático. Worktree não é sandbox. Processo tem argv fixo, ambiente reduzido, grupo/timeout/saída limitada, CPU/descritores no Unix. Um worker sequencial e single instance reduzem concorrência; não há garantia geral de limite NPROC nem scheduler/lease entre mecanismos. Não habilitar paralelo.

Journal guarda apenas metadados e digest, com leitura limitada e escrita atômica. Proposta confirmada pode ser retomada sem nova geração. Endpoint autenticado `/api/runner/device/active` devolve só IDs/sequência: reserva sem journal é encerrada como falha incerta, preservando worktree, sem nova escrita/modelo. Geração interrompida não é repetida automaticamente.

Progresso é limitado a 490 eventos de sequência; proposta/arquivos/testes têm limites separados, reservando término até 500. Dados legados que já estavam saturados não são reparados silenciosamente; precisam de inspeção específica. A consulta de eventos e o journal não substituem um Flight Recorder integral.

## Persistência de memória em preparação

Migração aditiva `0009`: ledger cifrado por dono/projeto/revisão com CAS, serviço interno sem rota/IPC/UI. Passport local `memory-only`, limitado a 64 KB; grafos/refs validados. Importação não concede ferramentas ou aprovação humana. Workflow de memória `user-approved` fica bloqueado até implementação específica. Filtro de segredo não é DLP; texto/fonte pode conter dados pessoais e requer revisão antes de envio.

ODCP e Expert Contracts são contratos testados, não enforcement integrado. Nenhum perfil autoriza comandos. Checklist de handoff exige SHA/snapshot observado pelo host; texto declarando sucesso não basta. Timer por tempo ativo é função pura, sem loop persistente no Runner.

## Deliberadamente bloqueado

Shell e testes arbitrários de projetos, commit/push/merge/deploy automáticos, Claude/Cursor executores, execução Windows sem prova nativa, autostart, Web Push/aprovação iPhone e transferência automática entre mecanismos. `npm test` é código arbitrário; não se torna seguro pelo nome. Futuro gate deve vincular runtime/argv/arquivos/política à aprovação e provar fs/rede/processos no SO.

## Evidência e riscos residuais

Codex real revalidado nesta rodada: conta oficial, HTTP/SQLite/Keychain e arquivo aprovado no worktree, original limpo. Ensaio de recuperação mata filho próprio após primeira escrita aprovada, restaura e conclui uma vez; proposta sintética identificada, sem modelo nesse teste. UI usa API/IPC simulados em cenários separados. GUI completa/iPhone/ARM64/Windows runtime e revisão independente ainda pendentes.

Logs nativos fixos/rotacionados não incluem tokens/prompt. Caminho específico da máquina removido da saída do teste Codex. Scanner de padrões e revisão de delta não garantem ausência de todo PII ou credencial. Auditoria integral de histórico/licenças/SBOM necessária antes de qualquer publicação. Sem migração remota, push autorizado, deploy ou release nesta fase. Veja RISK_REGISTER e AGENT_HANDOFF.

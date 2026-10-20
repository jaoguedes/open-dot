# Segurança e limites atuais

Open Dot está em desenvolvimento privado. Não habilitar execução sobre projetos sensíveis ou publicar uma beta pública sem os gates documentados em docs/audit/REMEDIATION_REPORT.md. Este arquivo não anuncia um programa público de suporte ou auditoria concluída.

Relate suspeitas por um canal privado previamente combinado com o mantenedor. Não publique tokens, dumps, conteúdo de conta, caminhos pessoais ou reproduções com dados reais em issues/logs. Use fixtures e descreva versão/SHA, fronteira afetada, comportamento observado e teste mínimo. Nenhum envio externo é feito automaticamente pelo aplicativo de teste.

O Runner usa canal de saída autenticado, cofre nativo e aprovação vinculada ao conteúdo. Revogação/lease não provam que um processo offline parou: estado uncertain preserva essa distinção. Worktree não equivale a sandbox; comandos/testes de projeto e executor Windows permanecem bloqueados. Não copie credenciais entre fornecedores ou exponha bearer ao frontend.

Memória exige sessão, CSRF para mutações, consentimento por projeto, retenção e CAS. Passport é dados, não autorização de execução. Remover snapshot é exclusão lógica; não promete eliminar cópias de WAL/backups. Proveniência user-provided não é decisão humana aprovada.

Scanner de padrões não é DLP nem auditoria integral de histórico. Revisão independente, inventário de dependências/assets/licenças, isolamento por SO, instalação e revisão de privacidade são gates anteriores a qualquer publicação. Não reescrever história compartilhada, rodar testes ofensivos externos ou contratar serviços para investigar um achado sem autorização aplicável.

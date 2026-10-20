# UX — Workspace e Runner

Dot anfitrião: reutilização de AgentDot/DotView, geometria, olhos, gradiente, blush e reações originais. Nada de boca, sobrancelha, badge permanente ou deformação de proporções. Hero do Workspace com 240 px, Runner com 320 px e contatos com 64 px. Movimento reduzido preservado pelo mesmo motor; sem imagem gerada ou cópia de aplicativos de referência.

Workspace usa lista/detalhe, estado real do snapshot, contexto e checklist locais. O seletor escolhe o agente para acompanhar histórico e abrir a tela existente; a conversa é sempre com o Dot via `/api/ask`, não uma simulação de driver. Projeto/tarefas não entram no prompt nem no servidor; conteúdo é local a este navegador, não uma execução. Histórico de conversa só em memória da tela. Aprovações levam ao fluxo existente por hash/CAS.

Meu dia ganha acesso ao Workspace. Resumos estruturados compartilham MailSummary: assunto, remetente quando disponível, categoria, data, fato, motivo por categoria explicitamente rotulado, ação sugerida e links existentes do Gmail. Não inventa dados ausentes nem cria rascunhos. Mantém feedback, silenciamento, evidência e comportamento de demonstração.

Runner: seis etapas navegáveis, diagnóstico só por IPC nativo, seleção via diálogo do SO, revogação, estado de pareamento indisponível. A conclusão confirma apenas a base, nunca “agente conectado”. Prévia web desabilita recursos locais. Nenhuma promessa de trabalho offline/remoto: tray mantém processo vivo enquanto o computador está ligado.

Temas e fontes locais existentes no web; desktop usa tokens de tema escuro e contraste existentes. Fallback de armazenamento em memória quando localStorage falha. Layout móvel com lista horizontal de contatos, campos rotulados e controles de teclado. QA em screenshots dentro de `test-results/runner/` (não versionadas). Leitor de tela e hardware nativo continuam verificações manuais separadas.

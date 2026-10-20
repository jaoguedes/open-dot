> Estado operacional em 20/10/2026: Codex macOS executou tarefa real no núcleo nativo, com proposta somente leitura e aprovação exata para edição no worktree. Shell/testes de projeto, Claude/Cursor e executor Windows continuam indisponíveis. Sem publicação por pedido atual. Consulte [relatório vigente](agent-workspace/RESULTADO_OPERACIONAL.md); estados anteriores abaixo são históricos.

# Segurança do Runner

## Fronteiras implementadas

O desktop carrega exclusivamente frontend empacotado. CSP bloqueia rede arbitrária, frames e objetos; connect-src só IPC. Não há navegação remota configurada nem servidor localhost. Capacidade vinculada à janela local `main`, sem shell/fs/http/opener plugins ou permissões remotas. Três comandos customizados: diagnostics, choose_folder e revoke_folder. `choose_folder` recebe a escolha exclusivamente do diálogo nativo; JavaScript não envia um caminho para conceder permissão. Configuração é local e não é um cofre de segredos.

Pastas são canonicalizadas (resolve symlinks), precisam existir e ser diretórios, raiz do disco recusada, dedupe e teto de 20. Registro não concede leitura de arquivo ou execução nesta versão. Permissões persistem na pasta de dados exclusiva com 0700 no Unix. Revogação persiste antes da confirmação na UI. Auditoria limitada a eventos fixos e timestamp, rotacionada em ~256 KB (mais um arquivo anterior), sem caminho/nome de projeto ou conteúdo. Lock em memória serializa mudanças dentro do processo. Não há proteção contra outro processo do mesmo usuário alterar os arquivos locais, nem garantia de auditoria imutável. Não executar duas instâncias simultâneas.

## Deliberadamente indisponível

Pareamento, transporte remoto, tokens, cofre do SO, drivers, comandos de shell, escrita/leitura em projetos e autostart. Nenhum token é solicitado ou armazenado. Não usar settings.json/localStorage para futuros tokens. Implementar cofre nativo antes de adicionar qualquer credencial. Pastas salvas não podem ser tratadas como autorização irrestrita por um driver futuro.

## Contrato para próxima fase

Pareamento autenticado por sessão do dono, desafio aleatório com alta entropia/expiração curta/uso único, confirmação dos dois lados, token vinculado a dispositivo e guardado no cofre do SO; servidor guarda apenas hash, oferece revogação e limite de tentativas. Runner inicia o canal TLS; conteúdo externo nunca autoriza comando. Sem CORS amplo ou porta localhost aberta.

Antes de qualquer driver: identificador allowlist, argumentos estruturados sem shell, timeout/cancelamento, orçamento, isolamento de pasta, revalidação de caminho a cada acesso (inclusive symlinks/TOCTOU), limites de saída, redação de logs, revisão do conteúdo exato por hash/versão e consumo único da aprovação. Persistir fila/lease e histórico real antes de mostrar execução. Reutilizar os princípios de approvals.ts sem importar suposições de Gmail.

## Verificação

Testes Rust exercitam existência/diretório/raiz/dedupe; UI simula IPC em teste separado e não prova segurança nativa. Capabilities/CSP e ausência de plugins perigosos são inspecionadas. Necessários testes reais de diálogo, tray, reabertura, persistência e permissões em Mac Intel/ARM e Windows. Nenhum acesso a segredos, serviço remoto ou banco de produção nesta implementação.

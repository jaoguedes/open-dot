# Open Dot Runner 0.1.0

Base desktop independente. Compartilha o motor original do Dot e os tokens visuais, sem incluir o app autenticado, service worker, banco ou cron remotos.

Na raiz do repositório:

```sh
npm ci
npm run runner:build
npm run runner:desktop -- dev
```

O último comando requer Rust e ferramentas nativas da plataforma. No macOS desktop bastam as Command Line Tools; nenhum Xcode completo é instalado pelo projeto. O build oficial dos instaladores fica no GitHub Actions, com opt-in e sem publicação automática. Confira [guia de instaladores](../../docs/open-dot-runner-release.md).

Funcional no código: diagnóstico do SO/arquitetura/versão via IPC, pastas selecionadas por diálogo nativo, revogação/persistência, auditoria limitada e menu no tray. Janela fecha para o tray; Sair encerra o processo.

Pareamento implementado: código de uso único (cinco minutos), confirmação na sessão web, segredo no Keychain/Credential Manager, reconexão e heartbeat de saída, revogação pelo Workspace. Caminhos completos não saem do Runner. HTTP loopback somente em debug.

Diagnóstico: procura os CLIs oficiais e consulta login do Codex/Claude sem abrir caches de credenciais. Cursor apenas detectado; login não confirmado. Codex no macOS oferece edição por proposta estruturada, após prova local do isolamento: até oito arquivos e 8 KB, sem shell/MCP, com aprovação do conteúdo exato e aplicação em worktree. Journal permite recuperar propostas sem repetir a chamada do modelo; geração interrompida falha sem repetição automática. Claude e Cursor permanecem sem execução disponível. Autostart ainda não implementado. A prévia em navegador tem comandos nativos desabilitados. Nenhuma execução fictícia ou credencial é incluída.

`npm run ui:runner` verifica a interface com Chromium e IPC simulado explicitamente nos testes. `cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml` verifica o Rust; compilar a UI antes. Resultados efetivamente obtidos nesta sessão ficam em [STATUS](../../docs/STATUS.md).

Integração do canal com cofre real e API/SQLite isolados: `node --import tsx scripts/test-runner-channel.ts` (Rust no PATH, macOS/Windows; abre somente loopback e remove o token de teste). Não executa tarefa de IA. O servidor usa sessão local de desenvolvimento e banco em memória; não valida login Google ou produção.

Estado operacional e bloqueios: [relatório](../../docs/agent-workspace/RESULTADO_OPERACIONAL.md).

Teste real do Codex: `node --import tsx scripts/test-runner-channel.ts --codex`. Exige CLI oficial com login ChatGPT e Keychain; faz uma chamada real do modelo em fixture Git isolada, aprova somente um arquivo de conteúdo fixo e comprova eventos, escrita e preservação da pasta original. Não é um teste completo da interface gráfica; não executa testes/comandos do projeto.

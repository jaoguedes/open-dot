# Roteiro de testes manuais (precisa de uma pessoa)

O que a automação desta auditoria não conseguiu provar. Use um projeto e dados fictícios. Anote para cada item: plataforma, SHA, **aprovado / reprovado / não testado** e uma observação curta. Não cole tokens nem caminhos pessoais nos registros.

## 0. Pré-requisitos (no Mac do mantenedor)

1. Instalar o Rust estável (rustup) e rodar `cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml`.
   **Aprova se:** todos passam, incluindo os novos `git_ignores_global_and_system_configuration`, `claude::tests::*` e `cursor::tests::*`. **Estes testes nunca foram compilados nesta auditoria.**
2. `node --import tsx scripts/test-runner-channel.ts --recovery`. **Aprova se:** sai com código 0.
3. Opcional: `cargo install cargo-audit --locked && cargo audit --file apps/runner/src-tauri/Cargo.lock`.

## 1. Runner — GUI nativa (macOS Intel, depois ARM64)

| # | Passo | Aprova se |
|---|---|---|
| 1.1 | Abrir o DMG (não assinado), arrastar, abrir pelo menu de contexto | Abre; aviso de app não verificado aparece e é esperado |
| 1.2 | Parear com a sua instância: código e nome no Workspace autenticado | Status “Conectado”; o token não aparece em lugar nenhum da interface |
| 1.3 | Escolher uma pasta Git de teste (com ao menos um commit) | Aparece na lista; revogar remove |
| 1.4 | Enviar tarefa ao Codex pedindo um arquivo novo | Proposta com conteúdo completo aparece no Workspace antes de qualquer escrita |
| 1.5 | Aprovar | Arquivo aparece só no worktree isolado; a pasta original continua com `git status` limpo |
| 1.6 | Pedir commit local na janela do Runner | Diálogo nativo mostra projeto, branch, hash e arquivos; cancelar não cria commit; confirmar cria commit em `agent/<tarefa>` sem push |
| 1.7 | Exportar contexto do projeto | Diálogo de salvar nativo; arquivo novo, nunca sobrescreve |
| 1.8 | Fechar a janela e reabrir pela bandeja; sair pelo menu | Volta ao estado anterior; ao sair, nenhum processo filho continua (Monitor de Atividade) |
| 1.9 | Revogar o dispositivo pelo Workspace com uma tarefa em andamento | Tarefa vira “incerta”, nada é repetido; o Runner pede novo pareamento |

## 2. Interrupção durante geração real

1. Enviar uma tarefa ao Codex e, durante a geração, encerrar o Runner pelo Monitor de Atividade (forçar encerramento).
2. Reabrir o Runner.

**Aprova se:** a tarefa termina como falha ou incerta, sem nova chamada ao modelo; o worktree é preservado; nenhum processo do Codex sobrou.

## 3. Claude Code (opcional, experimental)

1. Entrar no Claude Code pelo terminal com o login oficial (`claude`, depois `/login`). Não copie tokens.
2. Abrir o Runner com `OPEN_DOT_EXPERIMENTAL_DRIVERS=claude-code`.
3. Repetir 1.4 e 1.5 com o mecanismo Claude Code.

**Aprova se:** o diagnóstico mostra “Experimental”; a proposta chega sem nenhuma ferramenta usada; arquivos com caminho protegido (`.env`, `../`) são recusados; sem login, a tarefa falha com “Login oficial do Claude Code ausente ou expirado”.

## 4. Windows

1. Instalar o NSIS. **Aprova se:** instala por usuário, abre, pareia e mostra o executor como desligado (comportamento esperado nesta beta).

## 5. iPhone (PWA)

1. Adicionar à tela inicial; conferir ícone, splash com o Dot, temas claro e escuro, alvos de toque.
2. Abrir “Abrir no app do Gmail” num item do feed.

**Aprova se:** ícone e Dot corretos; nada cortado em 390 px; o botão abre o app do Gmail.

## 6. Produção (só o mantenedor)

1. Seguir `docs/audit/SEGURANCA_DO_MANTENEDOR.md` (2FA, `OWNER_GOOGLE_SUB`, contato público, `.deploy.local.json`).
2. `npm run deploy`. **Aprova se:** a migração 0017 é aplicada antes do Worker, o smoke passa e `/api/auth/google/start` redireciona **sem** `login_hint`.

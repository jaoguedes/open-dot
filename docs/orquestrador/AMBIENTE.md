# Ambiente de desenvolvimento (v0.2, atualizado no v0.3)

Máquina do mantenedor, macOS Intel (x86_64), 21/10/2026.

| Ferramenta | Versão | Como chegou |
|---|---|---|
| Node / npm | 24.21.0 / 11.19.0 | já instalado |
| Rust (cargo / rustc) | 1.99.1 / 1.99.1 | **instalado nesta rodada** com o instalador oficial `rustup`, no diretório do usuário: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rustup-init.sh && sh rustup-init.sh -y --no-modify-path --profile minimal --default-toolchain stable`. Sem alterar o PATH do shell; usar `PATH="$HOME/.cargo/bin:$PATH"`. |
| Claude Code | ver `FLAGS_VERIFICADAS.md` | já instalado (`~/.local/bin/claude`) |
| Codex CLI | 0.163.0-alpha.10.2 | dentro do app ChatGPT (`/Applications/ChatGPT.app/...`), logado com ChatGPT. A auditoria anterior não o encontrou porque procurou só no PATH |
| Gemini CLI, Cursor (`agent`), Ollama, OpenCode | — | **não instalados** nesta máquina |
| Claude Code | 2.1.296 | instalado, **sem login** (`authMethod: none`) |

Exceção de rede usada: só o instalador oficial `rustup` e os registros de pacotes que ele e o `cargo` usam.

## v0.3 (22/10/2026)

| Ferramenta | Versão | Observação |
|---|---|---|
| Node / npm | 24.21.0 | sem mudança |
| Rust (cargo / rustc) | 1.99.1 / 1.99.1 | suficiente para Tauri 2 e os plugins oficiais de atualização, início automático e notificação; nada foi atualizado |
| Codex CLI | 0.163.0-alpha.11 | logado (ChatGPT) |
| Claude Code | 2.1.306 | **logado por assinatura (claude.ai)**; driver do Runner segue opt-in e desligado |
| Gemini CLI, Cursor | — | não instalados |

Crates novas do Runner (licenças em `docs/LICENCAS.md`): `sysinfo` (saúde), `tauri-plugin-updater`, `tauri-plugin-autostart`, `tauri-plugin-notification`, `minisign-verify` (assinatura), `base64`, `semver`; `minisign` só em testes (chave efêmera na memória).

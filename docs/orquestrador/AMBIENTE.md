# Ambiente de desenvolvimento do v0.2

Máquina do mantenedor, macOS Intel (x86_64), 21/10/2026.

| Ferramenta | Versão | Como chegou |
|---|---|---|
| Node / npm | 24.21.0 / 11.19.0 | já instalado |
| Rust (cargo / rustc) | 1.99.1 / 1.99.1 | **instalado nesta rodada** com o instalador oficial `rustup`, no diretório do usuário: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rustup-init.sh && sh rustup-init.sh -y --no-modify-path --profile minimal --default-toolchain stable`. Sem alterar o PATH do shell; usar `PATH="$HOME/.cargo/bin:$PATH"`. |
| Claude Code | ver `FLAGS_VERIFICADAS.md` | já instalado (`~/.local/bin/claude`) |
| Codex CLI, Gemini CLI, Cursor (`agent`), Ollama, OpenCode | — | **não instalados** nesta máquina |

Exceção de rede usada: só o instalador oficial `rustup` e os registros de pacotes que ele e o `cargo` usam.

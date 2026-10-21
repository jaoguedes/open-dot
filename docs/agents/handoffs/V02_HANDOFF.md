# Handoff v0.2 — motor de orquestração

Branch `claude/od2-v02` (base `d9fe92d` de `claude/od2-audit`). Push do `origin` desativado. Nada publicado.

## Estado

- Fase 0: concluída. Rust 1.99.1 instalado via rustup no usuário; `cargo test` do Runner: 31 → 33 testes passando; recuperação integrada passando.
- Fase 1: concluída (catálogo, parsers TS, snapshot no Worker, migração 0018, detector Rust). Tela de ferramentas vai na Fase 5.
- Próxima: Fase 2 (agentes).

## Retomar

```bash
git switch claude/od2-v02 && git status
npm ci && npm run check
PATH="$HOME/.cargo/bin:$PATH" cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml
```

## Decisões e bloqueios

- Codex está dentro do app ChatGPT e logado (ChatGPT); Claude Code instalado **sem login** (não contornar); Gemini e Cursor ausentes.
- Gemini indisponível para implementar (modo plan escreve `.md`). Cursor indisponível.

# Handoff v0.2 — motor de orquestração

Branch `claude/od2-v02` (base `d9fe92d` de `claude/od2-audit`). Push do `origin` desativado. Nada publicado.

## Estado

- Fase 0: concluída. Rust 1.99.1 instalado via rustup no usuário; `cargo test` do Runner: 31 → 33 testes passando; recuperação integrada passando.
- Fase 1: concluída (catálogo, parsers TS, snapshot no Worker, migração 0018, detector Rust). Tela de ferramentas vai na Fase 5.
- Fase 2: concluída (formato, carregador, 5 especialistas, lock).
- Fase 3: concluída (perfil, cota, pesos, seletor, rotas de equipe/configurações/cota).
- Fase 4: concluída (respond nos drivers, pipeline sequencial no Worker, 2 chamadas reais ao Codex aprovadas no esquema; Claude sem login = sem teste real).
- Próxima: Fase 6 (avaliação golden), depois Fase 5 (tela Equipe) e Fase 7.

## Retomar

```bash
git switch claude/od2-v02 && git status
npm ci && npm run check
PATH="$HOME/.cargo/bin:$PATH" cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml
```

## Decisões e bloqueios

- Codex está dentro do app ChatGPT e logado (ChatGPT); Claude Code instalado **sem login** (não contornar); Gemini e Cursor ausentes.
- Gemini indisponível para implementar (modo plan escreve `.md`). Cursor indisponível.

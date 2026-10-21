# Handoff Claude Code — auditoria independente e preparação open source

Data 20/10/2026. Agente Claude Code. Branch `claude/od2-audit` (base congelada `9e1b3fd853d37a26413c0f03c71238c96b43842d`); interface em `claude/od2-ui` (HEAD `872056ce7705ef8a143ea7fb7f29482510f4c144`). SHA deste documento: `git log -1 --format=%H -- docs/agents/handoffs/2026-10-20-claude-independent-audit.md`.

## Objetivo

Deixar o repositório publicável como open source sem expor o mantenedor: auditoria independente, correções, higiene, licenças, pendências comprováveis, documentação, interface aprovada em branch separada e publicação preparada (não executada).

## Decisões

- Dot continua visível e padrão, licença só de visualização; forks trocam pelo Marcador (decisão do mantenedor no meio da rodada).
- Histórico não reescrito (só identificadores aceitos pelo mantenedor).
- Driver Claude Code desligado até validação real; Cursor indisponível por desenho.
- Origem e nome da instância fora do Git (`.deploy.local.json`).

## Concluído / pendente

Concluído: ver `docs/audit/CLAUDE_FINAL_REPORT.md`. Pendente (mantenedor): `cargo test`, roteiro manual, revisão jurídica, contatos, ações de produção, 2FA, decisão sobre `claude/od2-ui`.

## Retomar sem conversa

1. `git status`, `git worktree list`, `git log --oneline 9e1b3fd..claude/od2-audit`. Não tocar o worktree do Codex.
2. `npm ci && npm run check && npm run check:without-dot`.
3. Com Rust instalado: `cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml` e corrigir o que não compilar no código novo (`claude.rs`, `cursor.rs`, `worktree.rs`, `executor.rs`, `main.rs`, `drivers.rs`).
4. Próxima unidade: validar o driver Claude Code com login oficial (seção 3 do roteiro manual).
5. Nunca publicar sem `scripts/release/PUBLISH.md` e autorização do mantenedor.

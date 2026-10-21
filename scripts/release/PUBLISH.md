# Publicar o Open Dot (passo a passo do mantenedor)

O agente que preparou isto **não publicou nada**. Publicar é decisão sua, depois de ler `docs/audit/CLAUDE_FINAL_REPORT.md`.

## Antes

1. Faça o que está em `docs/audit/SEGURANCA_DO_MANTENEDOR.md` (2FA, rotação se houver dúvida, `OWNER_GOOGLE_SUB`, contato público).
2. Rode o roteiro manual que importa para você (`docs/audit/MANUAL_TEST_SCRIPT.md`), no mínimo a seção 0 (`cargo test`).
3. Preencha `[CONTATO_A_DEFINIR]` em `SECURITY.md`, `COMMERCIAL-LICENSE.md`, `LICENSE-DOT-ASSETS.md`, `TRADEMARK.md`, `CODE_OF_CONDUCT.md`, e decida se a revisão jurídica vem antes.
4. Decida se a interface nova (`claude/od2-ui`) entra agora (`INCLUDE_UI=1`) ou depois.

## Plano (não altera nada)

```bash
REPO=<dono>/<repo> scripts/release/publish.sh
```

## Executar

```bash
REPO=<dono>/<repo> EXPECTED_SHA=<sha revisado de claude/od2-audit> scripts/release/publish.sh --execute
```

O script confere árvore limpa, SHA esperado e varredura; pede para você digitar o nome do repositório; integra na `main` local; envia **só a `main`** (nunca `--mirror`/`--all`: há refs locais antigas); liga secret scanning, push protection, alertas e correções do Dependabot, relatório privado de vulnerabilidades, permissões somente leitura do Actions, aprovação para PRs de fork e proteção da `main`; apaga artefatos e execuções antigas do Actions; torna o repositório público; cria a tag `v0.1.0-beta` e um release **em rascunho**.

Se o histórico tiver sido reescrito (`HISTORY_REWRITTEN=1`), o script pede para excluir e recriar o repositório remoto antes do push, porque o GitHub mantém commits antigos acessíveis por refs de PR e cache. Nesta rodada o histórico **não** foi reescrito.

## Depois

- CODEOWNERS já aponta para `@jaoguedes`; confira só se quiser outros revisores.
- Revise e publique o release em rascunho.
- Confira as abas Security e Actions do repositório.

# Publicar o Open Dot v0.2.0-beta (passo a passo do mantenedor)

O agente que preparou isto **não publicou nada**. Publicar é decisão sua, depois de ler `docs/audit/V02_REPORT.md` e `docs/audit/PUBLISH_READINESS.md`.

## O que será publicado

A branch `release/v0.2` (auditoria + v0.2 + interface), enviada como **avanço rápido** da `main` para o SHA que você revisou, mais a tag `v0.2.0-beta` e um release em rascunho com `docs/release/v0.2.0-beta.md`. Nenhuma outra ref local é enviada.

## Plano (não altera nada)

```bash
git switch release/v0.2
REPO=jaoguedes/open-dot EXPECTED_SHA=$(git rev-parse release/v0.2) scripts/release/publish.sh
```

O plano confere, e **aborta** se falhar: SHA igual ao esperado, árvore limpa, nenhum commit alcançável com e-mail pessoal (autor ou committer), `.data/`, `.dev.vars` e `.deploy.local.json` não rastreados, varredura de segredos e dados pessoais limpa, `origin/main` ancestral (sem merge nem force). Depois lista as refs que já existem no remoto e avisa quais ficariam públicas.

## Antes de executar

- Refs que já estão no remoto ficam públicas com o repositório: hoje `codex/runner-safe-edit-beta` e o PR #1 (`refs/pull/1/*`). O script **não apaga nada**; apague a branch e feche o PR no GitHub se não quiser expô-los.
- Confira `docs/audit/PUBLISH_READINESS.md` (itens que ainda dependem de você).

## Executar

```bash
REPO=jaoguedes/open-dot EXPECTED_SHA=<sha revisado> scripts/release/publish.sh --execute
```

O script pede que você digite o nome do repositório, envia a `main` e a tag (reativando o push só durante cada envio e voltando a `DISABLED`), liga secret scanning, push protection, alertas e correções do Dependabot, relatório privado de vulnerabilidades, permissões somente leitura do Actions, aprovação para PRs de fork e proteção da `main`; apaga artefatos e execuções antigas do Actions; torna o repositório público; cria o release **em rascunho**.

O histórico não foi reescrito: não é preciso recriar o repositório remoto.

## Depois

- Revise e publique o release em rascunho.
- Confira as abas Security, Actions e Branches.

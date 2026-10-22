# Prontidão para publicar o v0.3

Checklist antes de publicar `claude/od2-v03`. **Nada aqui foi executado pelo agente.** 22/10/2026.

## 1. Revisão

| Item | Estado | Como |
|---|---|---|
| Revisão do `V03_REPORT.md` pelo Claude orquestrador / João | pendente | conferir estado honesto, desvios e gate |
| Commit local `613b607` com o ID de rollback do Worker | **decidir antes de qualquer push** | o commit nunca foi compartilhado; se quiser tirar do histórico, reescreva só esta branch local antes de enviar (o valor está em `docs/privado/`) |
| Trailer `Task:` fora do formato em 28 commits | aceitar ou reescrever (só local) | `npx tsx scripts/check-continuity.ts --base 69c5769226319a33f79c7f3e6419bc98afd92611` |

## 2. Migrações de produção (ordem)

1. `0017_rate_limits.sql` e `0018_orchestrator.sql` (pendentes desde o v0.2).
2. `0019_orchestrator_v03.sql` (só tabelas novas: preferências, calibração, pacotes importados, propostas de skill).

Aplicar **antes** do Worker novo (o código exige schema ≥ `0019`). Verificar: `npm run turso:inspect` deve listar as quatro tabelas novas e `GET /api/health` responder `ok` depois do deploy.

## 3. Deploy (João)

```bash
npm run deploy
```

Requer `.deploy.local.json` (origem da instância) e, para a fumaça, `npm run dev` em outro terminal. Conferir depois: Equipe (receitas e especialistas), Aprovações, Correio (só leitura).

## 4. Tag e release do v0.3 (sem executar)

Seguir `scripts/release/PUBLISH.md` adaptando a branch e a tag: `REPO=jaoguedes/open-dot EXPECTED_SHA=<sha revisado de claude/od2-v03>` e tag `v0.3.0-beta`, notas em `docs/release/v0.3.0-beta.md`.

## 5. Instalador `.dmg` do Runner 0.3.0

Condições:

- Gate verde (ver `V03_REPORT.md`).
- Workflow manual `runner-release.yml` com tag `runner-v0.3.0`, variável `RUNNER_BUILDS_ENABLED=true`, ambiente `runner-release`, **só rascunho**.
- O passo novo `check-updater-key.mjs` **faz o rascunho falhar enquanto a chave pública for provisória**. Ou gere a chave (abaixo), ou publique o 0.3.0 sem atualização automática removendo esse passo conscientemente.
- Instaladores **sem assinatura da Apple**; só **Mac Intel testado**.

## 6. O que só o João pode fazer

1. **Chave de assinatura do updater:** gerar, guardar a privada, pôr a pública no `tauri.conf.json`, cadastrar `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` no ambiente `runner-release` e abrir a exceção de política no workflow (`docs/release/runner-chave-de-assinatura.md`).
2. **Publicar o release-canal** `runner-canal-beta` (não rascunho, não pré-lançamento) com o `latest.json`.
3. **Testar a atualização real:** publicar uma versão e depois outra (roteiro em `docs/release/runner-atualizacao.md`).
4. **Notarização Apple (paga):** decidir no futuro; hoje fica o “Abrir mesmo assim”.
5. Pendências do v0.2: contato público, revisão jurídica, origem de alguns ícones, roteiro manual da GUI.
6. Claude Code está logado por assinatura nesta máquina: ligar o driver no Runner é opcional (opt-in) e continua sem teste real no pipeline.

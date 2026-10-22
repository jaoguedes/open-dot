# Chave de assinatura das atualizações do Runner

**Quem faz: só o João.** Nenhum agente gera, lê, copia ou guarda a chave privada. Nenhum valor de chave aparece em arquivo do repositório.

## 1. Gerar o par de chaves (uma vez)

No seu Mac, fora do repositório:

```bash
npx --yes @tauri-apps/cli@2.12.3 signer generate -w ~/.tauri/open-dot-runner.key
```

O comando pede uma senha e cria `~/.tauri/open-dot-runner.key` (privada) e `~/.tauri/open-dot-runner.key.pub` (pública).

- Guarde a privada e a senha num gerenciador de senhas e num backup offline.
- **Se perder a chave privada, quem já instalou o Runner não recebe mais atualizações automáticas**: será preciso publicar uma versão com chave nova e pedir para cada pessoa baixar manualmente.
- Nunca commite a privada nem a cole em issue, chat ou log.

## 2. Pôr a chave pública no app

Copie o conteúdo de `open-dot-runner.key.pub` para `plugins.updater.pubkey` em `apps/runner/src-tauri/tauri.conf.json`, no lugar de `[CHAVE_PUBLICA_A_DEFINIR]`, e confira:

```bash
node scripts/release/check-updater-key.mjs
```

## 3. Cadastrar os secrets no GitHub (mudança consciente de política)

Hoje **nenhum workflow usa `secrets`** e o teste `tests/workflow-policy.test.ts` garante isso. Assinar no CI exige abrir uma exceção só para o job de build do Runner em tag:

- Secrets do ambiente `runner-release` (Settings → Environments): `TAURI_SIGNING_PRIVATE_KEY` (conteúdo do arquivo da chave privada) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Workflow: no job `native` de `runner-ci.yml`, quando chamado pelo release, tirar o `--config '{"bundle":{"createUpdaterArtifacts":false}}'` e expor as duas variáveis só nesse passo; ajustar `tests/workflow-policy.test.ts` para permitir exatamente esses dois nomes nesse arquivo.
- Depois do build, gerar o `latest.json` com `node scripts/release/make-latest-json.mjs installers <versão> <url-base> docs/open-dot-runner-release-notes.md`.

Essa mudança não foi feita nesta rodada de propósito: é decisão sua (envolve segredo e política do CI).

## 4. Verificar

- O rascunho do release deve conter `.app.tar.gz` + `.sig` (macOS) e o instalador + `.sig` (Windows).
- `latest.json` só lista plataformas com `.sig`.

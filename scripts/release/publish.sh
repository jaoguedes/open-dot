#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Publicação do Open Dot como open source. SEM argumentos: só imprime o plano (dry-run).
# Com --execute: executa, pedindo que o operador digite o nome do repositório para confirmar.
# Este script nunca foi executado pelo agente que o escreveu. Leia scripts/release/PUBLISH.md antes.
#
#   scripts/release/publish.sh                       # plano
#   scripts/release/publish.sh --execute             # executa (interativo)
# Variáveis: REPO=<dono>/<repo>  EXPECTED_SHA=<sha da claude/od2-audit revisado>
#            INCLUDE_UI=1 (também mescla claude/od2-ui)  HISTORY_REWRITTEN=1 (se o histórico foi reescrito)
set -euo pipefail

EXECUTE=0
[[ "${1:-}" == "--execute" ]] && EXECUTE=1
REPO="${REPO:-}"
AUDIT_BRANCH="refs/heads/claude/od2-audit"
UI_BRANCH="refs/heads/claude/od2-ui"
TAG="v0.1.0-beta"

say() { printf '\n== %s\n' "$*"; }
run() {
  printf '  $ %s\n' "$*"
  if [[ $EXECUTE == 1 ]]; then "$@"; fi
}

if [[ -z "$REPO" ]]; then
  echo "Defina REPO=<dono>/<repo> (ex.: REPO=fulano/open-dot)." >&2
  [[ $EXECUTE == 1 ]] && exit 1
  REPO="<dono>/<repo>"
fi

say "0. Conferências locais (sempre executadas, só leitura)"
git diff --quiet && git diff --cached --quiet || { echo "Árvore com alterações não commitadas. Pare."; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo "Há arquivos não rastreados. Pare."; exit 1; }
HEAD_AUDIT="$(git rev-parse "$AUDIT_BRANCH")"
echo "  claude/od2-audit = $HEAD_AUDIT"
if [[ -n "${EXPECTED_SHA:-}" && "$EXPECTED_SHA" != "$HEAD_AUDIT" ]]; then echo "SHA diferente do esperado ($EXPECTED_SHA). Pare."; exit 1; fi
[[ $EXECUTE == 1 && -z "${EXPECTED_SHA:-}" ]] && { echo "Defina EXPECTED_SHA com o SHA revisado. Pare."; exit 1; }
node scripts/scan-secrets.mjs >/dev/null || { echo "Varredura da árvore encontrou algo. Pare."; exit 1; }
node scripts/scan-secrets.mjs --history >/dev/null || echo "  Aviso: o histórico tem identificadores aceitos pelo mantenedor (nome, handle, subdomínio). Ver CLAUDE_FINAL_REPORT.md."
[[ -n "$(git config --get remote.origin.pushurl || true)" && "$(git config --get remote.origin.pushurl)" == "DISABLED" ]] && echo "  push para origin está desabilitado (esperado); o passo 2 reabilita só para esta publicação."

if [[ $EXECUTE == 1 ]]; then
  echo
  read -r -p "Digite o nome do repositório ($REPO) para confirmar a publicação: " typed
  [[ "$typed" == "$REPO" ]] || { echo "Nome não confere. Nada foi feito."; exit 1; }
fi

if [[ "${HISTORY_REWRITTEN:-0}" == 1 ]]; then
  say "1. Histórico reescrito: recriar o repositório remoto"
  echo "  O GitHub mantém commits antigos acessíveis por refs de PR e cache. Antes do push:"
  echo "  - exclua o repositório $REPO no GitHub (Settings → Danger zone) e crie de novo, vazio, com o mesmo nome;"
  echo "  - só então continue."
  [[ $EXECUTE == 1 ]] && read -r -p "Repositório recriado vazio? Digite 'sim': " ok && [[ "$ok" == sim ]]
else
  say "1. Histórico não reescrito (decisão registrada no relatório final)"
fi

say "2. Integrar na main (local) — nunca --mirror nem --all"
run git switch main
run git merge --no-ff "$AUDIT_BRANCH" -m "chore(release): integrate independent audit and open source preparation"
if [[ "${INCLUDE_UI:-0}" == 1 ]]; then run git merge --no-ff "$UI_BRANCH" -m "feat(web): integrate approved interface"; fi
run npm ci
run npm run check
run npm run check:without-dot

say "3. Enviar só a main"
run git remote set-url --push origin "https://github.com/$REPO.git"
run git push origin refs/heads/main:refs/heads/main
run git remote set-url --push origin DISABLED

say "4. Proteções antes de abrir o acesso"
run gh api -X PATCH "repos/$REPO" -F security_and_analysis[secret_scanning][status]=enabled -F security_and_analysis[secret_scanning_push_protection][status]=enabled
run gh api -X PUT "repos/$REPO/vulnerability-alerts"
run gh api -X PUT "repos/$REPO/automated-security-fixes"
run gh api -X PUT "repos/$REPO/private-vulnerability-reporting"
run gh api -X PUT "repos/$REPO/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
run gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" -f approval_policy=all_external_contributors
run gh api -X PUT "repos/$REPO/branches/main/protection" --input scripts/release/branch-protection.json
echo "  Troque <OWNER> em .github/CODEOWNERS pelo seu usuário (commit separado) e confira o environment runner-release."

say "5. Limpar execuções e artefatos antigos do Actions (logs sem segredos, mas antigos)"
run bash -c "gh api 'repos/$REPO/actions/artifacts?per_page=100' --jq '.artifacts[].id' | xargs -I{} gh api -X DELETE 'repos/$REPO/actions/artifacts/{}'"
run bash -c "gh run list -R '$REPO' --limit 200 --json databaseId --jq '.[].databaseId' | xargs -I{} gh run delete {} -R '$REPO'"

say "6. Tornar público"
run gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences

say "7. Tag e rascunho de release"
run git tag -a "$TAG" -m "Open Dot $TAG"
run git remote set-url --push origin "https://github.com/$REPO.git"
run git push origin "refs/tags/$TAG"
run git remote set-url --push origin DISABLED
run gh release create "$TAG" -R "$REPO" --draft --prerelease --title "Open Dot $TAG" --notes-file docs/release/v0.1.0-beta.md

say "Fim"
[[ $EXECUTE == 1 ]] && echo "Publicado. Revise o release em rascunho antes de publicá-lo." || echo "Plano apenas (dry-run). Nada foi alterado."

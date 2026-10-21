#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Publicação do Open Dot. SEM --execute: só confere e imprime o plano (nada é alterado).
# Com --execute: além das conferências, pede que o operador digite o nome do repositório.
# Nunca foi executado pelo agente que o escreveu. Leia scripts/release/PUBLISH.md antes.
#
#   REPO=jaoguedes/open-dot EXPECTED_SHA=<sha> scripts/release/publish.sh
#   REPO=jaoguedes/open-dot EXPECTED_SHA=<sha> scripts/release/publish.sh --execute
# Variáveis:
#   REPO          dono/repositório no GitHub (obrigatório)
#   EXPECTED_SHA  SHA revisado da branch a publicar (obrigatório; o script aborta se divergir)
#   BRANCH        ref a publicar (padrão refs/heads/release/v0.2)
#   TAG           tag (padrão v0.2.0-beta)
#   NOTES         notas do release (padrão docs/release/v0.2.0-beta.md)
set -euo pipefail

EXECUTE=0
[[ "${1:-}" == "--execute" ]] && EXECUTE=1
REPO="${REPO:-}"
BRANCH="${BRANCH:-refs/heads/release/v0.2}"
TAG="${TAG:-v0.2.0-beta}"
NOTES="${NOTES:-docs/release/v0.2.0-beta.md}"
EXPECTED_SHA="${EXPECTED_SHA:-}"

say() { printf '\n== %s\n' "$*"; }
abort() { printf '\nABORTADO: %s\nNada foi publicado.\n' "$*" >&2; exit 1; }
run() {
  printf '  $ %s\n' "$*"
  if [[ $EXECUTE == 1 ]]; then "$@"; fi
}

[[ -n "$REPO" ]] || abort "defina REPO=<dono>/<repo>."
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || abort "REPO em formato inválido."
[[ -n "$EXPECTED_SHA" ]] || abort "defina EXPECTED_SHA com o SHA revisado de $BRANCH."
[[ "$BRANCH" == refs/heads/* ]] || abort "BRANCH precisa ser uma ref completa (refs/heads/...)."
[[ -f "$NOTES" ]] || abort "notas $NOTES não encontradas."

say "0. Conferências locais (sempre executadas, somente leitura)"
SHA="$(git rev-parse --verify "$BRANCH^{commit}" 2>/dev/null)" || abort "$BRANCH não existe."
echo "  $BRANCH = $SHA"
[[ "$SHA" == "$EXPECTED_SHA" ]] || abort "SHA de $BRANCH ($SHA) diferente do esperado ($EXPECTED_SHA)."
[[ "$(git rev-parse HEAD)" == "$SHA" ]] || abort "faça checkout de $BRANCH antes (a varredura lê a árvore de trabalho)."
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || abort "árvore com alterações ou arquivos não rastreados."

# (a) Nenhum commit alcançável com e-mail pessoal de autor ou de quem fez o commit.
PERSONAL="$(git log "$SHA" --format='%ae%n%ce' | grep -ci 'gmail' || true)"
echo "  commits alcançáveis com e-mail gmail (autor/committer): $PERSONAL"
[[ "$PERSONAL" == 0 ]] || abort "há commit com e-mail pessoal no histórico de $BRANCH."

# (b) Arquivos locais privados nunca podem estar rastreados.
PRIVATE="$(git ls-tree -r --name-only "$SHA" | grep -E '^(\.data/|\.dev\.vars|\.deploy\.local\.json)' || true)"
[[ -z "$PRIVATE" ]] || abort "arquivos privados rastreados: $PRIVATE"
echo "  .data/, .dev.vars e .deploy.local.json: não rastreados"

# (c) Varredura de segredos e dados pessoais da árvore.
node scripts/scan-secrets.mjs >/dev/null || abort "a varredura de segredos/dados pessoais encontrou algo (rode node scripts/scan-secrets.mjs)."
echo "  varredura de segredos e dados pessoais: limpa"
node scripts/scan-secrets.mjs --history >/dev/null || echo "  Aviso: o histórico antigo tem identificadores aceitos pelo mantenedor (nome, handle, subdomínio). Ver docs/audit/CLAUDE_FINAL_REPORT.md."

# Main remota precisa ser ancestral: o push é avanço rápido, sem merge local nem force.
if git rev-parse --verify -q refs/remotes/origin/main >/dev/null; then
  git merge-base --is-ancestor refs/remotes/origin/main "$SHA" || abort "origin/main não é ancestral de $SHA; publicar exigiria merge. Revise."
  echo "  origin/main é ancestral: o push da main será avanço rápido"
fi

say "Refs que existem hoje no remoto (somente leitura)"
REMOTE_REFS="$(git ls-remote --heads --tags origin 2>/dev/null || true)"
if [[ -z "$REMOTE_REFS" ]]; then
  echo "  (não consegui listar o remoto agora; confira em github.com/$REPO/branches)"
else
  echo "$REMOTE_REFS" | sed 's/^/  /'
  OTHER="$(echo "$REMOTE_REFS" | awk '{print $2}' | grep -v '^refs/heads/main$' | grep -v "^refs/tags/$TAG$" || true)"
  if [[ -n "$OTHER" ]]; then
    echo "  AVISO: estas refs já estão no remoto e ficarão PÚBLICAS ao mudar a visibilidade:"
    echo "$OTHER" | sed 's/^/    - /'
    echo "  O script não apaga nada. Se não quiser que fiquem públicas, apague-as no GitHub antes do passo 5."
    echo "  Pull requests antigos (refs/pull/*) também ficam visíveis; feche/revise o PR #1 se necessário."
  fi
fi
echo "  Refs locais que NUNCA são enviadas: backup-antes-do-github, refs/original/*, refs/codex/*, codex/*, claude/*, integration/*."

if [[ $EXECUTE == 1 ]]; then
  echo
  read -r -p "Digite o nome do repositório ($REPO) para confirmar a publicação: " typed
  [[ "$typed" == "$REPO" ]] || abort "nome não confere."
fi

say "1. Enviar só a main (avanço rápido para o SHA revisado) e reativar o push desabilitado só durante o envio"
run git remote set-url --push origin "https://github.com/$REPO.git"
run git push origin "$SHA:refs/heads/main"
run git remote set-url --push origin DISABLED

# >>> proteções (testado em tests/publish-script.test.ts com gh simulado)
# Passo 2: no plano grátis do GitHub algumas falham em repositório privado.
# Cada uma é tolerante a falha; as que falharem são reaplicadas depois do passo 5 (público).
PROTECTIONS="secret dependabot vulnreport actions forkpr branch"
label() {
  case "$1" in
    secret) echo "secret scanning e push protection" ;;
    dependabot) echo "alertas e correções do Dependabot" ;;
    vulnreport) echo "relatório privado de vulnerabilidades" ;;
    actions) echo "permissões do Actions" ;;
    forkpr) echo "aprovação para PRs de fork" ;;
    branch) echo "proteção da main" ;;
  esac
}
protection() {
  case "$1" in
    secret) run gh api -X PATCH "repos/$REPO" -F "security_and_analysis[secret_scanning][status]=enabled" -F "security_and_analysis[secret_scanning_push_protection][status]=enabled" ;;
    dependabot) run gh api -X PUT "repos/$REPO/vulnerability-alerts" && run gh api -X PUT "repos/$REPO/automated-security-fixes" ;;
    vulnreport) run gh api -X PUT "repos/$REPO/private-vulnerability-reporting" ;;
    actions) run gh api -X PUT "repos/$REPO/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false ;;
    forkpr) run gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" -f approval_policy=all_external_contributors ;;
    branch) run gh api -X PUT "repos/$REPO/branches/main/protection" --input scripts/release/branch-protection.json ;;
  esac
}
APPLIED=""
FAILED=""
try_protection() {
  echo "  - $(label "$1")"
  if protection "$1"; then
    [[ $EXECUTE == 1 ]] && APPLIED="$APPLIED $1"
    return 0
  fi
  echo "  FALHOU: $(label "$1")"
  FAILED="$FAILED $1"
}

retry_failed() {
  if [[ $EXECUTE == 0 ]]; then
    echo "  (no plano nada é aplicado; com --execute, reaplica na ordem: $(for p in $PROTECTIONS; do printf '%s; ' "$(label "$p")"; done))"
  elif [[ -z "$FAILED" ]]; then
    echo "  nenhuma falhou"
  else
    RETRY="$FAILED"
    FAILED=""
    for p in $PROTECTIONS; do
      case " $RETRY " in *" $p "*) try_protection "$p" ;; esac
    done
  fi
}
summary() {
  if [[ $EXECUTE == 1 ]]; then
    echo "  aplicadas: $(for p in $APPLIED; do printf '%s; ' "$(label "$p")"; done)"
    echo "  falharam:  $(for p in $FAILED; do printf '%s; ' "$(label "$p")"; done)"
    [[ -z "$FAILED" ]] || echo "  Aplique as que falharam à mão em github.com/$REPO/settings."
  else
    echo "  aplicadas: nenhuma (plano)"
    echo "  falharam:  nenhuma (plano)"
  fi
}
# <<< proteções

say "2. Proteções antes de abrir o acesso (falha não interrompe; reaplicadas depois do passo 5)"
for p in $PROTECTIONS; do try_protection "$p"; done
echo "  CODEOWNERS já aponta para @jaoguedes. Confira o environment runner-release (revisor obrigatório)."

say "3. Limpar execuções e artefatos antigos do Actions (logs sem segredos, mas antigos)"
run bash -c "gh api 'repos/$REPO/actions/artifacts?per_page=100' --jq '.artifacts[].id' | xargs -I{} gh api -X DELETE 'repos/$REPO/actions/artifacts/{}'"
run bash -c "gh run list -R '$REPO' --limit 200 --json databaseId --jq '.[].databaseId' | xargs -I{} gh run delete {} -R '$REPO'"

say "4. Tag anotada no SHA revisado e envio só dessa tag"
run git tag -a "$TAG" "$SHA" -m "Open Dot $TAG"
run git remote set-url --push origin "https://github.com/$REPO.git"
run git push origin "refs/tags/$TAG"
run git remote set-url --push origin DISABLED

say "5. Tornar público (depois de revisar as refs do aviso acima)"
run gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences

say "5b. Reaplicar só as proteções que falharam no passo 2 (agora com o repositório público)"
retry_failed

say "6. Release em rascunho (não publicado)"
run gh release create "$TAG" -R "$REPO" --draft --prerelease --title "Open Dot $TAG" --notes-file "$NOTES"

say "Resumo das proteções"
summary

say "Fim"
if [[ $EXECUTE == 1 ]]; then echo "Publicado. Revise o release em rascunho antes de publicá-lo."; else echo "Plano apenas (dry-run). Nada foi alterado."; fi

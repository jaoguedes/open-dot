#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Troca [CONTATO_A_DEFINIR] pelo contato público em todos os documentos que o citam.
#   scripts/release/fill-contact.sh --dry-run <contato>   mostra o que mudaria
#   scripts/release/fill-contact.sh <contato>             aplica (não faz commit)
# Use um alias ou link de issues, não o e-mail de login.
set -euo pipefail
DRY=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY=1; shift; fi
CONTACT="${1:-}"
if [[ -z "$CONTACT" ]]; then echo "Uso: $0 [--dry-run] <contato>" >&2; exit 2; fi
if [[ "$CONTACT" =~ [\|\\\&] ]]; then echo "Contato com caractere não permitido." >&2; exit 2; fi
FILES=(SECURITY.md COMMERCIAL-LICENSE.md LICENSE-DOT-ASSETS.md TRADEMARK.md CODE_OF_CONDUCT.md)
for f in "${FILES[@]}"; do
  n=$(grep -c '\[CONTATO_A_DEFINIR\]' "$f" || true)
  [[ "$n" == 0 ]] && continue
  echo "$f: $n ocorrência(s)"
  if [[ $DRY == 0 ]]; then
    tmp="$(mktemp)"
    sed "s|\[CONTATO_A_DEFINIR\]|$CONTACT|g" "$f" > "$tmp" && mv "$tmp" "$f"
  fi
done
[[ $DRY == 1 ]] && echo "Simulação: nada foi alterado." || echo "Feito. Revise com git diff antes do commit."

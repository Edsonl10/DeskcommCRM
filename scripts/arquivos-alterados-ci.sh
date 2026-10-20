#!/usr/bin/env bash
# Lista completa, incluindo a origem de renomes. Qualquer dúvida mede tudo.
set -euo pipefail
desconhecido() { echo __IMPACTO_DESCONHECIDO__; exit 0; }
case "${GITHUB_EVENT_NAME:-}" in
  pull_request)
    [[ "${PR:-}" =~ ^[0-9]+$ ]] || desconhecido
    dados=$(gh api --paginate "repos/${GITHUB_REPOSITORY}/pulls/${PR}/files" --jq '.[] | .filename, (.previous_filename // empty)') || desconhecido
    # A API limita em 3000 arquivos, e renomes podem gerar duas linhas.
    [ "$(printf '%s\n' "$dados" | wc -l)" -lt 3000 ] || desconhecido
    [ -n "$dados" ] || desconhecido
    printf '%s\n' "$dados"
    ;;
  push)
    [[ "${BASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || desconhecido
    [[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || desconhecido
    [[ "$BASE_SHA" != 0000000000000000000000000000000000000000 ]] || desconhecido
    git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null || desconhecido
    git cat-file -e "${GITHUB_SHA}^{commit}" 2>/dev/null || desconhecido
    # --no-renames mantém ambos os caminhos: código renomeado para docs é código removido.
    dados=$(git diff --no-renames --name-only "$BASE_SHA" "$GITHUB_SHA" --) || desconhecido
    [ -n "$dados" ] || desconhecido
    printf '%s\n' "$dados"
    ;;
  *) desconhecido ;;
esac

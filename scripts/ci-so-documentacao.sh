#!/usr/bin/env bash
# Perfil curto só para arquivos que não entram no funcionamento do produto.
set -euo pipefail
algum=nao
while IFS= read -r caminho || [ -n "$caminho" ]; do
  [ -n "$caminho" ] || continue
  algum=sim
  case "$caminho" in
    docs/*|tasks/*|evidence/*|.changes/*) ;;
    */*) echo nao; exit 0 ;;
    *.md) ;;
    *) echo nao; exit 0 ;;
  esac
done
echo "$algum"

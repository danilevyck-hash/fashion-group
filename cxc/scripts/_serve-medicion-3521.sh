#!/usr/bin/env bash
# Levanta el build de PRODUCCIÓN de ESTE worktree en el 3521 para medir.
#
# 🩸 GOTCHA: si el puerto está tomado por otro worktree, `next start` muere con
# EADDRINUSE y el medidor se conecta igual — mediría el build AJENO. Por eso el
# script se niega a arrancar si el puerto ya está ocupado.
set -euo pipefail
cd "$(dirname "$0")/.."

if lsof -nP -iTCP:3521 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "🔴 el puerto 3521 ya está tomado — mediría el build de OTRO worktree" >&2
  exit 1
fi

set -a
. ./.env.local
set +a
exec npx next start -p 3521

#!/usr/bin/env bash
# Corre la medición del catálogo de David contra el servidor del 3521.
# SOLO LECTURA: toma prestado un session_token vivo y no escribe nada.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! lsof -nP -iTCP:3521 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "🔴 nadie escucha en el 3521 — levantá scripts/_serve-medicion-3521.sh" >&2
  exit 1
fi

set -a
. ./.env.local
set +a

TOKEN="$(DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_token-medicion.ts)"
export TOKEN
export BASE="${BASE:-http://127.0.0.1:3521}"
export ROL="${ROL:-gerente_boston}"
exec node scripts/_medir-boston-catalogo-anchos.mjs

#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de "la pestaña de Boston dice de cuándo
# es su plata" y "la regla 1 vigila la cartera de Boston" (24-ago-2026).
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en la
# rama y git aborta el comando entero sin restaurar nada, así que las mutaciones se
# apilarían y ninguna se probaría por separado. Ya pasó en este repo.
#
# 🩸 Y `probar()` EXIGE encontrar el resumen de vitest: si la corrida muere, un
# "0 fallos" se leería como "la mutación sobrevivió" — un verificador que miente en
# verde es peor que no tenerlo.
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/components/cxc-boston-fecha-del-dato.test.tsx src/__tests__/lib/datos-viejos.test.ts"

ARCHIVOS=(
  "src/components/cxc/BostonTab.tsx"
  "src/components/shared/SyncStatus.tsx"
  "src/lib/datos-frescos.ts"
  "src/lib/cron-telemetry.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done

restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

CAZADAS=0
TOTAL=0

probar() {
  local nombre="$1"; shift
  TOTAL=$((TOTAL + 1))
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  local resumen
  resumen="$(printf '%s' "$salida" | grep -E '^\s+Tests\s+' | tail -1)"
  if [ -z "$resumen" ]; then
    echo "  ⚠️  $nombre — LA CORRIDA MURIÓ, no hay resumen de vitest (no cuenta como cazada)"
    restaurar
    return
  fi
  if printf '%s' "$resumen" | grep -q 'failed'; then
    local n
    n="$(printf '%s' "$resumen" | sed -E 's/.*Tests[[:space:]]+([0-9]+) failed.*/\1/')"
    echo "  ✅ CAZADA ($n tests rojos) — $nombre"
    CAZADAS=$((CAZADAS + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $nombre"
  fi
  restaurar
}

echo "── Mutaciones ──────────────────────────────────────────────"

# 1. La pestaña deja de montar el aviso.
perl -0pi -e 's/      <SyncStatus\n(?:.*\n)*?      \/>\n\n//' src/components/cxc/BostonTab.tsx
probar "la pestaña de Boston deja de montar <SyncStatus>"

# 2. Le pregunta por las 6 del grupo en vez de por Boston.
perl -0pi -e 's/const EMPRESAS_CARTERA_BOSTON = empresasCarteraAparte\(\);/const EMPRESAS_CARTERA_BOSTON = ["vistana","fashion_wear","fashion_shoes","active_shoes","active_wear","joystep"];/' src/components/cxc/BostonTab.tsx
probar "el aviso pregunta por las 6 del grupo (mezcla Boston con el grupo)"

# 3. El aviso se monta pero escondido con una clase.
perl -0pi -e 's/        className="mb-3"/        className="mb-3 hidden"/' src/components/cxc/BostonTab.tsx
probar "el aviso se esconde con una clase de Tailwind"

# 4. El ámbar nunca se pinta.
perl -0pi -e 's/  const warning = buildWarning\(data\.stale, empresaLabels\);/  const warning = null;/' src/components/shared/SyncStatus.tsx
probar "el ámbar nunca se pinta (SyncStatus)"

# 5. El ámbar se pinta SIEMPRE, también con el dato fresco.
perl -0pi -e 's/  if \(stale\.length === 0\) return null;/  if (false) return null;/' src/components/shared/SyncStatus.tsx
probar "el ámbar se pinta también con el dato fresco"

# 6. Vuelve el filtro viejo que dejaba a Boston fuera de la regla 1.
perl -0pi -e 's/  return empresasConEstadoCuenta\(\);/  return empresasConEstadoCuenta().filter((e) => e !== "confecciones_boston");/' src/lib/datos-frescos.ts
probar "vuelve la exclusión de Boston en empresasDe(\"cartera\")"

# 7. El universo vuelve a ser solo el grupo.
perl -0pi -e 's/import \{\n  empresasConEstadoCuenta,\n  empresasConFacturas,\n\} from "\@\/lib\/switch-api\/empresas";/import {\n  empresasConCxc,\n  empresasConEstadoCuenta,\n  empresasConFacturas,\n} from "\@\/lib\/switch-api\/empresas";/' src/lib/datos-frescos.ts
perl -0pi -e 's/  return empresasConEstadoCuenta\(\);/  void empresasConEstadoCuenta; return empresasConCxc();/' src/lib/datos-frescos.ts
probar "el universo de cartera vuelve a ser solo las 6 del grupo"

# 8. Desaparece el cron que refresca la cartera de Boston.
perl -0pi -e 's/^  \{ cron: "boston-cartera", hhmmUtc: "0810", empresas: \["confecciones_boston"\] \},\n//m' src/lib/cron-telemetry.ts
probar "se borra boston-cartera del cronograma (empresa vigilada sin cron)"

echo "────────────────────────────────────────────────────────────"
echo "  $CAZADAS de $TOTAL cazadas"
[ "$CAZADAS" -eq "$TOTAL" ]

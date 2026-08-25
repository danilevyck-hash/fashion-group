#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del motor NUEVO de reportes de Switch.
#
# 🩸 RESTAURA POR COPIA, no con `git checkout`: hay archivos NUEVOS en la rama y
# git aborta el comando entero sin restaurar nada, así que las mutaciones se
# apilarían y ninguna se probaría por separado.
#
# 🩸 Y `probar()` EXIGE el resumen de vitest: si la corrida muere, un "0 fallos"
# se leería como "la mutación sobrevivió" — un verificador que miente en verde es
# peor que no tenerlo.
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/boston-cartera-consola.test.ts src/__tests__/lib/boston-cartera-web.test.ts"

ARCHIVOS=(
  "src/lib/switch-api/web-client.ts"
  "src/lib/switch-api/estadocuenta-web.ts"
  "src/lib/switch-api/sync-estadocuenta-web.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

CAZADAS=0; TOTAL=0; NOOP=0

# 🩸 Una mutación que no matchea NADA deja el archivo intacto, los tests pasan y
# el reporte dice "SOBREVIVIÓ" — o sea, acusa al candado de un agujero que no
# existe. Ya pasó en esta misma corrida. `mutar` exige que el archivo CAMBIE.
mutar() {
  local archivo="$1"; shift
  local antes despues
  antes="$(md5 -q "$archivo")"
  perl -0pi -e "$1" "$archivo"
  despues="$(md5 -q "$archivo")"
  if [ "$antes" = "$despues" ]; then
    echo "  ⚠️  MUTACIÓN NO-OP: el patrón no matcheó nada en $archivo"
    NOOP=$((NOOP + 1)); return 1
  fi
  return 0
}
probar() {
  local nombre="$1"
  TOTAL=$((TOTAL + 1))
  local salida resumen
  salida="$(npx vitest run $TESTS 2>&1)"
  resumen="$(printf '%s' "$salida" | grep -E '^\s+Tests\s+' | tail -1)"
  if [ -z "$resumen" ]; then
    echo "  ⚠️  $nombre — LA CORRIDA MURIÓ, sin resumen (no cuenta como cazada)"
  elif printf '%s' "$resumen" | grep -q 'failed'; then
    local n; n="$(printf '%s' "$resumen" | sed -E 's/.*Tests[[:space:]]+([0-9]+) failed.*/\1/')"
    echo "  ✅ CAZADA ($n rojos) — $nombre"; CAZADAS=$((CAZADAS + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $nombre"
  fi
  restaurar
}

echo "── Mutaciones ──────────────────────────────────────────────"

# ── El adaptador: la derivación del saldo ──────────────────────────────────
mutar src/lib/switch-api/estadocuenta-web.ts 's/        saldo: debito - credito,/        saldo: debito + credito,/' \
  && probar "el saldo del documento suma en vez de restar el crédito"

mutar src/lib/switch-api/estadocuenta-web.ts 's/        saldo: debito - credito,/        saldo: num(m.saldoAcumulado) ?? 0,/' \
  && probar "usa saldoAcumulado (el corrido del cliente) como saldo del documento"

mutar src/lib/switch-api/estadocuenta-web.ts 's/        secuencial: m.nSistema \?\? null,/        secuencial: m.nFiscal ?? null,/' \
  && probar "el secuencial sale de nFiscal en vez de nSistema"

mutar src/lib/switch-api/estadocuenta-web.ts 's/        fechaCreacion: m.fecha \?\? null,/        fechaCreacion: m.fechaVence ?? null,/' \
  && probar "la fecha del documento sale de fechaVence"

# ── Los totales ────────────────────────────────────────────────────────────
mutar src/lib/switch-api/estadocuenta-web.ts 's/    \.filter\(\(\[titulo\]\) => titulo !== "total"\)\n//' \
  && probar "los totales dejan de descartar el campo total (cuenta la cartera dos veces)"

# ── El transporte ──────────────────────────────────────────────────────────
mutar src/lib/switch-api/web-client.ts 's/    claseReporte: "4",/    claseReporte: "1",/' \
  && probar "pide claseReporte 1 en vez de 4 (saldos sin antigüedad)"

mutar src/lib/switch-api/web-client.ts 's/    tipoReporte: "ESTADOCUENTACLIENTE",/    tipoReporte: "OTROREPORTE",/' \
  && probar "manda otro tipoReporte"

mutar src/lib/switch-api/web-client.ts 's/    pais: "",\n    provincia: "",/    pais: "null",\n    provincia: "null",/' \
  && probar 'los filtros geográficos vuelven a la palabra "null" (reporte en CERO)'

mutar src/lib/switch-api/web-client.ts 's/  const t = texto\.trimStart\(\);\n  if \(t\.startsWith\("<!DOCTYPE"\) \|\| t\.startsWith\("<html"\)\) \{/  const t = texto.trimStart();\n  if (false) {/' \
  && probar "deja de reconocer la página de excepción de Switch (el fallo del 19-ago)"

mutar src/lib/switch-api/web-client.ts 's/    if \(CONSOLA_FALLIDOS\.has\(estatus\)\) \{/    if (false) {/' \
  && probar "ignora ERROR/CANCELADO y sigue sondeando"

mutar src/lib/switch-api/web-client.ts 's/ \|\| typeof creado\.uuid !== "string" \|\| !creado\.uuid//' \
  && probar "acepta un crear sin uuid"

# ── El guard del reporte incompleto ────────────────────────────────────────
mutar src/lib/switch-api/sync-estadocuenta-web.ts 's/  if \(conocidos === 0\) return true;\n  return clientesEnReporte >= conocidos \* piso;/  return true;/' \
  && probar "el guard del reporte incompleto deja pasar todo"

mutar src/lib/switch-api/sync-estadocuenta-web.ts 's/export const PISO_CLIENTES_REPORTE = 0\.7;/export const PISO_CLIENTES_REPORTE = 0;/' \
  && probar "el piso baja a 0"

mutar src/lib/switch-api/sync-estadocuenta-web.ts 's/    const conocidos = await clientesConSaldoConocidos\(empresaKey\);\n    if \(!reporteVieneCompleto\(resumen\.clientes, conocidos\)\) \{/    const conocidos = await clientesConSaldoConocidos(empresaKey);\n    if (false) {/' \
  && probar "el guard se calcula pero no corta la corrida"

echo "────────────────────────────────────────────────────────────"
echo "  $CAZADAS de $TOTAL cazadas"
[ "$NOOP" -eq 0 ] || { echo "  🔴 $NOOP mutación(es) no matchearon nada — el reporte no vale"; exit 1; }
[ "$CAZADAS" -eq "$TOTAL" ]

#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de:
#   1. LA IDENTIDAD DE LA CARTERA DE BOSTON — el `ccte_id` con el año adentro y
#      el guard que corta cuando dos documentos distintos caen en la misma fila.
#   2. EL CENTINELA DE TIPOS DE COMPROBANTE DE VENTA — que avise cuando Switch
#      estrena un tipo que el tablero no sabe contar, y que NO avise nunca con
#      los tipos reales.
#
# 🩸 RESTAURA POR COPIA, no con `git checkout`: hay archivos NUEVOS en la rama y
# git aborta el comando entero sin restaurar nada, así que las mutaciones se
# apilarían y ninguna se probaría por separado.
#
# 🩸 Y `mutar()` EXIGE que el archivo CAMBIE (md5 antes/después): una mutación
# que no matchea nada deja el archivo intacto, los tests pasan y el reporte diría
# "SOBREVIVIÓ" — o sea, acusaría al candado de un agujero que no existe. Ya pasó
# en este repo. Si alguna es no-op, el informe entero se aborta.
#
# 🩸 El delimitador de perl es `#`, NO `|`: los patrones de este archivo llevan
# `||` (el `??` de TS, los `||` de las condiciones) y un `|` los partiría al
# medio, generando sustituciones que no matchean nada — que es exactamente el
# modo de fallo que `mutar()` existe para denunciar.
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/boston-cartera-web.test.ts src/__tests__/lib/boston-cartera-consola.test.ts src/__tests__/lib/ventas-centinela-tipos.test.ts src/__tests__/lib/sync-log-tipos-check.test.ts"

ARCHIVOS=(
  "src/lib/switch-api/estadocuenta-web.ts"
  "src/lib/switch-api/sync-estadocuenta-web.ts"
  "src/lib/ventas/tipos-comprobante.ts"
  "src/lib/ventas/centinela-tipos.ts"
  "src/lib/switch-api/sync-log-tipos.ts"
  "src/app/api/cron/switch-sync/route.ts"
  "supabase/migrations/20260826140000_ventas_tipos_sin_clasificar.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

CAZADAS=0; TOTAL=0; NOOP=0

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

echo "── 1. LA IDENTIDAD DE BOSTON ───────────────────────────────"

# ── La identidad vuelve a ser SOLO el número (el bug original) ──────────────
mutar src/lib/switch-api/estadocuenta-web.ts \
  's#const ccteId = serie \* CCTE_SERIE_FACTOR \+ offset \* CCTE_ANIO_FACTOR \+ correlativo;#const ccteId = serie * CCTE_SERIE_FACTOR + correlativo;#' \
  && probar "la identidad vuelve a ser SOLO el número (sin el año)"

mutar src/lib/switch-api/estadocuenta-web.ts \
  's#      const idres = ccteIdSintetico\(el\.secuencial, el\.fechaCreacion\);#      const idres = ccteIdSintetico(el.secuencial, "2026-01-01");#' \
  && probar "todos los documentos usan la MISMA fecha (el año deja de separar)"

mutar src/lib/switch-api/estadocuenta-web.ts \
  's#export const CCTE_ANIO_FACTOR = 100_000;#export const CCTE_ANIO_FACTOR = 0;#' \
  && probar "el factor del año es 0 (el año no aporta nada al id)"

# ── La fecha deja de ser obligatoria ───────────────────────────────────────
mutar src/lib/switch-api/estadocuenta-web.ts \
  's#  const fecha = parseFechaReporte\(fechaCreacion\);\n  if \(!fecha\) \{#  const fecha = parseFechaReporte(fechaCreacion) ?? "2026-01-01";\n  if (false) {#' \
  && probar "un documento sin fecha se acepta con una fecha inventada"

mutar src/lib/switch-api/estadocuenta-web.ts \
  's#  if \(!Number\.isFinite\(offset\) \|\| offset < 0 \|\| offset >= CCTE_ANIO_SPAN\) \{#  if (false) {#' \
  && probar "un año fuera de la ventana 2000-2099 se envuelve en vez de rechazarse"

# ── El guard de identidad ──────────────────────────────────────────────────
mutar src/lib/switch-api/estadocuenta-web.ts \
  's#      if \(previo !== undefined && !mismoDocumento\(previo, identidad\)\) \{#      if (previo !== undefined \&\& previo.secuencial !== identidad.secuencial) {#' \
  && probar "el guard vuelve a mirar SOLO el secuencial (el mismo repetido no corta)"

mutar src/lib/switch-api/estadocuenta-web.ts \
  's#    a\.fecha === b\.fecha &&#    true \&\&#' \
  && probar "la identidad deja de mirar la FECHA"

mutar src/lib/switch-api/estadocuenta-web.ts \
  's#    Math\.abs\(a\.saldo - b\.saldo\) < TOLERANCIA_IDENTIDAD#    true#' \
  && probar "la identidad deja de mirar el MONTO"

mutar src/lib/switch-api/estadocuenta-web.ts \
  's#      if \(previo !== undefined && !mismoDocumento\(previo, identidad\)\) \{#      if (false) {#' \
  && probar "el guard se calcula pero no corta la corrida"

# ── La columna y el id tienen que decir lo mismo ───────────────────────────
mutar src/lib/switch-api/estadocuenta-web.ts \
  's#        fecha_creacion: fechaDoc,#        fecha_creacion: null,#' \
  && probar "la fila deja de guardar la fecha con la que se calculó su id"

# ── El correlativo ya no entra en 5 dígitos ────────────────────────────────
mutar src/lib/switch-api/estadocuenta-web.ts \
  's#  if \(correlativo >= CCTE_CORRELATIVO_MAX\) \{#  if (false) {#' \
  && probar "un correlativo de 6 dígitos pisa los dígitos del año"

# ── El ORDEN: el reconcile no puede ir antes del upsert ────────────────────
mutar src/lib/switch-api/sync-estadocuenta-web.ts \
  's#    await upsertFilas\(filasBuenas, runStamp\);\n    const cerrados = await reconciliar\(empresaKey, runStamp, protegidos\);#    const cerrados = await reconciliar(empresaKey, runStamp, protegidos);\n    await upsertFilas(filasBuenas, runStamp);#' \
  && probar "el RECONCILE corre ANTES del upsert (la cartera pasa por CERO)"

# ── El cuadre tiene que ir antes de escribir ───────────────────────────────
mutar src/lib/switch-api/sync-estadocuenta-web.ts \
  's#    const cuadre = cuadraConSwitch\(resumen, publicado\);\n    if \(!cuadre\.ok\) \{#    const cuadre = cuadraConSwitch(resumen, publicado);\n    if (false) {#' \
  && probar "el cuadre se calcula y NO corta (se escribe una cartera que no cuadra)"

echo ""
echo "── 2. EL CENTINELA DE VENTAS ───────────────────────────────"

# ── Que NO avise nunca ─────────────────────────────────────────────────────
mutar src/lib/ventas/centinela-tipos.ts \
  's#  return hallazgos\.filter\(\(h\) => h\.filasConPlata > 0\);#  return [];#' \
  && probar "el centinela NUNCA avisa (el tipo nuevo pasa en silencio)"

mutar src/lib/ventas/centinela-tipos.ts \
  's#  const avisan = hallazgosQueAvisan\(medicion\.hallazgos\);#  const avisan: TipoSinClasificar[] = [];#' \
  && probar "el centinela mide pero descarta lo que midió"

mutar src/lib/ventas/centinela-tipos.ts \
  's#  return \[\.\.\.porEmpresa\.entries\(\)\]\.map\(\(\[empresaKey, hs\]\) => \(\{#  return [].map((\[empresaKey, hs\]: [string, TipoSinClasificar[]]) => ({#' \
  && probar "el centinela no devuelve ningún error para alertar"

# ── Que avise SIEMPRE (o sea: que no se vuelva ruido diario) ───────────────
mutar src/lib/ventas/centinela-tipos.ts \
  's#  return hallazgos\.filter\(\(h\) => h\.filasConPlata > 0\);#  return [...hallazgos];#' \
  && probar "avisa también sin plata (la alerta que suena por nada)"

# ── La lista de tipos conocidos ────────────────────────────────────────────
mutar src/lib/ventas/tipos-comprobante.ts \
  's#  "Transacción",\n  "Nota de Débito",#  "Nota de Débito",#' \
  && probar 'la lista pierde «Transacción» (el tipo de mayo-2025)'

mutar src/lib/ventas/tipos-comprobante.ts \
  's#  CNF: "Transacción",#  CNF: "Contado",#' \
  && probar "CNF deja de ser Transacción"

mutar src/lib/ventas/tipos-comprobante.ts \
  's#  return tipo === TIPO_VENTA_RESTA \? -1 : 0;#  return tipo === TIPO_VENTA_RESTA ? -1 : 1;#' \
  && probar "un tipo desconocido SUMA en vez de valer 0"

mutar supabase/migrations/20260826140000_ventas_tipos_sin_clasificar.sql \
  "s#'Factura', 'Tiquete', 'Transacción', 'Nota de Débito', 'Nota de Crédito'#'Factura', 'Tiquete', 'Nota de Débito', 'Nota de Crédito'#" \
  && probar "la vista de SQL y la lista de TS dejan de decir lo mismo"

mutar supabase/migrations/20260826140000_ventas_tipos_sin_clasificar.sql \
  "s#'FA', 'TQ', 'CNF', 'ND', 'NC'#'FA', 'TQ', 'ND', 'NC'#" \
  && probar "la vista de artículos pierde CNF"

# ── La política de alertas ─────────────────────────────────────────────────
mutar src/lib/switch-api/sync-log-tipos.ts \
  's#  "ventas_tipos",\n##' \
  && probar "el sync_type del centinela desaparece del código (corridas invisibles)"

mutar src/app/api/cron/switch-sync/route.ts \
  's#    \.\.\.centinela,\n##' \
  && probar "los hallazgos del centinela no entran a la llamada de alerta"

mutar src/app/api/cron/switch-sync/route.ts \
  's#  if \(paraAlertar\.length > 0\) \{\n    await alertSwitchCronErrors\(CRON_NAME, paraAlertar\);\n  \}#  if (paraAlertar.length > 0) {\n    await alertSwitchCronErrors(CRON_NAME, errors.map((e) => ({ empresaKey: e.empresaKey, syncType: e.tipo, error: e.error })));\n    await alertSwitchCronErrors(CRON_NAME, centinela);\n  }#' \
  && probar "dos llamadas a alertSwitchCronErrors (dos mensajes por la misma corrida)"

mutar src/app/api/cron/switch-sync/route.ts \
  's#  if \(errors\.length === 0\) \{\n    await recordCronHeartbeat\(CRON_NAME\);#  if (errors.length === 0 \&\& centinela.length === 0) {\n    await recordCronHeartbeat(CRON_NAME);#' \
  && probar "el centinela suprime el heartbeat (la alerta que suena para siempre)"

echo "────────────────────────────────────────────────────────────"
echo "  $CAZADAS de $TOTAL cazadas"
[ "$NOOP" -eq 0 ] || { echo "  🔴 $NOOP mutación(es) no matchearon nada — el reporte no vale"; exit 1; }
[ "$CAZADAS" -eq "$TOTAL" ]

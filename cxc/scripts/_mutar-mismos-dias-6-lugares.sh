#!/usr/bin/env bash
# Verificador de mutaciones: «un período empezado se compara contra los MISMOS
# DÍAS del año pasado, con la fecha de Panamá» — en los seis lugares que la
# auditoría del 3-sep-2026 encontró sin la regla.
#
# Cada mutación tiene que poner ROJO alguno de los candados de abajo. El control
# sin mutar tiene que dar 0.
#
# 🩸 Restaura por COPIA y no con `git checkout`: hay archivos NUEVOS en la rama.
# 🩸 El reemplazo es LITERAL con python (scripts/_mutar-aplicar.py), sin regex.
# 🩸 `mutar()` EXIGE que el archivo cambie, y `probar()` exige que vitest haya
# COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/mismos-dias-todas-las-comparaciones.test.ts
  src/__tests__/lib/ventas-productos-periodos.test.ts
  src/__tests__/lib/multifashion-productos-resumen.test.ts
  src/__tests__/lib/multifashion-vendedoras-rotulo.test.ts
  src/__tests__/lib/clientes-vs-anio-anterior-mismos-dias.test.ts
  src/__tests__/api/ventas-productos-periodo-route.test.ts
  src/__tests__/api/ventas-productos-por-cliente-route.test.ts
  src/__tests__/api/multifashion-productos-corte-cargado.test.ts
  src/__tests__/components/resumen-mes-anio-mes-en-curso.test.tsx
)
CORTE=src/lib/ventas/clientes-corte-comparativo.ts
RANKING=src/lib/multifashion/productos-ranking.ts
PRODUCTOS=src/lib/ventas/productos.ts
ANUAL=src/app/api/ventas/resumen-anual/route.ts
MESANIO=src/app/api/ventas/mes-anio/route.ts
MATRIZ=src/components/ventas/ResumenMesAnio.tsx
RESUMENVIEW=src/components/ventas/ResumenView.tsx
VG=src/app/api/dashboard/vista-general/route.ts
VGPAGE=src/app/vista-general/page.tsx
PREV=src/lib/ventas/prev-same-period.ts
MIG=supabase/migrations/20260910120000_ventas_dashboard_prev_same_period_v3_panama.sql
RUTA_PROD=src/app/api/ventas/productos/route.ts
RUTA_CLI=src/app/api/ventas/productos/por-cliente/route.ts
RUTA_MF=src/app/api/multifashion/productos/route.ts
VENDEDORAS=src/components/multifashion/VendedorasSubtab.tsx
ROTULO=src/lib/multifashion/vendedoras-rotulo.ts
ARCHIVOS=("$CORTE" "$RANKING" "$PRODUCTOS" "$ANUAL" "$MESANIO" "$MATRIZ" "$RESUMENVIEW" "$VG" "$VGPAGE" "$PREV" "$MIG" "$RUTA_PROD" "$RUTA_CLI" "$RUTA_MF" "$VENDEDORAS" "$ROTULO")
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre  [veces]
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" "${5:-1}" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

echo "== la definición única (clientes-corte-comparativo.ts) =="
mutar "$CORTE" \
  "const corte = ultimoDiaCargado && ultimoDiaCargado < hoy ? ultimoDiaCargado : hoy;" \
  "const corte = hoy;" \
  'el corte es «hoy» a secas (ignora lo cargado)'
mutar "$CORTE" \
  "const hoy = hoyPanama(ahora);" \
  "const hoy = ahora.toISOString().slice(0, 10);" \
  'hoy en UTC'
mutar "$CORTE" \
  "const dia = Math.min(Number(fecha.slice(8, 10)), ultimoDiaDelMes(anio, mes));" \
  "const dia = Number(fecha.slice(8, 10));" \
  'rompe el 29 de febrero'
mutar "$CORTE" \
  "const corte = futuro || cargadoHastaHoy > actual.hasta ? actual.hasta : cargadoHastaHoy;" \
  "const corte = actual.hasta;" \
  'la ventana comparativa vuelve a FIN del período (mes/año entero)'
mutar "$CORTE" \
  "    hasta: unAnioAntes(corte)," \
  "    hasta: unAnioAntes(actual.hasta)," \
  'el «hasta» del año pasado ignora el corte'

echo "== #4 Productos (Ventas y Multifashion) =="
mutar "$PRODUCTOS" \
  "return ventanaUnAnioAntes(productosRangoPeriodo(periodo, year, mes, ahora), ultimoDiaCargado, ahora);" \
  "return ventanaUnAnioAntes(productosRangoPeriodo(periodo, year, mes, ahora), null, ahora);" \
  'Ventas › Productos corta en hoy (tira el último día cargado)'
mutar "$RANKING" \
  "const v = ventanaUnAnioAntes(actual, ultimoDiaCargado, ahora);" \
  "const v = ventanaUnAnioAntes(actual, null, ahora);" \
  'Multifashion › Productos corta en hoy'
mutar "$RUTA_PROD" \
  "const comparativo = productosRangoComparativo(periodo, year, mes, ahora, ultimoDiaCargado);" \
  "const comparativo = productosRangoComparativo(periodo, year, mes, ahora, null);" \
  'la ruta de Productos no pasa el último día cargado'
mutar "$RUTA_CLI" \
  "? productosRangoComparativo(periodo, year, mes, ahora, await ultimoDiaArticuloDiario(empresa, actual.desde, actual.hasta))" \
  "? productosRangoComparativo(periodo, year, mes, ahora, null)" \
  'la ventana previa del filtro por cliente corta en hoy'
mutar "$RUTA_MF" \
  "const rango = rangoComparativo({ desde, hasta }, now, ultimoDiaCargado);" \
  "const rango = rangoComparativo({ desde, hasta }, now, null);" \
  'la ruta de Multifashion no pasa el último día cargado'

echo "== #1 Resumen › Anual =="
mutar "$ANUAL" \
  "if (Y === currentYear && prevMismosDias) return prevMismosDias.get(empKey) ?? zero();" \
  "if (Y === currentYear && prevMismosDias) return yearTotal(prevM);" \
  'el año en curso vuelve a compararse contra el año pasado entero (MV)'
mutar "$ANUAL" \
  "const anioHoy = Number(hoyPanama().slice(0, 4));" \
  "const anioHoy = new Date().getUTCFullYear();" \
  'el «año de hoy» sale del reloj UTC'

echo "== #2 Resumen › Mes×año =="
mutar "$MATRIZ" \
  "prev={esMesEnCurso ? mesEnCurso.prev : cell?.prev ?? null}" \
  "prev={empresa.byMonth[mi + 1]?.[y - 1] ?? null}" \
  'la matriz vuelve a leer el mes ENTERO del año pasado'
mutar "$MATRIZ" \
  "deltaOverride={esMesEnCurso ? { ratio: relDelta(cell, mesEnCurso.prev, viewMode), label: mesEnCurso.label } : null}" \
  "deltaOverride={null}" \
  'la celda del mes en curso pierde el rótulo de los mismos días'
mutar "$RESUMENVIEW" \
  "  const ventas = empresa.ventas2025[mes - 1] ?? 0;" \
  "  const ventas = 0;" \
  'el previo del mes en curso se arma sin las ventas de la RPC'
mutar "$MESANIO" \
  "const hoy = hoyPanama();" \
  "const hoy = new Date().toISOString().slice(0, 10);" \
  'el mes parcial se marca con el día UTC'

echo "== #3 Vista General =="
mutar "$VG" \
  "  if (parcialSel) {
    if (prevMismosDiasRes?.error)" \
  "  if (false) {
    if (prevMismosDiasRes?.error)" \
  'el mes en curso vuelve a compararse contra el mes entero (MV)'
mutar "$VG" \
  "const mesActualPanama = hoyPanama().slice(0, 7);" \
  "const mesActualPanama = new Date().toISOString().slice(0, 7);" \
  'el mes en curso sale del reloj UTC'
mutar "$VGPAGE" \
  'vs {ventas.parcial && ventas.prevHasta ? `1–${fechaCorta(ventas.prevHasta)} ${ventas.prevHasta.slice(0, 4)}` : mesPrevAnio}' \
  'vs {mesPrevAnio}' \
  'la tarjeta vuelve a decir «vs septiembre 2025» sin las fechas'

echo "== #6 la RPC en Panamá =="
mutar "$MIG" \
  "v_hoy          := multifashion_hoy_panama();" \
  "v_hoy          := CURRENT_DATE;" \
  'la RPC corta en UTC (CURRENT_DATE)'
mutar "$MIG" \
  "mf_panama_date(fecha) AS d," \
  "fecha::date AS d," \
  'el día de la factura en UTC (fecha::date)'
mutar "$MIG" \
  "SELECT empresa_key, LEAST(MAX(d), v_hoy) AS e_cur_max" \
  "SELECT empresa_key, MAX(d) AS e_cur_max" \
  'el corte por empresa no se topa en hoy'
mutar "$MIG" \
  "COALESCE(ec.e_cur_max, v_fecha_corte)" \
  "ec.e_cur_max" \
  'una empresa sin filas este mes queda fuera del mes' 2
mutar "$PREV" \
  'export const RPC_PREV_SAME_PERIOD = "ventas_dashboard_prev_same_period_v3";' \
  'export const RPC_PREV_SAME_PERIOD = "ventas_dashboard_prev_same_period_v2";' \
  'el código sigue pidiendo _v2 (UTC)'

echo "== #5 Vendedoras: el rótulo =="
mutar "$VENDEDORAS" \
  "{rotuloDelta.columna}</SortHeader>" \
  "Δ vs año pasado</SortHeader>" \
  'la columna vuelve a decir «vs año pasado» en los chips de mes'
mutar "$ROTULO" \
  '  if (chip === "en_curso" || chip === "mes_anterior") {' \
  '  if (false) {' \
  'el rótulo dice «vs año pasado» siempre'

echo
echo "cazadas: $CAZ · sobrevivieron: $SOB · no mutaron/muertas: $NOOP"
[ "$SOB" -eq 0 ] && [ "$NOOP" -eq 0 ]

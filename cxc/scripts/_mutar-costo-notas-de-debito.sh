#!/usr/bin/env bash
# Verificador de mutaciones de «el costo del Resumen incluye las notas de
# débito» + el cuadre mensual de costo (3-sep-2026).
#
# 🩸 Restaura por COPIA y no con `git checkout`: hay archivos NUEVOS en la rama y
# git aborta el comando entero sin restaurar nada.
# 🩸 El reemplazo es LITERAL con python (`_mutar-aplicar.py`), sin delimitadores.
# 🩸 `mutar()` EXIGE que el archivo cambie, y `probar()` exige que vitest haya
# COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/cuadre-costo.test.ts
  src/__tests__/lib/costo-con-notas-de-debito.test.ts
  src/__tests__/lib/mismos-dias-todas-las-comparaciones.test.ts
  src/__tests__/lib/ventas-datos-fantasma.test.ts
)
ARCHIVOS=(
  supabase/migrations/20260915120000_costo_con_notas_de_debito.sql
  src/lib/alertas/cuadre-costo.ts
  src/lib/alertas/cuadre-costo-io.ts
  src/lib/ventas/prev-same-period.ts
  src/lib/ventas/dashboard-summary.ts
  src/lib/ventas/queries.ts
  src/app/api/cron/switch-reconciliacion/route.ts
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

SQL=supabase/migrations/20260915120000_costo_con_notas_de_debito.sql

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

echo "== SQL =="
mutar "$SQL" \
  "  FROM switch_articulo_diario
  WHERE tipo <> 'ND'
  GROUP BY 1, 2" \
  "  FROM switch_articulo_diario
  GROUP BY 1, 2" \
  'la vista v2 vuelve a sumar el código ND del artículo diario (doble conteo)'

mutar "$SQL" \
  "  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    SUM(costo) AS costo_total
  FROM switch_factura_utilidad
  WHERE tipo_comprobante = 'Nota de Débito'
  GROUP BY 1, 2" \
  "  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    0::numeric AS costo_total
  FROM switch_factura_utilidad
  WHERE tipo_comprobante = 'Nota de Crédito'
  GROUP BY 1, 2" \
  'la vista v2 deja de sumar las ND de utilidad'

mutar "$SQL" \
  "LEFT JOIN switch_costo_unificado_v2 c" \
  "LEFT JOIN switch_costo_unificado_vw c" \
  'la MV se arma sobre la vista vieja (sin ND)'

mutar "$SQL" \
  "      FROM switch_articulo_diario a
      WHERE a.tipo <> 'ND'
        AND a.fecha >= (SELECT w.m        FROM win w)" \
  "      FROM switch_articulo_diario a
      WHERE a.fecha >= (SELECT w.m        FROM win w)" \
  'summary_v2 suma el código ND del artículo diario'

mutar "$SQL" \
  "      FROM switch_factura_utilidad u
      WHERE u.tipo_comprobante = 'Nota de Débito'
        AND u.fecha >= (SELECT w.m        FROM win w)" \
  "      FROM switch_factura_utilidad u
      WHERE u.tipo_comprobante = 'Factura'
        AND u.fecha >= (SELECT w.m        FROM win w)" \
  'summary_v2 suma las facturas de utilidad en vez de las ND'

mutar "$SQL" \
  "      SELECT empresa_key, fecha AS d,
             CASE WHEN tipo = 'NC' THEN -costo_total ELSE costo_total END AS costo
      FROM switch_articulo_diario
      WHERE tipo <> 'ND'
        AND fecha >= v_c_prev_lo" \
  "      SELECT empresa_key, fecha AS d, costo_total AS costo
      FROM switch_costo_diario
      WHERE fecha >= v_c_prev_lo" \
  '🔴 el lector dormido: prev_v4 vuelve a leer switch_costo_diario'

mutar "$SQL" \
  "      SELECT empresa_key, fecha AS d, costo
      FROM switch_factura_utilidad
      WHERE tipo_comprobante = 'Nota de Débito'
        AND fecha >= v_c_prev_lo" \
  "      SELECT empresa_key, fecha AS d, costo
      FROM switch_factura_utilidad
      WHERE tipo_comprobante = 'Nota de Débito'
        AND fecha >= v_c_prev_lo
      UNION ALL
      SELECT
        CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
             WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
             ELSE empresa END,
        fecha,
        costo
      FROM ventas_raw
      WHERE fecha < DATE '2026-05-01'" \
  'prev_v4 vuelve a mezclar ventas_raw.costo'

mutar "$SQL" \
  "      AND s.fecha <> (date_trunc('month', s.fecha) + INTERVAL '1 month - 1 day')::date
  )," \
  "  )," \
  '🔴 el cuadre suma el último día del mes (que vale \$0)'

mutar "$SQL" \
  "    COALESCE(SUM(d.costo_total)   FILTER (WHERE d.completo), 0)::numeric      AS costo_diario,
    COALESCE(SUM(r.costo)         FILTER (WHERE d.completo), 0)::numeric      AS costo_resumen" \
  "    COALESCE(SUM(d.costo_total), 0)::numeric      AS costo_diario,
    COALESCE(SUM(r.costo), 0)::numeric      AS costo_resumen" \
  'el cuadre suma los días leídos a media mañana (foto parcial)'

echo "== TypeScript: la decisión =="
mutar src/lib/alertas/cuadre-costo.ts \
  "export const UMBRAL_CUADRE = 0.02;" \
  "export const UMBRAL_CUADRE = 0.5;" \
  'umbral 50 % en vez de 2 %'

mutar src/lib/alertas/cuadre-costo.ts \
  "  if (pct <= UMBRAL_CUADRE) return null;" \
  "  if (pct < UMBRAL_CUADRE) return null;" \
  'dispara en 2,00 % exacto («más de» → «desde»)'

mutar src/lib/alertas/cuadre-costo.ts \
  "  if (Math.abs(diferencia) < PISO_DIFERENCIA_USD) return null;" \
  "" \
  'sin piso en dólares: joystep avisa por \$1'

mutar src/lib/alertas/cuadre-costo.ts \
  "  if (diasComparados < MIN_DIAS_COMPARADOS) return null;" \
  "" \
  'opina sobre un mes con 3 días'

mutar src/lib/alertas/cuadre-costo.ts \
  "  const hasta = \`\${y}-\${String(m).padStart(2, \"0\")}-01\`;" \
  "  const hasta = \`\${y}-\${String(m + 1).padStart(2, \"0\")}-01\`;" \
  'la ventana mete el mes en curso'

mutar src/lib/alertas/cuadre-costo.ts \
  "  const desde = desdeCalc < PRIMER_MES_CON_COSTO_DIARIO ? PRIMER_MES_CON_COSTO_DIARIO : desdeCalc;" \
  "  const desde = desdeCalc;" \
  'la ventana retrocede antes de que exista switch_costo_diario'

mutar src/lib/alertas/cuadre-costo.ts \
  "  const signo = d.diferencia > 0 ? \"de más\" : \"de menos\";" \
  "  const signo = d.diferencia > 0 ? \"de menos\" : \"de más\";" \
  'el mensaje invierte el signo'

echo "== TypeScript: el I/O =="
mutar src/lib/alertas/cuadre-costo-io.ts \
  "    if (await yaAvisadoCuadre(d.empresaKey, d.mes, ahoraMs)) {" \
  "    if (false) {" \
  'sin anti-loop: repite el aviso en cada pasada'

mutar src/lib/alertas/cuadre-costo-io.ts \
  "  await enviarSistema(mensajeCuadre(nuevos));" \
  "  await enviarNegocio(mensajeCuadre(nuevos));" \
  'el aviso sale por NEGOCIO en vez de SISTEMA'

mutar src/lib/alertas/cuadre-costo-io.ts \
  "    if (esFuncionInexistente(error)) {" \
  "    if (true) {" \
  'cualquier error de la base se traga en silencio'

mutar src/lib/alertas/cuadre-costo-io.ts \
  "    const d = evaluarCuadre(fila);
    if (d) out.push(d);" \
  "    const d = evaluarCuadre(fila);
    if (d && d.pct > 100) out.push(d);" \
  'el I/O filtra por su cuenta lo que la decisión ya decidió'

echo "== TypeScript: las versiones y el enganche =="
mutar src/lib/ventas/prev-same-period.ts \
  'export const RPC_PREV_SAME_PERIOD = "ventas_dashboard_prev_same_period_v4";' \
  'export const RPC_PREV_SAME_PERIOD = "ventas_dashboard_prev_same_period_v3";' \
  'el Resumen sigue pidiendo prev_v3 (el lector dormido)'

mutar src/lib/ventas/dashboard-summary.ts \
  'export const RPC_DASHBOARD_SUMMARY = "ventas_dashboard_summary_v2";' \
  'export const RPC_DASHBOARD_SUMMARY = "ventas_dashboard_summary";' \
  'el Resumen sigue pidiendo summary_v1 (sin ND)'

mutar src/lib/ventas/queries.ts \
  "    leerDashboardSummary(year)," \
  '    withDbRetry(() => supabaseServer.rpc("ventas_dashboard_summary", { p_anio: year }), { label: "ventas_dashboard_summary" }),' \
  'queries.ts llama la RPC vieja por su cuenta'

mutar src/app/api/cron/switch-reconciliacion/route.ts \
  "  const cuadreCosto = await checkCuadreCosto();" \
  "  const cuadreCosto: string[] = [];" \
  'la reconciliación deja de correr el cuadre'

echo
echo "== RESULTADO: cazadas=$CAZ sobrevivieron=$SOB no-op=$NOOP =="
[ "$SOB" -eq 0 ] && [ "$NOOP" -eq 0 ]

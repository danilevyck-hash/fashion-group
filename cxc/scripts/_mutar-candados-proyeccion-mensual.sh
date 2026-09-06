#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de la PROYECCIÓN MENSUAL (los meses que faltan, en gris) y del
# nuevo piso de cobertura (v8) CAZAN de verdad?
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROL (mutaciones que NO deben cazarse) tienen que quedar
# verdes: un candado que se pone rojo con cualquier cosa no está midiendo nada.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-proyeccion-mensual.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/ventas-proyeccion-mensual.test.ts \
src/__tests__/components/ventas-proyeccion-meses-gris.test.tsx \
src/__tests__/lib/ventas-proyeccion-cobertura-v8.test.ts \
src/__tests__/lib/ventas-proyeccion-v7.test.ts \
src/__tests__/components/ventas-resumen-cierre-del-anio.test.tsx \
src/__tests__/lib/nada-de-voseo.test.ts"

MOD="src/lib/ventas/proyeccion-mensual.ts"
ESC="src/components/ventas/ResumenView.tsx"
CEL="src/components/ventas/ResumenViewMobile.tsx"
QRY="src/lib/ventas/queries.ts"
MIG="supabase/migrations/20261001120000_proyeccion_cobertura_v8.sql"
MED="scripts/_medir-cobertura-minima.mjs"

ARCHIVOS=("$MOD" "$ESC" "$CEL" "$QRY" "$MIG" "$MED" "src/components/ventas/types.ts")

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

corrida() { # imprime el nº de fallos, o "muerta"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then echo "muerta"; return; fi
  grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0
}

probar() { # $1 = nombre de la mutación
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "muerta" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() { # $1 = nombre del control (NO debe cazarse)
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "0" ]; then
    echo "  ✅ CONTROL OK (verde, como debe) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL MAL (se puso rojo sin motivo) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

_aplicar() { # $1 archivo, $2 viejo, $3 nuevo
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta, encoding="utf-8").read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w", encoding="utf-8").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  _aplicar "$1" "$2" "$3" || { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  _aplicar "$1" "$2" "$3" || { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ── A. La cuenta del reparto ─────────────────────────────────────────────────

# 1. El divisor pasa a ser el AÑO ENTERO del año pasado: el factor se achica y
#    los tres meses salen por debajo.
mutar "$MOD" \
  "  const resto = e.cierreAnioAnterior - e.ventasPrevYtdSp;" \
  "  const resto = e.cierreAnioAnterior;" \
  "reparto: el divisor deja de descontar lo que el año pasado ya llevaba"

# 2. El divisor cuenta también el mes en curso completo (se resta el mes de más).
mutar "$MOD" \
  "  const resto = e.cierreAnioAnterior - e.ventasPrevYtdSp;" \
  "  const resto = e.cierreAnioAnterior - e.ventasPrevYtdSp - (e.prevFull[e.mesCorte - 1] ?? 0);" \
  "reparto: el divisor deja fuera el resto del mes en curso"

# 3. Se reparte la proyección ENTERA en vez de lo que falta.
mutar "$MOD" \
  "  return e.proyeccionRestante / resto;" \
  "  return (e.proyeccionRestante * 2) / resto;" \
  "reparto: el factor se calcula con el doble de lo que falta"

# 4. El factor se ignora: los meses futuros salen con la venta del año pasado.
mutar "$MOD" \
  "  return vacio.map((_, i) => (i + 1 <= e.mesCorte ? null : (e.prevFull[i] ?? 0) * factor));" \
  "  return vacio.map((_, i) => (i + 1 <= e.mesCorte ? null : (e.prevFull[i] ?? 0)));" \
  "reparto: los meses futuros salen sin el factor"

# 5. 🔴 EL MES EN CURSO SE PISA con un proyectado (lo que Daniel dijo que no).
mutar "$MOD" \
  "  return vacio.map((_, i) => (i + 1 <= e.mesCorte ? null : (e.prevFull[i] ?? 0) * factor));" \
  "  return vacio.map((_, i) => (i + 1 < e.mesCorte ? null : (e.prevFull[i] ?? 0) * factor));" \
  "el mes EN CURSO se pisa con un número proyectado"

# 6. Se proyectan también meses ya pasados.
mutar "$MOD" \
  "  return vacio.map((_, i) => (i + 1 <= e.mesCorte ? null : (e.prevFull[i] ?? 0) * factor));" \
  "  return vacio.map((_, i) => (e.prevFull[i] ?? 0) * factor);" \
  "se proyectan los meses que YA pasaron"

# 7. Un mes sin venta el año pasado deja de dar 0 y desaparece.
mutar "$MOD" \
  "(e.prevFull[i] ?? 0) * factor));" \
  "(e.prevFull[i] == null ? null : e.prevFull[i] * factor)));" \
  "el noviembre en \$0 de Active Wear desaparece en vez de decir 0"

# ── B. Cuándo NO se dibuja ───────────────────────────────────────────────────

# 8. El fallback lineal deja de frenar: se inventa un reparto sin año base.
mutar "$MOD" \
  "  if (e.esFallbackLineal) return null;" \
  "  if (false) return null;" \
  "sin año base (fallback lineal) igual se dibujan meses"

# 9. Un divisor <= 0 pasa: factor negativo o infinito.
mutar "$MOD" \
  "  return resto > 0 ? resto : null;" \
  "  return resto;" \
  "un divisor cero o negativo deja de frenar"

# 10. Sin cierre del año anterior igual se reparte.
mutar "$MOD" \
  "  if (!(e.cierreAnioAnterior > 0)) return null;" \
  "  if (false) return null;" \
  "sin cierre del año anterior igual se dibuja"

# 11. Nada que repartir (restante 0) pasa a dibujar tres ceros.
mutar "$MOD" \
  "  if (!(e.proyeccionRestante > 0)) return null;" \
  "  if (e.proyeccionRestante < 0) return null;" \
  "con la proyección ya alcanzada se dibujan ceros en vez de «—»"

# 12. Un año sin una sola venta (mes de corte 0) igual proyecta los 12 meses.
mutar "$MOD" \
  "  if (!Number.isFinite(e.mesCorte) || e.mesCorte < 1) return vacio;" \
  "  if (false) return vacio;" \
  "un año sin ventas proyecta los doce meses de la nada"

# 13. El Total Grupo suma como si un mes sin proyección valiera cero.
mutar "$MOD" \
  "    return hay ? suma : null;" \
  "    return suma;" \
  "el Total Grupo dice \$0 donde ninguna empresa pudo proyectar"

# ── C. La pantalla del ESCRITORIO ────────────────────────────────────────────

# 14. Se dibuja también en modo Utilidad y Margen (no existe ese dato).
mutar "$ESC" \
  'granularity === "mensual" && viewMode === "ventas"' \
  'granularity === "mensual"' \
  "escritorio: se dibujan meses grises en Utilidad y en Margen"

# 15. Se dibuja en Trimestral, donde el reparto no es mensual.
mutar "$ESC" \
  'granularity === "mensual" && viewMode === "ventas"' \
  'viewMode === "ventas"' \
  "escritorio: se dibujan meses grises en Trimestral"

# 16. Un año CERRADO empieza a proyectar.
mutar "$ESC" \
  "    showProyeccionCol && granularity" \
  "    granularity" \
  "escritorio: un año cerrado dibuja meses proyectados"

# 17. La celda gris deja de ser gris: se confunde con lo vendido.
mutar "$ESC" \
  'bg-gray-50 px-1.5 py-3.5 text-right font-mono text-xs tabular-nums text-gray-400' \
  'px-1.5 py-3.5 text-right font-mono text-xs tabular-nums text-gray-950' \
  "escritorio: el mes proyectado se pinta como si fuera vendido"

# 17b. La celda gris se vuelve tocable (abre el detalle de un dato que no existe).
mutar "$ESC" \
  "        {renderCellValue(proyectado, mode)}" \
  "        <button type=\"button\">{renderCellValue(proyectado, mode)}</button>" \
  "escritorio: la celda proyectada se vuelve tocable"

# 18. El Total Grupo deja de mostrar la suma proyectada.
mutar "$ESC" \
  "                    proyectado={mesesGris?.grupo[ci] ?? null}" \
  "                    proyectado={null}" \
  "escritorio: el Total Grupo vuelve a los guiones"

# 19. La leyenda del gris desaparece.
mutar "$ESC" \
  "            {mesesGris ? LEYENDA_MESES_PROYECTADOS : null}" \
  "            {null}" \
  "escritorio: se va la leyenda que explica el gris"

# 20. 🔴 La columna Total pasa a sumar lo proyectado (Daniel dijo que NO).
mutar "$ESC" \
  "                    ventasTotal={r.ventasTotal}" \
  "                    ventasTotal={r.ventasTotal + (mesesGris?.porFila[r.empresa.id] ?? []).reduce((s, v) => s + (v ?? 0), 0)}" \
  "escritorio: la columna Total empieza a sumar lo proyectado"

# 21. 🔴 Vuelve el rótulo «vs 1–5 sep» a la celda del mes en curso.
mutar "$ESC" \
  '        subtitulo: labelCorto(cell.periodLabel, prevYear),' \
  '        subtitulo: `${labelCorto(cell.periodLabel, prevYear)} vs 1-5 sep`,' \
  "escritorio: vuelve el rótulo «vs 1-5 sep» que Daniel sacó"

# ── D. La pantalla del CELULAR ───────────────────────────────────────────────

# 22. El celular deja de llenar los meses (queda solo el escritorio).
mutar "$CEL" \
  "    renglonPeriodo(TOTAL_GRUPO_ID, \"Total grupo\", c, ci, mesesGris?.grupo[ci] ?? null));" \
  "    renglonPeriodo(TOTAL_GRUPO_ID, \"Total grupo\", c, ci, null));" \
  "celular: el Total Grupo vuelve a los guiones"

# 23. El renglón proyectado deja de ir en gris: se confunde con lo vendido.
mutar "$CEL" \
  '          renglon.valor === "—" || renglon.proyectado' \
  '          renglon.valor === "—"' \
  "celular: el mes proyectado se pinta como si fuera vendido"

# 24. Las tarjetas dejan de llenarse en el celular.
mutar "$CEL" \
  "renglonPeriodo(id, nombre, c, ci, mesesGris?.porFila[id]?.[ci] ?? null)" \
  "renglonPeriodo(id, nombre, c, ci, null)" \
  "celular: las tarjetas de empresa vuelven a los guiones"

# 25. El celular se dibuja también en Utilidad/Margen.
mutar "$CEL" \
  'granularity === "mensual" && viewMode === "ventas"' \
  'granularity === "mensual"' \
  "celular: se dibujan meses grises en Utilidad y en Margen"

# 26. Se va la leyenda del celular.
mutar "$CEL" \
  "{LEYENDA_MESES_PROYECTADOS}</p>" \
  "</p>" \
  "celular: se va la leyenda que explica el gris"

# ── E. El piso de cobertura (v8) ─────────────────────────────────────────────

# 27. El piso vuelve a 0.10: la v8 deja de ser un cambio.
mutar "$MIG" \
  "  c_cobertura_min    CONSTANT numeric := 0.20;" \
  "  c_cobertura_min    CONSTANT numeric := 0.10;" \
  "v8: el piso vuelve a 0.10"

# 28. El piso se va a 0.60 — el valor que rompe a Multifashion.
mutar "$MIG" \
  "  c_cobertura_min    CONSTANT numeric := 0.20;" \
  "  c_cobertura_min    CONSTANT numeric := 0.60;" \
  "v8: el piso salta a 0.60 sin volver a medir"

# 29. La v8 aprovecha y mueve TAMBIÉN el clamp.
mutar "$MIG" \
  "  c_clamp_max        CONSTANT numeric := 1.60;" \
  "  c_clamp_max        CONSTANT numeric := 2.00;" \
  "v8: se cuela un cambio del clamp que nadie midió"

# 30. La v8 dropea la v7 y se queda sin red.
mutar "$MIG" \
  "CREATE OR REPLACE FUNCTION ventas_proyeccion_cierre_v8(p_anio int)" \
  "DROP FUNCTION IF EXISTS ventas_proyeccion_cierre_v7(int);
CREATE OR REPLACE FUNCTION ventas_proyeccion_cierre_v8(p_anio int)" \
  "v8: dropea la v7 y se queda sin caída"

# 31. El código deja de pedir la v8.
mutar "$QRY" \
  'supabaseServer.rpc("ventas_proyeccion_cierre_v8", { p_anio: year })' \
  'supabaseServer.rpc("ventas_proyeccion_cierre_v7", { p_anio: year })' \
  "queries: se deja de llamar a la v8"

# 32. El código pierde la caída a la v6.
mutar "$QRY" \
  'supabaseServer.rpc("ventas_proyeccion_cierre_v6", { p_anio: year })' \
  'supabaseServer.rpc("ventas_proyeccion_cierre_v8", { p_anio: year })' \
  "queries: se pierde la caída a la v6"

# 33. La medición desaparece de la cabecera de la migración.
mutar "$MIG" \
  "--   Confecciones Boston 2023 (2 cortes, oct-nov): error 82.7% → **4.4%**" \
  "--   Confecciones Boston 2023: mejora bastante" \
  "v8: la cabecera pierde el número medido de Boston"

# 34. El script de medición empieza a escribir en producción.
mutar "$MED" \
  "const num = (x) => (x == null ? null : Number(x));" \
  "const num = (x) => { /* INSERT INTO switch_facturas */ return x == null ? null : Number(x); };" \
  "medición: el script deja de ser de solo lectura"

# ── F. El payload ────────────────────────────────────────────────────────────

# 35. La forma del año pasado deja de viajar: no hay con qué repartir.
mutar "$QRY" \
  "      ventasPrevFull: prevFull[key]," \
  "      ventasPrevFull: Array(12).fill(null)," \
  "payload: la forma del año pasado llega vacía"

# 36. La forma del año pasado se lee del año EQUIVOCADO.
mutar "$QRY" \
  '.eq("anio", year - 1)' \
  '.eq("anio", year)' \
  "payload: la forma se lee del año en curso en vez del anterior"

# ── CONTROLES (no deben cazarse) ─────────────────────────────────────────────

# C1. Un comentario más en el módulo puro: no cambia una sola cuenta.
control "$MOD" \
  "export const MESES_DEL_ANIO = 12;" \
  "// Doce meses tiene el año; no hay nada que configurar.
export const MESES_DEL_ANIO = 12;" \
  "CONTROL: un comentario nuevo en el módulo"

# C2. El padding de la celda gris: es estética, no el número ni el color.
control "$ESC" \
  'className="whitespace-nowrap border-b border-gray-200 bg-gray-50 px-1.5 py-3.5 text-right font-mono text-xs tabular-nums text-gray-400"' \
  'className="whitespace-nowrap border-b border-gray-200 bg-gray-50 px-2 py-3.5 text-right font-mono text-xs tabular-nums text-gray-400"' \
  "CONTROL: cambia el padding de la celda gris"

echo
echo "── resumen ──────────────────────────────────────────────────────────────"
echo "  mutaciones cazadas : $cazadas"
echo "  sobrevivientes     : $sobrevivientes"
echo "  controles OK       : $controles_ok"
echo "  controles mal      : $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

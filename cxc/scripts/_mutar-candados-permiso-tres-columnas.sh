#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «el permiso perdona las tres columnas»
# (16-sep-2026): `src/__tests__/lib/permiso-tres-columnas.test.ts`, más los dos
# candados viejos que NO se pueden romper (`asistencia-permiso-horas` y
# `justificar-horas-solo-constancia`).
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/permiso-horas.ts
REP=src/lib/asistencia/reporte.ts
TSX=src/app/asistencia/ReporteTab.tsx
XLS=src/lib/asistencia/exportar.ts

TESTS=(
  src/__tests__/lib/permiso-tres-columnas.test.ts
  src/__tests__/lib/asistencia-permiso-horas.test.ts
  src/__tests__/lib/justificar-horas-solo-constancia.test.ts
)

ARCHIVOS=("$REGLA" "$REP" "$TSX" "$XLS")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | grep -qE "Test Files" && ! echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. la salida temprana vuelve a no perdonarse (el defecto original) =="
mutar "$REP" '      const salidaTempranaMin = Math.max(0, salidaTempranaBrutaMin - permisoPerdonaSalidaMin);' \
             '      const salidaTempranaMin = salidaTempranaBrutaMin;' \
&& probar 'Andrea y Briceida vuelven a perder sus minutos'

echo "== 2. el exceso de almuerzo vuelve a no perdonarse =="
mutar "$REP" '        excesoAlmuerzoMin = Math.max(0, excesoAlmuerzoBrutoMin - permisoPerdonaAlmuerzoMin);' \
             '        excesoAlmuerzoMin = excesoAlmuerzoBrutoMin;' \
&& probar 'el almuerzo cubierto por el permiso se sigue descontando'

echo "== 3. el perdón de salida NO se capea a su propio bruto =="
mutar "$REP" '      const permisoPerdonaSalidaMin = Math.min(salidaTempranaBrutaMin, minutosPerdonadosDe(ventana, {' \
             '      const permisoPerdonaSalidaMin = Math.max(salidaTempranaBrutaMin, minutosPerdonadosDe(ventana, {' \
&& probar 'un permiso del día entero perdona más de lo que se incumplió'

echo "== 4. la ventana de la salida temprana se arma al revés =="
mutar "$REP" '        desdeSeg: sal, hastaSeg: salidaProgSeg, bordeDelReloj: "inicio",' \
             '        desdeSeg: salidaProgSeg, hastaSeg: sal, bordeDelReloj: "inicio",' \
&& probar 'la ventana invertida no perdona nada'

echo "== 5. la salida temprana se estira por el borde equivocado =="
mutar "$REP" '        desdeSeg: sal, hastaSeg: salidaProgSeg, bordeDelReloj: "inicio",' \
             '        desdeSeg: sal, hastaSeg: salidaProgSeg, bordeDelReloj: "fin",' \
&& probar 'el mismo minuto deja de valer del lado de la marca'

echo "== 6. el almuerzo perdona desde que se SALIÓ, no desde que se pasó del permitido =="
mutar "$REP" '          desdeSeg: crudas[1] + almuerzoProgSeg, hastaSeg: crudas[2], bordeDelReloj: "fin",' \
             '          desdeSeg: crudas[1], hastaSeg: crudas[2], bordeDelReloj: "fin",' \
&& probar 'se perdona más almuerzo del que sobró'

echo "== 7. «solo lo que se solapa» se cae: se perdona la ventana entera =="
mutar "$REGLA" '  const desde = estiraInicio ? abre : Math.max(ventana.desdeSeg, abre);' \
               '  const desde = estiraInicio ? abre : ventana.desdeSeg;' \
&& probar 'un permiso de la mañana perdona la tarde'

echo "== 8. el borde que NO mira a la marca también se estira =="
mutar "$REGLA" '    bordeDelReloj === "fin" && Math.floor(ventana.hastaSeg / 60) === Math.floor(cierra / 60);' \
               '    Math.floor(ventana.hastaSeg / 60) === Math.floor(cierra / 60);' \
&& probar 'el final del permiso se estira también en la salida temprana'

echo "== 9. la regla del MISMO MINUTO se pierde en la salida temprana =="
mutar "$REGLA" '    bordeDelReloj === "inicio" && Math.floor(ventana.desdeSeg / 60) === Math.floor(abre / 60);' \
               '    false;' \
&& probar 'quien se fue 12:07:32 con permiso «desde las 12:07» pierde 32 segundos'

echo "== 10. el resumen deja de sumar las tres columnas =="
mutar "$REP" '        (a, d) => a + d.permisoPerdonaMin + d.permisoPerdonaSalidaMin + d.permisoPerdonaAlmuerzoMin, 0),' \
             '        (a, d) => a + d.permisoPerdonaMin, 0),' \
&& probar 'minutosPerdonadosPorPermiso vuelve a contar solo la tardanza'

echo "== 11. se inventa un almuerzo donde solo hay 2 marcas =="
mutar "$REP" '      if (crudas.length >= 4) {
        almuerzoTomado = crudas[2] - crudas[1]; // segundos' \
             '      if (crudas.length >= 2) {
        almuerzoTomado = crudas[crudas.length - 1] - crudas[0]; // segundos' \
&& probar 'con 2 marcas aparece un exceso de almuerzo'

echo "== 12. el chip vuelve a decir «Permiso 0 min» =="
mutar "$TSX" '                  {etiquetaPermisoDelDia(d.permisoRango, perdonDelDia(d))}' \
             '                  Permiso {fmtMin(d.permisoPerdonaMin)} min' \
&& probar 'la pantalla esconde lo que perdonó de verdad'

echo "== 13. el Excel deja de decir lo mismo que la pantalla =="
mutar "$XLS" '          : d.permiso ? textoPermisoDelDia(d.permiso, {' \
             '          : d.permiso ? ((x: unknown) => `${d.permiso} · perdona ${n0(d.permisoPerdonaMin)} min`)({' \
&& probar 'el papel vuelve a contar solo la tardanza'

echo "== 14. el resumen de la persona se calla lo perdonado =="
mutar "$TSX" '          {perdonDelPeriodo(r) && (' \
             '          {false && perdonDelPeriodo(r) && (' \
&& probar 'la línea «Los permisos de horas perdonaron…» no se dibuja'

echo "== 15. el texto no nombra la columna: todo se lee como tardanza =="
mutar "$REGLA" '  if (p.salidaTempranaMin > 0) partes.push(`${min(p.salidaTempranaMin)} min de salida temprana`);' \
               '  if (p.salidaTempranaMin > 0) partes.push(`${min(p.salidaTempranaMin)} min de tardanza`);' \
&& probar 'el chip miente sobre qué perdonó'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '/** Los tres, juntos. */' '/** Los tres, juntos (uno por columna). */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$REGLA" '  const desde = estiraInicio ? abre : Math.max(ventana.desdeSeg, abre);
  const hasta = estiraFin ? cierra : Math.min(ventana.hastaSeg, cierra);
  return Math.max(0, (hasta - desde) / 60);' \
               '  const arranque = estiraInicio ? abre : Math.max(ventana.desdeSeg, abre);
  const remate = estiraFin ? cierra : Math.min(ventana.hastaSeg, cierra);
  return Math.max(0, (remate - arranque) / 60);' \
&& controlar 'nombres de variables dentro de la intersección'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

#!/usr/bin/env bash
# Verificación por MUTACIÓN de «la marca repetida se olvida sola» (18-sep-2026):
# `src/__tests__/lib/asistencia-marca-repetida.test.ts` y
# `src/__tests__/components/asistencia-marca-repetida.test.tsx`, más los vecinos
# que cambiaron de dirección ese día (`marcas-impares`, `asistencia-marcas-de-mas`,
# `asistencia-cinco-arreglos`).
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`, y el reemplazo lo hace
# `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

MOD=src/lib/asistencia/marca-repetida.ts
MOTOR=src/lib/asistencia/reporte.ts
EXP=src/lib/asistencia/exportar.ts
TSX=src/app/asistencia/ReporteTab.tsx

TESTS=(
  src/__tests__/lib/asistencia-marca-repetida.test.ts
  src/__tests__/components/asistencia-marca-repetida.test.tsx
  src/__tests__/lib/marcas-impares.test.ts
  src/__tests__/lib/asistencia-marcas-de-mas.test.ts
  src/__tests__/components/asistencia-marcas-de-mas.test.tsx
  src/__tests__/components/asistencia-cinco-arreglos.test.tsx
)

ARCHIVOS=("$MOD" "$MOTOR" "$EXP" "$TSX")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }
correr() { npx vitest run "${TESTS[@]}" 2>&1; }

# 🩸 `grep` SIN `-q`, a propósito. Con `set -o pipefail`, `grep -q` cierra el
# tubo apenas encuentra la línea y el `echo` de una salida grande (vitest
# imprime el archivo ENTERO cuando falla un `toContain` sobre la fuente) muere
# por SIGPIPE: el tubo devuelve error y una mutación CAZADA se lee como «corrida
# muerta». Ya pasó aquí, con la mutación 8. `grep >/dev/null` lee todo.
tiene() { grep -E "$1" >/dev/null; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | tiene "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | tiene "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | tiene "Test Files" && ! echo "$salida" | tiene "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. la regla se apaga: 0 segundos =="
mutar "$MOD" 'export const SEGUNDOS_MARCA_REPETIDA = 60;' 'export const SEGUNDOS_MARCA_REPETIDA = 0;' \
&& probar 'la 07:58:37 de Ramón vuelve a contar'

echo "== 2. el número se afloja a 61 =="
mutar "$MOD" 'export const SEGUNDOS_MARCA_REPETIDA = 60;' 'export const SEGUNDOS_MARCA_REPETIDA = 61;' \
&& probar '61 segundos empieza a olvidarse'

echo "== 3. el número se aprieta a 59 =="
mutar "$MOD" 'export const SEGUNDOS_MARCA_REPETIDA = 60;' 'export const SEGUNDOS_MARCA_REPETIDA = 59;' \
&& probar '60 segundos exactos deja de olvidarse'

echo "== 4. «o menos» pasa a «menos que» =="
mutar "$MOD" '      if (d >= 0 && d <= umbralSeg) {' '      if (d >= 0 && d < umbralSeg) {' \
&& probar 'los 60 s exactos ya no se olvidan'

echo "== 5. se conserva la ÚLTIMA en vez de la primera =="
mutar "$MOD" '        olvidadas.push({ seg, despuesDeSeg: ultimaQueCuenta, segundosDespues: d });
        continue;' '        olvidadas.push({ seg: ultimaQueCuenta, despuesDeSeg: seg, segundosDespues: d });
        buenas[buenas.length - 1] = seg; ultimaQueCuenta = seg;
        continue;' \
&& probar 'la salida pasa a ser la segunda del doble toque'

echo "== 6. se compara contra la anterior a secas y no contra la última que cuenta =="
mutar "$MOD" '        olvidadas.push({ seg, despuesDeSeg: ultimaQueCuenta, segundosDespues: d });
        continue;' '        olvidadas.push({ seg, despuesDeSeg: ultimaQueCuenta, segundosDespues: d });
        ultimaQueCuenta = seg;
        continue;' \
&& probar 'una repetida estira la ventana'

echo "== 7. el motor ignora la regla =="
mutar "$MOTOR" '      const { buenas, olvidadas } = olvidarRepetidas(crudas);' \
               '      const { buenas, olvidadas } = { buenas: crudas, olvidadas: [] as ReturnType<typeof olvidarRepetidas>["olvidadas"] };' \
&& probar 'Ramón vuelve a tener 327 minutos de exceso'

echo "== 8. el freno vuelve a contar sobre las crudas =="
mutar "$MOTOR" '      const revisar = !enCurso && buenas.length !== 4;' '      const revisar = !enCurso && crudas.length !== 4;' \
&& probar 'un día de 5 con una repetida sigue frenando'

echo "== 9. la repetida se olvida EN SILENCIO =="
mutar "$MOTOR" '        marcasIds: buenas.map((seg) => p.ids.get(fecha)?.get(seg) ?? null),
        repetidas,' '        marcasIds: buenas.map((seg) => p.ids.get(fecha)?.get(seg) ?? null),
        repetidas: [],' \
&& probar 'el día no dice qué marca se olvidó'

echo "== 10. el resumen deja de contarlas =="
mutar "$MOTOR" '      marcasRepetidas: dias.reduce((a, d) => a + d.repetidas.length, 0),' '      marcasRepetidas: 0,' \
&& probar 'el total de repetidas va siempre en cero'

echo "== 11. el Excel esconde la repetida =="
mutar "$EXP" '        d.repetidas?.length ? textoTodasLasMarcasConRepetidas(d.marcas, d.repetidas) : textoTodasLasMarcas(d.marcas),' \
             '        textoTodasLasMarcas(d.marcas),' \
&& probar '«Todas las marcas» ya no dice «(repetida, no cuenta)»'

echo "== 12. la guía del Excel deja de explicarla =="
mutar "$EXP" '    ["Marca repetida", `Una marca a' '    ["Marca_repetida", `Una marca a' \
&& probar 'el archivo no explica qué es una marca repetida'

echo "== 13. la pantalla no dibuja la fila tachada =="
mutar "$TSX" '      {(d.repetidas ?? []).map((r, i) => (' '      {([] as typeof d.repetidas).map((r, i) => (' \
&& probar 'la 07:58:37 desaparece de la pantalla'

echo "== 14. el aviso de arriba no sale nunca =="
mutar "$TSX" '      {personas && contarRepetidas(personas.flatMap((p) => p.dias)) > 0 && (' '      {false && (' \
&& probar 'nadie se entera arriba de la tabla'

echo "== 15. el texto de la celda del Excel pierde el «no cuenta» =="
mutar "$MOD" '    ...repetidas.map((r) => ({ hora: r.hora, texto: `${r.hora} (repetida, no cuenta)` })),' \
             '    ...repetidas.map((r) => ({ hora: r.hora, texto: r.hora })),' \
&& probar 'la repetida se lee como una marca más'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$MOD" '/** «1 s» · «45 s» · «60 s». Siempre en segundos: el tope es un minuto. */' \
             '/** «1 s» · «45 s» · «60 s». En segundos, siempre: el tope es un minuto. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$MOD" 'ultimaQueCuenta' 'ultimaBuena' 5 \
&& controlar 'nombre de la variable de la última marca que cuenta'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

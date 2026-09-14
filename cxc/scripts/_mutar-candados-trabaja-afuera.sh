#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «Trabaja afuera» (14-sep-2026):
#   `src/__tests__/lib/planilla-trabaja-afuera.test.ts`.
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/trabaja-afuera.ts
REP=src/lib/asistencia/reporte.ts
MOTOR=src/lib/asistencia/planilla.ts
FICHA=src/lib/asistencia/ficha-persona.ts
SERVER=src/lib/asistencia/config-server.ts

TESTS=(
  src/__tests__/lib/planilla-trabaja-afuera.test.ts
)

ARCHIVOS=("$REGLA" "$REP" "$MOTOR" "$FICHA" "$SERVER")

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

echo "== 1. la casilla deja de llegar al reporte: todos sin casilla =="
mutar "$REP" '          trabajaAfuera: opts.trabajaAfuera?.has(codigo) === true,' '          trabajaAfuera: false,' \
&& probar 'el reporte ignora el set (día sin marca sigue siendo ausencia)'

echo "== 2. el día sin marca sigue AUSENTE aunque tenga el motivo =="
mutar "$REP" '          ausente: !enCurso && habil && !feriado && !justificadoDelDia,' '          ausente: !enCurso && habil && !feriado && !justificado,' \
&& probar 'ausente mira `justificado` en vez de `justificadoDelDia`'

echo "== 3. todos trabajan afuera (la casilla no se mira) =="
mutar "$REGLA" '  if (!d.trabajaAfuera) return null;' '  if (d.trabajaAfuera === undefined) return null;' \
&& probar 'sin casilla también se paga (control al revés)'

echo "== 4. el feriado sin marca pasa a «afuera» =="
mutar "$REGLA" '  if (d.enCurso || !d.habil || d.feriado || d.justificado) return null;' '  if (d.enCurso || !d.habil || d.justificado) return null;' \
&& probar 'el feriado deja de mandar'

echo "== 5. el fin de semana pasa a «afuera» =="
mutar "$REGLA" '  if (d.enCurso || !d.habil || d.feriado || d.justificado) return null;' '  if (d.enCurso || d.feriado || d.justificado) return null;' \
&& probar 'sábado y domingo se rotulan como día afuera'

echo "== 6. el día en curso se juzga =="
mutar "$REGLA" '  if (d.enCurso || !d.habil || d.feriado || d.justificado) return null;' '  if (!d.habil || d.feriado || d.justificado) return null;' \
&& probar 'hoy y los que vienen pasan a «afuera»'

echo "== 7. la justificación cargada deja de mandar (regla pura) =="
mutar "$REGLA" '  if (d.enCurso || !d.habil || d.feriado || d.justificado) return null;' '  if (d.enCurso || !d.habil || d.feriado) return null;' \
&& probar 'la regla pisa una justificación cargada'

echo "== 8. el dato se lee al revés: null cuenta como sí =="
mutar "$REGLA" '  return v === true || v === "true" || v === 1 || v === "1";' '  return v !== false && v !== "false" && v !== 0 && v !== "0";' \
&& probar 'trabajaAfuera(undefined) da true'

echo "== 9. la quincena sin marcas vuelve a ser «no marcó ni un día» =="
mutar "$MOTOR" '      if (linea.fueraDePlanilla || linea.noMarcaReloj || linea.trabajaAfuera) {' '      if (linea.fueraDePlanilla || linea.noMarcaReloj) {' \
&& probar 'armarPlanilla le pide marcas a quien trabaja afuera'

echo "== 10. la casilla no viaja a la línea =="
mutar "$MOTOR" '    trabajaAfuera: ficha.trabajaAfuera === true,' '    trabajaAfuera: false,' \
&& probar 'linea.trabajaAfuera siempre false (sin chip y sin excepción)'

echo "== 11. «no marca el reloj» deja de ganar cuando también trabaja afuera =="
mutar "$MOTOR" '  const noMarca = ficha.noMarcaReloj === true;
  // 🔴 Y QUIEN NO COBRA HORAS EXTRA' '  const noMarca = ficha.noMarcaReloj === true && ficha.trabajaAfuera !== true;
  // 🔴 Y QUIEN NO COBRA HORAS EXTRA' \
&& probar 'con las dos casillas el reloj se mide'

echo "== 12. la ficha no dice quién trabaja afuera =="
mutar "$FICHA" '  if (p.trabajaAfuera === true) {' '  if (p.trabajaAfuera === true && false) {' \
&& probar 'el chip «Trabaja afuera» no se dibuja'

echo "== 13. la lectura aparte deja de tolerar la columna ausente =="
mutar "$SERVER" '    if (esColumnaTrabajaAfueraFaltante(error)) return new Set();' '    if (esColumnaTrabajaAfueraFaltante(error)) throw new Error(error.message);' \
&& probar 'sin la migración la planilla se caería'

echo "== 14. el error que no nombra la columna también se traga =="
mutar "$REGLA" '  if (!texto.includes(COLUMNA_TRABAJA_AFUERA)) return false;' '  if (!texto.includes(COLUMNA_TRABAJA_AFUERA)) return true;' \
&& probar 'un permiso denegado se lee como «falta la migración»'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '// LAS PALABRAS' '// LAS PALABRAS.' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. el orden de los campos que se le pasan a la regla (misma conducta) =="
mutar "$REP" '          habil, feriado, enCurso, justificado,' '          enCurso, habil, feriado, justificado,' \
&& controlar 'orden de las propiedades del objeto'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

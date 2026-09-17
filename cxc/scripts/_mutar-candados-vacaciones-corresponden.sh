#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «Le corresponden N días» (17-sep-2026):
#   `src/__tests__/lib/vacaciones-le-corresponden.test.ts`.
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/vacaciones-corresponden.ts
# 🔑 Se muta `neto-no-negativo.ts` y NO `planilla.ts`: importar el módulo desde
# la planilla arma un ciclo (`vacaciones-corresponden → vacaciones → planilla`)
# que tumba la corrida entera de vitest, y una corrida muerta no prueba nada.
MOTOR=src/lib/asistencia/neto-no-negativo.ts
SQL=supabase/migrations/20261204120000_asistencia_saldo_vacaciones_retirado.sql

TESTS=(
  src/__tests__/lib/vacaciones-le-corresponden.test.ts
)

ARCHIVOS=("$REGLA" "$MOTOR" "$SQL")

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

echo "== 1. la ley pasa a 12 meses =="
mutar "$REGLA" 'export const MESES_POR_PERIODO = 11;' 'export const MESES_POR_PERIODO = 12;' \
&& probar 'un mes de vacaciones por cada DOCE de trabajo'

echo "== 2. el bloque en curso se REDONDEA en vez de truncarse =="
mutar "$REGLA" '    + Math.floor((resto * DIAS_POR_PERIODO) / MESES_POR_PERIODO);' \
  '    + Math.round((resto * DIAS_POR_PERIODO) / MESES_POR_PERIODO);' \
&& probar 'un día de más que alguien todavía no ganó'

echo "== 3. el mes en curso se cuenta como cumplido =="
mutar "$REGLA" '  if (b.dia < a.dia) meses -= 1;' '  if (false) meses -= 1;' \
&& probar 'el día 15 cuenta como el mes cerrado'

echo "== 4. sin fecha de ingreso, CERO en vez de null =="
mutar "$REGLA" '  if (!esFechaValida(fechaIngreso) || !esFechaValida(hasta)) return null;' \
  '  if (!esFechaValida(fechaIngreso) || !esFechaValida(hasta)) return 0;' \
&& probar 'un cero se leería como «no le toca ni un día»'

echo "== 5. sin fecha de ingreso igual sale un número =="
mutar "$REGLA" '  if (ganados === null) {' '  if (false) {' \
&& probar 'se resta lo tomado contra una nada'

echo "== 6. las «ya pagadas» dejan de restar =="
mutar "$REGLA" '    dias: ganados - tomados - yaPagados,' '    dias: ganados - tomados,' \
&& probar 'los días cobrados y no disfrutados se regalan dos veces'

echo "== 7. el negativo se recorta a cero =="
mutar "$REGLA" '    dias: ganados - tomados - yaPagados,' '    dias: Math.max(0, ganados - tomados - yaPagados),' \
&& probar 'quien adelantó vacaciones se esconde'

echo "== 8. 🔴 el número se vuelve a llamar «le quedan» =="
mutar "$REGLA" 'export const ROTULO_CORRESPONDEN = "Le corresponden";' \
  'export const ROTULO_CORRESPONDEN = "Le quedan";' \
&& probar 'se lee como un saldo, y no lo es'

echo "== 9. 🔴 la línea del «no incluye» se queda sin su fecha =="
mutar "$REGLA" '  "No incluye vacaciones tomadas antes del 17 de septiembre de 2026.";' \
  '  "Los días salen de su antigüedad.";' \
&& probar 'el número pasa a leerse como un saldo completo'

echo "== 10. 🔴 el módulo empieza a saber de plata =="
mutar "$REGLA" 'export function textoDias(n: number): string {' \
  'export function valeEnPlata(n: number, rataHora: number): number { return n * 8 * rataHora; }
export function textoDias(n: number): string {' \
&& probar 'un cálculo de dinero se cuela en el módulo'

echo "== 11. 🔴 un módulo que decide dinero lo importa =="
mutar "$MOTOR" 'import { centavos } from "./planilla";' \
  'import { centavos } from "./planilla";
import "./vacaciones-corresponden";' \
&& probar 'el número entra al camino que decide un pago'

echo "== 12. 🔴 la migración DROPEA las columnas en vez de comentarlas =="
mutar "$SQL" 'COMMENT ON COLUMN asistencia_personas.saldo_vacaciones_dias IS' \
  'ALTER TABLE asistencia_personas DROP COLUMN saldo_vacaciones_dias;
COMMENT ON COLUMN asistencia_personas.saldo_vacaciones_corte IS' 1 \
&& probar 'lo retirado se borra de verdad'

echo "== 13. los días tomados se cuentan solo HÁBILES =="
mutar "$REGLA" '    const dias = diasDeVacacion(v.desde, v.hasta);' \
  '    const dias = Math.round(diasDeVacacion(v.desde, v.hasta) * 5 / 7);' \
&& probar 'se comparan hábiles contra un techo de días corridos'

echo "== 14. las vacaciones de otro se cuentan como propias =="
mutar "$REGLA" '    if (String(v?.empleado_codigo ?? "").trim() !== cod) continue;' \
  '    if (false) continue;' \
&& probar 'a cada quien se le restan los días de todos'

echo "== 15. el aviso habla aunque no falte nadie =="
mutar "$REGLA" '  if (n === 0) return null;' '  if (n < 0) return null;' \
&& probar 'un cartel permanente, que se deja de leer'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '// LA LEY, EN DOS NÚMEROS' '// LA LEY, EN DOS NÚMEROS.' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. el orden de los dos contadores de lo tomado (misma cuenta) =="
mutar "$REGLA" '  let tomados = 0;
  let yaPagados = 0;' '  let yaPagados = 0;
  let tomados = 0;' \
&& controlar 'orden de dos declaraciones sin dependencia entre sí'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

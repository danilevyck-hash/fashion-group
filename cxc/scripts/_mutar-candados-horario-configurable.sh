#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «los días y los dos horarios,
# configurables por persona» (18-sep-2026):
# `src/__tests__/lib/horario-configurable.test.ts`, más los candados viejos que
# NO se pueden romper (`marcas-impares` sigue excluyendo el sábado no laborable;
# `planilla-trabaja-afuera` y `asistencia-siete-pantallas` siguen igual).
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/horario-configurable.ts
REP=src/lib/asistencia/reporte.ts
PLA=src/lib/asistencia/planilla.ts
RUTA=src/app/api/asistencia/horarios/route.ts
TAB=src/app/asistencia/HorariosTab.tsx

TESTS=(
  src/__tests__/lib/horario-configurable.test.ts
  src/__tests__/lib/marcas-impares.test.ts
  src/__tests__/lib/planilla-trabaja-afuera.test.ts
  src/__tests__/lib/asistencia-siete-pantallas.test.ts
)

ARCHIVOS=("$REGLA" "$REP" "$PLA" "$RUTA" "$TAB")

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

echo "== 1. sin la migración, el resolver igual reparte días (falla CERRADA en vez de abierta) =="
mutar "$REGLA" '  if (opts.faltaMigracion) return out;' \
               '  if (opts.faltaMigracion && false) return out;' \
&& probar 'con la migración sin correr Multifashion ya cambiaría'

echo "== 2. el domingo entra como laborable si se manda en la lista =="
mutar "$REGLA" '  if (dow === DOMINGO) return false;' \
               '  if (dow === DOMINGO && !dias) return false;' \
&& probar 'el domingo pierde su recargo'

echo "== 3. el domingo pasa la normalización =="
mutar "$REGLA" '    if (Number.isInteger(n) && n >= 1 && n <= SABADO) out.add(n);' \
               '    if (Number.isInteger(n) && n >= 0 && n <= SABADO) out.add(n);' \
&& probar 'la lista guarda un 0'

echo "== 4. Multifashion vuelve a lunes a viernes =="
mutar "$REGLA" '    american_classic: LUNES_A_SABADO,' \
               '    american_classic: DIAS_LABORABLES_DEFAULT,' \
&& probar 'el sábado de Multifashion deja de ser laborable'

echo "== 5. la columna de la persona ya no le gana a la empresa =="
mutar "$REGLA" '    if (propios) out.set(h.empleado_codigo, propios);' \
               '    if (propios && !out.has(h.empleado_codigo)) out.set(h.empleado_codigo, propios);' \
&& probar 'un Multifashion configurado lunes a viernes sigue con sábado'

echo "== 6. manda CUALQUIER marca del teléfono, no la primera =="
mutar "$REP" '    if (!prim || seg < prim.seg) p.primera.set(dia, { seg, dispositivo: m.dispositivo ?? null });' \
             '    if (!prim || seg < prim.seg || esMarcaDeAfueraMut(m.dispositivo)) p.primera.set(dia, { seg, dispositivo: m.dispositivo ?? null });
    function esMarcaDeAfueraMut(d: string | null | undefined) { return String(d ?? "") === "telefono"; }' \
&& probar 'la segunda marca decide el horario'

echo "== 7. la primera es por orden de llegada, no por hora =="
mutar "$REP" '    if (!prim || seg < prim.seg) p.primera.set(dia, { seg, dispositivo: m.dispositivo ?? null });' \
             '    if (!prim) p.primera.set(dia, { seg, dispositivo: m.dispositivo ?? null });' \
&& probar 'una marca del teléfono que llegó después deja de ser la primera'

echo "== 8. vacío ya NO es el mismo de adentro: el teléfono siempre usa lo de afuera aunque esté vacío =="
mutar "$REGLA" '  if (!afuera || (!entradaAfuera && !salidaAfuera)) {' \
               '  if (!afuera) {' \
&& probar 'con las dos horas de afuera vacías el día se marca «de afuera»'

echo "== 9. la salida de afuera vacía cae a la ENTRADA de adentro, no a la salida =="
mutar "$REGLA" '    salida: salidaAfuera ?? h.salida,' \
               '    salida: salidaAfuera ?? h.entrada,' \
&& probar 'campo por campo se pierde'

echo "== 10. el motor vuelve a preguntar por el calendario en vez de por la lista =="
mutar "$REP" '      const habil = esDiaLaborable(fecha, diasDeEsta);' \
             '      const habil = esDiaLaborable(fecha);' \
&& probar 'el sábado de Multifashion no es hábil para el motor'

echo "== 11. el Reporte recorre lunes a viernes aunque la persona trabaje el sábado =="
mutar "$REP" '      : todosLosDias.filter((f) => esDiaLaborable(f, diasDeEsta));' \
             '      : todosLosDias.filter((f) => esDiaLaborable(f));' \
&& probar 'el Reporte no muestra el sábado de Multifashion'

echo "== 12. la planilla vuelve a mirar el calendario y no `d.habil` =="
mutar "$PLA" '  const habil = typeof d.habil === "boolean" ? d.habil : esHabil(d.fecha);' \
             '  const habil = esHabil(d.fecha);' \
&& probar 'el sábado con marca de Multifashion vuelve a `sabadoMin`'

echo "== 13. el sábado laborable se paga con recargo de domingo =="
mutar "$PLA" '    const esDomingo = dow(d.fecha) === 0;' \
             '    const esDomingo = dow(d.fecha) === 0 || dow(d.fecha) === 6;' \
&& probar 'el sábado no laborable se paga al 1,5'

echo "== 14. el motor ya no elige el horario por día: siempre el de adentro =="
mutar "$REP" '        p.primera.get(fecha)?.dispositivo,' \
             '        null,' \
&& probar 'el horario de afuera nunca aplica'

echo "== 15. el PUT deja pasar el domingo =="
mutar "$RUTA" '        [COLUMNA_DIAS_LABORABLES]: body.diasLaborables !== undefined ? diasV.valor : previa.dias,' \
              '        [COLUMNA_DIAS_LABORABLES]: body.diasLaborables !== undefined ? (body.diasLaborables as number[]) : previa.dias,' \
&& probar 'la ruta escribe la lista cruda'

echo "== 16. el PUT escribe las columnas nuevas aunque no existan =="
mutar "$RUTA" '  const fila = previa.faltaMigracion
    ? base
    : {' \
              '  const fila = false
    ? base
    : {' \
&& probar 'sin la migración el upsert lleva dias_laborables'

echo "== 17. el PUT pisa lo guardado cuando el cuerpo no lo trae =="
mutar "$RUTA" '        [COLUMNA_ENTRADA_AFUERA]: body.entradaAfuera !== undefined ? entradaAfueraV.valor : previa.entradaAfuera,' \
              '        [COLUMNA_ENTRADA_AFUERA]: entradaAfueraV.valor,' \
&& probar 'guardar la salida borra el horario de afuera'

echo "== 18. la pantalla dibuja los días aunque falte la migración =="
mutar "$TAB" '  const configurable = !faltaMigracion;' \
             '  const configurable = true;' \
&& probar 'se ofrece un control que el servidor no puede guardar'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '/** Lo de siempre: lunes a viernes. */' '/** Lo de siempre: de lunes a viernes. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$REGLA" '  const afuera = esMarcaDeAfuera(dispositivoPrimeraMarca);
  const entradaAfuera = limpiaHora(h.entrada_afuera);
  const salidaAfuera = limpiaHora(h.salida_afuera);
  if (!afuera || (!entradaAfuera && !salidaAfuera)) {' \
               '  const vinoDelTelefono = esMarcaDeAfuera(dispositivoPrimeraMarca);
  const entradaAfuera = limpiaHora(h.entrada_afuera);
  const salidaAfuera = limpiaHora(h.salida_afuera);
  if (!vinoDelTelefono || (!entradaAfuera && !salidaAfuera)) {' \
&& controlar 'nombre de variable dentro de horarioDelDia'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

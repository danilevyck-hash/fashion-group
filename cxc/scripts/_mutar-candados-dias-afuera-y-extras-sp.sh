#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del 14-sep-2026:
#   1. el servicio profesional cobra horas extra salvo por la casilla de su ficha;
#   2. los días afuera («Trabajo de vendedor» por rango, sin horas guardadas,
#      solo los días sin marca);
#   3. «Compensatorio», un motivo más que no descuenta.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

MOTOR=src/lib/asistencia/planilla.ts
APR=src/lib/asistencia/aprobaciones.ts
REP=src/lib/asistencia/reporte.ts
RUTA=src/app/api/asistencia/reporte/route.ts
MOTIVOS=src/lib/asistencia/motivos.ts
HORAS=src/lib/asistencia/permiso-horas.ts
FORM=src/app/asistencia/JustificarForm.tsx

TESTS=(
  src/__tests__/lib/servicio-profesional-cobra-extra.test.ts
  src/__tests__/lib/dias-afuera-y-compensatorio.test.ts
  src/__tests__/components/justificar-form-nota-motivo.test.tsx
  src/__tests__/lib/reporte-servicio-profesional-sin-extras.test.ts
  src/__tests__/api/aprobaciones-no-lista-servicio-profesional.test.ts
  src/__tests__/lib/planilla-aviso-extras-sin-aprobar.test.ts
  src/__tests__/lib/asistencia-servicio-profesional.test.ts
  src/__tests__/lib/justificar-horas-solo-constancia.test.ts
  src/__tests__/lib/asistencia-motivo-trabajo-fuera.test.ts
  src/__tests__/lib/planilla-tres-descuentos.test.ts
)

ARCHIVOS=("$MOTOR" "$APR" "$REP" "$RUTA" "$MOTIVOS" "$HORAS" "$FORM")

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

echo "== 1. la regla vieja vuelve: ser servicio profesional apaga las extras =="
mutar "$MOTOR" '  const sinRecargos = noCobraExtra;' '  const sinRecargos = fueraDePlanilla || noCobraExtra;' \
&& probar 'sinRecargos = fueraDePlanilla || noCobraExtra'

echo "== 2. la casilla deja de apagar nada =="
mutar "$MOTOR" '  const sinRecargos = noCobraExtra;' '  const sinRecargos = false;' \
&& probar 'sinRecargos = false (Yulissa cobraría)'

echo "== 3. la casilla se lee al revés =="
mutar "$MOTOR" '  const noCobraExtra = ficha.cobraHorasExtra === false;' '  const noCobraExtra = ficha.cobraHorasExtra === true;' \
&& probar 'noCobraExtra invertida'

echo "== 4. Aprobaciones vuelve a saltarse al servicio profesional =="
mutar "$APR" '    if (l.cobraHorasExtra === false) continue;' '    if (l.fueraDePlanilla) continue;
    if (l.cobraHorasExtra === false) continue;' \
&& probar 'if (l.fueraDePlanilla) continue;'

echo "== 5. Aprobaciones ofrece a quien no cobra extras =="
mutar "$APR" '    if (l.cobraHorasExtra === false) continue;' '' \
&& probar 'sin el continue de la casilla'

echo "== 6. el Reporte vuelve a preguntar por la bandera =="
mutar "$REP" '  return p.cobraHorasExtra !== false;' '  return p.servicioProfesional !== true;' \
&& probar 'cuentaHorasExtra mira servicioProfesional'

echo "== 7. el Reporte cuenta extras a todos =="
mutar "$REP" '  return p.cobraHorasExtra !== false;' '  return true;' \
&& probar 'cuentaHorasExtra = true'

echo "== 8. la ruta del Reporte arma el conjunto con la bandera =="
mutar "$RUTA" '      personasDb.filas.filter((f) => !cobraHorasExtraDeFila(f)).map((f) => String(f.empleado_codigo)),' '      personasDb.filas.filter(servicioProfesionalDeFila).map((f) => String(f.empleado_codigo)),' \
&& probar 'sinHorasExtra desde servicioProfesionalDeFila'

echo "== 9. la ruta del Reporte no marca la casilla =="
mutar "$RUTA" '      .map((p) => (sinHorasExtra.has(p.codigo) ? { ...p, cobraHorasExtra: false } : p))' '' \
&& probar 'la casilla no viaja al Reporte'

echo "== 10. «Compensatorio» sale de la lista =="
mutar "$MOTIVOS" '  "Incapacidad",
  MOTIVO_COMPENSATORIO,
  "Catástrofe",' '  "Incapacidad",
  "Catástrofe",' \
&& probar 'sin Compensatorio'

echo "== 11. «Compensatorio» se va al final =="
mutar "$MOTIVOS" '  "Incapacidad",
  MOTIVO_COMPENSATORIO,
  "Catástrofe",
  "Escolares",
  MOTIVO_TRABAJO_VENDEDOR,
  MOTIVO_CONSTANCIA,' '  "Incapacidad",
  "Catástrofe",
  "Escolares",
  MOTIVO_TRABAJO_VENDEDOR,
  MOTIVO_CONSTANCIA,
  MOTIVO_COMPENSATORIO,' \
&& probar 'Compensatorio lejos de Incapacidad'

echo "== 12. la nota del día afuera pierde el horario =="
mutar "$MOTIVOS" '  "Se paga como un día normal de 8 horas (9:00 a 18:00 con una hora de almuerzo). "' '  "Se paga como un día normal de 8 horas. "' \
&& probar 'TEXTO_DIA_AFUERA sin 9:00 a 18:00'

echo "== 13. la nota no sale con Trabajo de vendedor =="
mutar "$MOTIVOS" '  if (esTrabajoDeVendedor(motivo)) return TEXTO_DIA_AFUERA;' '' \
&& probar 'notaDelMotivo(Trabajo de vendedor) = null'

echo "== 14. el compensatorio se lee como ausencia =="
mutar "$MOTIVOS" '  if (motivo.trim() === MOTIVO_COMPENSATORIO) return "Día compensatorio (libre que se le debía)";' '' \
&& probar 'textoDiaJustificado(Compensatorio) = Ausencia justificada'

echo "== 15. el formulario no dibuja la nota =="
mutar "$FORM" '      {notaMotivo && (' '      {false && (' \
&& probar 'nota apagada en la pantalla'

echo "== 16. el formulario manda el horario 9–18 como horas =="
mutar "$FORM" '        body: JSON.stringify({ codigo, desde, hasta, motivo, nota, ...horas }),' '        body: JSON.stringify({ codigo, desde, hasta, motivo, nota, horaDesde: "09:00", horaHasta: "18:00" }),' \
&& probar 'viajan hora_desde/hora_hasta con el día afuera'

echo "== 17. las horas se admiten con cualquier motivo menos Incapacidad =="
mutar "$HORAS" '  return String(motivo ?? "").trim() === MOTIVO_CONSTANCIA;' '  return String(motivo ?? "").trim() !== "Incapacidad";' \
&& probar 'motivoAdmiteHoras abierto'

echo "== 18. un día justificado sin marcas vuelve a ser ausencia =="
mutar "$REP" '          ausente: !enCurso && habil && !feriado && !justificado,' '          ausente: !enCurso && habil && !feriado,' \
&& probar 'el día afuera descuenta'

echo "== 19. un permiso de horas justifica el día entero =="
mutar "$REP" '      const justificado = just && !ventana ? just.motivo : null;' '      const justificado = just ? just.motivo : null;' \
&& probar 'las horas guardadas justifican el día'

echo "== 20. la justificación pisa la tardanza de un día marcado =="
mutar "$REP" '      const tardeMin = Math.max(0, tardeBrutaMin - permisoPerdonaMin);' '      const tardeMin = justificado ? 0 : Math.max(0, tardeBrutaMin - permisoPerdonaMin);' \
&& probar 'con marcas, la justificación borra la tardanza'

echo "== CONTROL A. solo cambia un comentario del motor =="
mutar "$MOTOR" '  // 🔴 14-sep-2026 — LA REGLA SE MUDÓ A LA FICHA. Hasta hoy esto decía' '  // 🔴 14-sep-2026 — la regla se mudó a la ficha. Hasta hoy esto decía' \
&& controlar 'comentario del motor'

echo "== CONTROL B. la nota del compensatorio cambia de palabras y conserva «No se descuenta» =="
mutar "$MOTIVOS" '  "Un día libre que se le debe (por un domingo o feriado trabajado). No se descuenta.";' '  "Un día libre que se le debe por un domingo o feriado trabajado. No se descuenta.";' \
&& controlar 'texto del compensatorio'

echo
echo "RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde"

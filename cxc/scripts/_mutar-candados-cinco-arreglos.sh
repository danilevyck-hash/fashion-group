#!/usr/bin/env bash
# Verificación por MUTACIÓN de los cinco arreglos de pantalla de Asistencia
# (16-sep-2026): `src/__tests__/components/asistencia-cinco-arreglos.test.tsx`.
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

ATAJOS=src/lib/asistencia/atajos-periodo.ts
URL=src/lib/asistencia/periodo-en-la-url.ts
SOSPE=src/lib/asistencia/salida-sospechosa.ts
EXTRAS=src/lib/asistencia/extras-decididas.ts
TSX=src/app/asistencia/ReporteTab.tsx
RUTA=src/app/api/asistencia/reporte/route.ts
REP=src/lib/asistencia/reporte.ts

TESTS=(
  src/__tests__/components/asistencia-cinco-arreglos.test.tsx
  src/__tests__/components/asistencia-reporte-desde-la-ficha.test.tsx
)

ARCHIVOS=("$ATAJOS" "$URL" "$SOSPE" "$EXTRAS" "$TSX" "$RUTA" "$REP")

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

echo "== 1. «Ayer» deja de ser ayer =="
mutar "$ATAJOS" '  d.setUTCDate(d.getUTCDate() - 1);' '  d.setUTCDate(d.getUTCDate() - 2);' \
&& probar 'el atajo Ayer salta dos días'

echo "== 2. «Quincena pasada» es la misma que la de hoy =="
mutar "$ATAJOS" '  const anterior = Math.max(0, actual - 1);' '  const anterior = actual;' \
&& probar 'los dos botones de quincena dicen lo mismo'

echo "== 3. la quincena se busca mal: siempre la última de la lista =="
mutar "$ATAJOS" '  const i = qs.findIndex((q) => q.desde <= hoy && hoy <= q.hasta);' '  const i = -1;' \
&& probar 'estando a mitad de mes se ofrece la quincena equivocada'

echo "== 4. el botón prendido se decide por parecido, no por igualdad =="
mutar "$ATAJOS" '  return atajos.find((a) => a.desde === desde && a.hasta === hasta)?.clave ?? null;' \
                '  return atajos.find((a) => a.desde === desde)?.clave ?? null;' \
&& probar 'un rango con el mismo inicio prende el botón'

echo "== 5. la URL deja de ganarle al recordado =="
mutar "$URL" '  if (esFecha(d) && esFecha(h) && d <= h) return { desde: d, hasta: h };
  const r = opts.recordado;' \
             '  const r = opts.recordado;' \
&& probar '«Ver sus días ›» ya no manda su rango'

echo "== 6. media URL se cree: se muestra medio período pedido =="
mutar "$URL" '  if (esFecha(d) && esFecha(h) && d <= h) return { desde: d, hasta: h };' \
             '  if (esFecha(d) || esFecha(h)) return { desde: d || opts.haceCatorce, hasta: h || opts.hoy };' \
&& probar 'un rango al revés o a medias pasa'

echo "== 7. el período deja de escribirse en la URL al montar =="
mutar "$TSX" '    setDesdeUrl(inicial.desde); setHastaUrl(inicial.hasta);' '    return;' \
&& probar 'volver de Planilla vuelve a resetear el período'

echo "== 8. el aviso deja de nombrar a quién le falta el horario =="
mutar "$TSX" '          {sinHorarioLista.length > 0 && (' '          {false && sinHorarioLista.length > 0 && (' \
&& probar 'se dice el número y nada más, como antes'

echo "== 9. la ruta deja de mandar quiénes son =="
mutar "$RUTA" '      sinHorarioLista,' '      sinHorarioLista: [],' \
&& probar 'la lista llega vacía y no hay a quién nombrar'

echo "== 10. «dos marcas» sin mirar dónde cae la última =="
mutar "$SOSPE" '  return d.salidaTempranaMin > SALIDA_SOSPECHOSA_MIN;' '  return true;' \
&& probar 'los días buenos de Andrea (7 y 9 de sep) también avisan'

echo "== 11. el umbral se afloja a 30 minutos =="
mutar "$SOSPE" 'export const SALIDA_SOSPECHOSA_MIN = 120;' 'export const SALIDA_SOSPECHOSA_MIN = 30;' \
&& probar 'el caso de 58 minutos, que es normal, empieza a avisar'

echo "== 12. la regla pisa al día en curso y al que no es hábil =="
mutar "$SOSPE" '  if (!d.habil || d.enCurso || d.fueraDeVigencia || d.vacacion) return false;' '  if (d.vacacion) return false;' \
&& probar 'a media mañana todo el mundo avisa'

echo "== 13. el aviso se cuela en días de 4 marcas =="
mutar "$SOSPE" '  if (d.marcas.length !== 2) return false;' '  if (d.marcas.length < 2) return false;' \
&& probar 'un día completo también avisa'

echo "== 14. el motor deja de preguntar y nada avisa nunca =="
mutar "$REP" '        revisar, salidaSospechosa: sospechosa,' '        revisar, salidaSospechosa: false,' \
&& probar 'la bandera nunca llega a la pantalla'

echo "== 15. la pantalla no dibuja el chip =="
mutar "$TSX" '              {d.salidaSospechosa && (' '              {false && d.salidaSospechosa && (' \
&& probar 'el día sospechoso pasa sin decir nada'

echo "== 16. lo pendiente se cuenta como aprobado =="
mutar "$EXTRAS" '    if (decision === "si") out.aprobadoMin += d.extraMin;' '    if (decision !== "no") out.aprobadoMin += d.extraMin;' \
&& probar 'se muestra como pagable lo que nadie aprobó'

echo "== 17. rechazado y aprobado se cambian de lugar =="
mutar "$EXTRAS" '    else if (decision === "no") out.rechazadoMin += d.extraMin;' '    else if (decision === "no") out.aprobadoMin += d.extraMin;' \
&& probar 'lo rechazado se lee como aprobado'

echo "== 18. la celda deja de decir lo decidido =="
mutar "$TSX" '          {cuentaHorasExtra(p) && textoExtrasDecididas(extras) && (' \
             '          {false && cuentaHorasExtra(p) && textoExtrasDecididas(extras) && (' \
&& probar 'vuelve a mostrar solo lo que midió el reloj'

echo "== 19. la ruta deja de mandar las decisiones =="
mutar "$RUTA" '      decisionesExtra,' '      decisionesExtra: {},' \
&& probar 'sin decisiones la celda no puede repartir nada'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$SOSPE" ' * Dos horas. Ver arriba de dónde sale.' ' * Dos horas justas. Ver arriba de dónde sale.' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$EXTRAS" '  const out: ExtrasDecididas = { aprobadoMin: 0, rechazadoMin: 0, pendienteMin: 0 };' \
                '  const acumulado: ExtrasDecididas = { aprobadoMin: 0, rechazadoMin: 0, pendienteMin: 0 };
  const out = acumulado;' \
&& controlar 'nombre de la variable del acumulador'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

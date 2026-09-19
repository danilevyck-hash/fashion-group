#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «solo se cierran quincenas» (18-sep-2026):
#   `src/__tests__/api/planilla-solo-quincenas.test.ts`
#   `src/__tests__/api/planilla-guardada-route.test.ts`
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/planilla-guardada.ts
RUTA=src/app/api/asistencia/planilla-guardada/route.ts
GENERAR=src/app/api/asistencia/planilla/route.ts
MOTOR=src/lib/asistencia/planilla.ts
PANTALLA=src/app/asistencia/PlanillaTab.tsx
BOSTON=src/app/boston/tabs/PlanillaBoston.tsx
SQL=supabase/migrations/20261201120000_borrar_planillas_de_prueba.sql

TESTS=(
  src/__tests__/api/planilla-solo-quincenas.test.ts
  src/__tests__/api/planilla-guardada-route.test.ts
)

ARCHIVOS=("$REGLA" "$RUTA" "$GENERAR" "$MOTOR" "$PANTALLA" "$BOSTON" "$SQL")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

# 🩸 SIN TUBERÍAS PARA MIRAR LA SALIDA: con `set -o pipefail`, un
# `echo "$salida" | grep -q` sobre una salida grande devuelve 141 (grep corta,
# echo se come un SIGPIPE) y una mutación CAZADA se reportaría como muerta.
tiene() { case "$2" in *"$1"*) return 0;; *) return 1;; esac; }
corrio() { tiene "Test Files" "$1"; }
fallo()  { [[ "$1" =~ Tests[[:space:]]+[^$'\n']*failed ]]; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! corrio "$salida"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if fallo "$salida"; then
    echo "  ✅ CAZADA — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if corrio "$salida" && ! fallo "$salida"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

FRENO_EN_RUTA='    const noQuincena = frenoSoloQuincenas(periodo);
    if (noQuincena) {
      return NextResponse.json({ ok: false, error: noQuincena }, { status: 400 });
    }'

echo "== 1. la regla se apaga: todo pasa =="
mutar "$REGLA" '  if (periodo.esQuincena) return null;' '  if (periodo.esQuincena || !periodo.esQuincena) return null;' \
&& probar 'un 15–28 ago vuelve a cerrarse'

echo "== 2. la regla se invierte: pasa lo que NO es quincena =="
mutar "$REGLA" '  if (periodo.esQuincena) return null;' '  if (!periodo.esQuincena) return null;' \
&& probar 'se rechaza la quincena y se cierra el rango'

echo "== 3. el texto deja de decir qué llegó =="
mutar "$REGLA" '    `Solo se cierran quincenas. Llegó del ${fechaCorta(periodo.desde)} al ` +
    `${fechaCorta(periodo.hasta)}, y eso no es una quincena. ` +' '    `Solo se cierran quincenas. Eso no es una quincena. ` +' \
&& probar 'el mensaje no dice las fechas'

echo "== 4. el texto pierde la palabra quincena =="
mutar "$REGLA" '    `Solo se cierran quincenas. Llegó del ${fechaCorta(periodo.desde)} al ` +' '    `Solo se cierran períodos fijos. Llegó del ${fechaCorta(periodo.desde)} al ` +' \
&& probar 'el mensaje deja de nombrar la regla'

echo "== 5. la ruta deja de preguntar =="
mutar "$RUTA" "$FRENO_EN_RUTA" '' \
&& probar 'el servidor cierra cualquier rango'

echo "== 6. la ruta contesta 409 en vez de 400 =="
mutar "$RUTA" '      return NextResponse.json({ ok: false, error: noQuincena }, { status: 400 });' '      return NextResponse.json({ ok: false, error: noQuincena }, { status: 409 });' \
&& probar 'cambia el código con que se rechaza'

echo "== 7. el freno se corre DESPUÉS de leer la base =="
mutar "$RUTA" "$FRENO_EN_RUTA" '' \
&& mutar "$RUTA" '    const { cabeceras } = await leerCabeceras(empresa);
    const solapadas = solapadasDe(empresa, { desde, hasta }, cabeceras);' "    const { cabeceras } = await leerCabeceras(empresa);
$FRENO_EN_RUTA
    const solapadas = solapadasDe(empresa, { desde, hasta }, cabeceras);" \
&& probar 'se lee la base antes de frenar'

echo "== 8. el motor cree que cualquier rango que EMPIEZA como quincena lo es =="
mutar "$MOTOR" '    if (q.desde === desde && q.hasta === hasta) return periodoDeQuincena(q);' '    if (q.desde === desde) return periodoDeQuincena(q);' \
&& probar '16–31 ago pasa como quincena'

echo "== 9. la Planilla vuelve a montar el calendario =="
mutar "$PANTALLA" '          <span className="text-xs text-gray-500">Quincena</span>' '          <span className="text-xs text-gray-500">Quincena</span>{false && <RangoFechas desde="" hasta="" onChange={() => {}} />}' \
&& probar 'el rango libre vuelve a la pantalla'

echo "== 10. la Planilla ofrece «Cerrar quincena» sobre un rango que no es quincena =="
mutar "$PANTALLA" '        {!!data && !vieja && !cerrada && !!data.lineas.length && puedeCerrarla && !data.avisos.rangoLibre && (' '        {!!data && !vieja && !cerrada && !!data.lineas.length && puedeCerrarla && (' \
&& probar 'el botón vuelve a salir'

echo "== 11. la planilla de Boston pierde su rango libre =="
mutar "$BOSTON" '<RangoFechas' '<RangoDeFechas' \
&& probar 'a David le quitan el calendario'

echo "== 12. la ruta que GENERA empieza a llevar el freno =="
mutar "$GENERAR" 'import { esCerrada } from "@/lib/asistencia/planilla-guardada";' 'import { esCerrada, frenoSoloQuincenas } from "@/lib/asistencia/planilla-guardada";' \
&& probar 'se mataría el ajuste de la quincena anterior'

echo "== 13. una migración nombra las dos cabeceras de 15–28 ago =="
mutar "$SQL" "    '4996da0f-e861-4d93-93a6-753e1e6cb03b'   -- confecciones_boston 2026-08-15 → 2026-08-25 (cerrada)" "    '4996da0f-e861-4d93-93a6-753e1e6cb03b',  -- confecciones_boston 2026-08-15 → 2026-08-25 (cerrada)
    '5bc68925-17f5-43bd-a02c-678d224ea0df'   -- fashion_wear 15–28 ago" \
&& probar 'se reescribe el pasado'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" ' * Devuelve `null` cuando el período ES una quincena, o el texto del rechazo en' ' * Contesta `null` cuando el período ES una quincena, o el texto del rechazo en' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. la misma regla escrita con una variable =="
mutar "$REGLA" '  if (periodo.esQuincena) return null;' '  const esQuincena = periodo.esQuincena === true;
  if (esQuincena) return null;' \
&& controlar 'la misma pregunta en dos líneas'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

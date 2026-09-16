#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «la quincena es fija: el rango libre se
# fue de la pantalla» (15-sep-2026):
#   `src/__tests__/lib/quincena-fija-sin-rango-libre.test.ts`
#   `src/__tests__/components/planilla-elegir-quincena.test.tsx`
#   `src/__tests__/components/asistencia-planilla-cerrar-quincena.test.tsx`
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/elegir-quincena.ts
PANTALLA=src/app/asistencia/PlanillaTab.tsx
SQL=supabase/migrations/20261201120000_borrar_planillas_de_prueba.sql

TESTS=(
  src/__tests__/lib/quincena-fija-sin-rango-libre.test.ts
  src/__tests__/components/planilla-elegir-quincena.test.tsx
  src/__tests__/components/asistencia-planilla-cerrar-quincena.test.tsx
)

ARCHIVOS=("$REGLA" "$PANTALLA" "$SQL")

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

echo "== 1. vuelven a ser solo las dos del mes en curso =="
mutar "$PANTALLA" '  const quincenasParaElegir = useMemo(() => quincenasElegibles(hoy), [hoy]);' '  const quincenasParaElegir = useMemo(() => quincenasElegibles(hoy).slice(2), [hoy]);' \
&& probar 'en octubre no se podría cerrar septiembre'

echo "== 2. el mes anterior sale mal: se ofrece el mismo mes dos veces =="
mutar "$REGLA" '  const anteriorMes = m === 1 ? 12 : m - 1;' '  const anteriorMes = m;' \
&& probar 'cuatro botones que son los mismos dos'

echo "== 3. enero no cae en diciembre del año pasado =="
mutar "$REGLA" '  const anteriorAnio = m === 1 ? a - 1 : a;' '  const anteriorAnio = a;' \
&& probar 'el 1 de enero deja a diciembre inalcanzable'

echo "== 4. el orden se invierte: primero el mes en curso =="
mutar "$REGLA" '  return [
    quincena(anteriorAnio, anteriorMes, 1),
    quincena(anteriorAnio, anteriorMes, 2),
    quincena(a, m, 1),
    quincena(a, m, 2),
  ];' '  return [
    quincena(a, m, 1),
    quincena(a, m, 2),
    quincena(anteriorAnio, anteriorMes, 1),
    quincena(anteriorAnio, anteriorMes, 2),
  ];' \
&& probar 'el orden de calendario se rompe'

echo "== 5. se agrega una quincena de más =="
mutar "$REGLA" '    quincena(a, m, 2),
  ];' '    quincena(a, m, 2),
    quincena(a, m === 12 ? 1 : m + 1, 1),
  ];' \
&& probar 'se ofrece una quincena que todavía no existe'

echo "== 6. la pantalla vuelve a nombrar «Otro rango» =="
mutar "$PANTALLA" '          <span className="text-xs text-gray-500">Quincena</span>' '          <span className="text-xs text-gray-500">Quincena · Otro rango</span>' \
&& probar 'el rango libre vuelve al vocabulario de la pantalla'

echo "== 7. el cartel del vacío vuelve a mandar al calendario =="
mutar "$PANTALLA" '            Toca la quincena arriba y después <b>Generar</b>.' '            Toca la quincena arriba —o un rango en «Otro rango»— y después <b>Generar</b>.' \
&& probar 'se promete una opción que no existe'

echo "== 8. la recomendación vuelve a hablar de un calendario que no está =="
mutar "$PANTALLA" '          <b>{fechaCorta(sugerido.inicio)}</b> — es la quincena que sigue arriba.' '          <b>{fechaCorta(sugerido.inicio)}</b> — está marcado en el calendario.' \
&& probar 'manda a mirar algo que se retiró'

echo "== 9. la recomendación pisa a quien ya eligió =="
mutar "$PANTALLA" '      {sugerido && !elegido && !pedido && (' '      {sugerido && !pedido && (' \
&& probar 'se sigue recomendando después de elegir'

echo "== 10. el borrado se vuelve un DELETE abierto =="
mutar "$SQL" '  DELETE FROM asistencia_planilla_guardada WHERE id = ANY(ids);' '  DELETE FROM asistencia_planilla_guardada WHERE quincena IS NULL;' \
&& probar 'se lleva por delante cualquier cabecera futura'

echo "== 11. el borrado deja de comprobar que no sean quincenas =="
mutar "$SQL" '    RAISE EXCEPTION '"'"'ABORTADO: % de las cabeceras nombradas SÍ es una quincena. No se borró nada.'"'"', con_quin;' '    RAISE NOTICE '"'"'hay % quincena(s), se borran igual'"'"', con_quin;' \
&& probar 'se podría borrar una quincena pagada'

echo "== 12. el borrado deja de comprobar los pagos de préstamo =="
mutar "$SQL" '  SELECT count(*) INTO con_pago FROM asistencia_planilla_prestamo
    WHERE planilla_id = ANY(ids);' '  con_pago := 0;' \
&& probar 'un pago quedaría huérfano y el saldo mentiría'

echo "== 13. la quincena de verdad entra a la lista de borrado =="
mutar "$SQL" "    '4996da0f-e861-4d93-93a6-753e1e6cb03b'   -- confecciones_boston 2026-08-15 → 2026-08-25 (cerrada)" "    '4996da0f-e861-4d93-93a6-753e1e6cb03b',  -- confecciones_boston 2026-08-15 → 2026-08-25 (cerrada)
    '55b47a9f-5e9f-40c8-aa3a-9ca053990aea'   -- fashion_wear 1-15 sep: ES UNA QUINCENA" \
&& probar 'se borra la única quincena de verdad'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '/** El corte que se PROPONE al elegir una quincena (13 o 28). "" si no hay. */' '/** El corte PROPUESTO al elegir una quincena (13 o 28). "" si no hay. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. el mes anterior se calcula con dos pasos (misma conducta) =="
mutar "$REGLA" '  const anteriorMes = m === 1 ? 12 : m - 1;
  const anteriorAnio = m === 1 ? a - 1 : a;' '  const esEnero = m === 1;
  const anteriorMes = esEnero ? 12 : m - 1;
  const anteriorAnio = esEnero ? a - 1 : a;' \
&& controlar 'la misma cuenta escrita con una variable'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

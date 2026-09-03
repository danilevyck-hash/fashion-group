#!/usr/bin/env bash
# Verificador de mutaciones: «vs 2025» de Ventas › Clientes corta el año
# anterior en los MISMOS DÍAS (migración 20260909120000 + espejo TS).
#
# Cada mutación tiene que poner ROJO el candado
# `clientes-vs-anio-anterior-mismos-dias.test.ts` (más los dos que leen la
# migración vigente). El control sin mutar tiene que dar 0.
#
# 🩸 Restaura por COPIA y no con `git checkout`: hay archivos NUEVOS en la rama.
# 🩸 El reemplazo es LITERAL con python (scripts/_mutar-aplicar.py), sin regex.
# 🩸 `mutar()` EXIGE que el archivo cambie, y `probar()` exige que vitest haya
# COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/clientes-vs-anio-anterior-mismos-dias.test.ts
  src/__tests__/lib/clientes-ytd.test.ts
  src/__tests__/components/ventas-mostrador-por-codigo.test.tsx
)
MIG=supabase/migrations/20260909120000_clientes_vs_anio_anterior_mismos_dias.sql
TS=src/lib/ventas/clientes-corte-comparativo.ts
ARCHIVOS=("$MIG" "$TS")
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre  [veces]
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" "${5:-1}" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

echo "== SQL: la vista del año en curso =="
mutar "$MIG" \
  "WHERE k.anio = cy.y - 1 AND k.fecha <= cp.d" \
  "WHERE k.anio = cy.y - 1 AND k.mes <= EXTRACT(MONTH FROM cp.d)::int" \
  'vuelve el corte a FIN de mes (mes <= …)'
mutar "$MIG" \
  "SELECT (c.d - INTERVAL '1 year')::date AS d FROM corte c" \
  "SELECT make_date(EXTRACT(YEAR FROM c.d)::int - 1, EXTRACT(MONTH FROM c.d)::int, EXTRACT(DAY FROM c.d)::int) AS d FROM corte c" \
  'rompe el 29 de febrero (make_date con el día tal cual)'
mutar "$MIG" \
  "SELECT (NOW() AT TIME ZONE 'America/Panama')::date AS d" \
  "SELECT CURRENT_DATE AS d" \
  'corta en UTC en vez de Panamá (CURRENT_DATE)'
mutar "$MIG" \
  "SELECT LEAST(COALESCE(MAX(k.fecha), h.d), h.d) AS d" \
  "SELECT h.d AS d" \
  'el corte es «hoy» a secas (le regala un día al año pasado en el refresh nocturno)'
mutar "$MIG" \
  "    WHERE k.anio = cy.y
    GROUP BY k.cliente_key, k.empresa" \
  "    WHERE k.anio = cy.y AND k.fecha <= (SELECT d FROM corte)
    GROUP BY k.cliente_key, k.empresa" \
  '«Compras 2026» se recorta (deja de ser todo lo cargado)'

echo "== SQL: la función de años cerrados =="
mutar "$MIG" \
  "WHERE k.anio = p_year - 1 AND k.fecha <= v_corte_prev" \
  "WHERE k.anio = p_year - 1 AND k.mes <= EXTRACT(MONTH FROM v_corte_prev)::int" \
  'la rama de años cerrados vuelve a cortar por mes'
mutar "$MIG" \
  "v_corte_prev := (v_corte - INTERVAL '1 year')::date" \
  "v_corte_prev := make_date(EXTRACT(YEAR FROM v_corte)::int - 1, EXTRACT(MONTH FROM v_corte)::int, EXTRACT(DAY FROM v_corte)::int)" \
  'rompe el 29 de febrero en la función'
mutar "$MIG" \
  "v_hoy      := (NOW() AT TIME ZONE 'America/Panama')::date" \
  "v_hoy      := CURRENT_DATE" \
  'la función corta en UTC'
mutar "$MIG" \
  "(del_grupo AND cliente_codigo = 'TCKCTA')" \
  "(del_grupo AND cliente_codigo = 'CONTADO')" \
  'el mostrador deja de reconocerse por su código (lo que 20260908 arregló se pierde)'

echo "== TS: el espejo de la regla =="
mutar "$TS" \
  "const corte = ultimaVentaCargada && ultimaVentaCargada < hoy ? ultimaVentaCargada : hoy;" \
  "const corte = hoy;" \
  'espejo: el corte es hoy a secas'
mutar "$TS" \
  "const hoy = hoyPanama(ahora);" \
  "const hoy = ahora.toISOString().slice(0, 10);" \
  'espejo: hoy en UTC'
mutar "$TS" \
  "return { corte, cortePrev: unAnioAntes(corte) };" \
  "return { corte, cortePrev: \`\${Number(corte.slice(0, 4)) - 1}\${corte.slice(4)}\` };" \
  'espejo: rompe el 29 de febrero (año − 1 con el mismo mes-día)'
mutar "$TS" \
  "return { corte, cortePrev: unAnioAntes(corte) };" \
  "return { corte, cortePrev: \`\${Number(corte.slice(0, 4)) - 1}-\${corte.slice(5, 7)}-31\`.replace(/-(0[2469]|11)-31$/, (m, mm) => \`-\${mm}-\${mm === '02' ? '28' : '30'}\`) };" \
  'espejo: vuelve el corte a fin de mes'

echo
echo "cazadas: $CAZ · sobrevivieron: $SOB · no mutaron/muertas: $NOOP"
[ "$SOB" -eq 0 ] && [ "$NOOP" -eq 0 ]

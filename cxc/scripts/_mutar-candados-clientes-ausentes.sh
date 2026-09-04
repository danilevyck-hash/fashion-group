#!/usr/bin/env bash
# Verificador de mutaciones — clientes ausentes de Switch (4-sep-2026).
#
# Lo que los candados tienen que cazar (el brief, textual):
#   marcar con una corrida fallida → rojo · marcar por una sola empresa → rojo ·
#   borrar en vez de marcar → rojo · que no vuelva al reaparecer → rojo ·
#   que el ausente siga en el selector → rojo.
#
# Mismo esqueleto que scripts/_mutar-candados-aprobador-empresa.sh (restaura por
# COPIA, reemplazo LITERAL con python, y probar() exige que vitest colecte).
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/clientes-ausentes-de-switch.test.ts
  src/__tests__/components/clientes-ausentes-selector-y-ficha.test.tsx
)
ARCHIVOS=(
  src/lib/clientes/ausentes.ts
  src/lib/switch-api/sync-clientes-master.ts
  src/lib/clientes/directorio-cache.ts
  src/lib/hooks/useBusquedaClientes.ts
  "src/app/api/catalogo/[marca]/clientes-switch/route.ts"
  src/app/api/clientes/route.ts
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
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

# ── la regla pura ─────────────────────────────────────────────────────────────

mutar src/lib/clientes/ausentes.ts \
  'return filas.every((f) => f.activo === false);' \
  'return filas.some((f) => f.activo === false);' \
  'ausente por UNA sola empresa (every → some)'

mutar src/lib/clientes/ausentes.ts \
  'if (filas.length === 0) return false;' \
  'if (filas.length === 0) return true;' \
  'sin filas en switch_clientes cuenta como ausente'

mutar src/lib/clientes/ausentes.ts \
  'if (d && (!max || d > max)) max = d;' \
  'if (d && (!max || d < max)) max = d;' \
  'la fecha es la primera empresa, no la última'

mutar src/lib/clientes/ausentes.ts \
  'return !c.ausente_desde;' \
  'return true;' \
  'todo es ofrecible (esOfrecible siempre true)'

# ── el sync: protecciones ─────────────────────────────────────────────────────

mutar src/lib/switch-api/sync-clientes-master.ts \
  'if (!hayDatoDeActivo) {' \
  'if (false) {' \
  'sin datos de activo igual marca/revive'

mutar src/lib/switch-api/sync-clientes-master.ts \
  'if (ausentes.length > byCodigo.size * MAX_FRACCION_AUSENTES) {' \
  'if (false) {' \
  'el freno del 10% no frena'

mutar src/lib/switch-api/sync-clientes-master.ts \
  '.update({ ausente_desde: fecha })' \
  '.delete()' \
  'BORRAR en vez de marcar'

mutar src/lib/switch-api/sync-clientes-master.ts \
  '      .in("codigo", codigos)
      .is("ausente_desde", null)' \
  '      .in("codigo", codigos)' \
  'la marca pisa una fecha ya escrita'

mutar src/lib/switch-api/sync-clientes-master.ts \
  'if (vivos.length > 0) {' \
  'if (false) {' \
  'no vuelve al reaparecer (revive apagado)'

mutar src/lib/switch-api/sync-clientes-master.ts \
  '    try {
      rows = await leerEspejo(false);
    } catch (e) {
      return { ok: false, ...empty, error: e instanceof Error ? e.message : String(e) };
    }' \
  '    rows = [];' \
  'una corrida FALLIDA sigue como si nada (rows = [])'

# ── las superficies ───────────────────────────────────────────────────────────

mutar src/lib/hooks/useBusquedaClientes.ts \
  '    .filter(esOfrecible)
    .filter((c) => coincideBusqueda(q, camposDeBusquedaCliente(c)))' \
  '    .filter((c) => coincideBusqueda(q, camposDeBusquedaCliente(c)))' \
  'el ausente sigue en el selector (filtrar sin esOfrecible)'

mutar src/lib/hooks/useBusquedaClientes.ts \
  'setHits(sinAusentesDeSwitch(Array.isArray(data.clientes) ? data.clientes : []));' \
  'setHits(Array.isArray(data.clientes) ? data.clientes : []);' \
  'el fallback al servidor ofrece ausentes'

mutar src/lib/clientes/directorio-cache.ts \
  'return datos.then(sinAusentesDeSwitch);' \
  'return datos;' \
  'la puerta única ofrece ausentes (Guías/Cheques/atar)'

mutar "src/app/api/catalogo/[marca]/clientes-switch/route.ts" \
  '    .eq("activo", true)
' \
  '' \
  'el selector de pedidos ofrece clientes borrados en Switch'

echo
echo "== resumen: $CAZ cazadas · $SOB sobrevivieron · $NOOP muertas =="
[ "$SOB" -eq 0 ] && [ "$NOOP" -eq 0 ]

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías: los DESTINOS del cliente como botones
# bajo el campo Dirección (4-sep-2026).
#
# Lo que se ataca: el agrupado EXACTO (que una diferencia de número jamás se
# junte), que el botón NUNCA se aplique solo, que el campo siga siendo texto
# libre, que lo borrado no cuente (los dos `deleted`), que la tabla de Daniel
# gane sobre el histórico, el tope de 6, la grafía más usada (nunca la
# normalizada), el orden por frecuencia, el separador de la tienda, el
# interruptor GUIAS_ATAJOS_NUEVOS y que la ruta de verdad mande los destinos.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS
# en la rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó en este repo.
#
# 🩸 EL PATRÓN QUE NO MUTA NADA SE DENUNCIA (⛔), no se canta como cazado. El
# reemplazo es LITERAL (scripts/_mutar-guias-aplicar.py) y exige que el texto
# viejo aparezca las veces que se le dicen. Hay una mutación de CONTROL que a
# propósito no matchea: si no sale ⛔, el denunciador está roto.
#
#   bash scripts/_mutar-candados-guias-destinos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

PURO="src/lib/guias/destinos-clientes.ts"
COMP="src/app/guias/components/DestinosDelCliente.tsx"
FORM="src/app/guias/components/GuiaForm.tsx"
RUTA="src/app/api/guias/frecuencias/route.ts"

ARCHIVOS=("$PURO" "$COMP" "$FORM" "$RUTA")
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

# La lista va como ARRAY: en zsh un string sin comillas NO se parte por
# espacios, le llegaría a vitest como UN argumento y correría 0 archivos.
TESTS=(
  "src/__tests__/lib/guias-destinos-cliente.test.ts"
  "src/__tests__/components/guia-form-destinos.test.tsx"
  "src/__tests__/lib/guias-frecuencias-ruta.test.ts"
)

cazadas=0; sueltas=0; muertos=0; n=0

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_err_dest; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_err_dest))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run "${TESTS[@]}" --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE, "0 fallos" se leería como "sobrevivió".
  if ! grep -qE "Tests +[0-9]" <<< "$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — $nombre"
    sueltas=$((sueltas+1)); restaurar; return
  fi
  local fallos
  fallos=$(grep -oE "Tests +[0-9]+ failed" <<< "$salida" | grep -oE "[0-9]+" | sed -n 1p)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos rojos) — $nombre"; cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"; sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ MUTACIONES — Guías · destinos del cliente ═══"

# ── el agrupado exacto ───────────────────────────────────────────────────────

mutacion "los DÍGITOS se caen de la clave (N2 y N3 se juntan — agrupar por parecido)" "$PURO" \
  'const digitos = (crudo.match(/\d+/g) ?? []).map((d) => String(Number(d))).join("|");' \
  'const digitos = "";'

mutacion "un renglón BORRADO vuelve a contar" "$PURO" \
  '    if (e.deleted) continue;
' \
  ''

mutacion "un renglón de una GUÍA borrada vuelve a contar (el otro deleted)" "$PURO" \
  '    if (!fechaDe.has(e.guia_id)) continue;
' \
  ''

# ── la tabla de Daniel y el histórico ────────────────────────────────────────

mutacion "el histórico PISA la tabla de Daniel (la definición deja de ganar)" "$PURO" \
  'if (definidos) return definidos.map((d) => d.destino);' \
  'if (definidos && (historicos ?? []).length === 0) return definidos.map((d) => d.destino);'

mutacion "el tope de 6 botones se cae" "$PURO" \
  'salida[codigo] = ordenados.slice(0, MAX_BOTONES_DESTINO).map((g) => {' \
  'salida[codigo] = ordenados.map((g) => {'

mutacion "se ofrece la grafía MENOS usada (o la normalizada ganaría igual)" "$PURO" \
  '          forma.c > mejor.c ||' \
  '          forma.c < mejor.c ||'

mutacion "el orden deja de ser por frecuencia" "$PURO" \
  '        b.total - a.total ||' \
  '        0 ||'

# ── «el de siempre» (4-sep-2026, mockup final) ───────────────────────────────

mutacion "la marca «el de siempre» SE IGNORA (nada se autollena para los definidos)" "$PURO" \
  '    const elDeSiempre = definidos.find((d) => d.elDeSiempre === true);' \
  '    const elDeSiempre = definidos.find(() => false);'

mutacion "se autollena el PRIMER definido aunque nadie lo haya marcado" "$PURO" \
  '    return elDeSiempre ? elDeSiempre.destino : null;' \
  '    return definidos[0].destino;'

# ── la tienda y su separador ─────────────────────────────────────────────────

mutacion "el separador de la tienda cambia (deja de decidirse en UN lugar)" "$PURO" \
  'return /^\d+$/.test(t) ? `${d} · tienda ${t}` : `${d} · ${t}`;' \
  'return /^\d+$/.test(t) ? `${d} - tienda ${t}` : `${d} - ${t}`;'

mutacion "las tiendas aparecen SIN destino elegido" "$COMP" \
  '{tiendas.length > 0 && (' \
  '{('

# ── el botón se toca, no se aplica solo — y el campo sigue libre ─────────────

mutacion "el botón SE APLICA SOLO (el destino se escribe sin tocarlo)" "$COMP" \
  'const tiendas = tiendasDelDestino(codigo, direccion, definidos);' \
  'const tiendas = tiendasDelDestino(codigo, direccion, definidos);
  if (base === "" && botones.length >= 1) onElegir(botones[0]);'

mutacion "el campo Dirección deja de ser editable" "$FORM" \
  'onChange={(e) => { onUpdateItem(idx, "direccion", e.target.value); marcarTocado(clave); }}' \
  'readOnly onChange={() => {}}'

# ── el interruptor y la ruta ─────────────────────────────────────────────────

mutacion "los botones ignoran GUIAS_ATAJOS_NUEVOS (apagarlo no apaga nada)" "$FORM" \
  '{GUIAS_ATAJOS_NUEVOS && (' \
  '{true && ('

mutacion "la ruta calcula los destinos y los TIRA (los botones quedan vacíos en silencio)" "$RUTA" \
  'const destinos = GUIAS_ATAJOS_NUEVOS ? destinosHistoricos(rows, guias) : {};' \
  'const destinos = {};'

# ── control del denunciador ──────────────────────────────────────────────────

mutacion "CONTROL (a propósito no matchea — tiene que salir ⛔)" "$PURO" \
  'este texto no existe en el archivo' \
  'nada'

echo ""
echo "═══ RESULTADO: $cazadas cazadas · $sueltas sueltas · $muertos patrones muertos (control incluido) · $n corridas ═══"

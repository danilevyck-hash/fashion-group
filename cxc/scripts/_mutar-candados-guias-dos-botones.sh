#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías: dos botones en la fila y la poda del
# workflow (25-ago-2026).
#
# Daniel: *"Dos botones en la fila: «Editar» y «Despachar», pero que haga
# sentido, siento que de TANTOS CAMBIOS no se entiende el workflow"*.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 Y EL SCRIPT DENUNCIA EL PATRÓN QUE NO MUTA NADA, en vez de cantarlo como
# "SOBREVIVIÓ". Un patrón que no matchea deja el archivo intacto: los tests
# pasan y eso se lee como un candado flojo — un rojo inventado sobre algo que
# nunca se puso a prueba. Ya pasó dos veces en este repo (un em-dash y un
# espacio fino) y una tercera acá, con `perl` y el delimitador `|`: el `||` del
# código real hacía que la mutación se PEGARA al principio del archivo.
# Por eso el reemplazo es LITERAL — `scripts/_mutar-guias-aplicar.py` — y exige
# que el texto viejo aparezca exactamente las veces que se le dicen.
#
#   bash scripts/_mutar-candados-guias-dos-botones.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/guias/components/GuiasList.tsx"
  "src/app/guias/components/DespachoForm.tsx"
  "src/app/guias/components/ListaEnvios.tsx"
  "src/app/guias/page.tsx"
  "src/app/guias/[id]/page.tsx"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/components/guias-entrega-directa.test.tsx \
src/__tests__/components/guias-sin-rechazo.test.tsx \
src/__tests__/components/guias-editar-en-la-misma-pantalla.test.tsx \
src/__tests__/components/guias-lista-unica-envios.test.tsx \
src/__tests__/components/guias-numero-transp-no-se-copia.test.tsx \
src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts"

cazadas=0; sueltas=0; muertos=0; n=0

LISTA="src/app/guias/components/GuiasList.tsx"
ENVIOS="src/app/guias/components/ListaEnvios.tsx"
PAGE_LISTA="src/app/guias/page.tsx"
PAGE_GUIA="src/app/guias/[id]/page.tsx"
DESPACHO="src/app/guias/components/DespachoForm.tsx"

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_err; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_err))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
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

echo "═══ MUTACIONES ═══"

# ── 1 · los dos botones de la fila ───────────────────────────────────────────

mutacion "la fila vuelve a UN SOLO botón (se va «Editar»)" "$LISTA" \
  'onClick={() => onEditar(expandedGuia.id)}' \
  'onClick={() => onDespachar(expandedGuia.id)}'

mutacion "la fila se queda sin «Despachar»" "$LISTA" \
  '{canEdit && !isDispatched && expandedGuia.estado === "Pendiente Bodega" && (' \
  '{false && canEdit && !isDispatched && expandedGuia.estado === "Pendiente Bodega" && ('

mutacion "«Despachar» llama a lo mismo que «Editar»" "$LISTA" \
  'onClick={() => onDespachar(expandedGuia.id)}' \
  'onClick={() => onEditar(expandedGuia.id)}'

mutacion "«Despachar» aparece en una guía que ya salió (Confirmada)" "$LISTA" \
  '{canEdit && !isDispatched && expandedGuia.estado === "Pendiente Bodega" && (' \
  '{canEdit && !isDispatched && (' 

mutacion "una guía DESPACHADA vuelve a ofrecer los dos botones" "$LISTA" \
  '&& !isDispatched &&' '&&' 2

# ── 2 · «Editar» tiene que ATERRIZAR en el formulario ────────────────────────

mutacion "«Editar» de la fila cae en la misma pantalla que «Despachar»" "$PAGE_LISTA" \
  'onEditar={(id) => router.push(`/guias/${id}?editar=1`)}' \
  'onEditar={(id) => router.push(`/guias/${id}`)}'

mutacion "la guía ignora el query y abre siempre en lectura" "$PAGE_GUIA" \
  'if (new URLSearchParams(window.location.search).get("editar") === "1") setEditando(true);' \
  'void 0;'

# ── 3 · el modo de entrega, una sola vez por pantalla ────────────────────────

mutacion "el bloque «Cómo sale» vuelve a dibujarse mientras se edita" "$PAGE_GUIA" \
  'mostrarModo={!enEdicion}' 'mostrarModo={true}'

mutacion "«Cómo sale» + «Cambiar» desaparece de la guía en LECTURA" "$DESPACHO" \
  'mostrarModo = true,' 'mostrarModo = false,'

# ── 4 · el N° del transportista en el acordeón de una despachada ─────────────

mutacion "el acordeón vuelve a leer el N° de la CABECERA" "$LISTA" \
  '{numerosTranspDeLaGuia(expandedGuia).join(", ") || "—"}' \
  '{sinCeroPelado(expandedGuia.numero_guia_transp) || "—"}'

mutacion "el acordeón muestra UNO SOLO cuando hay varios" "$LISTA" \
  '{numerosTranspDeLaGuia(expandedGuia).join(", ") || "—"}' \
  '{numerosTranspDeLaGuia(expandedGuia)[0] || "—"}'

# ── 5 · lo que NO se aflojó ──────────────────────────────────────────────────

mutacion "las cajas del N° vuelven a nacer con el de la cabecera" "$ENVIOS" \
  'value={numerosTransp[idx] ?? ""}' \
  'value={numerosTransp[idx] || String(numeroGuiaCabecera ?? "")}'

mutacion "el N° anotado al crear la guía deja de decirse" "$ENVIOS" \
  '{" "}Al crear la guía se anotó{" "}' '{" "}'

# 🩸 EL CONTROL DEL PROPIO SCRIPT: una mutación que a propósito no matchea
# nada. Si esto no sale ⛔, el denunciador está roto y todos los ✅ de arriba
# valen lo mismo que un barrido con el comentario adentro.
mutacion "(control) un patrón que no existe tiene que salir DENUNCIADO" "$LISTA" \
  'esto-no-existe-en-el-archivo' 'tampoco-esto'

echo
echo "═══ RESUMEN ═══"
echo "  intentadas: $n · cazadas: $cazadas · sobrevivieron: $sueltas · patrones muertos: $muertos"
# El control aporta EL único ⛔ esperado.
[ "$sueltas" -eq 0 ] && [ "$muertos" -eq 1 ]

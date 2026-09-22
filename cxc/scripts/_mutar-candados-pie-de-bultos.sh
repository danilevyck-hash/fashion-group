#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿EL CANDADO DEL PIE DE BULTOS CAZA DE VERDAD?
# (Guías › la lista — 22-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar, y mutaciones inocuas) tienen que
# quedar VERDES: un ✅ ahí significa que los candados fallan por otra razón y
# toda la corrida no dice nada.
#
# Lo que Daniel aprobó y no se puede volver a romper:
#   1. 🔴 El total de bultos del pie cuenta LO QUE SE VE — no las 236 guías.
#   2. 🔴 Sigue al BUSCADOR y al filtro de «solo pendientes», igual que el
#      conteo de guías de al lado. *«O el total sigue al filtro, o no hay
#      buscador»*.
#   3. 🔴 Se suman los bultos FINALES (`guia_items.bultos`), los que firmó el
#      transportista — nunca `bultos_original`, que es solo el rastro.
#   4. 🔴 La suma vive en UNA sola función (`sumarBultos`), que usan el pie de
#      la pantalla y la banda del total del Excel.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: con archivos NUEVOS en
# la rama git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-pie-de-bultos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/components/guias-pie-de-bultos.test.tsx \
src/__tests__/components/guias-lista-que-se-lee-sola.test.tsx \
src/__tests__/excel-exports-operacion.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/app/guias/components/GuiasList.tsx"
  "src/app/guias/components/excel-guias.ts"
  "src/lib/guias/pie-de-la-lista.ts"
  "src/app/api/guias/route.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta, encoding="utf-8").read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w", encoding="utf-8").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── CONTROLES ────────────────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En un
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
mutar "src/app/guias/components/GuiasList.tsx" \
  '<span data-testid="pie-bultos" className="tabular-nums font-medium">' \
  '<span data-testid="pie-bultos" className="tabular-nums font-semibold">' \
  "CONTROL 2 — la negrita del número del pie. Lo bueno es el 🔴"
mutar "src/lib/guias/pie-de-la-lista.ts" \
  'export function sumarBultos(guias: readonly GuiaConBultos[]): number {' \
  'export function sumarBultos(guias: readonly GuiaConBultos[] = []): number {' \
  "CONTROL 3 — un valor por defecto de más en la firma. Lo bueno es el 🔴"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. EL TOTAL SIN FILTRAR (lo de antes) ────────────────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const totalBultos = sumarBultos(mostradas);' \
  '                const totalBultos = sumarBultos(filtered);' \
  "1.1 🩸 EL DEFECTO ORIGINAL — el total vuelve a sumar lo que está detrás del botón"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const totalBultos = sumarBultos(mostradas);' \
  '                const totalBultos = sumarBultos(guias);' \
  "1.2 el total suma TODAS las guías vivas, sin filtro ni ventana"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const mostradas = [...pendientes, ...visible];' \
  '                const mostradas = [...pendientes, ...visible, ...viejas];' \
  "1.3 lo que espera detrás del botón se cuela en la lista del pie"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const mostradas = [...pendientes, ...visible];' \
  '                const mostradas = [...visible];' \
  "1.4 lo PENDIENTE de arriba deja de contarse (se ve y no suma)"

mutar "src/app/guias/components/GuiasList.tsx" \
  '{textoPieDeLista(mostradas.length, guias.length)}' \
  '{textoPieDeLista(filtered.length, guias.length)}' \
  "1.5 el conteo de guías se despega de la lista dibujada"

echo "── 2. EL TOTAL QUE IGNORA LA BÚSQUEDA ───────────────────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const filtered = filtrarGuias(guias);

                if (filtered.length === 0) {' \
  '                const filtered = guias;

                if (filtered.length === 0) {' \
  "2.1 🩸 la lista deja de filtrar por lo tecleado (pantalla y total)"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const totalBultos = sumarBultos(mostradas);' \
  '                const totalBultos = sumarBultos(guias.filter((g) => !showPending || g.estado === "Pendiente Bodega"));' \
  "2.2 🩸 el total mira el filtro de pendientes pero NO el buscador"

mutar "src/lib/guias/pie-de-la-lista.ts" \
  '  return guias.reduce((suma, g) => suma + (Number(g.total_bultos) || 0), 0);' \
  '  return guias.slice(0, 1).reduce((suma, g) => suma + (Number(g.total_bultos) || 0), 0);' \
  "2.3 la suma se queda con la primera guía y se olvida del resto"

echo "── 3. LOS BULTOS ORIGINALES EN VEZ DE LOS CORREGIDOS ────────────────────"

mutar "src/app/api/guias/route.ts" \
  'total_bultos: (g.guia_items || []).reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0),' \
  'total_bultos: (g.guia_items || []).reduce((s: number, i: { bultos: number; bultos_original?: number | null }) => s + (i.bultos_original ?? i.bultos ?? 0), 0),' \
  "3.1 🔴 la ruta sirve lo que contó la secretaria, no lo que firmó el transportista"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const totalBultos = sumarBultos(mostradas);' \
  '                const totalBultos = mostradas.reduce((s, g) => s + (g.guia_items || []).reduce((a, i) => a + ((i as { bultos_original?: number | null }).bultos_original ?? i.bultos ?? 0), 0), 0);' \
  "3.2 🔴 el pie se arma su propia cuenta con los bultos ORIGINALES"

mutar "src/lib/guias/pie-de-la-lista.ts" \
  '/** Los bultos FINALES de la guía: la suma de `guia_items.bultos`. */
  total_bultos?: number | null;' \
  '/** Los bultos FINALES de la guía: la suma de `guia_items.bultos`. */
  total_bultos?: number | null;
  guia_items?: Array<{ bultos?: number | null; bultos_original?: number | null }> | null;' \
  "3.3 (aditiva) la suma común aprende a ver el rastro — antesala de sumarlo"

echo "── 4. DOS SUMAS OTRA VEZ ────────────────────────────────────────────────"

mutar "src/app/guias/components/excel-guias.ts" \
  '  const totalBultos = sumarBultos(guias);' \
  '  const totalBultos = guias.reduce((s, g) => s + (g.total_bultos || 0), 0);' \
  "4.1 el Excel vuelve a tener su propia copia de la suma"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const totalBultos = sumarBultos(mostradas);' \
  '                const totalBultos = mostradas.reduce((s, g) => s + (g.total_bultos || 0), 0);' \
  "4.2 la pantalla vuelve a tener su propia copia de la suma"

echo "── 5. LO QUE NO SE TOCA ─────────────────────────────────────────────────"

mutar "src/app/guias/components/excel-guias.ts" \
  '  const totalBultos = sumarBultos(guias);' \
  '  const totalBultos = sumarBultos(guias.filter((g) => (g.guia_items || []).length > 0));' \
  "5.1 la guía SIN renglones deja de aportar sus bultos al total del Excel"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const { recientes, viejas } = partirGuiasParaLaLista(filtered, new Date(), search);' \
  '                const { recientes, viejas } = partirGuiasPorVentana(filtered, new Date());' \
  "5.2 buscar vuelve a recortar la ventana (la guía vieja no aparece ni suma)"

echo
echo "────────────────────────────────────────────────────────────────────────"
echo "CONTROLES que fallaron (tiene que ser 0): $control_fallos"
echo "MUTACIONES cazadas: $cazadas · sobrevivientes: $sobrevivientes"

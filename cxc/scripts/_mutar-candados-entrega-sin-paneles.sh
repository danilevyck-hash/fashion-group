#!/usr/bin/env zsh
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — "Paneles deja de ser obligatorio en la entrega
# de muebles" (23-ago-2026).
#
# Se rompe el arreglo, a propósito y de a UNO, y se exige que algún test se
# ponga ROJO. Un candado que no caza su propia mutación no es un candado.
#
# Lo que se prueba que está cazado:
#   1. Que PANELES vuelva a ser obligatorio (el freno, el texto y el `min`).
#   2. Que se pueda guardar una entrega VACÍA (en la pantalla y en el servidor).
#   3. Que el stock se descuente en BULTOS en vez de piezas.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS
#   en esta rama y git aborta el comando entero sin restaurar nada, así que las
#   mutaciones se apilarían y ninguna se probaría por separado.
#
# 🩸 SIN `perl` — el reemplazo lo hace `scripts/_mutar.py`, que compara LITERAL
#   y REVIENTA si el texto no estaba. Una mutación que no se aplica se reporta
#   como "SOBREVIVIÓ" y termina acusando al candado de un bug del script. (Y de
#   paso desaparece el problema de elegir delimitador: no hay `s|…|…|`.)
#
# 🩸 ESTE SCRIPT ES zsh, Y zsh NO PARTE POR ESPACIOS UNA VARIABLE SIN COMILLAS.
#   `npx vitest run $TESTS` le pasaría a vitest UN solo argumento con toda la
#   lista adentro, vitest no encontraría ese archivo, correría **0 archivos** y
#   0 fallos se leería como "SOBREVIVIÓ". Eso dio 6 falsos "no cazada" el
#   23-ago-2026. Por eso va `${=TESTS}` (partir en palabras, explícito) y por
#   eso `probar()` EXIGE que la corrida haya tocado al menos 1 archivo.
#
#   zsh scripts/_mutar-candados-entrega-sin-paneles.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/components/marketing/EntregaForm.tsx"
  "src/lib/marketing/inventario.ts"
  "src/lib/marketing/piezas-bultos.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
# 🩸 EXIT NO ALCANZA. Este script se corrió una vez con `| head -5` y head cerró
#   la tubería: SIGPIPE mató el proceso en medio de una mutación y el archivo
#   quedó MUTADO en el árbol de trabajo (los tests pasaron a fallar "solos" y
#   parecía un bug del arreglo). Por eso se atrapan también INT, TERM y PIPE.
#   Aun así: NO PIPEES ESTE SCRIPT A `head`. Redirigí a un archivo y leelo.
trap restaurar EXIT INT TERM PIPE

TESTS="src/__tests__/components/marketing-entrega-form.test.tsx \
src/__tests__/components/marketing-reclamos-toques.test.tsx \
src/__tests__/lib/marketing-stock-piezas.test.ts \
src/__tests__/lib/marketing-piezas-bultos.test.ts \
src/__tests__/lib/poda-textos-ayuda.test.ts"

cazadas=0; sueltas=0; n=0; ROTA=0

mutar() {
  if ! python3 scripts/_mutar.py "$1" "$2" "$3"; then
    echo "  ⚠️  SCRIPT ROTO: la mutación no se aplicó en $1"
    ROTA=1
  fi
}

probar() {
  n=$((n+1))
  local nombre="$1"
  if [ "$ROTA" = "1" ]; then
    echo "  ⚠️  SALTEADA (la mutación no se aplicó) — $nombre"
    sueltas=$((sueltas+1)); ROTA=0; restaurar; return
  fi
  local salida
  # ⚠️ `${=TESTS}` — ver el encabezado. Sin el `=`, zsh manda un solo argumento.
  salida=$(npx vitest run ${=TESTS} --reporter=dot 2>&1)

  # 🩸 Si la corrida MUERE, el resumen no existe y "0 fallos" se leería como
  # "sobrevivió". Se exige encontrar el renglón de vitest.
  if [[ ! "$salida" =~ 'Tests[[:space:]]+[0-9]+' ]]; then
    echo "  ⚠️  LA CORRIDA MURIÓ — $nombre"
    sueltas=$((sueltas+1)); restaurar; return
  fi

  # 🔴 Y si corrió 0 ARCHIVOS, tampoco prueba nada: es el bug de `$TESTS` sin
  # partir. Un "0 fallos" con 0 archivos es la mentira más cara del script.
  # El TOTAL de archivos es el número entre paréntesis del renglón "Test Files"
  # ("Test Files  1 failed | 4 passed (5)"). El primer número de ese renglón NO
  # sirve: es el de la primera categoría, que cambia según haya fallos o no.
  local archivos
  archivos=$(printf '%s' "$salida" | grep -oE "Test Files.*\(([0-9]+)\)" | grep -oE "\([0-9]+\)$" | tr -d '()' | head -1)
  archivos=${archivos:-0}
  if [ "$archivos" -lt 1 ]; then
    echo "  ⚠️  VITEST CORRIÓ 0 ARCHIVOS — el script está roto, no el candado"
    sueltas=$((sueltas+1)); restaurar; return
  fi

  local fallos
  fallos=$(printf '%s' "$salida" | grep -oE "Tests +[0-9]+ failed" | grep -oE "[0-9]+" | head -1)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos tests rojos, $archivos archivos) — $nombre"
    cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"
    sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── 1. Paneles vuelve a ser OBLIGATORIO ─────────────────────────────────────
mutar src/components/marketing/EntregaForm.tsx \
  'const puedeGuardar = marcasOk && tieneAlMenosUno && !guardando;' \
  'const puedeGuardar = trunc(Number(panelesStr)) >= 1 && marcasOk && tieneAlMenosUno && !guardando;'
probar "el botón vuelve a apagarse cuando no hay paneles"

mutar src/components/marketing/EntregaForm.tsx \
  '    if (marcasSel.length === 0) f.push("al menos una marca");' \
  '    if (trunc(Number(panelesStr)) < 1) f.push("la cantidad de paneles");
    if (marcasSel.length === 0) f.push("al menos una marca");'
probar "el 'Falta:' vuelve a reclamar la cantidad de paneles"

mutar src/components/marketing/EntregaForm.tsx \
  '                <div className="flex items-end gap-2">' \
  '                <p className="text-xs text-gray-500 -mt-1">
                  <span className="text-red-500">*</span> Obligatorio — sin
                  paneles no se puede registrar la entrega.
                </p>
                <div className="flex items-end gap-2">'
probar "el texto 'Obligatorio — sin paneles' vuelve a la pantalla"

mutar src/components/marketing/EntregaForm.tsx \
  '                      min={0}
                      step={1}
                      value={panelesStr}' \
  '                      min={1}
                      step={1}
                      value={panelesStr}'
probar "el campo vuelve a exigir min=1 (el navegador lo marcaría inválido)"

# ── 2. Se puede guardar una entrega VACÍA ───────────────────────────────────
mutar src/components/marketing/EntregaForm.tsx \
  'const puedeGuardar = marcasOk && tieneAlMenosUno && !guardando;' \
  'const puedeGuardar = marcasOk && !guardando;'
probar "la pantalla deja guardar una entrega sin ningún producto"

mutar src/components/marketing/EntregaForm.tsx \
  '    if (!tieneAlMenosUno) f.push("al menos un producto con cantidad");' ''
probar "el botón apagado deja de decir que falta un producto"

mutar src/lib/marketing/inventario.ts \
  '  const items = normalizarItems(input.items ?? []);
  if (items.length === 0) {
    throw new Error("La entrega debe tener al menos un item");
  }' \
  '  const items = normalizarItems(input.items ?? []);'
probar "el SERVIDOR deja de frenar la entrega vacía"

# ── 3. El stock se descuenta en BULTOS ──────────────────────────────────────
mutar src/lib/marketing/piezas-bultos.ts \
  '  return normalizarPiezas(renglon.piezas);' \
  '  return normalizarBultos(renglon.bultos) ?? normalizarPiezas(renglon.piezas);'
probar "🔴 piezasParaStock devuelve BULTOS — el stock se descuadra"

mutar src/lib/marketing/inventario.ts \
  '        ? piezasParaStock({ piezas: it.cantidad, bultos: it.bultos })' \
  '        ? Number(it.bultos ?? it.cantidad)'
probar "🔴 la aritmética de stock lee el campo bultos directo"

echo
echo "═══ RESULTADO: $cazadas cazadas de $n ═══"
[ "$sueltas" -eq 0 ] || echo "🔴 $sueltas sin cazar"

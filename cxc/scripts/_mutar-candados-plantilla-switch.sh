#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «PLANTILLA SWITCH» CAZAN DE VERDAD? (8-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar) tienen que quedar VERDES: una ✅ ahí
# significa que los candados fallan por otra razón y el resto no dice nada.
#
# Lo que este trabajo dejó puesto y no se puede volver a romper:
#   1. El módulo se llama «Plantilla Switch» en pantalla; la key sigue `cargar`.
#   2. La tabla de talla de la pestaña «Reglas» SALE DEL CÓDIGO (CASOS_TALLA y
#      CASOS_TALLA_REEBOK), no de una lista tecleada que se separa sola.
#   3. El short de baño se mide en LETRA (M), no en 41 de zapato ni 32 de pantalón.
#   4. La secretaria puede QUITAR una descripción — desactivando, nunca borrando.
#   5. La tabla de nombres muestra LO QUE SALE AL EXCEL, y solo las 10 que hacen
#      falta.
#   6. Las dos mitades del veredicto solo valen DENTRO DE LA MISMA MARCA.
#   7. Las 7 marcas sin descripciones se MUESTRAN, diciendo qué les pasa.
#
# 🩸 La restauración va por COPIA, no con `git checkout`: hay archivos NUEVOS y
# git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE encontrar el resumen de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-plantilla-switch.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/plantilla-switch.test.ts \
src/__tests__/plantilla-switch-pantalla.test.tsx \
src/__tests__/depurador-veredicto.test.ts \
src/__tests__/depurador-validate.test.ts \
src/__tests__/reebok-depurador.test.ts \
src/__tests__/components/poda-textos-explicaciones.test.tsx \
src/__tests__/lib/depurador-pestanas-rediseno.test.ts \
src/__tests__/lib/poda-textos-cxc-multifashion.test.ts"

ARCHIVOS=(
  "src/lib/modules.ts"
  "src/lib/depurador/logic.ts"
  "src/lib/depurador/talla.ts"
  "src/lib/depurador/celda.ts"
  "src/lib/depurador/reebok.ts"
  "src/lib/depurador/veredicto.ts"
  "src/lib/depurador/tienda.ts"
  "src/lib/hooks/useCatalogoDescripciones.ts"
  "src/app/productos/cargar/page.tsx"
  "src/app/productos/cargar/ReglasView.tsx"
  "src/app/productos/cargar/DepuradorClient.tsx"
  "src/app/api/productos/cargar/descripciones/route.ts"
  "src/app/api/productos/cargar/descripciones/[id]/route.ts"
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
# `\n` en el reemplazo = salto de línea de verdad (bash lo pasa literal).
viejo, nuevo = viejo.replace("\\n", "\n"), nuevo.replace("\\n", "\n")
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── CONTROL 1 (sin mutar) ────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En el
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control_1=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. EL NOMBRE DEL MÓDULO ──────────────────────────────────────────────"

# 1.1 El módulo vuelve a llamarse «Depurador» en el home y el menú.
mutar "src/lib/modules.ts" \
  'label: "Plantilla Switch",  href: "/productos/cargar"' \
  'label: "Depurador",         href: "/productos/cargar"' \
  "el módulo vuelve a llamarse Depurador"

# 1.2 El encabezado (breadcrumb + barra del celular) vuelve a decir Depurador.
mutar "src/app/productos/cargar/page.tsx" \
  '<AppHeader module="Plantilla Switch" />' \
  '<AppHeader module="Depurador" />' \
  "el encabezado vuelve a decir Depurador"

# 1.3 El h1 sr-only vuelve al nombre viejo.
mutar "src/app/productos/cargar/DepuradorClient.tsx" \
  '<h1 className="sr-only">Plantilla Switch</h1>' \
  '<h1 className="sr-only">Depurador de Productos</h1>' \
  "el h1 sr-only vuelve a decir Depurador de Productos"

# 1.4 El rótulo del ámbito de fórmulas vuelve a decir Depurador.
mutar "src/app/productos/cargar/page.tsx" \
  '>Plantilla (importación)</TabBtn>' \
  '>Depurador (importación)</TabBtn>' \
  "el ámbito de fórmulas vuelve a decir Depurador"

# 1.5 Alguien renombra la KEY del módulo (rompe role_permissions).
mutar "src/lib/modules.ts" \
  '{ key: "cargar",         label: "Plantilla Switch"' \
  '{ key: "plantilla",      label: "Plantilla Switch"' \
  "la key del modulo cambia de cargar a otra cosa"

echo "── 2. LA TABLA DE TALLA SALE DEL CÓDIGO ─────────────────────────────────"

# 2.1 La pantalla se teclea otra vez su propia tabla.
mutar "src/app/productos/cargar/ReglasView.tsx" \
  '              {[...CASOS_TALLA, CASO_TALLA_RESTO].map((r) => (' \
  '              {[{ caso: "Calzado hombre", detecta: "a mano", talla: "41" }].map((r) => (' \
  "la pantalla vuelve a teclear la tabla de talla"

# 2.2 La tabla promete una talla y la regla devuelve otra.
mutar "src/lib/depurador/talla.ts" \
  '    talla: "41",\n    familia: "calzado",' \
  '    talla: "42",\n    familia: "calzado",' \
  "la tabla dice 41 y la regla da otra cosa"

# 2.3 La talla por defecto deja de ser M.
mutar "src/lib/depurador/talla.ts" \
  'export const TALLA_POR_DEFECTO = "M";' \
  'export const TALLA_POR_DEFECTO = "L";' \
  "la talla por defecto deja de ser M"

# 2.4 Kids deja de ser aditivo (se lleva el turno y tapa al calzado).
mutar "src/lib/depurador/talla.ts" \
  '    exclusiva: false, // no se lleva el turno' \
  '    exclusiva: true, // no se lleva el turno' \
  "Kids se vuelve exclusivo y tapa los demás casos"

# 2.5 Reebok: la tabla de la pantalla se separa de casoTallaReebok.
mutar "src/lib/depurador/reebok.ts" \
  '  if (!esFootwear(it.department)) return "ropa";' \
  '  if (!esFootwear(it.department)) return "calzado-kids";' \
  "Reebok: la ropa deja de caer en su caso"

# 2.6 Reebok: la pantalla vuelve a teclear su lista.
mutar "src/app/productos/cargar/ReglasView.tsx" \
  '            {CASOS_TALLA_REEBOK.map((r) => (' \
  '            {[{ id: "x", caso: "Footwear · Male", talla: "9" }].map((r) => (' \
  "Reebok: la pantalla vuelve a teclear su lista"

echo "── 3. EL SHORT DE BAÑO SE MIDE EN LETRA ─────────────────────────────────"

# 3.1 SWIMSHO vuelve a la lista de CALZADO (el defecto original).
mutar "src/lib/depurador/talla.ts" \
  '"MOCASIN"];' \
  '"MOCASIN", "SWIMSHO"];' \
  "SWIMSHO vuelve a la lista de calzado"

# 3.2 La familia «letra» se vacía: el short de baño cae en BOTTOMS (32).
mutar "src/lib/depurador/talla.ts" \
  'const TALLA_LETRA = ["SWIMSHO"];' \
  'const TALLA_LETRA: string[] = [];' \
  "la familia letra se vacía y el baño cae en pantalón"

# 3.3 «letra» deja de ir PRIMERA: BOTTOMS le gana y el baño pide la 32.
mutar "src/lib/depurador/talla.ts" \
  '  { id: "letra", palabras: TALLA_LETRA },\n  { id: "calzado", palabras: FOOTWEAR },\n  { id: "bottom", palabras: BOTTOMS },' \
  '  { id: "bottom", palabras: BOTTOMS },\n  { id: "calzado", palabras: FOOTWEAR },\n  { id: "letra", palabras: TALLA_LETRA },' \
  "la familia letra deja de tener prioridad"

# 3.4 El caso del baño deja de estar acotado a su familia: se lleva TODO.
mutar "src/lib/depurador/talla.ts" \
  '    familia: "letra",\n    genero: null,\n    exclusiva: true,' \
  '    familia: null,\n    genero: null,\n    exclusiva: true,' \
  "el caso del baño se aplica a todo, no solo a su familia"

echo "── 4. LA SECRETARIA PUEDE QUITAR UNA DESCRIPCIÓN ────────────────────────"

# 4.1 La puerta vuelve a ser solo-admin.
mutar "src/app/api/productos/cargar/descripciones/[id]/route.ts" \
  'const ALLOWED = ["admin", "secretaria"];' \
  'const ALLOWED = ["admin"];' \
  "el PATCH vuelve a ser solo de admin"

# 4.2 Quitar pasa a BORRAR de verdad.
mutar "src/app/api/productos/cargar/descripciones/[id]/route.ts" \
  '    .update({ activa: body.activa })' \
  '    .delete()' \
  "quitar pasa a ser un DELETE"

# 4.3 La lectura deja de traer el id: la pantalla se queda sin poder quitar.
mutar "src/app/api/productos/cargar/descripciones/route.ts" \
  '  return NextResponse.json({ catalogo, filas });' \
  '  return NextResponse.json({ catalogo });' \
  "la lectura deja de traer el id de cada descripción"

# 4.4 La pantalla manda `activa: true` (prende en vez de quitar).
mutar "src/app/productos/cargar/ReglasView.tsx" \
  'body: JSON.stringify({ activa: false }),' \
  'body: JSON.stringify({ activa: true }),' \
  "el botón de quitar prende en vez de quitar"

# 4.5 El botón de quitar pierde los 44 px.
mutar "src/app/productos/cargar/ReglasView.tsx" \
  'className="inline-flex h-[44px] w-[32px] items-center justify-center' \
  'className="inline-flex h-[20px] w-[32px] items-center justify-center' \
  "el botón de quitar baja de 44 px"

echo "── 5. LA TABLA DE NOMBRES DICE LO QUE SALE AL EXCEL ─────────────────────"

# 5.1 La fila vuelve a mostrar el valor CRUDO del mapa (la que mentía).
mutar "src/lib/depurador/logic.ts" \
  '    const limpia = normalizeDescripcion(sucia);' \
  '    const limpia = NORMALIZACION[sucia];' \
  "la tabla vuelve a leer el mapa crudo"

# 5.2 Se muestran las 22, incluidas las 12 que los principios ya resuelven.
mutar "src/lib/depurador/logic.ts" \
  '    if (applyPrinciples(sucia.trim()) === limpia) continue;' \
  '    if (false) continue;' \
  "se muestran las 22 en vez de las 10"

# 5.3 La pantalla vuelve a teclear la lista en vez de pedirla.
mutar "src/app/productos/cargar/ReglasView.tsx" \
  '  const correcciones = useMemo(() => reglasDeNormalizacionQueHacenFalta(), []);' \
  '  const correcciones = useMemo(() => [{ sucia: "A", limpia: "B" }], []);' \
  "la pantalla vuelve a teclear las correcciones"

# 5.4 Los 8 principios vuelven a la pantalla (ya no es minimalista).
mutar "src/app/productos/cargar/ReglasView.tsx" \
  '        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-teal-800">Cómo se elige la talla</h3>' \
  '        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-teal-800">Principios de limpieza</h3>' \
  "vuelve el título de los principios de limpieza"

echo "── 6. LAS DOS MITADES SOLO VALEN DENTRO DE LA MISMA MARCA ───────────────"

# 6.1 Se apaga el interruptor: vuelve el defecto que tapaba la casi-gemela.
mutar "src/lib/depurador/veredicto.ts" \
  'export const MITADES_POR_MARCA = true;' \
  'export const MITADES_POR_MARCA = false;' \
  "se apaga el interruptor de mitades por marca"

# 6.2 Las mitades vuelven a mirar TODO el catálogo aunque venga la marca.
mutar "src/lib/depurador/veredicto.ts" \
  '  const mitades: MitadesConocidas = deLaMarca ?? { izquierdas: idx.izquierdas, derechas: idx.derechas };' \
  '  const mitades: MitadesConocidas = { izquierdas: idx.izquierdas, derechas: idx.derechas };' \
  "las mitades vuelven a mirar todo el catálogo"

# 6.3 El índice por marca se llena con TODO junto (una sola bolsa).
mutar "src/lib/depurador/veredicto.ts" \
  '    const km = claveMarca(marca);' \
  '    const km = "todas";' \
  "el índice por marca vuelve a ser una sola bolsa"

# 6.4 El llamador del Depurador deja de pasar la marca.
mutar "src/app/productos/cargar/DepuradorClient.tsx" \
  'veredictoDescripcion(desc, catalogo, marca)' \
  'veredictoDescripcion(desc, catalogo)' \
  "el Depurador deja de pasarle la marca al veredicto"

# 6.5 Facturas Tienda deja de pasar la marca.
mutar "src/lib/depurador/tienda.ts" \
  'veredictoDescripcion(desc, cfg.catalogo, marca)' \
  'veredictoDescripcion(desc, cfg.catalogo)' \
  "Facturas Tienda deja de pasarle la marca al veredicto"

# 6.6 «ya-existe» se acota a la marca (NO se debía tocar).
mutar "src/lib/depurador/veredicto.ts" \
  '  const existente = idx.completas.get(clave(normalizada));' \
  '  const existente = undefined as string | undefined;' \
  "«ya-existe» deja de mirar todo el catálogo"

echo "── 7. LAS MARCAS VACÍAS SE VEN, DICIENDO QUÉ LES PASA ───────────────────"

# 7.1 La marca vacía se esconde (Daniel: «no se esconden»).
mutar "src/app/productos/cargar/ReglasView.tsx" \
  '              return { marca: c.marca, ds, todas, visible: nombreCoincide || ds.length > 0 };' \
  '              return { marca: c.marca, ds, todas, visible: todas.length > 0 };' \
  "las marcas vacías se esconden"

# 7.2 Vuelve el «(0)» pelado en vez de decir qué pasa.
mutar "src/app/productos/cargar/ReglasView.tsx" \
  'export const SIN_DESCRIPCIONES = "Todavía sin descripciones cargadas";' \
  'export const SIN_DESCRIPCIONES = "(0)";' \
  "vuelve el (0) pelado"

# 7.3 El buscador deja de mirar las descripciones (solo el nombre de la marca).
mutar "src/app/productos/cargar/ReglasView.tsx" \
  '              const ds = nombreCoincide ? todas : todas.filter((d) => norm(d).includes(s));' \
  '              const ds = todas;' \
  "el buscador deja de buscar en las descripciones"

echo "── CONTROLES QUE NO DEBEN CAZARSE ───────────────────────────────────────"
# Cambios INOCENTES: si el candado se pone rojo acá, está mirando de más.
restaurar
cazadas_reales=$cazadas
sobrevivientes_reales=$sobrevivientes
cazadas=0; sobrevivientes=0

# C1. Un comentario cualquiera: no cambia una sola conducta.
mutar "src/lib/depurador/talla.ts" \
  '/** Familia de talla de una descripción: de qué se mide el artículo. */' \
  '/** Familia de talla (comentario cambiado a propósito, control). */' \
  "CONTROL inocente — cambiar un comentario (NO debe cazarse)"
control_inocente_1=$cazadas
cazadas=0; sobrevivientes=0

# C2. Un color de la pantalla: se ve distinto, no dice nada distinto.
mutar "src/app/productos/cargar/ReglasView.tsx" \
  'className="hover:bg-teal-50"' \
  'className="hover:bg-stone-50"' \
  "CONTROL inocente — cambiar un color (NO debe cazarse)"
control_inocente_2=$cazadas

echo "── CONTROL 2 (sin mutar, después de restaurar todo) ─────────────────────"
restaurar
cazadas=0; sobrevivientes=0
probar "CONTROL 2 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control_2=$cazadas

echo "─────────────────────────────────────────────────────────────────────────"
echo "CONTROL 1: $control_1 · CONTROL 2: $control_2 (los dos tienen que ser 0)"
echo "CONTROLES INOCENTES: $control_inocente_1 y $control_inocente_2 (los dos tienen que ser 0)"
echo "RESULTADO: $cazadas_reales cazadas · $sobrevivientes_reales sobrevivientes"
[ "$sobrevivientes_reales" -eq 0 ] && [ "$control_1" -eq 0 ] && [ "$control_2" -eq 0 ] \
  && [ "$control_inocente_1" -eq 0 ] && [ "$control_inocente_2" -eq 0 ] \
  && echo "✅ TODAS CAZADAS" || echo "🔴 REVISAR"

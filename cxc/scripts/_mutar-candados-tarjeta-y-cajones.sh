#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE LA TARJETA, LOS RÓTULOS Y LOS CAJONES CAZAN DE VERDAD?
# (22-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. El CONTROL (sin mutar) tiene que quedar VERDE: una ✅ ahí
# significa que los candados fallan por otra razón y el resto no dice nada.
#
# Lo que este trabajo dejó puesto y no se puede volver a romper:
#   1. Tommy y Calvin NO dibujan el nombre del producto (19 nombres para 455
#      productos · 6 para 82), y el CÓDIGO encabeza la tarjeta.
#      🔴 Y el error INVERSO: Reebok y Joybees SÍ lo dibujan.
#   2. La diferencia es un DATO DEL TEMA, nunca un `if` con el nombre de la marca.
#   3. Español SOLO en Joybees y Reebok: «Niños», con eñe. Tommy y Calvin se
#      quedan en inglés.
#   4. Los chips de Joybees suman 81: los 28 huérfanos tienen cajón.
#   5. Un chip en CERO no se dibuja (Calvin dibujaba cuatro).
#   6. La caja de la foto sale de MEDIR las fotos de cada marca, y la foto nunca
#      se recorta para llenarla.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: este trabajo trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-tarjeta-y-cajones.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/catalogo-la-foto-manda.test.ts \
src/__tests__/lib/catalogo-la-foto-aprovecha-su-caja.test.ts \
src/__tests__/components/catalogo-tarjeta-nombre-por-marca.test.tsx \
src/__tests__/catalogo-cards-paridad.test.ts \
src/__tests__/lib/catalogo-admin-una-lista.test.ts \
src/__tests__/lib/catalogo-escondidos-y-solo-lectura.test.tsx"

ARCHIVOS=(
  "src/lib/catalogo/marcas-ui.tsx"
  "src/lib/catalogo/stock-en-la-tarjeta.ts"
  "src/lib/catalogos/admin-chips.ts"
  "src/lib/reebok-gender.ts"
  "src/components/catalogo/CatalogoProductCard.tsx"
  "src/components/catalogo/CatalogoGroupedCard.tsx"
  "src/components/catalogo/CatalogoStockLine.tsx"
  "src/components/catalogo/groupByModel.ts"
  "src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx"
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

echo "── CONTROL (sin mutar) ──────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En el
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
cazadas=0; sobrevivientes=0

echo "── 1. EL NOMBRE VUELVE A TOMMY Y A CALVIN ───────────────────────────────"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    // 🔴 Tommy: 19 nombres para 455 productos. La línea repetía el encabezado\n    // de sección, así que manda el CÓDIGO. Ver `nombreEnLaTarjeta`.\n    nombreEnLaTarjeta: false,' \
  '    nombreEnLaTarjeta: true,' \
  "Tommy vuelve a dibujar el nombre («Women-Sneakers» ×97)"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    // 🔴 Calvin: 6 nombres para 82 productos. Igual que Tommy.\n    nombreEnLaTarjeta: false,' \
  '    nombreEnLaTarjeta: true,' \
  "Calvin vuelve a dibujar el nombre"

echo "── 2. EL ERROR INVERSO: SE LE QUITA EL NOMBRE A QUIEN SÍ LO NECESITA ────"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    // Reebok: el nombre DICE el modelo («CLASSIC LEATHER», «ZIG DYNAMICA 6»),\n    // 74 distintos sobre 220 vivos. La línea sirve y se queda.\n    nombreEnLaTarjeta: true,' \
  '    nombreEnLaTarjeta: false,' \
  "Reebok pierde «CLASSIC LEATHER» de la tarjeta"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    // Joybees: 70 nombres distintos sobre 81 vivos — cada uno dice modelo y\n    // color («Kids Varsity Clog Black/Red»). La línea se queda.\n    nombreEnLaTarjeta: true,' \
  '    nombreEnLaTarjeta: false,' \
  "Joybees pierde el nombre de la tarjeta"

echo "── 3. LA DECISIÓN DEJA DE SER UN DATO Y VUELVE A SER UN if DE MARCA ────"

mutar "src/components/catalogo/CatalogoProductCard.tsx" \
  '          {t.nombreEnLaTarjeta && (' \
  '          {marca === "reebok" && (' \
  "la card pregunta por el NOMBRE de la marca en vez de al tema"

echo "── 4. EL CÓDIGO DEJA DE LEERSE (vuelve al gris al 50 %) ─────────────────"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    codigoTitulo: "text-sm font-semibold text-[#152342] leading-5 h-5 truncate tabular-nums",' \
  '    codigoTitulo: "text-xs text-[#152342]/50 leading-5 h-5 truncate tabular-nums",' \
  "Tommy: el código vuelve a ser tenue y chico"

echo "── 5. «NINOS» SIN EÑE, Y «KIDS» EN JOYBEES ──────────────────────────────"

mutar "src/lib/reebok-gender.ts" \
  'ninos: "Niños", unisex: "Unisex" };' \
  'ninos: "Ninos", unisex: "Unisex" };' \
  "vuelve «Ninos» sin eñe al encabezado de sección"

mutar "src/lib/reebok-gender.ts" \
  'const FILTER_LABEL: Record<string, string> = { male: "Hombre", female: "Mujer", kids: "Niños" };' \
  'const FILTER_LABEL: Record<string, string> = { male: "Hombre", female: "Mujer", kids: "Ninos" };' \
  "vuelve «Ninos» sin eñe al subtítulo del PDF"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '      // 🔴 «Niños», con eñe (22-sep-2026). Ver `reebok-gender.ts`.\n      { value: "kids", label: "Niños" },' \
  '      { value: "kids", label: "Ninos" },' \
  "el chip de Reebok vuelve a decir «Ninos»"

mutar "src/components/catalogo/groupByModel.ts" \
  '  kids: "Niños",\n  accesorios: "Accesorios",' \
  '  kids: "Kids",\n  accesorios: "Accesorios",' \
  "la sección de Joybees vuelve a decir «Kids»"

echo "── 6. TOMMY Y CALVIN TRADUCIDOS AL ESPAÑOL (lo que Daniel NO quiere) ────"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '      { value: "women", label: "Women" },\n      { value: "men", label: "Men" },\n      { value: "boys", label: "Boys" },\n      { value: "girls", label: "Girls" },\n    ],\n    categoryOptions: [\n      { value: "", label: "Todos" },\n      { value: "sneakers", label: "Sneakers" },\n      { value: "flip_flops", label: "Flip Flops" },\n      { value: "sandals", label: "Sandals" },\n      { value: "shoes", label: "Shoes" },\n      { value: "slippers", label: "Slippers" },\n      { value: "boots", label: "Boots" },' \
  '      { value: "women", label: "Mujer" },\n      { value: "men", label: "Hombre" },\n      { value: "boys", label: "Niños" },\n      { value: "girls", label: "Niñas" },\n    ],\n    categoryOptions: [\n      { value: "", label: "Todos" },\n      { value: "sneakers", label: "Sneakers" },\n      { value: "flip_flops", label: "Flip Flops" },\n      { value: "sandals", label: "Sandalias" },\n      { value: "shoes", label: "Calzado" },\n      { value: "slippers", label: "Pantuflas" },\n      { value: "boots", label: "Botas" },' \
  "Tommy traducido al español"

echo "── 7. LOS CAJONES DE JOYBEES DEJAN DE SUMAR 81 ──────────────────────────"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '  { value: "Trekking", label: "Trekking", palabras: ["trekking"] },\n' '' \
  "se cae el cajón Trekking: 12 productos sin cajón"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '  { value: "Popinz", label: "Popinz", palabras: ["popinz", "popinsz"] },\n' '' \
  "se cae el cajón Popinz: 11 productos sin cajón"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '{ value: "Popinz", label: "Popinz", palabras: ["popinz", "popinsz"] }' \
  '{ value: "Popinz", label: "Popinz", palabras: ["popinz"] }' \
  "se pierde la grafía «POPINSZ»: 1 producto sin cajón"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '  { value: "Clogs", label: "Clogs", palabras: ["clog"] },\n  { value: "Sandalias", label: "Sandalias", palabras: ["sandal"] },' \
  '  { value: "Sandalias", label: "Sandalias", palabras: ["sandal"] },\n  { value: "Clogs", label: "Clogs", palabras: ["clog"] },' \
  "se altera el ORDEN de los cajones (la precedencia)"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    categorias: JOYBEES_CAJONES.map((c) => ({ value: c.value, label: c.label })),' \
  '    categorias: [\n      { value: "Clogs", label: "Clogs" },\n      { value: "Sandalias", label: "Sandalias" },\n      { value: "Flips", label: "Flips" },\n    ],' \
  "los chips vuelven a ser una SEGUNDA lista escrita a mano"

echo "── 8. UN CHIP EN CERO VUELVE A DIBUJARSE ────────────────────────────────"

mutar "src/lib/catalogos/admin-chips.ts" \
  '  const sale = (c: ChipAdmin) => todaviaNoSe || c.count > 0 || c.key === elegido;' \
  '  const sale = (_c: ChipAdmin) => true;' \
  "vuelven «Shoes 0 · Slippers 0 · Boots 0 · Sin foto 0»"

mutar "src/lib/catalogos/admin-chips.ts" \
  '  if (sale(sinFoto)) chips.push(sinFoto);' \
  '  chips.push(sinFoto);' \
  "«Sin foto 0» vuelve a salir siempre"

mutar "src/lib/catalogos/admin-chips.ts" \
  '  const todaviaNoSe = productos.length === 0;' \
  '  const todaviaNoSe = false;' \
  "se pierde el fallar ABIERTO mientras el catálogo no cargó"

mutar "src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx" \
  '          {sinFoto.length > 0 && (' \
  '          {true && (' \
  "vuelve el botón «Todos tienen foto», apagado y sin poder tocarse"

echo "── 9. LA CAJA DE LA FOTO DEJA DE SALIR DE LA MEDICIÓN ───────────────────"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    imageBg: "aspect-square bg-[#F5F0E8] relative overflow-hidden cursor-pointer",' \
  '    imageBg: "aspect-[4/3] bg-[#F5F0E8] relative overflow-hidden cursor-pointer",' \
  "Reebok vuelve a 4:3 (sus 122 fotos cuadradas pierden el 25 % del ancho)"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    imageBg: "aspect-[4/3] bg-[#F6F7F9] relative overflow-hidden cursor-pointer",' \
  '    imageBg: "aspect-square bg-[#F6F7F9] relative overflow-hidden cursor-pointer",' \
  "Tommy pasa a cuadrada (sus 322 fotos 4:3 ganan fondo vacío)"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    imageFit: "w-full h-full object-contain",\n    placeholder: (' \
  '    imageFit: "w-full h-full object-cover",\n    placeholder: (' \
  "se llena la caja RECORTANDO el producto (object-cover)"

mutar "src/lib/catalogo/marcas-ui.tsx" \
  '    imageIntrinsic: { ancho: 400, alto: 400 },' \
  '    imageIntrinsic: { ancho: 400, alto: 300 },' \
  "el hueco reservado deja de coincidir con la caja (la grilla salta)"

echo "── 10. EL SEGUNDO NÚMERO DEL STOCK SE APAGA SIN PREGUNTARLE A DANIEL ────"

mutar "src/lib/catalogo/stock-en-la-tarjeta.ts" \
  'export const MOSTRAR_EXISTENCIA = true;' \
  'export const MOSTRAR_EXISTENCIA = false;' \
  "se apaga «Existencia» sin la decisión de Daniel"

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "  CAZADAS: $cazadas   ·   SOBREVIVIENTES: $sobrevivientes"
echo "════════════════════════════════════════════════════════════════════════"

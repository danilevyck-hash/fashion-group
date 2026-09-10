#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de LOS CUADRITOS del aviso «qué cambió» (9-sep-2026) CAZAN?
#
# Daniel: *«hazlo con una imagen cada punto de ser necesario para que el usuario
# lo vea»* · *«las que cambian de botón o algo más que sea necesario para
# facilidad de usuario»* · *«acuérdate que solo lo verá una vez cada vez que
# entra al módulo por usuario»*.
#
# Lo que cubren:
#   1  QUIÉNES llevan cuadrito — y sobre todo quiénes NO (regla, número o texto)
#   2  cada cuadrito trae su texto alternativo, y dice la COSA
#   3  ni un color escrito a mano: todo sale de `currentColor` y de clases
#   4  no estorba — chiquito, cabe en el celular, y nada se mueve
#   5  los anchos se CALCULAN del rótulo, no se teclean
#   6  sin dibujo, la novedad se ve exactamente como antes
#   7  el dibujo no rompe el máximo de tres
#   8  🔴 el acento es EL COLOR DE SU MÓDULO (`moduleColors.ts`), nunca uno solo
#   9  🔴 el botón principal se dibuja NEGRO RELLENO, y solo donde de verdad lo es
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae archivos
# NUEVOS y git aborta el comando entero sin restaurar nada — y, peor, un script
# que se cuelga a mitad se lleva por delante el trabajo sin commitear.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-novedades-dibujos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/components/novedades-dibujos.test.tsx \
src/__tests__/lib/novedades.test.ts \
src/__tests__/components/novedades-aviso.test.tsx \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/novedades/dibujos.ts"
  "src/lib/novedades/lista.ts"
  "src/lib/novedades/seleccion.ts"
  "src/components/novedades/DibujoNovedad.tsx"
  "src/components/NovedadesAviso.tsx"
  "src/lib/moduleColors.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

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

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ═══ 1 · QUIÉNES llevan cuadrito ═════════════════════════════════════════════

mutar "src/lib/novedades/lista.ts" \
  '    dibujo: "flechita-en-el-numero",
' "" \
  "a la flechita de Comisiones le quitan su cuadrito"

mutar "src/lib/novedades/lista.ts" \
  '    texto: "El estado de cuenta que le mandas al cliente ahora sale con la misma forma que el de Switch.",' \
  '    texto: "El estado de cuenta que le mandas al cliente ahora sale con la misma forma que el de Switch.",
    dibujo: "exportar-a-descargar",' \
  "un cambio de FORMA del papel gana un cuadrito que no aclara nada"

mutar "src/lib/novedades/lista.ts" \
  '    texto: "Abre en el último mes cerrado y no en el que va corriendo; el mes en curso queda a un toque.",' \
  '    texto: "Abre en el último mes cerrado y no en el que va corriendo; el mes en curso queda a un toque.",
    dibujo: "un-solo-control-de-tiempo",' \
  "una REGLA (con qué mes abre) gana un cuadrito"

mutar "src/lib/novedades/dibujos.ts" \
  '  "flechita-en-el-numero": {' \
  '  "cuadrito-que-nadie-muestra": {
    alt: "Un cuadrito que ninguna novedad enseña, dibujado y olvidado.",
    piezas: [{ t: "caja", texto: "Nada" }],
  },
  "flechita-en-el-numero": {' \
  "nace un cuadrito huérfano, sin novedad que lo muestre"

# ═══ 2 · El texto alternativo ════════════════════════════════════════════════

mutar "src/lib/novedades/dibujos.ts" \
  'alt: "El botón que decía «Exportar» ahora dice «Descargar» y abre un menú.",' \
  'alt: "Dibujo.",' \
  "un cuadrito se queda con un alternativo de relleno"

mutar "src/lib/novedades/dibujos.ts" \
  'alt: "El botón que decía «Exportar» ahora dice «Descargar» y abre un menú.",' \
  'alt: "Imagen del botón que decía «Exportar» y ahora dice «Descargar».",' \
  "el alternativo narra («Imagen de…») en vez de decir la cosa"

mutar "src/lib/novedades/dibujos.ts" \
  'alt: "El botón «Guardar» ya no está: tocas el dato y se guarda al salir del campo.",' \
  'alt: "El botón «Guardar» ya no está: tocá el dato y se guarda al salir del campo.",' \
  "se cuela voseo en un texto alternativo"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '      role="img"
      aria-label={alt}' \
  '      role="img"' \
  "el cuadrito pierde su rotulo alternativo"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  "      <title>{alt}</title>
" "" \
  "el cuadrito pierde su título"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '      role="img"' \
  '      role="img"
      aria-hidden="true"' \
  "el cuadrito se esconde de los lectores de pantalla"

# ═══ 3 · Ni un color escrito a mano ══════════════════════════════════════════

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'export const ACENTO_SIN_COLOR = "text-gray-700";' \
  'export const ACENTO_SIN_COLOR = "[color:#374151]";' \
  "el gris de siempre se clava en un #hex"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'className="stroke-current" strokeWidth={p.fuerte ? 1.6 : 1} fill="none"' \
  'stroke="rgb(107,114,128)" strokeWidth={p.fuerte ? 1.6 : 1} fill="none"' \
  "el trazo de la caja deja de heredar el color de la app"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'className="max-w-full text-gray-500"' \
  'className="max-w-full"' \
  "el cuadrito se queda sin color de arriba (hereda cualquier cosa)"

# ═══ 4 · Que no estorbe ══════════════════════════════════════════════════════

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'className="max-w-full text-gray-500"' \
  'className="text-gray-500"' \
  "en el celular el cuadrito deja de achicarse y empuja la pantalla"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'preserveAspectRatio="xMinYMid meet"' \
  'preserveAspectRatio="none"' \
  "al achicarse el cuadrito se deforma"

mutar "src/components/NovedadesAviso.tsx" \
  '<span className="flex flex-wrap items-center gap-x-2 gap-y-1">' \
  '<span className="flex items-center gap-x-2">' \
  "el renglón deja de envolver: en el celular el cuadrito corta la frase"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'className="max-w-full text-gray-500"' \
  'className="max-w-full animate-pulse text-gray-500"' \
  "el cuadrito se pone a parpadear"

mutar "src/lib/novedades/dibujos.ts" \
  '      { t: "caja", texto: "Descargar ⌄", boton: true },' \
  '      { t: "caja", texto: "Descargar ⌄", fuerte: true },' \
  "«Descargar» vuelve al borde (el error de medir el gris de adentro del menú)"

mutar "src/lib/novedades/dibujos.ts" \
  '      { t: "caja", texto: "Exportar", boton: true, apagado: true, tachado: true },' \
  '      { t: "caja", texto: "Exportar", apagado: true, tachado: true },' \
  "«Exportar» deja de ser EL MISMO botón negro que se renombró"

mutar "src/lib/novedades/dibujos.ts" \
  '    piezas: [{ t: "caja", texto: "Septiembre 2026 ⌄", fuerte: true }],' \
  '    piezas: [{ t: "caja", texto: "Septiembre 2026 ⌄ o el año o los últimos 3, 6 o 12 meses", fuerte: true }],' \
  "un cuadrito crece hasta ser un banner"

# ═══ 5 · Los anchos se CALCULAN ══════════════════════════════════════════════

mutar "src/lib/novedades/dibujos.ts" \
  '      return Math.max(CAJA_MIN, anchoDeTexto(p.texto) + 14 + extra);' \
  '      return 50;' \
  "el ancho de la caja se teclea y deja de seguir al rótulo"

mutar "src/lib/novedades/dibujos.ts" \
  '  return Math.round(texto.length * 5.4);' \
  '  return 20;' \
  "todos los rótulos miden lo mismo (el texto se sale de su caja)"

mutar "src/lib/novedades/dibujos.ts" \
  '    x += anchoDePieza(p) + SEPARACION;' \
  '    x += SEPARACION;' \
  "las piezas se montan una encima de otra"

mutar "src/lib/novedades/dibujos.ts" \
  '      return p.n * (PESTANA_W + PESTANA_GAP) - PESTANA_GAP;' \
  '      return 40;' \
  "una tira de ocho pestañas mide lo mismo que una de cuatro"

# ═══ 6 · Sin dibujo, la novedad se ve como antes ═════════════════════════════

mutar "src/components/NovedadesAviso.tsx" \
  '              {n.dibujo ? (' \
  '              {true ? (' \
  "también se envuelve la novedad que NO lleva cuadrito"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '  if (!esDibujoConocido(clave)) return null;' \
  '  if (!clave) return null;' \
  "una llave desconocida se intenta dibujar igual (cuadro roto)"

mutar "src/lib/novedades/dibujos.ts" \
  '  return typeof clave === "string" && Object.prototype.hasOwnProperty.call(DIBUJOS, clave);' \
  '  return true;' \
  "cualquier llave pasa por buena, venga de donde venga"

# ═══ 7 · El máximo de tres ═══════════════════════════════════════════════════

mutar "src/components/NovedadesAviso.tsx" \
  '          {aMostrar.map((n) => (' \
  '          {pendientes.map((n) => (' \
  "con el cuadrito puesto se dibujan más de tres renglones"

# ═══ y el campo `dibujo` sigue siendo parte de una lista CERRADA ═════════════

mutar "src/lib/novedades/lista.ts" \
  '    dibujo: "una-sola-puerta-cobrar",' \
  '    dibujo: "una-sola-puerta-cobrar",
    color: "rojo",' \
  "una novedad estrena un campo inventado"

# ═══ 8 · El acento es EL COLOR DE SU MÓDULO ══════════════════════════════════

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '  return getModuleColorByKey(modulo)?.text ?? ACENTO_SIN_COLOR;' \
  '  return "text-teal-700";' \
  "vuelve el color único para los catorce, y encima uno que la paleta no usa"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '  return getModuleColorByKey(modulo)?.text ?? ACENTO_SIN_COLOR;' \
  '  return getModuleColorByKey("cxc")!.text;' \
  "todos los cuadritos salen del azul de la cartera"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '  return getModuleColorByKey(modulo)?.text ?? ACENTO_SIN_COLOR;' \
  '  return getModuleColorByKey(modulo)?.text ?? "text-lime-600";' \
  "al módulo sin color se le inventa un tono en vez de caer al gris"

mutar "src/components/NovedadesAviso.tsx" \
  '<DibujoNovedad clave={n.dibujo} modulo={n.modulo} />' \
  '<DibujoNovedad clave={n.dibujo} />' \
  "la tira deja de decirle al cuadrito en qué módulo está"

# ═══ 9 · El botón principal, negro relleno y solo donde lo es ════════════════

mutar "src/lib/novedades/dibujos.ts" \
  '      { t: "caja", texto: "Cobrar", boton: true },' \
  '      { t: "caja", texto: "Cobrar", fuerte: true },' \
  "«Cobrar» vuelve a dibujarse con borde, o sea como un campo de texto"

mutar "src/lib/novedades/dibujos.ts" \
  '      { t: "caja", texto: "Guardar", boton: true, apagado: true, tachado: true },' \
  '      { t: "caja", texto: "Guardar", apagado: true, tachado: true },' \
  "el botón «Guardar» que se fue deja de verse como el botón que era"

mutar "src/lib/novedades/dibujos.ts" \
  '    piezas: [{ t: "caja", texto: "Septiembre 2026 ⌄", fuerte: true }],' \
  '    piezas: [{ t: "caja", texto: "Septiembre 2026 ⌄", boton: true }],' \
  "un DESPLEGABLE se pinta como el botón negro de la casa"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '        className={p.boton ? "fill-current" : "stroke-current"}' \
  '        className="stroke-current"' \
  "el botón negro deja de rellenarse"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  '        className={p.boton ? LETRA_DEL_BOTON : "fill-current"}' \
  '        className="fill-current"' \
  "la letra del botón negro se pinta del mismo color que su relleno"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'const NEGRO = "text-black dark:text-white";' \
  'const NEGRO = "text-black";' \
  "el botón negro se queda sin su vuelta: en fondo oscuro desaparece"

mutar "src/components/novedades/DibujoNovedad.tsx" \
  'export const RADIO = 4;' \
  'export const RADIO = 3;' \
  "las cajas vuelven a ser más cuadradas que todo lo demás del sistema"

echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/lib/novedades/dibujos.ts" \
  '      { t: "caja", texto: "Vistana", fuerte: true },' \
  '      { t: "caja", texto: "Fashion Wear", fuerte: true },' \
  "CONTROL: un rótulo dibujado cambia de empresa"

control "src/lib/novedades/dibujos.ts" \
  'export const SEPARACION = 6;' \
  'export const SEPARACION = 7;' \
  "CONTROL: se le da un pelo más de aire entre piezas"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

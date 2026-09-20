#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MUTACIONES de los dos candados del 20-sep-2026:
#   · guias-etiqueta-agrande.test.tsx  (el tiquete de los bultos)
#   · pedido-pdf-carta.test.ts         (el PDF del pedido en carta)
#
# Cada mutación rompe UNA regla a propósito; el candado tiene que ponerse ROJO.
# Los dos controles cambian algo que NO es una regla y tienen que seguir verdes.
#
#   bash scripts/_mutar-candados-etiqueta-y-pedido.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")/.." || exit 1

PDF_ETQ="src/lib/guias/pdf-etiquetas.ts"
PURO_ETQ="src/lib/guias/etiquetas.ts"
CORE="src/lib/catalogo/order-pdf-core.ts"
T_ETQ="src/__tests__/components/guias-etiqueta-agrande.test.tsx"
T_PED="src/__tests__/lib/pedido-pdf-carta.test.ts"

cazadas=0; escapadas=0; controles_ok=0; controles_mal=0

# 🔴 SE RESTAURA DESDE UNA COPIA DEL ÁRBOL DE TRABAJO, NUNCA CON `git checkout`:
# los archivos que se mutan casi siempre tienen cambios SIN COMMITEAR —son los
# del encargo que se está probando— y un `git checkout --` los borraría, dejando
# todas las mutaciones corriendo contra el código viejo (y todo «cazado» por el
# motivo equivocado).
COPIA="$(mktemp -d)"
trap 'rm -rf "$COPIA"' EXIT
for f in "$PDF_ETQ" "$PURO_ETQ" "$CORE"; do
  mkdir -p "$COPIA/$(dirname "$f")"
  cp "$f" "$COPIA/$f"
done
restaurar() { for f in "$PDF_ETQ" "$PURO_ETQ" "$CORE"; do cp "$COPIA/$f" "$f"; done; }

# $1 = descripción · $2 = archivo · $3 = python de mutación · $4 = test · $5 = "control" opcional
probar() {
  local desc="$1" archivo="$2" py="$3" test="$4" modo="${5:-mutacion}"
  restaurar
  python3 - "$archivo" <<PY
import sys, io
p = sys.argv[1]
s = io.open(p, encoding="utf8").read()
$py
io.open(p, "w", encoding="utf8").write(s)
PY
  if [ $? -ne 0 ]; then echo "  ⚠️  no se pudo mutar: $desc"; restaurar; return; fi
  if npx vitest run "$test" >/dev/null 2>&1; then
    if [ "$modo" = "control" ]; then echo "  ✅ CONTROL verde: $desc"; controles_ok=$((controles_ok+1));
    else echo "  ❌ ESCAPÓ: $desc"; escapadas=$((escapadas+1)); fi
  else
    if [ "$modo" = "control" ]; then echo "  ❌ CONTROL rojo (falso positivo): $desc"; controles_mal=$((controles_mal+1));
    else echo "  ✅ cazada: $desc"; cazadas=$((cazadas+1)); fi
  fi
  restaurar
}

echo "── El tiquete de los bultos ──────────────────────────────────────────────"
probar "el destino vuelve al tamaño del cliente" "$PDF_ETQ" \
  's = s.replace("const MAY_DESTINO = 7.5;", "const MAY_DESTINO = 5.5;")' "$T_ETQ"
probar "el número del bulto se achica a 9 mm" "$PDF_ETQ" \
  's = s.replace("const MAY_BULTO = 11.0;", "const MAY_BULTO = 9.0;")' "$T_ETQ"
probar "el cliente vuelve a los 4,8 mm de antes" "$PDF_ETQ" \
  's = s.replace("const MAY_CLIENTE = 5.5;", "const MAY_CLIENTE = 4.8055;")' "$T_ETQ"
probar "la factura se queda chica" "$PDF_ETQ" \
  's = s.replace("const MAY_FACTURA = 4.0;", "const MAY_FACTURA = 3.4;")' "$T_ETQ"
probar "alguien cambia la altura de mayúscula de la fuente" "$PDF_ETQ" \
  's = s.replace("const ALTURA_DE_MAYUSCULA = 0.718;", "const ALTURA_DE_MAYUSCULA = 0.66;")' "$T_ETQ"
probar "el rótulo vuelve a decir CAJA" "$PURO_ETQ" \
  's = s.replace(chr(34) + "BULTO" + chr(34) + ";", chr(34) + "CAJA" + chr(34) + ";")' "$T_ETQ"
probar "el «de 14» deja de ir a la mitad" "$PDF_ETQ" \
  's = s.replace("const F_BULTO_TOTAL = F_BULTO / 2;", "const F_BULTO_TOTAL = F_BULTO;")' "$T_ETQ"
probar "el número pasa a escribirse 1/4" "$PURO_ETQ" \
  's = s.replace("total: `de ${total}`", "total: `/${total}`")' "$T_ETQ"
probar "el «de 14» se le encima al número" "$PDF_ETQ" \
  's = s.replace("const BULTO_ANTES_DEL_TOTAL = 2.6;", "const BULTO_ANTES_DEL_TOTAL = -8.0;")' "$T_ETQ"
probar "el bloque del número deja de centrarse entero" "$PDF_ETQ" \
  's = s.replace("const xNumero = centro - (anchoNumero + BULTO_ANTES_DEL_TOTAL + anchoTotal) / 2;", "const xNumero = centro;")' "$T_ETQ"
probar "los puntos suspensivos vuelven a empujar la línea afuera" "$PDF_ETQ" \
  's = s.replace("while (ultima.length > 1 && doc.getTextWidth(`${ultima}…`) > ancho) ultima = ultima.slice(0, -1);", "")' "$T_ETQ"
probar "el destino pierde el hueco y vuelve a dos líneas" "$PDF_ETQ" \
  's = s.replace("    hastaY: yRaya - AIRE_SOBRE_LA_RAYA,\n", "")' "$T_ETQ"
probar "se afloja el espacio entre bloques y el destino ya no entra en tres" "$PDF_ETQ" \
  's = s.replace("const ENTRE_BLOQUES = 12.5;", "const ENTRE_BLOQUES = 19.0;")' "$T_ETQ"
probar "el bloque del bulto deja de anclarse al borde de abajo" "$PDF_ETQ" \
  's = s.replace("const yNumero = y0 + CUARTO_H - PAD_Y;", "const yNumero = y + 40;")' "$T_ETQ"
probar "alguien vuelve a escribir un tamaño en puntos a mano" "$PDF_ETQ" \
  's = s.replace("const F_CLIENTE = PT_PARA_MAYUSCULA(MAY_CLIENTE);", "const F_CLIENTE = PT(0.031 * HOJA_W);")' "$T_ETQ"
probar "CONTROL · solo se cambia un comentario del papel" "$PDF_ETQ" \
  's = s.replace("// Hoja carta en milímetros.", "// Hoja tamaño carta, en milímetros.")' "$T_ETQ" control

echo
echo "── El PDF del pedido ─────────────────────────────────────────────────────"
probar "el pedido vuelve a nacer en A4" "$CORE" \
  's = s.replace(chr(34) + "portrait" + chr(34) + ", unit: " + chr(34) + "mm" + chr(34) + ", format: " + chr(34) + "letter" + chr(34), chr(34) + "portrait" + chr(34))' "$T_PED"
probar "una banda de color vuelve a los 210 de A4" "$CORE" \
  's = s.replace("doc.rect(0, 0, hoja.ancho, 18, " + chr(34) + "F" + chr(34) + ");", "doc.rect(0, 0, 210, 18, " + chr(34) + "F" + chr(34) + ");", 1)' "$T_PED"
probar "el texto de la derecha vuelve al 196" "$CORE" \
  's = s.replace("hoja.derecha, 12", "196, 12")' "$T_PED"
probar "el guard de salto vuelve al alto de A4" "$CORE" \
  's = s.replace("hoja.alto - 7", "290")' "$T_PED"
probar "las medidas dejan de salir del documento" "$CORE" \
  's = s.replace("const ancho = doc.internal.pageSize.getWidth();", "const ancho = 210;")' "$T_PED"
probar "el margen derecho deja de ser 14" "$CORE" \
  's = s.replace("export const MARGEN_MM = 14;", "export const MARGEN_MM = 20;")' "$T_PED"
probar "CONTROL · solo se cambia un comentario del core" "$CORE" \
  's = s.replace("// Header por marca", "// El encabezado de cada marca")' "$T_PED" control

echo
echo "─────────────────────────────────────────────────────────────────────────"
echo "mutaciones cazadas: $cazadas · escapadas: $escapadas"
echo "controles verdes: $controles_ok · controles en rojo: $controles_mal"
[ "$escapadas" -eq 0 ] && [ "$controles_mal" -eq 0 ]

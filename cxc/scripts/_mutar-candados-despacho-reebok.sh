#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado del DESPACHO de Reebok (17-sep-2026).
#
# Cada mutación rompe una de las uniones que el candado dice proteger: el costo
# que se LEE del archivo, el código de barras que es el UPC, la cantidad que es
# la recibida, la tabla de respaldo que aguanta las dos generaciones del archivo,
# y el camino que lleva el Excel hasta la pantalla. Si alguna pasa en VERDE, ese
# candado no protege nada.
#
#   bash scripts/_mutar-candados-despacho-reebok.sh
set -u
cd "$(dirname "$0")/.." || exit 1
TESTS="src/__tests__/lib/reebok-despacho.test.ts src/__tests__/reebok-depurador.test.ts"
DES=src/lib/depurador/reebok-despacho.ts
REE=src/lib/depurador/reebok.ts
CLI=src/app/productos/cargar/ReebokClient.tsx
DIS=src/app/productos/cargar/DepuradorDispatcher.tsx
T=$(mktemp -d)
cp "$DES" "$T/des"; cp "$REE" "$T/ree"; cp "$CLI" "$T/cli"; cp "$DIS" "$T/dis"
restaurar() { cp "$T/des" "$DES"; cp "$T/ree" "$REE"; cp "$T/cli" "$CLI"; cp "$T/dis" "$DIS"; }
trap 'restaurar; rm -rf "$T"' EXIT

CAZADAS=0; TOTAL=0
probar() { # nombre esperado(rojo|verde)
  TOTAL=$((TOTAL+1))
  # shellcheck disable=SC2086
  if npx vitest run $TESTS >/dev/null 2>&1; then R=verde; else R=rojo; fi
  if [ "$R" = "$2" ]; then CAZADAS=$((CAZADAS+1)); echo "  ✓ $1 → $R"; else echo "  ✗ $1 → $R (se esperaba $2)"; fi
  restaurar
}

echo "── Mutaciones ──"

perl -0pi -e 's/wholesaleOff: precioAfterDisc,/wholesaleOff: null,/' "$DES"
probar "1. el costo vuelve a inventarse: «Precio after Disc» deja de mandar" rojo

perl -0pi -e 's/const precioAfterDisc = num\(row\[indice\.precioAfterDisc\]\);/const precioAfterDisc = indice.precioBase === -1 ? null : num(row[indice.precioBase]);/' "$DES"
probar "2. el costo lee «Precio Base» (sin descuento) en vez del ya descontado" rojo

perl -0pi -e 's/"Código Barra \*": sample\.codigoBarra \|\| sample\.sku \|\| first\.newArticle,/"Código Barra *": sample.sku || first.newArticle,/' "$REE"
probar "3. el código de barras vuelve a ser el SKU de Reebok, no el UPC" rojo

perl -0pi -e 's/const codigoBarra = val\(row, indice\.upc\) \|\| val\(row, indice\.ean\);/const codigoBarra = val(row, indice.upc);/' "$DES"
probar "4. sin UPC ya no se cae al EAN (una columna que se va rompe el archivo)" rojo

perl -0pi -e 's/piezas: num\(row\[indice\.quantity\]\) \|\| 0,/piezas: 1,/' "$DES"
probar "5. la cantidad deja de ser la recibida" rojo

perl -0pi -e 's/(rotulo: "Category", alias: \["Category", "Categoría", "CATEGORY"\], )obligatoria: false,/$1obligatoria: true,/' "$DES"
probar "6. «Category» se vuelve obligatoria y el despacho viejo deja de entrar" rojo

perl -0pi -e 's/(rotulo: "Composición", alias: \["Composición", "Composicion"\], )obligatoria: false,/$1obligatoria: true,/' "$DES"
probar "7. «Composición» se vuelve obligatoria y el formato NUEVO deja de entrar" rojo

perl -0pi -e 's/if \(tokens\.has\(token\)\) return department;/if (normH(segmento).includes(token)) return department;/' "$DES"
probar "8. el Department se decide con «includes» y «HWY» se vuelve HARDWARE" rojo

perl -0pi -e 's/return department === "FOOTWEAR" \? RUBRO_CALZADO : "";/return RUBRO_CALZADO;/' "$DES"
probar "9. el rubro de respaldo se inventa SHOES también para la ropa" rojo

perl -0pi -e 's/alias: \["PO NAME", "PO Name", "PONAME", "BP Reference No\.", "BP Reference No", "BP Reference"\]/alias: ["BP Reference No.", "PO NAME", "PO Name", "PONAME"]/' "$DES"
probar "10. «BP Reference No.» le gana al «PO NAME» que Reebok va a mandar" rojo

perl -0pi -e 's/"Composición": composicion,/"Composición": "",/' "$REE"
probar "11. la Composición vuelve a ir siempre vacía" rojo

perl -0pi -e 's/\.filter\(\(c\) => !\(c\.obligatoriaSalvo && indice\[c\.obligatoriaSalvo\] !== -1\)\)//' "$DES"
probar "12. el segmento sigue haciendo falta aunque llegue la columna «Department»" rojo

perl -0pi -e 's/const FIRMA_DESPACHO = \["SKU FATHER", "QUANTITY"\];/const FIRMA_DESPACHO = ["SKU"];/' "$DES"
probar "13. la confirmación de compra se confunde con un despacho" rojo

perl -0pi -e 's/if \(findHeaderRow\(rows\) !== -1 \|\| findHeaderRowDespacho\(rows\) !== -1\)/if (findHeaderRow(rows) !== -1)/' "$DIS"
probar "14. la dropzone deja de mandar el despacho al flujo Reebok" rojo

perl -0pi -e 's/const filtrarSinPiezas = formato === "despacho" \|\| monthColIdx !== -1;/const filtrarSinPiezas = monthColIdx !== -1;/' "$CLI"
probar "15. el despacho deja de filtrar y sube a Switch lo que no llegó" rojo

echo "── CONTROLES (tienen que quedar VERDES) ──"
perl -0pi -e 's/es el estado normal, y va a volver a pasar/es el estado normal y va a volver a pasar/' "$DES"
probar "CONTROL: cambiar un comentario del módulo no rompe nada" verde
perl -0pi -e 's/confirmacion: "Confirmación de compra · lo que va a llegar",/confirmacion: "Confirmación de compra · lo que va a llegar (preforma)",/' "$CLI"
probar "CONTROL: retocar el rótulo de la pantalla no rompe nada" verde

echo ""
echo "  $CAZADAS de $TOTAL como se esperaba."
[ "$CAZADAS" = "$TOTAL" ] || exit 1

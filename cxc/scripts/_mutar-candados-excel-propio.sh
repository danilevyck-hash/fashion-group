#!/usr/bin/env bash
# Verifica POR MUTACIÓN el candado del camino "Fotos a mi Excel".
# Un candado que no caza nada es peor que no tenerlo.
#
#   bash scripts/_mutar-candados-excel-propio.sh
#
# ⚠️ Restaura por COPIA, no con `git checkout`: hay archivos NUEVOS y git aborta
# el comando entero si alguno no está en el índice, dejando las mutaciones
# APILADAS y el resultado en verde mintiendo.
set -uo pipefail
cd "$(dirname "$0")/.."

PURO="src/lib/depurador/excel-propio.ts"
ZIP="src/lib/depurador/fotos-xlsx.ts"
PANTALLA="src/app/productos/cargar/MiExcelFotosClient.tsx"
TEST="src/__tests__/lib/depurador-excel-propio.test.ts"
TMP="$(mktemp -d)"
for f in "$PURO" "$ZIP" "$PANTALLA"; do cp "$f" "$TMP/$(basename "$f")"; done
restaurar() { for f in "$PURO" "$ZIP" "$PANTALLA"; do cp "$TMP/$(basename "$f")" "$f"; done; }
trap restaurar EXIT

ok=0; fallo=0
probar() { # $1 = nombre
  local salida codigo rotos
  salida=$(npx vitest run "$TEST" 2>&1); codigo=$?
  rotos=$(printf '%s' "$salida" | grep -Eo '[0-9]+ failed' | head -1 | grep -Eo '[0-9]+' || true)
  if [ "$codigo" -ne 0 ]; then
    echo "✅ CAZADA (${rotos:-?} tests) — $1"; ok=$((ok+1))
  else
    echo "🔴 SOBREVIVIÓ — $1"; fallo=$((fallo+1))
  fi
  restaurar
}

# 1. el código se lee de la columna A en vez de la B
perl -0pi -e 's/export const COL_CODIGO_INDICE = 1;/export const COL_CODIGO_INDICE = 0;/' "$PURO"
probar "el código se lee de otra columna"

# 2. la fila 1 (encabezado) entra como código
perl -0pi -e 's/if \(nFila === FILA_ENCABEZADO\) \{/if \(false\) {/' "$PURO"
probar "el encabezado se lee como un código más"

# 3. nunca se escribe NO IMAGEN
perl -0pi -e 's/que === "sin-foto"\n        \?/false\n        ?/' "$PURO"
probar "la celda sin foto queda vacía en vez de decir NO IMAGEN"

# 4. la celda A se agrega al FINAL de la fila (orden de columnas roto)
perl -0pi -e 's/\? filaCuerpo\.slice\(0, inicioA\) \+ celda \+ filaCuerpo\.slice\(finA\) : celda \+ filaCuerpo/? filaCuerpo.slice(0, inicioA) + celda + filaCuerpo.slice(finA) : filaCuerpo + celda/' "$PURO"
probar "la celda A se escribe al final de la fila"

# 5. el estilo de la celda A que ya existía se pierde
perl -0pi -e 's/const attrEstilo = estilo != null \? ` s="\$\{estilo\}"` : "";/const attrEstilo = "";/' "$PURO"
probar "se pierde el formato de la celda A"

# 6. la geometría se hardcodea en vez de leerse del archivo
perl -0pi -e 's/anchoPx: anchoColumnaAPx\(anchoCol\),/anchoPx: 104,/' "$PURO"
probar "el ancho de columna se inventa en vez de leerse"

# 7. el ancla vuelve a ser `i + 1` (el del pedido Reebok)
perl -0pi -e 's/export function filaAnclaDe\(filas: readonly FilaConCodigo\[\], i: number\): number \{\n  return filas\[i\]\.fila - 1;/export function filaAnclaDe(filas: readonly FilaConCodigo[], i: number): number {\n  void filas;\n  return i + 1;/' "$PURO"
probar "la foto se ancla por índice del par y no por la fila real"

# 8. el plan se salta las filas sin foto
perl -0pi -e 's/for \(const f of filas\) plan\.set\(f\.fila, tieneFoto\(f\.codigo\) \? "vacia" : "sin-foto"\);/for (const f of filas) if (tieneFoto(f.codigo)) plan.set(f.fila, "vacia");/' "$PURO"
probar "las filas sin foto se saltan"

# 9. se afloja el freno de Reebok: pisar un dibujo ajeno deja de cortar
perl -0pi -e 's/if \(hojaXml\.includes\("<drawing "\) && !dibujoPrevio\) \{/if (false) {/' "$ZIP"
probar "Reebok deja de cortar cuando la hoja ya tenía un dibujo"

# 10. las imágenes viejas del macro no se borran
perl -0pi -e 's/if \(dibujoPrevio\) await borrarMediaDelDibujo\(zip, dibujoPrevio\.rels\);//' "$ZIP"
probar "las fotos viejas del macro quedan pegadas en el archivo"

# 11. el ancla vuelve a twoCellAnchor (no se esconde al filtrar igual, pero deja
#     de ser lo verificado y prueba que el candado mira el XML del dibujo)
perl -0pi -e 's/<xdr:oneCellAnchor>/<xdr:twoCellAnchor>/; s/<\/xdr:oneCellAnchor>/<\/xdr:twoCellAnchor>/' "$ZIP"
probar "el ancla deja de ser oneCellAnchor"

# 12. la pantalla escribe su propio "NO IMAGEN"
perl -0pi -e 's/\{TEXTO_SIN_FOTO\}/NO IMAGEN/' "$PANTALLA"
probar "la pantalla escribe su propio texto NO IMAGEN"

# 13. la pantalla manda el archivo al servidor
perl -0pi -e 's/const t0 = Date\.now\(\);/const t0 = Date.now(); await fetch("\/api\/nada");/' "$PANTALLA"
probar "la pantalla sube el archivo a algún lado"

# 14. el .xlsm baja como .xlsx aunque el macro se conserve
perl -0pi -e 's/const salidaExt = ext === "\.xlsm" && !conservaMacro \? "\.xlsx" : ext;/const salidaExt = ".xlsx";/' "$PURO"
probar "el .xlsm baja como .xlsx aunque el macro viaje"

echo
echo "═══ $ok cazadas · $fallo sobrevivieron ═══"
[ "$fallo" -eq 0 ]

#!/usr/bin/env bash
# Verificación por MUTACIÓN de los dos candados del 17-sep-2026:
#   · `plantilla-switch-mas-util` — las cinco mejoras de las DOS pantallas;
#   · `excel-por-el-camino-comun` — todo Excel sale por `workbookBytes`.
#
# Cada mutación rompe una de las uniones que esos candados dicen proteger: el
# costo que se suma y no se recalcula, el artículo sin costo que no vale cero,
# las facturas que no se inventan, la cuenta contra Switch, los dos rótulos
# compartidos, el ámbar de CATEGORY que dejó de pedir revisar, el filtro único
# de la vista previa, y —la que más importa— que el Excel que se descarga siga
# saliendo con las mismas celdas y por el camino común. Si alguna pasa en VERDE,
# ese candado no protege nada.
#
#   bash scripts/_mutar-candados-plantilla-mas-util.sh
set -u
cd "$(dirname "$0")/.." || exit 1
TESTS="src/__tests__/lib/plantilla-switch-mas-util.test.ts src/__tests__/lib/excel-por-el-camino-comun.test.ts src/__tests__/lib/reebok-despacho.test.ts"

RES=src/lib/depurador/resumen-del-archivo.ts
ROT=src/lib/depurador/rotulos.ts
CAT=src/lib/depurador/reebok-categorias.ts
FIL=src/lib/depurador/filtro-ambar.ts
EXP=src/lib/excel-export.ts
REE=src/lib/depurador/reebok.ts
DES=src/lib/depurador/reebok-despacho.ts
RCL=src/app/productos/cargar/ReebokClient.tsx
DCL=src/app/productos/cargar/DepuradorClient.tsx
CUR=src/app/productos/cargar/CurvasView.tsx
FOT=src/lib/depurador/fotos-xlsx.ts
RSM=src/app/productos/cargar/ResumenDelArchivo.tsx
ARCHIVOS="$RES $ROT $CAT $FIL $EXP $REE $DES $RCL $DCL $CUR $RSM $FOT"

T=$(mktemp -d)
i=0; for f in $ARCHIVOS; do cp "$f" "$T/$i"; i=$((i+1)); done
restaurar() { i=0; for f in $ARCHIVOS; do cp "$T/$i" "$f"; i=$((i+1)); done; }
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

# ── 1 · el costo del archivo ────────────────────────────────────────────────
perl -0pi -e 's/      sinCosto\+\+;\n      continue;/      conCosto++;/' "$RES"
probar "1. el artículo SIN costo vuelve a valer cero y entra a la suma" rojo

perl -0pi -e 's/if \(cFob === null \|\| cCif === null\)/if (cFob === null \&\& cCif === null)/' "$RES"
probar "2. medio costo alcanza: una fila sin CIF entra igual y el total miente" rojo

perl -0pi -e 's/  if \(v === null \|\| v === undefined \|\| v === ""\) return null;/  if (v === null || v === undefined) return null;/' "$RES"
probar "3. la celda vacía se lee como 0 en vez de «sin costo»" rojo

perl -0pi -e 's/fob \+= cFob \* unidades;/fob += cFob * unidades * 1.1;/' "$RES"
probar "4. el costo se RECALCULA (un flete de más): segunda definición de costo" rojo

# ── 2 · las facturas ────────────────────────────────────────────────────────
perl -0pi -e 's/    if \(vistas\.has\(s\)\) continue;/    if (false) continue;/' "$RES"
probar "5. las facturas se repiten una vez por fila del archivo" rojo

perl -0pi -e 's/    if \(!s\) continue;/    if (!s) { out.push("(sin factura)"); continue; }/' "$RES"
probar "6. un archivo sin facturas se INVENTA una" rojo

# ── 3 · nuevo contra Switch ─────────────────────────────────────────────────
perl -0pi -e 's/  String\(v \?\? ""\)\.trim\(\)\.toUpperCase\(\);/  String(v ?? "").trim();/' "$RES"
probar "7. el código deja de normalizarse y «accs055» se cuenta como nuevo" rojo

perl -0pi -e 's/  const unicos = new Set<string>\(\);/  const unicos: string[] = [] as unknown as Set<string> \& string[];/' "$RES"
probar "8. el código repetido se cuenta dos veces (el grano deja de ser el artículo)" rojo

# ── 4 · los dos rótulos compartidos ─────────────────────────────────────────
perl -0pi -e 's/export const ROTULO_DESCARGAR_PLANTILLA = "Descargar plantilla Switch";/export const ROTULO_DESCARGAR_PLANTILLA = "Descargar plantilla";/' "$ROT"
probar "9. el rótulo vuelve a ser distinto en cada pantalla" rojo

perl -0pi -e 's/\{ROTULO_SUBIR_OTRO_ARCHIVO\}/Otro archivo/' "$DCL"
probar "10. CK/TH vuelve a escribir «Otro archivo» a mano" rojo

# ── 5 · el ámbar de CATEGORY de Reebok ──────────────────────────────────────
perl -0pi -e 's/  v\.columna === "CATEGORY" \&\& v\.valor !== CATEGORIA_VACIA;/  false;/' "$CAT"
probar "11. CATEGORY vuelve al ámbar de «revísalos», con 30 de 75 en ámbar" rojo

perl -0pi -e 's/  return inesperados\.filter\(\(v\) => !ES_CATEGORY\(v\)\);/  return inesperados.filter((v) => v.columna === "GENDER" || v.columna === "Department");/' "$CAT"
probar "12. una columna NUEVA se cae del aviso en silencio (lista a mano)" rojo

perl -0pi -e 's/return \{ categorias: deCategory\.map\(\(v\) => v\.valor\), productos: productos\.size \};/return { categorias: deCategory.map((v) => v.valor), productos: deCategory.length };/' "$CAT"
probar "13. se cuentan CATEGORÍAS donde había que contar PRODUCTOS (4 en vez de 30)" rojo

perl -0pi -e 's/  v\.columna === "CATEGORY" \&\& v\.valor !== CATEGORIA_VACIA;/  v.columna === "CATEGORY";/' "$CAT"
probar "13b. la CATEGORY vacía se vende como «una categoría que falta en el catálogo»" rojo

# ── 6 · un solo mecanismo de filtrado ───────────────────────────────────────
perl -0pi -e 's/  if \(filtro === FILTRO_AMBAR\) return fila\.fallback;/  if (filtro === FILTRO_AMBAR) return true;/' "$FIL"
probar "14. «Ver solo esos N» no filtra nada" rojo

perl -0pi -e 's/  return norm\(fila\.cols\["Descripción \*"\]\) === q;/  return norm(fila.cols["Descripción *"]).includes(q);/' "$FIL"
probar "15. el filtro de descripción pasa a ser por parecido" rojo

perl -0pi -e 's/  filtro === FILTRO_AMBAR \? "los que hay que revisar" : filtro;/  filtro;/' "$FIL"
probar "16. el valor crudo «__ambar» se le muestra a la persona" rojo

# ── 7 · 🔴 EL EXCEL Y EL CAMINO COMÚN ───────────────────────────────────────
perl -0pi -e 's/  return `A1:\$\{addr\(filas - 1, columnas - 1\)\}`;/  return `A2:\${addr(filas - 1, columnas - 1)}`;/' "$EXP"
probar "17. el filtro deja de arrancar en A1 y la fila fija se corre" rojo

perl -0pi -e 's/  return congelarEncabezadosXlsx\(new Uint8Array\(buf\)\);/  return new Uint8Array(buf);/' "$EXP"
probar "18. el camino común deja de congelar la fila de encabezados" rojo

perl -0pi -e 's/        ws\["!autofilter"\] = \{ ref: filtroDesdeA1\(aoa\) \};\n        XLSX\.utils\.book_append_sheet\(wb, ws, "Pedido"\);\n        saveAs\(workbookBlob\(wb\), nombre\);/        XLSX.utils.book_append_sheet(wb, ws, "Pedido");\n        XLSX.writeFile(wb, nombre);/' "$RCL"
probar "19. la preforma vuelve a bajar por XLSX.writeFile, fuera del camino común" rojo

perl -0pi -e 's/      const bytes = workbookBytes\(wb\);/      const bytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);/' "$RCL"
probar "20. la preforma con fotos se escribe a secas y pierde el panel" rojo

perl -0pi -e 's/^      ws\["!autofilter"\] = \{ ref: filtroDesdeA1\(aoa\) \};\n//m' "$RCL"
probar "21. UNA de las tres hojas de Reebok se queda sin filtro y sin fila fija" rojo

perl -0pi -e 's/      const blob = workbookBlob\(wb\);/      const blob = new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer]);/' "$DCL"
probar "22. la plantilla de Calvin/Tommy/KL se sale del camino común" rojo

perl -0pi -e 's/"Costo FOB \*": fob,\n        "Costo CIF \*": cif,/"Costo FOB *": cif,\n        "Costo CIF *": fob,/' "$REE"
probar "23. 🔴 SE MUEVE UN NÚMERO DEL EXCEL: FOB y CIF cambiados de columna" rojo

perl -0pi -e 's/      documento: val\(row, indice\.documento\),/      documento: val(row, indice.documento),\n      po: val(row, indice.documento),/' "$DES"
probar "24. 🔴 el «Document Number» se cuela adentro de las 25 columnas" rojo

# ── 8 · EL ARCHIVO NUEVO DE REEBOK ─────────────────────────────────────────
perl -0pi -e 's/"PO NAME", "PO Name", "PONAME", "PO", /"PO NAME", "PO Name", "PONAME", /' "$DES"
probar "25. se quita el alias «PO» y el archivo de hoy pierde el PO entero" rojo

perl -0pi -e 's/"PO NAME", "PO Name", "PONAME", "PO", "BP Reference No\.", /"PO", "PO NAME", "PO Name", "PONAME", "BP Reference No.", /' "$DES"
probar "26. «PO» se adelanta a «PO NAME» y cambia la precedencia" rojo

perl -0pi -e 's/      po: val\(row, indice\.po\) \|\| val\(row, indice\.orden\),/      po: val(rows[headerRow + 1], indice.po),/' "$DES"
probar "27. el PO se lee UNA vez por archivo en vez de por fila" rojo

perl -0pi -e 's/\$\{f\.descripcion \? \` descr="\$\{escapar\(f\.descripcion\)\}"\` : ""\}//' "$FOT"
probar "28. las fotos vuelven a ir sin texto alternativo" rojo

perl -0pi -e 's/ descr="\$\{escapar\(f\.descripcion\)\}"/ descr="\${f.descripcion}"/' "$FOT"
probar "29. el texto alternativo va SIN escapar y un «&» rompe el XML" rojo

# ── CONTROLES ───────────────────────────────────────────────────────────────
echo "── Controles (tienen que quedar VERDES) ──"

perl -0pi -e 's/\/\/ Módulo PURO: sin DOM, sin red, sin xlsx\./\/\/ Modulo PURO: sin DOM, sin red, sin xlsx. (comentario tocado a proposito)/' "$RES"
probar "C1. cambiar un comentario no rompe nada" verde

perl -0pi -e 's/const Separador = \(\)/const SeparadorDeLaFila = ()/; s/<Separador \/>/<SeparadorDeLaFila \/>/g' "$RSM"
probar "C2. renombrar un componente interno de pantalla no rompe nada" verde

echo
echo "Cazadas: $CAZADAS de $TOTAL"
[ "$CAZADAS" = "$TOTAL" ] || exit 1

#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del papel de catálogos
# (PDF de pedido + Excel de Comprobantes), 22-sep-2026.
#
# Cada mutación rompe A PROPÓSITO una de las reglas que Daniel aprobó; el
# candado tiene que ponerse ROJO. Los CONTROLES cambian algo que a ninguna
# regla le importa: ahí el candado tiene que quedarse VERDE, o está cazando
# ruido.
#
# 🔴 SE RESTAURA CON UNA COPIA, NUNCA CON `git checkout --`: el árbol puede
# estar sucio y `git checkout` de un archivo lo devuelve al ÍNDICE, o sea que
# se lleva por delante el trabajo sin commitear. Acá cada archivo se copia a
# un temporal antes de tocarlo y se copia de vuelta al terminar.
set -uo pipefail
cd "$(dirname "$0")/.."

PDF=src/lib/catalogo/order-pdf-core.ts
XLS=src/lib/catalogos/pedidos-excel.ts
RUTA='src/app/api/catalogo/[marca]/pedidos-export/route.ts'

TESTS_PDF="src/__tests__/lib/pedido-pdf-hoja-con-identidad.test.ts src/__tests__/lib/pedido-pdf-carta.test.ts src/__tests__/catalogo-pdf.test.ts"
TESTS_XLS="src/__tests__/lib/comprobantes-excel-que-se-filtra.test.ts src/__tests__/excel-exports-catalogos.test.ts"

RESPALDO=$(mktemp -d)
trap 'rm -rf "$RESPALDO"' EXIT

# 🔴 LA HUELLA DE LOS ARCHIVOS ANTES DE EMPEZAR. Al final se vuelve a medir: si
# una mutación no se revirtió, el script lo DICE en vez de dejar el repo tocado.
ANTES=$(md5 -q "$PDF" "$XLS" "$RUTA" 2>/dev/null || md5sum "$PDF" "$XLS" "$RUTA")

ok=0; mal=0

# muta <esperado ROJO|VERDE> <nombre> <archivo> <tests> <viejo> <nuevo>
muta() {
  local esperado="$1" nombre="$2" archivo="$3" tests="$4" viejo="$5" nuevo="$6"
  local copia="$RESPALDO/$(echo "$archivo" | tr '/[]' '___')"
  cp "$archivo" "$copia"
  if ! python3 - "$archivo" "$viejo" "$nuevo" <<'PY'
import io,sys
p,v,n=sys.argv[1],sys.argv[2],sys.argv[3]
s=io.open(p,encoding="utf8").read()
if v not in s: sys.exit("no se encontró el texto a mutar")
io.open(p,"w",encoding="utf8").write(s.replace(v,n,1))
PY
  then
    cp "$copia" "$archivo"
    echo "  ❌ $nombre → no se pudo mutar"; mal=$((mal+1)); return
  fi
  local real
  if npx vitest run $tests >/dev/null 2>&1; then real=VERDE; else real=ROJO; fi
  cp "$copia" "$archivo"
  if [ "$real" = "$esperado" ]; then
    echo "  ✅ $nombre → $real"; ok=$((ok+1))
  else
    echo "  ❌ $nombre → $real (se esperaba $esperado)"; mal=$((mal+1))
  fi
}

echo "── PDF: cada hoja dice de quién es ───────────────────────────────────"
muta ROJO "1. la cabecera deja de repetirse en las hojas nuevas" "$PDF" "$TESTS_PDF" \
  '      willDrawPage: cabeceraSiFalta,' '      '
muta ROJO "2. se va «Página N de M»" "$PDF" "$TESTS_PDF" \
  '    doc.text(`Página ${n} de ${hojas}`, hoja.derecha, hoja.alto - 10, { align: "right" });' \
  '    void n;'
muta ROJO "3. la numeración pierde el «de M»" "$PDF" "$TESTS_PDF" \
  '`Página ${n} de ${hojas}`' '`Página ${n}`'
muta ROJO "4. se va la reserva del pie: el total vuelve a irse solo" "$PDF" "$TESTS_PDF" \
  '      margin: { top: TOP_CONTENIDO_MM, bottom: ALTO_PIE_MM },' \
  '      margin: { top: TOP_CONTENIDO_MM },'
muta ROJO "5. la reserva se queda corta (15 mm)" "$PDF" "$TESTS_PDF" \
  'export const ALTO_PIE_MM = 31;' 'export const ALTO_PIE_MM = 15;'
muta ROJO "6. la cabecera se dibuja dos veces sobre la misma hoja" "$PDF" "$TESTS_PDF" \
  '    if (hojasConCabecera.has(pagina)) return;' '    if (pagina < 0) return;'
muta ROJO "7. el cliente sale de la cabecera" "$PDF" "$TESTS_PDF" \
  '    doc.text(`Cliente: ${fitClientName(doc, clientName)}`, 14, 26);' \
  '    doc.text("Cliente:", 14, 26);'
muta ROJO "8. el número del pedido sale de la cabecera" "$PDF" "$TESTS_PDF" \
  '    doc.text(`${documentoLabel}: ${orderNumber}`, 90, 26);' \
  '    doc.text(`${documentoLabel}:`, 90, 26);'
muta VERDE "CONTROL a. la foto del renglón se agranda 1 mm" "$PDF" "$TESTS_PDF" \
  '            const imgSize = 10;' '            const imgSize = 11;'

echo
echo "── Excel: se puede filtrar ───────────────────────────────────────────"
muta ROJO "9. la fecha vuelve a ser TEXTO" "$XLS" "$TESTS_XLS" \
  '      { fecha: fechaPedido(p.created_at) },' '      fmtFechaPedido(p.created_at),'
muta ROJO "10. la fecha se lleva la hora adentro" "$XLS" "$TESTS_XLS" \
  '      { fecha: fechaPedido(p.created_at) },' \
  '      { v: (fechaPedido(p.created_at)?.getTime() ?? 0) / 86400000 + 25569, fmt: "dd/mm/yyyy" },'
muta ROJO "11. desaparece la columna «Tipo»" "$XLS" "$TESTS_XLS" \
  '          { header: "Tipo", wch: 12 },
' ''
muta ROJO "12. desaparece la columna «En Switch»" "$XLS" "$TESTS_XLS" \
  '          { header: "En Switch", wch: 10, align: "center" },
' ''
muta ROJO "13. el «No» pierde el rojo y se lee como cualquier otro" "$XLS" "$TESTS_XLS" \
  '              : { v: EN_SWITCH_NO, fg: ROJO_FALTA, bold: true },' '              : EN_SWITCH_NO,'
muta ROJO "14. «TOTAL» vuelve a ponerse encima de «Items»" "$XLS" "$TESTS_XLS" \
  '    ...(conOrigen ? ["TOTAL"] : []),
    conOrigen ? null : "TOTAL",
    null,
    grandItems,' \
  '    ...(conOrigen ? [null] : []),
    null,
    null,
    "TOTAL",'
muta ROJO "15. «Items» deja de sumar" "$XLS" "$TESTS_XLS" \
  '    grandItems,
    grandTotal,' '    null,
    grandTotal,'
muta ROJO "16. el origen vuelve a decir «Mío» / «Del link»" "$XLS" "$TESTS_XLS" \
  '      ...(conOrigen ? [ORIGEN_LABEL[p.origen === "link" ? "link" : "mio"]] : []),' \
  '      ...(conOrigen ? [p.origen === "link" ? "Del linkk" : "Mio"] : []),'
muta ROJO "17. el vendedor del enlace vuelve a salir en blanco" "$XLS" "$TESTS_XLS" \
  '      textoVendedor(p),' '      p.vendor || "",'
muta ROJO "18. la hoja vuelve a llamarse «Pedidos»" "$XLS" "$TESTS_XLS" \
  'export const HOJA_COMPROBANTES = PANEL_COMPROBANTES;' 'export const HOJA_COMPROBANTES = "Pedidos";'
muta ROJO "19. el borrador deja de distinguirse del pedido" "$XLS" "$TESTS_XLS" \
  '    status: p.status ?? null,' '    status: null,'
muta ROJO "20. «está en Switch» se vuelve a deducir del número" "$XLS" "$TESTS_XLS" \
  '    ...(typeof p.en_switch === "boolean" ? { enSwitch: p.en_switch } : {}),' '    '
muta VERDE "CONTROL b. la columna Cliente cambia de ancho" "$XLS" "$TESTS_XLS" \
  '    { header: "Cliente", wch: 28 },' '    { header: "Cliente", wch: 29 },'

echo
echo "── El archivo sale por el camino común ───────────────────────────────"
muta ROJO '21. el Excel se arma por fuera de workbookBytes' "$RUTA" "$TESTS_XLS" \
  '    const buf = workbookBuffer(wb);' \
  '    const buf = Buffer.from(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);'
muta VERDE "CONTROL c. cambia el orden de lectura de la vista" "$RUTA" "$TESTS_XLS" \
  '.order("created_at", { ascending: false });' '.order("created_at", { ascending: true });'

echo
DESPUES=$(md5 -q "$PDF" "$XLS" "$RUTA" 2>/dev/null || md5sum "$PDF" "$XLS" "$RUTA")
if [ "$ANTES" != "$DESPUES" ]; then
  echo "  ❌ EL REPO QUEDÓ TOCADO: alguna mutación no se revirtió. Revísalo."
  mal=$((mal+1))
else
  echo "  ✅ los tres archivos quedaron exactamente como estaban"
fi

echo
echo "═══ $ok como se esperaba · $mal fuera de lo esperado ═══"
[ "$mal" -eq 0 ]

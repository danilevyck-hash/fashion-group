#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del PAPEL DEL MES Y DEL AÑO de Comisiones (9-sep-2026) CAZAN de
# verdad?
#
# Daniel: *«Los paso a PDF también, para que todo el módulo se comporte igual»*.
# Los dos botones de arriba dejaron de salir por el diálogo de imprimir del
# navegador y bajan un PDF armado por el sistema; «Descargar el año», que era
# Excel y nada más, quedó con los dos formatos.
#
# Lo que cubren:
#   1  el papel se BAJA, no se manda al diálogo del navegador
#   2  el nombre del archivo lo pone el código (el MISMO que el Excel)
#   3  un papel no se lleva otro reporte pegado atrás (no lee el DOM)
#   4  el pie sale de `sumarPagable` y las filas son las de la pantalla
#   5  los que no se pagan siguen SALIENDO en el archivo, con su marca
#   6  el Excel no se tocó
#   7  el año se comporta igual que el mes (los dos formatos, rótulo derivado)
#   8  parado o acostado se DERIVA de las columnas
#   9  🩸 el «−» de la plata negativa se lee en el papel
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NUNCA CON `git checkout`: un agente puso
# `trap 'git checkout -- …' EXIT`, se colgó en medio de la verificación y el trap
# le devolvió los archivos a HEAD — le borró su propia implementación sin
# commitear. Se copia lo que hay AL EMPEZAR y se restaura de ahí.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-comisiones-papel-mes-anio.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comisiones-papel-mes-anio.test.ts \
src/__tests__/lib/comisiones-flecha.test.ts \
src/__tests__/lib/comisiones-forma.test.ts \
src/__tests__/lib/comisiones-un-boton-pdf.test.ts \
src/__tests__/components/comisiones-flecha-pantalla.test.tsx \
src/__tests__/components/comisiones-papel-pantalla.test.tsx \
src/__tests__/iphone-comisiones-encabezado.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/comisiones/descarga.ts"
  "src/lib/comisiones/tabla-papel.ts"
  "src/lib/comisiones/pdf-tabla-comisiones.ts"
  "src/lib/comisiones/pdf-chrome.ts"
  "src/lib/comisiones/pdf-comision.ts"
  "src/lib/comisiones/nombre-archivo.ts"
  "src/lib/comisiones/imprimir.ts"
  "src/lib/ventas/comisionExcel.ts"
  "src/components/ventas/ComisionesView.tsx"
  "src/components/ventas/ComisionesConsolidadoView.tsx"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
  "src/components/ventas/comisiones-detalle/ImpresionTablaComisiones.tsx"
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

# ═══ 1 · Vuelve el diálogo del navegador ════════════════════════════════════
mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "descargarPdfTablaComisiones(" "imprimirComo(" \
  "1. la matriz vuelve al diálogo de imprimir del navegador"

mutar "src/components/ventas/ComisionesPorEmpresaView.tsx" \
  "    descargarPdfTablaComisiones(" "    window.print(); void (" \
  "2. la vista de una empresa vuelve a window.print()"

mutar "src/lib/comisiones/pdf-tabla-comisiones.ts" \
  'construirPdfTablaComisiones(tabla).save(`${nombreSinExtension}.pdf`);' \
  "construirPdfTablaComisiones(tabla); window.print();" \
  "3. el generador deja de guardar el archivo y manda a imprimir"

# ═══ 2 · El nombre del archivo se pierde ════════════════════════════════════
mutar "src/lib/comisiones/pdf-tabla-comisiones.ts" \
  'construirPdfTablaComisiones(tabla).save(`${nombreSinExtension}.pdf`);' \
  'construirPdfTablaComisiones(tabla).save(document.title + ".pdf");' \
  "4. el nombre lo pone el navegador (document.title = «Fashion Group»)"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "      nombreArchivoComisionesMes(year, mes)," '      "Fashion Group",' \
  "5. la matriz manda un nombre fijo en vez del de siempre"

mutar "src/components/ventas/ComisionesPorEmpresaView.tsx" \
  "      nombreArchivoComisionesEmpresa(empresa, year, mes)," '      "comisiones",' \
  "6. la empresa pierde su nombre de archivo"

mutar "src/lib/comisiones/nombre-archivo.ts" \
  'return `comisiones-consolidado-${sufijoArchivoPeriodo(year, mes)}`;' \
  'return `matriz-${sufijoArchivoPeriodo(year, mes)}`;' \
  "7. el PDF del mes deja de llamarse como su Excel"

# ═══ 3 · Un papel se lleva otro pegado atrás ════════════════════════════════
mutar "src/lib/comisiones/pdf-tabla-comisiones.ts" \
  "  const titulo = \`\${tabla.titulo} · \${tabla.subtitulo}\`;" \
  "  const titulo = \`\${tabla.titulo} · \${tabla.subtitulo}\`;
  if (document.body) doc.text(\"CIERRE\", 10, 10);" \
  "8. el generador lee el DOM y se cuela otro reporte (CIERRE)"

# ═══ 4 · El pie deja de salir de sumarPagable ═══════════════════════════════
mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "  const colTotal = (key: string) => sumarPagable(allShown, (r) => r.porEmpresa[key] ?? 0);" \
  "  const colTotal = (key: string) => allShown.reduce((a, r) => a + (r.porEmpresa[key] ?? 0), 0);" \
  "9. el pie de la matriz suma por su cuenta, sin sumarPagable"

mutar "src/components/ventas/ComisionesPorEmpresaView.tsx" \
  "  const totalGeneral = sumarPagable(vendedores, (v) => v.comision_total ?? 0);" \
  "  const totalGeneral = vendedores.reduce((a, v) => a + (v.comision_total ?? 0), 0);" \
  "10. el pie de una empresa suma por su cuenta"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "    const todas = [...conActividad, ...(sinAsignar ? [sinAsignar] : [])];" \
  "    const todas = [...(rows ?? [])];" \
  "11. las filas del papel dejan de ser las de la pantalla"

# ═══ 5 · Los que no se pagan desaparecen del archivo ════════════════════════
mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "    return todas.map((r) => ({" \
  "    return todas.filter((r) => r.se_paga !== false).map((r) => ({" \
  "12. los que no se pagan se caen del papel del mes"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "          ? \`\${nombreVendedorEnPantalla(r.vendedor)} (\${ROTULO_NO_SE_PAGA})\`" \
  "          ? \`\${nombreVendedorEnPantalla(r.vendedor)}\`" \
  "13. se cae la marca «(no se paga)» del papel"

# ═══ 6 · El Excel cambia ════════════════════════════════════════════════════
mutar "src/lib/ventas/comisionExcel.ts" \
  'comisiones-consolidado-${sufijoArchivoPeriodo(c.year, c.mes)}' \
  'comisiones-mes-${sufijoArchivoPeriodo(c.year, c.mes)}' \
  "14. el Excel del mes cambia de nombre"

mutar "src/components/ventas/ComisionesPorEmpresaView.tsx" \
  "    void exportComisionesResumen({" "    void Promise.resolve({" \
  "15. la vista de una empresa deja de bajar su Excel de siempre"

# ═══ 7 · El año pierde el PDF, o el rótulo se escribe a mano ════════════════
mutar "src/components/ventas/ComisionesView.tsx" \
  "        <button
          type=\"button\"
          onClick={() => pdfRef.current?.()}" \
  "        <button
          type=\"button\"
          hidden={mes === 0}
          onClick={() => pdfRef.current?.()}" \
  "16. el año se queda otra vez sin botón de PDF"

mutar "src/lib/comisiones/descarga.ts" \
  'return `${rotuloDescargarPeriodo(mes)} en PDF`;' \
  'return mes === 0 ? "Descargar el año" : "Descargar el mes en PDF";' \
  "17. el rótulo del año se escribe a mano y no dice el formato"

mutar "src/lib/comisiones/descarga.ts" \
  'return `${rotuloDescargarPeriodo(mes)} en Excel`;' \
  'return "Descargar el mes en Excel";' \
  "18. el rótulo del Excel deja de derivar del período"

# ═══ 8 · La forma del papel se escribe a mano ═══════════════════════════════
mutar "src/lib/comisiones/pdf-tabla-comisiones.ts" \
  "    orientation: orientacionPapel(tabla.columnas.length)," \
  '    orientation: "portrait",' \
  "19. la orientación se escribe a mano: la matriz de 8 columnas no entra"

mutar "src/lib/comisiones/tabla-papel.ts" \
  'return cuantasColumnas > MAX_COLUMNAS_PARADO ? "landscape" : "portrait";' \
  'return "portrait";' \
  "20. nada se acuesta nunca"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "        titulo: TITULO_PAPEL_GRUPO," '        titulo: "Comisiones",' \
  "21. el título del papel se escribe a mano en la vista"

mutar "src/components/ventas/ComisionesPorEmpresaView.tsx" \
  "        subtitulo: etiquetaPeriodo(year, mes)," '        subtitulo: "",' \
  "22. el papel deja de decir de qué período es"

# ═══ 9 · 🩸 El menos de la plata negativa ═══════════════════════════════════
mutar "src/lib/comisiones/pdf-chrome.ts" \
  "  return texto.replace(/\\u2212/g, MENOS_EN_PDF);" "  return texto;" \
  "23. el «−» vuelve a manglar el renglón entero del papel"

mutar "src/lib/comisiones/pdf-tabla-comisiones.ts" \
  "    body: tabla.filas.map((f) => f.celdas.map(textoDePdf))," \
  "    body: tabla.filas.map((f) => f.celdas)," \
  "24. las filas del papel del período dejan de sanearse"

mutar "src/lib/comisiones/pdf-comision.ts" \
  "        ? ventas.map((f) => f.celdas.map(textoDePdf))" \
  "        ? ventas.map((f) => f.celdas)" \
  "25. la nota de crédito del reporte de un vendedor vuelve a salir mangada"

mutar "src/lib/comisiones/pdf-chrome.ts" \
  'export const MENOS_EN_PDF = "-";' 'export const MENOS_EN_PDF = "−";' \
  "26. el reemplazo del menos no reemplaza nada"

# ═══ 10 · Lo retirado no se borra ═══════════════════════════════════════════
mutar "src/components/ventas/comisiones-detalle/ImpresionTablaComisiones.tsx" \
  "RETIRADO EL 9-SEP-2026" "retirado" \
  "27. la hoja HTML pierde su nota fechada de retiro"

mutar "src/lib/comisiones/imprimir.ts" \
  "SIN LECTORES DESDE EL 9-SEP-2026" "sin lectores" \
  "28. imprimirComo pierde la nota que explica por qué se conserva"

# ═══ CONTROLES — cambios inocuos que NO deben cazarse ═══════════════════════
echo "── controles ────────────────────────────────────────────────────────────"

control "src/lib/comisiones/pdf-chrome.ts" \
  "export const CEBRA: [number, number, number] = [248, 249, 249];" \
  "export const CEBRA: [number, number, number] = [250, 250, 250];" \
  "C1. el gris de la fila cebra del papel cambia un punto"

control "src/lib/comisiones/pdf-tabla-comisiones.ts" \
  "  doc.setFontSize(7.5);" "  doc.setFontSize(7.4);" \
  "C2. la nota del pie del papel baja una décima de punto"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "MUTACIONES: $cazadas cazadas · $sobrevivientes sobrevivieron"
echo "CONTROLES:  $controles_ok sanos · $controles_mal cazados de más"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ] || exit 1

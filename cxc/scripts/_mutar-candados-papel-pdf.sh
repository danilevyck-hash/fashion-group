#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «el papel» (9-sep-2026)
#
# Tres cosas del mismo tema, decididas por Daniel:
#   1. Los datos fiscales de las SEIS empresas en el estado de cuenta.
#   2. Comisiones: UN solo botón, y es PDF.
#   3. Guías: todo PDF, se va el PNG.
#
# Cada mutación rompe UNA regla a propósito y se comprueba que el candado se
# pone ROJO. Los CONTROLES son cambios inocuos que NO deben cazarse: si un
# control se caza, el candado está mirando el archivo y no la regla.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA A /tmp, JAMÁS CON `git checkout`. El 9-sep-2026
# un agente puso `trap 'git checkout -- …' EXIT`, se colgó EN MEDIO de la
# verificación, el trap disparó al morir el proceso y le borró su propia
# implementación sin commitear. Acá se copia lo que hay AL EMPEZAR y se restaura
# de esa copia — vuelve lo que había, esté commiteado o no.
#
# Uso:  bash scripts/_mutar-candados-papel-pdf.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

RESPALDO="$(mktemp -d "${TMPDIR:-/tmp}/papel-pdf-respaldo.XXXXXX")"

ARCHIVOS=(
  "src/lib/cxc/empresa-fiscal.ts"
  "src/lib/comisiones/pdf-comision.ts"
  "src/lib/comisiones/reporte-comision.ts"
  "src/lib/guias/compartir-formato.ts"
  "src/lib/guias/papel-de-la-guia.ts"
  "src/app/guias/components/GuiaDetail.tsx"
  "src/components/ventas/ComisionesDetalleModal.tsx"
  "src/components/ventas/comisiones-detalle/useDescargaComision.tsx"
)

for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done

restaurar() {
  for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done
}
trap 'restaurar; echo "↩︎  restaurado desde $RESPALDO"' EXIT

CAZADAS=0
PERDIDAS=0
CONTROL_OK=0
CONTROL_MAL=0

# correr <"mutacion"|"control"> <nombre> <archivos de test…>
correr() {
  local clase="$1"; shift
  local nombre="$1"; shift
  if npx vitest run "$@" --silent >/tmp/_papel-pdf-vitest.log 2>&1; then
    if [ "$clase" = "control" ]; then
      echo "  ✅ CONTROL no cazado (bien): $nombre"
      CONTROL_OK=$((CONTROL_OK + 1))
    else
      echo "  ❌ PERDIDA (el candado no la vio): $nombre"
      PERDIDAS=$((PERDIDAS + 1))
    fi
  else
    if [ "$clase" = "control" ]; then
      echo "  ❌ CONTROL CAZADO (mal — el candado mira el archivo, no la regla): $nombre"
      CONTROL_MAL=$((CONTROL_MAL + 1))
    else
      echo "  ✅ cazada: $nombre"
      CAZADAS=$((CAZADAS + 1))
    fi
  fi
  restaurar
}

FISCAL="src/__tests__/lib/cxc-empresa-fiscal-las-seis.test.ts src/__tests__/lib/cxc-estado-cuenta-forma-switch.test.ts"
COMIS="src/__tests__/lib/comisiones-un-boton-pdf.test.ts src/__tests__/lib/comisiones-forma.test.ts src/__tests__/lib/comisiones-flecha.test.ts"
COMIS_PANT="src/__tests__/components/comisiones-flecha-pantalla.test.tsx src/__tests__/components/comisiones-forma-pantalla.test.tsx"
GUIAS="src/__tests__/lib/guias-todo-pdf.test.ts src/__tests__/lib/guias-papel-uno-solo.test.ts src/__tests__/lib/guias-compartir-png.test.ts src/__tests__/lib/guia-pdf-compartir.test.ts"

echo "═══ 1 · LOS DATOS FISCALES DE LAS SEIS ═══"

# 1. Vistana sale con la identificación de Fashion Wear.
perl -0pi -e 's/(vistana: \{ legal: "VISTANA INTERNATIONAL PANAMA, S\.A\.", identificacion: ")[^"]+/${1}40254-103-278837/' src/lib/cxc/empresa-fiscal.ts
correr mutacion "una empresa sale con la identificación de otra" $FISCAL

# 2. Vistana sale con el nombre legal de Fashion Wear.
perl -0pi -e 's/vistana: \{ legal: "[^"]+"/vistana: { legal: "FASHION WEAR, INC"/' src/lib/cxc/empresa-fiscal.ts
correr mutacion "una empresa sale con el nombre legal de otra" $FISCAL

# 3. El correo deja de ser el mismo en las seis.
perl -0pi -e 's/correo: CORREO_DEL_GRUPO,/correo: r.legal.startsWith("V") ? "vistanaa\@cwpanama.net" : CORREO_DEL_GRUPO,/' src/lib/cxc/empresa-fiscal.ts
correr mutacion "el correo deja de ser el mismo (vuelve el viejo de Switch)" $FISCAL

# 4. El correo se escribe a mano en vez de salir de un solo lugar.
perl -0pi -e 's/correo: CORREO_DEL_GRUPO,/correo: "info\@fashiongr.com",/' src/lib/cxc/empresa-fiscal.ts
correr mutacion "el correo se escribe adentro en vez de venir de un solo lugar" $FISCAL

# 5. Falta una de las seis.
perl -0pi -e 's/^\s*joystep: \{ legal.*\n//m' src/lib/cxc/empresa-fiscal.ts
correr mutacion "falta una de las 6 empresas" $FISCAL

# 6. El teléfono deja de ir vacío.
perl -0pi -e 's/(\/\/ 🔴 Vacío en las seis.*\n\s*telefono: )""/${1}"507-000-0000"/' src/lib/cxc/empresa-fiscal.ts
correr mutacion "el teléfono deja de ir vacío" $FISCAL

echo "═══ 2 · COMISIONES: UN BOTÓN, Y ES PDF ═══"

# 7. Vuelve el botón «Imprimir» (dos botones para lo mismo).
perl -0pi -e 's/<FileText className="h-3\.5 w-3\.5" \/> PDF/<FileText className="h-3.5 w-3.5" \/> Imprimir/' src/components/ventas/ComisionesDetalleModal.tsx
correr mutacion "Comisiones vuelve a decir «Imprimir» en vez de «PDF»" $COMIS

# 8. Vuelve el print del navegador en el motor de la descarga.
perl -0pi -e 's/(      descargarPdfComision\()/      window.print();\n${1}/' src/components/ventas/comisiones-detalle/useDescargaComision.tsx
correr mutacion "Comisiones vuelve al diálogo de impresión del navegador" $COMIS

# 9. El nombre del archivo se pierde (vuelve «Fashion Group»).
perl -0pi -e 's/nombreDe\(empresas, vendedor\),/"Fashion Group",/' src/components/ventas/comisiones-detalle/useDescargaComision.tsx
correr mutacion "el nombre del archivo se pierde (vuelve «Fashion Group»)" $COMIS_PANT

# 10. El generador guarda con un nombre fijo.
perl -0pi -e 's/\.save\(`\$\{nombreSinExtension\}\.pdf`\)/.save("Fashion Group.pdf")/' src/lib/comisiones/pdf-comision.ts
correr mutacion "el generador ignora el nombre que le pasan" $COMIS

# 11. Los reportes se pegan: el de una empresa arrastra al de la otra.
perl -0pi -e 's/^\s*if \(i > 0\) doc\.addPage\(\);\n//m' src/lib/comisiones/pdf-comision.ts
correr mutacion "el PDF de una empresa se lleva el de otra pegado atrás" $COMIS

# 12. El generador vuelve a mirar el DOM (de ahí venía el reporte colado).
perl -0pi -e 's/(export function construirPdfComision\(hojas: HojaReporte\[\]\): jsPDF \{\n)/${1}  void document.querySelector("[data-cds-print]");\n/' src/lib/comisiones/pdf-comision.ts
correr mutacion "el generador vuelve a leer el DOM" $COMIS

# 13. El papel pierde el número largo de factura (se concilia contra Switch).
perl -0pi -e 's/^      v\.secuencial,$/      v.secuencial.slice(-4),/m' src/lib/comisiones/reporte-comision.ts
correr mutacion "el papel de comisión pierde la factura LARGA" $COMIS

echo "═══ 3 · GUÍAS: TODO PDF ═══"

# 14. Vuelve el corte: imagen en el celular hasta 6 renglones.
perl -0pi -e 's/^  return "pdf";$/  return _aparato === "celular" \&\& Number(_cantidadRenglones) > 0 \&\& Number(_cantidadRenglones) <= MAX_RENGLONES_PNG ? "png" : "pdf";/m' src/lib/guias/compartir-formato.ts
correr mutacion "Guías vuelve a mandar PNG en el celular" $GUIAS

# 15. El que arma el archivo vuelve a construir la imagen.
perl -0pi -e 's/(import \{ construirPdfGuia, nombreArchivoGuia \} from "\.\/pdf-guia";)/${1}\nimport { construirPngGuia } from ".\/png-guia";/' src/lib/guias/papel-de-la-guia.ts
perl -0pi -e 's/(function archivoParaCompartir\(g: Guia\): File \{\n)/${1}  const png = construirPngGuia(g);\n  if (png) return png;\n/' src/lib/guias/papel-de-la-guia.ts
correr mutacion "el archivo de la guía vuelve a ser una imagen" $GUIAS

# 16. Se cuela un `await` entre el clic y la hoja de compartir (iOS la bloquea).
perl -0pi -e 's/(function archivoParaCompartir\(g: Guia\): File \{\n)/${1}  const _espera = await Promise.resolve(null);\n/' src/lib/guias/papel-de-la-guia.ts
correr mutacion "el PDF de la guía se arma con un await en el medio" $GUIAS

# 17. Vuelve la precarga de firmas (la imagen entra otra vez por la puerta de atrás).
perl -0pi -e 's/(import \{ compartirGuia, imprimirGuia \} from "\@\/lib\/guias\/papel-de-la-guia";)/${1}\nimport { precargarFirmasGuia } from "\@\/lib\/guias\/png-guia";/' src/app/guias/components/GuiaDetail.tsx
perl -0pi -e 's/(  const \[compartiendo, setCompartiendo\] = useState\(false\);)/${1}\n  precargarFirmasGuia(guia);/' src/app/guias/components/GuiaDetail.tsx
correr mutacion "vuelven los lectores de png-guia (la precarga de firmas)" $GUIAS

echo "═══ CONTROLES (NO deben cazarse) ═══"

# C1. Un comentario más en la ficha fiscal: no cambia una sola regla.
perl -0pi -e 's/(export const CORREO_DEL_GRUPO)/\/\/ Nota de control: este comentario no cambia ninguna regla.\n${1}/' src/lib/cxc/empresa-fiscal.ts
correr control "un comentario más en la ficha fiscal" $FISCAL

# C2. El gris del pie del PDF de comisiones: es cosmético, nadie lo afirma.
perl -0pi -e 's/const GRIS_CLARO: \[number, number, number\] = \[156, 163, 175\];/const GRIS_CLARO: [number, number, number] = [150, 158, 170];/' src/lib/comisiones/pdf-comision.ts
correr control "el gris del pie del PDF de comisiones" $COMIS

echo
echo "═════════════════════════════════════════════"
echo "  Mutaciones: $((CAZADAS + PERDIDAS)) · cazadas: $CAZADAS · perdidas: $PERDIDAS"
echo "  Controles:  $((CONTROL_OK + CONTROL_MAL)) · bien: $CONTROL_OK · mal: $CONTROL_MAL"
echo "═════════════════════════════════════════════"
[ "$PERDIDAS" -eq 0 ] && [ "$CONTROL_MAL" -eq 0 ]

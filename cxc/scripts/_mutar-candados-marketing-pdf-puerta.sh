#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿EL CANDADO DEL PDF EN LA PUERTA CAZA DE VERDAD? (Marketing, 10-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES tienen que quedar VERDES: un ✅ ahí significa que
# los candados fallan por otra razón y toda la corrida no dice nada.
#
# Lo que Daniel pidió y no se puede volver a romper:
#   «Marketing PDF, que sea como la factura, porque es una factura en PDF que
#    con AI lee los campos y lo rellena solo.»
#     1. La puerta acepta PDF y lo dice.
#     2. El PDF ES la factura: la IA lo lee y el paso 3 no lo vuelve a pedir.
#     3. 🔴 NUNCA se sube dos veces, y se cuelga como `pdf_factura`.
#     4. La foto sigue igual; Mueble e Impulsadora, intactos.
#     5. 🔴 El interruptor APAGADO deja la puerta exactamente como hoy.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: con archivos NUEVOS en
# la rama git aborta el comando entero sin restaurar nada — y un `checkout` en
# medio de la corrida borra el trabajo sin commitear.
#
#   bash scripts/_mutar-candados-marketing-pdf-puerta.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/marketing-pdf-en-la-puerta.test.ts \
src/__tests__/components/marketing-pdf-en-la-puerta.test.tsx \
src/__tests__/components/marketing-registrar-gasto.test.tsx \
src/__tests__/components/marketing-factura-form-poda.test.tsx \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/marketing/pdf-en-la-puerta.ts"
  "src/app/marketing/components/RegistrarGastoModal.tsx"
  "src/app/marketing/components/uploadHelpers.ts"
  "src/components/marketing/FacturaForm.tsx"
  "src/components/marketing/PdfUploader.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() {
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

mutar() {
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
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── CONTROLES ────────────────────────────────────────────────────────────"
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  "// Daniel, textual (10-sep-2026): *«Marketing PDF, que sea como la factura," \
  "// Daniel, textual el 10-sep-2026: *«Marketing PDF, que sea como la factura," \
  "CONTROL 2 — cambiar una palabra de un COMENTARIO. Lo bueno es el 🔴"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. LA PUERTA ACEPTA LA FACTURA EN PDF ────────────────────────────────"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  '  return encendido ? "image/*,application/pdf" : "image/*";' \
  '  return "image/*";' \
  "1.1 el campo vuelve a aceptar solo imágenes"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  '  return encendido ? "Foto o factura" : "Foto";' \
  '  return "Foto";' \
  "1.2 el rótulo no dice que la factura también entra"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  '  return (nombre ?? "").trim().toLowerCase().endsWith(".pdf");' \
  '  return (nombre ?? "").trim().toLowerCase().includes(".pdf");' \
  "1.3 el PDF se reconoce por PARECIDO (factura.pdf.jpg pasaría por PDF)"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  '    if ((archivo?.size ?? 0) > maxMb * 1024 * 1024) {' \
  '    if (false) {' \
  "1.4 se pierde el tope de 10 MB en la puerta"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  'export const MAX_PDF_MB = 10;' \
  'export const MAX_PDF_MB = 25;' \
  "1.5 el tope de la puerta deja de ser el del paso 3"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                    if (!cual.ok) {
                      toast(cual.mensaje, "error");
                      return;
                    }' \
  '                    if (!cual.ok) {
                      return;
                    }' \
  "1.6 el archivo rechazado se descarta EN SILENCIO"

echo "── 2. EL PDF ES LA FACTURA: LA IA LO LEE Y NO SE VUELVE A PEDIR ─────────"

mutar "src/components/marketing/FacturaForm.tsx" \
  '        {pdfInicial ? (' \
  '        {false ? (' \
  "2.1 el paso 3 vuelve a pedir el PDF que ya entró por la puerta"

mutar "src/components/marketing/FacturaForm.tsx" \
  '    if (!pdfInicial || pdfDeLaPuertaLeido.current) return;' \
  '    if (!pdfInicial || true) return;' \
  "2.2 el PDF de la puerta nunca se lee: los campos llegan vacíos"

mutar "src/components/marketing/FacturaForm.tsx" \
  '    pdfDeLaPuertaLeido.current = true;
    void handlePdfUpload(pdfInicial);' \
  '    void handlePdfUpload(pdfInicial);' \
  "2.3 🩸 se pierde el freno del ref: la IA se llamaría en cada render"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                    ...(pdfPuerta ? { pdfInicial: pdfPuerta } : {}),' \
  '                    ...({} as Record<string, never>),' \
  "2.4 el PDF de la puerta no viaja al formulario"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                    onUploadPdfForIA: subirPdfParaIA,' \
  '                    onUploadPdfForIA: undefined,' \
  "2.5 la puerta deja de conectar la IA (como estaba antes de este cambio)"

echo "── 3. NUNCA DOS VECES, Y COMO pdf_factura ───────────────────────────────"

mutar "src/app/marketing/components/uploadHelpers.ts" \
  '  let path = (args.pathPreSubido ?? "").trim();
  if (!path) {' \
  '  let path = "";
  if (!path) {' \
  "3.1 🩸 el PDF se sube DOS veces (se ignora el que ya está arriba)"

mutar "src/app/marketing/components/uploadHelpers.ts" \
  '      tipo: "pdf_factura",' \
  '      tipo: "foto_factura",' \
  "3.2 la factura se cuelga como si fuera una foto"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '          pathPreSubido: pdfPathPreSubido,' \
  '          pathPreSubido: null,' \
  "3.3 la puerta olvida el archivo ya subido"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '        setPdfPathPreSubido(path);
        return path;' \
  '        return path;' \
  "3.4 el path de la IA no se anota (y el guardado vuelve a subirlo)"

echo "── 4. LO QUE NO SE TOCA ─────────────────────────────────────────────────"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                      setPdfPuerta(archivo);
                      setPdfPathPreSubido(null);
                      setFoto(null);' \
  '                      setPdfPuerta(archivo);
                      setPdfPathPreSubido(null);' \
  "4.1 la foto y la factura conviven (el campo es UNO solo)"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '            tipo: "otro",' \
  '            tipo: "foto_proyecto",' \
  "4.2 🩸 el PDF de Mueble se publicaría en la galería del cliente"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '      const proyectoId = proyecto?.id;
      if (!proyectoId) return null;' \
  '      const proyectoId = proyecto?.id ?? "sin-proyecto";
      if (!proyectoId) return null;' \
  "4.3 se intenta subir el PDF sin proyecto (la ruta lo rechaza)"

echo "── 6. COMPRA → FACTURA OBLIGATORIA ──────────────────────────────────────"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  '  if (!obligatorio || hayPdf) return null;' \
  '  return null;' \
  "6.1 se puede guardar una compra SIN factura"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  '  if (!obligatorio || hayPdf) return null;' \
  '  if (hayPdf) return null;' \
  "6.2 la factura se exige TAMBIÉN donde no se pide (editar una vieja, el proyecto)"

mutar "src/components/marketing/FacturaForm.tsx" \
  '  const puedeGuardar = pasoDatos && marcasValidas && !enviando && falta === null;' \
  '  const puedeGuardar = pasoDatos && marcasValidas && !enviando;' \
  "6.3 el botón guarda igual aunque falte la factura"

mutar "src/components/marketing/FacturaForm.tsx" \
  '        {!checkingDup && falta && (' \
  '        {false && falta && (' \
  "6.4 el botón se apaga SIN decir qué falta"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                    pdfObligatorio: true,' \
  '                    pdfObligatorio: false,' \
  "6.5 la puerta deja de exigir la factura en las compras"

echo "── 5. EL INTERRUPTOR APAGA TODO ─────────────────────────────────────────"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  'export const MARKETING_PDF_EN_LA_PUERTA = false;' \
  'export const MARKETING_PDF_EN_LA_PUERTA = true;' \
  "5.1 el interruptor nace ENCENDIDO (Daniel todavía no lo prendió)"

mutar "src/lib/marketing/pdf-en-la-puerta.ts" \
  '    if (!encendido) {
      return {
        ok: false,
        mensaje: "Aquí solo entra una foto. La factura en PDF se sube en el paso siguiente.",
      };
    }' \
  '    if (false) {
      return { ok: false, mensaje: "" };
    }' \
  "5.2 apagado, un PDF forzado entra igual"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '              {...(MARKETING_PDF_EN_LA_PUERTA
                ? {' \
  '              {...(true
                ? {' \
  "5.3 apagado, el paso 3 igual llama a la IA (deja de ser la pantalla de hoy)"

echo
echo "────────────────────────────────────────────────────────────────────────"
echo "CONTROLES que fallaron (tiene que ser 0): $control_fallos"
echo "MUTACIONES cazadas: $cazadas · sobrevivientes: $sobrevivientes"

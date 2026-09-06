#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DEL REDISEÑO DE GUÍAS CAZAN DE VERDAD? (5-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. El CONTROL (sin mutar) tiene que quedar VERDE: una ✅ ahí
# significa que los candados están fallando por otra razón y todo el resto de la
# corrida no dice nada.
#
# Lo que Daniel aprobó y no se puede volver a romper:
#   1.  El número de factura: se guarda COMPLETO, se muestra CORTO, se compara
#       por los últimos 4 dígitos DENTRO de la misma empresa.
#   2.  «American Classics» deja de estar repetido: D-201 no se ofrece.
#   3.  La caja de BULTOS para bodega, solo con la guía pendiente.
#   4.  Queda registro de la corrección — y NO sale en el papel.
#   5.  Guardar deja de reescribir la guía entera. Nadie pierde acceso.
#   6.  El texto técnico de Observaciones deja de mostrarse (no se borra).
#   7.  El ámbar, solo para lo que se puede arreglar.
#   8.  Los restos muertos: sin lectores, y la columna NO se dropea.
#   9.  El estado «Rechazada» se retiró.
#   10. Compartir: imagen hasta 6 renglones, PDF de ahí para arriba.
#   11. Un solo «Guardar Guía».  12. BULTOS empieza vacío.
#   13. «Changinola» → «Changuinola».
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-guias-rediseno.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/guias-numero-factura.test.ts \
src/__tests__/lib/guias-american-classics.test.ts \
src/__tests__/lib/guias-bultos-de-bodega.test.ts \
src/__tests__/lib/guias-restos-y-ambar.test.ts \
src/__tests__/lib/guias-compartir-png.test.ts \
src/__tests__/components/guias-bultos-y-guardar.test.tsx \
src/__tests__/lib/guias-faltantes-despacho.test.ts \
src/__tests__/lib/guias-modo-despacho.test.ts \
src/__tests__/lib/guias-atajos-facturas.test.ts \
src/__tests__/lib/guia-pdf-compartir.test.ts \
src/__tests__/lib/clientes-nombre-display.test.ts \
src/__tests__/components/guias-papel-y-marcas.test.tsx \
src/__tests__/components/guias-sin-rechazo.test.tsx \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/guias/numero-factura.ts"
  "src/lib/guias/atajos-facturas.ts"
  "src/lib/guias/american-classics.ts"
  "src/lib/guias/bultos-correccion.ts"
  "src/lib/guias/observaciones.ts"
  "src/lib/guias/faltantes-despacho.ts"
  "src/lib/guias/modo-despacho.ts"
  "src/lib/guias/compartir-formato.ts"
  "src/lib/guias/png-guia.ts"
  "src/lib/guias/papel-de-la-guia.ts"
  "src/lib/guias/pdf-guia.ts"
  "src/components/ClientePicker.tsx"
  "src/app/guias/components/GuiaForm.tsx"
  "src/app/guias/components/GuiasList.tsx"
  "src/app/guias/components/ListaEnvios.tsx"
  "src/app/guias/components/PrintDocument.tsx"
  "src/app/guias/components/excel-guias.ts"
  "src/app/guias/components/useDespachoGuia.ts"
  "src/app/guias/components/useGuiaFormState.ts"
  "src/app/guias/components/FacturasDelCliente.tsx"
  "src/app/guias/components/AtarClienteModal.tsx"
  "src/app/guias/components/GuiaDetail.tsx"
  "src/app/guias/components/constants.ts"
  "src/app/guias/[id]/page.tsx"
  "src/app/api/guias/route.ts"
  "src/app/api/guias/[id]/route.ts"
  "src/app/api/guias/frecuencias/route.ts"
  "src/app/api/guias/despachos-frecuentes/route.ts"
  "supabase/migrations/20261004120000_guias_bultos_corregidos.sql"
  "supabase/migrations/20261005120000_guias_changuinola.sql"
  "supabase/migrations/20261006120000_guias_columnas_retiradas.sql"
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
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. EL NÚMERO DE FACTURA: COMPLETO ADENTRO, CORTO AFUERA ──────────────"

mutar "src/lib/guias/numero-factura.ts" \
  '  return d.length > DIGITOS_DE_LA_FACTURA ? d.slice(-DIGITOS_DE_LA_FACTURA) : d;' \
  '  return d;' \
  "1.1 la clave deja de recortar: el largo de Switch no parea con el corto viejo"

mutar "src/lib/guias/numero-factura.ts" \
  '  if (d === "" || /^0+$/.test(d)) return "";' \
  '  if (d === "") return "";' \
  "1.2 el «0000» viejo entra al índice: dos traslados se acusan de «ya salió»"

mutar "src/lib/guias/numero-factura.ts" \
  '  if (!SECUENCIAL_SWITCH.test(t)) return t;' \
  '  if (t.length <= 4) return t;' \
  "1.3 se recorta todo lo largo: una factura de 5 dígitos escrita a mano se muta"

mutar "src/lib/guias/atajos-facturas.ts" \
  'function claveYaSalio(empresaNombre: string | null | undefined, numeroNormalizado: string): string {
  return `${normalizarEmpresaGuia(empresaNombre)}|${numeroNormalizado}`;' \
  'function claveYaSalio(empresaNombre: string | null | undefined, numeroNormalizado: string): string {
  return `${numeroNormalizado}`;' \
  "1.4 el aviso deja de acotar por EMPRESA (2.449 choques medidos en 2026)"

mutar "src/app/guias/components/PrintDocument.tsx" \
  '{facturasParaMostrar(item.facturas)}' \
  '{item.facturas}' \
  "1.5 el PAPEL vuelve a imprimir los 12 caracteres"

mutar "src/lib/guias/pdf-guia.ts" \
  '          facturasParaMostrar(it.facturas),' \
  '          it.facturas ?? "",' \
  "1.6 el PDF vuelve a imprimir los 12 caracteres"

mutar "src/app/guias/components/excel-guias.ts" \
  '{ v: facturasParaMostrar(item?.facturas) || "", sz: 9, fg: "666666" },' \
  '{ v: item?.facturas || "", sz: 9, fg: "666666" },' \
  "1.7 el EXCEL vuelve a exportar el secuencial largo"

mutar "src/lib/guias/atajos-facturas.ts" \
  '      const previas = (r.facturas ?? "").trim();
      return { ...r, facturas: previas ? `${previas}, ${sec}` : sec };' \
  '      const previas = (r.facturas ?? "").trim();
      const corto = claveDeFactura(sec);
      return { ...r, facturas: previas ? `${previas}, ${corto}` : corto };' \
  "1.8 se GUARDA el corto: se pierde el número completo de Switch"

echo "── 2. «AMERICAN CLASSICS» NO SE REPITE ──────────────────────────────────"

mutar "src/lib/guias/american-classics.ts" \
  'export const CODIGOS_RETIRADOS_DE_GUIAS: readonly string[] = [
  CODIGO_AMERICAN_CLASSICS_RETIRADO,
];' \
  'export const CODIGOS_RETIRADOS_DE_GUIAS: readonly string[] = [];' \
  "2.1 D-201 vuelve a ofrecerse"

mutar "src/components/ClientePicker.tsx" \
  '  const hitsVisibles = ocultar(hits);' \
  '  const hitsVisibles = [...hits];' \
  "2.2 el retirado vuelve por la BÚSQUEDA"

mutar "src/components/ClientePicker.tsx" \
  '  const listaTop = q.length < 2 ? ocultar(topClientes ?? []) : [];' \
  '  const listaTop = q.length < 2 ? (topClientes ?? []) : [];' \
  "2.3 el retirado vuelve por «Más usados»"

mutar "src/components/ClientePicker.tsx" \
  '  const directorio = ocultar(directorioCrudo);' \
  '  const directorio = directorioCrudo;' \
  "2.4 el retirado vuelve por la red de seguridad"

mutar "src/app/guias/components/AtarClienteModal.tsx" \
  '            codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}' \
  '' \
  "2.5 «Atar cliente» puede volver a atar a D-201"

mutar "src/app/api/guias/frecuencias/route.ts" \
  '        .filter((c) => nameByCod.has(c) && !estaRetiradoDeGuias(c))' \
  '        .filter((c) => nameByCod.has(c))' \
  "2.6 el servidor vuelve a mandar a D-201 en «Más usados»"

mutar "src/lib/guias/american-classics.ts" \
  '/**
 * 🔑 EL NOMBRE NO SE DECIDE ACÁ.' \
  'export const NOMBRE_AQUI = "American Classics Store";
/**
 * 🔑 EL NOMBRE NO SE DECIDE ACÁ.' \
  "2.7 el alias se escribe por segunda vez (la pantalla se contradice)"

echo "── 3 y 4. LOS BULTOS DE BODEGA, Y SU RASTRO ─────────────────────────────"

mutar "src/lib/guias/bultos-correccion.ts" \
  'export function puedeCorregirBultos(despachada: boolean, puedeDespachar: boolean): boolean {
  return !despachada && puedeDespachar;' \
  'export function puedeCorregirBultos(despachada: boolean, puedeDespachar: boolean): boolean {
  return puedeDespachar;' \
  "3.1 se pueden tocar los bultos de una guía YA FIRMADA"

mutar "src/app/guias/components/ListaEnvios.tsx" \
  '          const puedeContar = editable && Boolean(setBultos);' \
  '          const puedeContar = Boolean(setBultos);' \
  "3.2 la caja aparece en una guía despachada"

mutar "src/lib/guias/bultos-correccion.ts" \
  '    if (ahora !== antes) salida.push({ id, bultos: ahora });' \
  '    salida.push({ id, bultos: ahora });' \
  "3.3 se escriben renglones que nadie tocó"

mutar "src/lib/guias/bultos-correccion.ts" \
  '    if (!id) return;' \
  '    if (!id) { salida.push({ id: "", bultos: Number(tecleados[i] ?? 0) }); return; }' \
  "3.4 viaja un renglón SIN id"

mutar "src/app/guias/components/useDespachoGuia.ts" \
  '    if (bultosCorregidos.length > 0) payload.items_bultos = bultosCorregidos;' \
  '    if (bultosCorregidos.length > 0) payload.items = items;' \
  "3.5 los bultos viajan por items del PUT (borra e inserta los renglones)"

mutar "src/app/api/guias/[id]/route.ts" \
  '  if (correccionesBultos.length > 0 && previous?.estado !== "Completada") {' \
  '  if (correccionesBultos.length > 0) {' \
  "3.6 el servidor deja corregir los bultos de una guía firmada"

mutar "src/app/api/guias/[id]/route.ts" \
  '.eq("id", c.id).eq("guia_id", id)).error;' \
  '.eq("id", c.id)).error;' \
  "3.7 se puede escribir la línea de OTRA guía"

mutar "src/lib/guias/bultos-correccion.ts" \
  '  if (a === b) return "";' \
  '  if (a === b) return `↑ ${a} → ${b}`;' \
  "4.1 el rastro en vivo acusa a quien solo miró la caja"

mutar "src/lib/guias/bultos-correccion.ts" \
  '  if (original == null) return null;' \
  '  if (original == null) return "Bultos corregidos: 0 → 0";' \
  "4.2 se afirma una corrección sin dato (migración pendiente)"

mutar "src/app/api/guias/[id]/route.ts" \
  '        cambio.bultos_original = antes.bultos_original ?? de;' \
  '        cambio.bultos_original = de;' \
  "4.3 la segunda corrección PISA el original"

mutar "src/lib/guias/png-guia.ts" \
  'import { observacionesVisibles } from "./observaciones";' \
  'import { observacionesVisibles } from "./observaciones";
const bultos_original = 0;' \
  "4.4 el rastro se cuela en la imagen que se comparte"

echo "── 5. GUARDAR MANDA SOLO LO QUE CAMBIÓ ──────────────────────────────────"

mutar "src/app/guias/components/useGuiaFormState.ts" \
  '    if (editingId && !calcularHayCambios(guardado, instantanea)) {' \
  '    if (false) {' \
  "5.1 guardar sin cambios vuelve a escribir la guía entera"

mutar "src/app/guias/components/useGuiaFormState.ts" \
  '    const mandarItems = !editingId || renglonesCambiaron(guardado, enviada);' \
  '    const mandarItems = true;' \
  "5.2 items viaja siempre: borra y recrea los 532 renglones"

echo "── 6. EL TEXTO TÉCNICO DE OBSERVACIONES ─────────────────────────────────"

mutar "src/lib/guias/observaciones.ts" \
  '    .filter((l) => !esLaLineaTecnica(l))' \
  '    .filter(() => true)' \
  "6.1 vuelve a verse «Cerrada en bloque…» en 54 guías"

mutar "src/lib/guias/observaciones.ts" \
  '  const t = linea.trim().replace(/\.$/, "");
  return t === TEXTO_CIERRE_EN_BLOQUE;' \
  '  return linea.includes("3-ago-2026");' \
  "6.2 se compara un pedazo: una nota que menciona la fecha desaparece"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                  {observacionesVisibles(expandedGuia.observaciones) && (' \
  '                                  {expandedGuia.observaciones && (' \
  "6.3 el acordeón de la lista lo vuelve a mostrar"

mutar "src/lib/guias/pdf-guia.ts" \
  '  const textoObs = observacionesVisibles(g.observaciones);' \
  '  const textoObs = String(g.observaciones ?? "");' \
  "6.4 el PDF lo vuelve a imprimir"

echo "── 7. EL ÁMBAR, SOLO PARA LO QUE SE PUEDE ARREGLAR ──────────────────────"

mutar "src/lib/guias/faltantes-despacho.ts" \
  '  if (esAnteriorAlBloqueo(g.fecha)) return [];' \
  '' \
  "7.1 vuelven las 65 marcas permanentes que nadie puede quitar"

mutar "src/lib/guias/faltantes-despacho.ts" \
  'export const FECHA_BLOQUEO_DESPACHO = "2026-08-10";' \
  'export const FECHA_BLOQUEO_DESPACHO = "2027-01-01";' \
  "7.2 el corte se corre y deja de marcar lo NUEVO (la regla se apaga)"

mutar "src/lib/guias/faltantes-despacho.ts" \
  '  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;' \
  '  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return true;' \
  "7.3 sin fecha se CALLA en vez de decir (ante la duda, callar)"

echo "── 8 y 9. LOS RESTOS MUERTOS Y «RECHAZADA» ──────────────────────────────"

mutar "src/app/api/guias/[id]/route.ts" \
  '"tipo_despacho", "nombre_chofer"];' \
  '"tipo_despacho", "nombre_chofer", "motivo_rechazo", "nombre_entregador"];' \
  "8.1 el PATCH vuelve a aceptar columnas muertas"

mutar "src/app/api/guias/route.ts" \
  'transportistas(nombre), placa, observaciones, estado' \
  'transportistas(nombre), placa, observaciones, monto_total, estado' \
  "8.2 monto_total vuelve a viajar al navegador en cada carga"

mutar "supabase/migrations/20261006120000_guias_columnas_retiradas.sql" \
  'COMMENT ON COLUMN guia_transporte.monto_total IS' \
  'ALTER TABLE guia_transporte DROP COLUMN monto_total;
COMMENT ON COLUMN guia_transporte.monto_total IS' \
  "8.3 una migración DROPEA una columna retirada"

mutar "src/lib/guias/modo-despacho.ts" \
  '  return estado === "Completada";' \
  '  return estado === "Completada" || estado === "Rechazada";' \
  "9.1 «Rechazada» vuelve a contar como despachada"

mutar "src/app/api/guias/despachos-frecuentes/route.ts" \
  '      .eq("estado", "Completada")' \
  '      .in("estado", ["Completada", "Rechazada"])' \
  "9.2 los juegos frecuentes vuelven a leer «Rechazada»"

echo "── 10. COMPARTIR: IMAGEN HASTA 6, PDF DE AHÍ PARA ARRIBA ────────────────"

mutar "src/lib/guias/compartir-formato.ts" \
  'export const MAX_RENGLONES_PNG = 6;' \
  'export const MAX_RENGLONES_PNG = 3;' \
  "10.1 el corte se mueve de 6 a 3 (el 94% medido deja de entrar)"

mutar "src/lib/guias/compartir-formato.ts" \
  '  if (!Number.isFinite(n) || n <= 0) return "pdf";' \
  '  if (!Number.isFinite(n) || n <= 0) return "png";' \
  "10.2 una guía sin renglones se comparte como imagen vacía"

mutar "src/lib/guias/papel-de-la-guia.ts" \
  '  if (formatoParaCompartir((g.guia_items ?? []).length) === "png") {
    const png = construirPngGuia(g);
    if (png) return png;
  }' \
  '  if ((g.guia_items ?? []).length <= 6) {
    const png = construirPngGuia(g);
    if (png) return png;
  }' \
  "10.3 el corte se escribe a mano en vez de salir del módulo puro"

mutar "src/lib/guias/papel-de-la-guia.ts" \
  'function archivoParaCompartir(g: Guia): File {' \
  'async function archivoParaCompartir(g: Guia): Promise<File> {
  await Promise.resolve();' \
  "10.4 se cuela un await antes de la hoja de compartir (iOS la bloquea)"

mutar "src/lib/guias/png-guia.ts" \
  '  if (img && img.complete && img.naturalWidth > 0) return img;' \
  '  if (img) return img;' \
  "10.5 se dibuja una firma que todavía no se decodificó"

mutar "src/app/guias/components/GuiaDetail.tsx" \
  '      const r = await compartirGuia(guia);' \
  '      const { construirPdfGuia, nombreArchivoGuia } = await import("@/lib/guias/pdf-guia");
      const blob = construirPdfGuia(guia).output("blob");
      const r = await (async () => { void blob; void nombreArchivoGuia; return "compartido" as const; })();' \
  "10.6 vuelve la SEGUNDA copia del armado del PDF"

echo "── 11, 12 y 13. UN SOLO GUARDAR · BULTOS VACÍO · CHANGUINOLA ────────────"

mutar "src/app/guias/components/GuiaForm.tsx" \
  '          <span className="hidden sm:block truncate"><StatusBadge /></span>
        </div>' \
  '          <span className="hidden sm:block truncate"><StatusBadge /></span>
        </div>
          <SaveButton />' \
  "11.1 vuelve el segundo botón de guardar"

mutar "src/app/guias/components/GuiaForm.tsx" \
  '          value={item.bultos || ""}' \
  '          value={item.bultos || ""}
          placeholder="0"' \
  "12.1 vuelve el «0» dentro de la caja de bultos"

mutar "src/app/guias/components/constants.ts" \
  '"Guabito", "Changuinola"];' \
  '"Guabito", "Changinola"];' \
  "13.1 la lista vuelve a ofrecer la grafía mala"

mutar "supabase/migrations/20261005120000_guias_changuinola.sql" \
  " WHERE btrim(direccion) = 'Changinola';" \
  " WHERE direccion ILIKE '%Changinola%';" \
  "13.2 la migración usa un LIKE suelto y pisa «Changinola pasillo 4»"

echo "── CONTROL 2 — un cambio REAL que ninguna regla prohíbe ─────────────────"
# Si el candado caza esto, está amarrado a la letra del código en vez de a la
# conducta. Lo bueno acá es el «🔴 SOBREVIVIÓ» (0 fallos).
restaurar
python3 - <<'PY2'
p = "src/lib/guias/bultos-correccion.ts"
s = open(p).read()
s = s.replace("/** Cómo se nombra en pantalla a quien está corrigiendo, por su rol. */",
              "/** El rótulo de quien corrige, por rol (comentario reescrito a propósito). */")
s = s.replace("const PALABRA_POR_ROL: Record<string, string> = {",
              "const PALABRA_POR_ROL: Readonly<Record<string, string>> = {")
open(p, "w").write(s)
PY2
antes_control2=$cazadas
probar "CONTROL 2 — comentario + tipo Readonly. Lo BUENO acá es el 🔴 (0 fallos)"
if [ "$cazadas" -gt "$antes_control2" ]; then
  control2_fallo=1
  cazadas=$((cazadas - 1))
else
  control2_fallo=0
  sobrevivientes=$((sobrevivientes - 1))
fi
restaurar

echo
echo "═══════════════════════════════════════════════════════════════════════════"
echo "  CONTROL 1 (sin mutar):        $control_fallos fallos — tiene que ser 0"
echo "  CONTROL 2 (comentario+tipo):  $control2_fallo  — tiene que ser 0"
echo "  Mutaciones cazadas:           $cazadas"
echo "  Sobrevivientes:               $sobrevivientes"
echo "═══════════════════════════════════════════════════════════════════════════"

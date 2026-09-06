#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «LA GUÍA EN EL TELÉFONO» CAZAN DE VERDAD? (5-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES tienen que quedar VERDES: un ✅ ahí significa que
# los candados fallan por otra razón y el resto de la corrida no dice nada.
#
# Los cuatro que Daniel aprobó («van todos»), y que no se pueden volver a romper:
#   1. Fuera la tabla que se corta: en el teléfono, ficha; de `lg:` para arriba,
#      tabla. Y la ficha es la MISMA de `ListaEnvios`, no una copia.
#   2. Las firmas, plegadas al MIRAR — y ENTERAS al firmar, en el papel, en el
#      PDF y en la imagen. Si falta una, se dice cuál.
#   3. La lista está SIEMPRE agrupada por fecha: el botón que la apagaba se
#      RETIRÓ (Daniel: «el chip por fecha y todos quítalo. Siempre ordenado por
#      fecha»), y no vuelve ni disfrazado de control de dos opciones.
#   4. La cédula con guiones, SOLO al mostrarla, y sin inventar guiones en lo
#      que no parece una cédula.
#   5. El chip verde «despachada» se fue (221 de 222); solo se pinta lo que
#      espera. Arriba va la línea de lo que falta, y LLEVA a esa guía.
#   6. La pendiente sube arriba, con «Despachar» a la vista.
#   7. «Compartir» e «Imprimir» en la fila; «Editar» y «Eliminar» en el «···».
#      Y el papel se pide COMPLETO: la fila no trae las firmas.
#   8. La lista abre con el último mes; el resto, detrás del botón.
#   9. El orden de lo que se lee: cliente arriba, transportista al final; la
#      fecha y el estado salen de la fila.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-guias-celular.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/guias-cedula-con-guiones.test.ts \
src/__tests__/lib/guias-firmas-plegadas.test.ts \
src/__tests__/components/guias-en-el-telefono.test.tsx \
src/__tests__/components/guias-anotar-numero-tarde.test.tsx \
src/__tests__/components/guias-cliente-una-sola-vez.test.tsx \
src/__tests__/lib/guias-numero-factura.test.ts \
src/__tests__/lib/guias-chip-nombre-y-candado.test.ts \
src/__tests__/lib/guias-lista-834-columnas.test.ts \
src/__tests__/components/guias-panel-que-se-lee.test.tsx \
src/__tests__/lib/guias-ventana-y-pendientes.test.ts \
src/__tests__/components/guias-eliminar-en-la-fila.test.tsx \
src/__tests__/components/guias-sin-rechazo.test.tsx \
src/__tests__/components/guias-entrega-directa.test.tsx \
src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/guias/cedula.ts"
  "src/lib/guias/ventana-lista.ts"
  "src/lib/guias/pendientes-arriba.ts"
  "src/lib/guias/firmas-resumen.ts"
  "src/lib/guias/pdf-guia.ts"
  "src/app/guias/components/ResumenEnvio.tsx"
  "src/app/guias/components/FirmasPlegadas.tsx"
  "src/app/guias/components/GuiasList.tsx"
  "src/app/guias/components/ListaEnvios.tsx"
  "src/app/guias/components/PrintDocument.tsx"
  "src/app/guias/components/DespachoForm.tsx"
  "src/app/guias/components/SignatureCanvas.tsx"
  "src/app/guias/[id]/page.tsx"
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

echo "── 1. FUERA LA TABLA QUE SE CORTA ───────────────────────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  'className="mt-4 hidden lg:block">' \
  'className="mt-4">' \
  "1.1 la tabla de 600 px vuelve a verse en el teléfono"

mutar "src/app/guias/components/GuiasList.tsx" \
  '<ul className="lg:hidden divide-y divide-gray-100 mt-4">' \
  '<ul className="divide-y divide-gray-100 mt-4">' \
  "1.2 la ficha se dibuja TAMBIÉN en escritorio: los renglones, dos veces"

mutar "src/app/guias/components/GuiasList.tsx" \
  'className="mt-4 hidden lg:block">' \
  'className="mt-4 hidden md:block">' \
  "1.3 el corte se mueve a md: — el iPad vertical vuelve a arrastrar"

mutar "src/app/guias/components/ResumenEnvio.tsx" \
  '  const detalle = [item.direccion, item.empresa, facturasParaMostrar(item.facturas)]' \
  '  const detalle = [item.direccion, item.empresa]' \
  "1.4 la ficha deja de decir la factura"

mutar "src/app/guias/components/ResumenEnvio.tsx" \
  'facturasParaMostrar(item.facturas)]' \
  'item.facturas]' \
  "1.5 la ficha imprime la factura CRUDA de Switch (11-000002534)"

mutar "src/app/guias/components/GuiasList.tsx" \
  '<span className="text-sm tabular-nums shrink-0">{item.bultos || 0} bultos</span>' \
  '<span className="text-sm tabular-nums shrink-0"></span>' \
  "1.6 la ficha pierde los bultos"

mutar "src/app/guias/components/GuiasList.tsx" \
  '    const claseTexto = ficha ? "text-sm" : "text-xs";' \
  '    const claseTexto = "text-xs";' \
  "1.7 el nombre de la ficha vuelve a 12 px"

mutar "src/app/guias/components/GuiasList.tsx" \
  '    {!nombreDelChip(item) && (' \
  '    {true && (' \
  "1.8 el nombre se dibuja DOS veces: el escrito y el del chip"

mutar "src/app/guias/components/ListaEnvios.tsx" \
  '              <ResumenEnvio item={item} />' \
  '              <div className="min-w-0"><span className="text-sm font-medium">{item.cliente}</span></div>' \
  "1.9 la pantalla de despacho deja de delegar y se escribe su propia línea"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                      <li className="py-2.5 text-sm text-gray-400">Esta guía no tiene envíos cargados.</li>' \
  '                                      <li className="py-2.5" />' \
  "1.10 una guía sin renglones deja el hueco en blanco"

echo "── 2. LAS FIRMAS, PLEGADAS AL MIRAR ─────────────────────────────────────"

mutar "src/lib/guias/firmas-resumen.ts" \
  '  if (t) return { completas: false, hayAlguna: true, texto: `Falta la firma del ${quien(etiquetaFirmaEntregador(directa))}` };' \
  '  if (t) return { completas: true, hayAlguna: true, texto: "✓ Firmada por las dos partes" };' \
  "2.1 con UNA firma dice que está firmada por las dos partes"

mutar "src/lib/guias/firmas-resumen.ts" \
  '  return { completas: false, hayAlguna: false, texto: "" };' \
  '  return { completas: false, hayAlguna: true, texto: "Sin firmas" };' \
  "2.2 las 65 guías viejas estrenan un cartel que nadie pidió"

mutar "src/lib/guias/firmas-resumen.ts" \
  '  return directa ? "Firma del chofer" : "Firma del transportista";' \
  '  return directa ? "Firma del transportista" : "Firma del chofer";' \
  "2.3 en entrega directa los rótulos se cruzan"

mutar "src/app/guias/components/FirmasPlegadas.tsx" \
  '  const [abierto, setAbierto] = useState(false);' \
  '  const [abierto, setAbierto] = useState(true);' \
  "2.4 vuelve a abrir con los dos cuadros desplegados"

mutar "src/app/guias/components/FirmasPlegadas.tsx" \
  '  if (!resumen.hayAlguna) return null;' \
  '  if (false) return null;' \
  "2.5 se dibuja el bloque aunque no haya ni una firma"

mutar "src/app/guias/components/DespachoForm.tsx" \
  'import SignatureCanvas from "./SignatureCanvas";' \
  'import SignatureCanvas from "./SignatureCanvas";\nimport FirmasPlegadas from "./FirmasPlegadas";' \
  "2.6 el plegado se cuela en la pantalla de FIRMAR"

mutar "src/app/guias/components/SignatureCanvas.tsx" \
  'style={{ height: 150 }}' \
  'style={{ height: 60 }}' \
  "2.7 el cuadro de firmar encoge a 60 px"

mutar "src/app/guias/components/PrintDocument.tsx" \
  '              {g.firma_entregador_base64 ? (' \
  '              {false ? (' \
  "2.8 el papel deja de imprimir la firma del entregador"

echo "── 3. LA LISTA, SIEMPRE AGRUPADA POR FECHA ──────────────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const _gg = groupByTimePeriod(visible, "fecha" as keyof Guia, "guias");' \
  '                const _gg: ReturnType<typeof groupByTimePeriod> = [];' \
  "3.1 se pierde el agrupado por fecha: la lista queda plana para siempre"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                className="border border-gray-200 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm outline-none focus:border-black w-full max-w-sm transition"
              />' \
  '                className="border border-gray-200 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm outline-none focus:border-black w-full max-w-sm transition"
              />
              <button type="button" className="text-xs">Lista plana</button>' \
  "3.2 vuelve el botón que nombraba el destino en vez del estado"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                className="border border-gray-200 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm outline-none focus:border-black w-full max-w-sm transition"
              />' \
  '                className="border border-gray-200 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm outline-none focus:border-black w-full max-w-sm transition"
              />
              <div data-control-segmentado role="tablist"><button role="tab" aria-selected="true">Por fecha</button><button role="tab" aria-selected="false">Todas</button></div>' \
  "3.3 vuelve disfrazado de control de dos opciones"

echo "── 4. LA CÉDULA, CON GUIONES ────────────────────────────────────────────"

mutar "src/lib/guias/cedula.ts" \
  'const TOMO = 3;' \
  'const TOMO = 4;' \
  "4.1 el tomo arranca en 4: 89822270 saldría 8-9822-270"

mutar "src/lib/guias/cedula.ts" \
  '  for (let tomo = TOMO; tomo <= MAX_PARTE; tomo++) {' \
  '  for (let tomo = TOMO; tomo <= TOMO; tomo++) {' \
  "4.2 nunca sube a tomo de 4: 810102403 se quedaría sin guiones"

mutar "src/lib/guias/cedula.ts" \
  'const MIN_FOLIO = 2;' \
  'const MIN_FOLIO = 1;' \
  "4.3 una cédula a medias (88246) se decora igual"

mutar "src/lib/guias/cedula.ts" \
  'const MAX_PARTE = 4;' \
  'const MAX_PARTE = 5;' \
  "4.4 se le inventan guiones a los 10 dígitos que no son cédula"

mutar "src/lib/guias/cedula.ts" \
  'const YA_PARTIDA = /^([0-9]{1,2}|[A-Za-z]{1,2})\s*-\s*([0-9]{1,4})\s*-\s*([0-9]{1,6})$/;' \
  'const YA_PARTIDA = /^([0-9]{1,2}|[A-Za-z]{1,2})-([0-9]{1,4})-([0-9]{1,6})$/;' \
  "4.5 los espacios de más ya no se ordenan (E- 8-73291)"

mutar "src/lib/guias/cedula.ts" \
  '  if (!/^[0-9]+$/.test(pelada)) return original;' \
  '  if (!/^[0-9]+$/.test(pelada)) return pelada;' \
  "4.6 un pasaporte pierde sus espacios en vez de mostrarse tal cual"

mutar "src/app/guias/components/PrintDocument.tsx" \
  '<span className="ml-1 font-medium">{cedulaParaMostrar(g.cedula)}</span>' \
  '<span className="ml-1 font-medium">{g.cedula || ""}</span>' \
  "4.7 el papel vuelve a imprimir 89822270"

mutar "src/lib/guias/pdf-guia.ts" \
  '    cedula: cedulaParaMostrar(g.cedula),' \
  '    cedula: g.cedula ?? "",' \
  "4.8 el PDF vuelve a imprimir la cédula pelada"

mutar "src/app/guias/components/DespachoForm.tsx" \
  '                        {j.cedula} · {j.placa}' \
  '                        {cedulaParaMostrar(j.cedula)} · {j.placa}' \
  "4.9 el formulario formatea lo que va a GUARDAR"

echo "── 5. EL COLOR SE RESERVA PARA LO QUE ESPERA ────────────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                              {!isDispatched && (
                                <span className="shrink-0">
                                  <StatusBadge estado="pendiente" />
                                </span>
                              )}' \
  '                              <span className="shrink-0">
                                <StatusBadge estado={isDispatched ? "despachada" : "pendiente"} />
                              </span>' \
  "5.1 vuelve el chip verde en las 221 despachadas"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                {!isDispatched && (
                                  <span className="shrink-0"><StatusBadge estado="pendiente" /></span>
                                )}' \
  '                                <span className="shrink-0"><StatusBadge estado={isDispatched ? "despachada" : "pendiente"} /></span>' \
  "5.2 lo mismo en la tarjeta del teléfono"

mutar "src/app/guias/components/GuiasList.tsx" \
  '          if (!avisoPendientes) return null;' \
  '          if (false) return null;' \
  "5.3 la línea de arriba sale aunque no haya nada que despachar"

mutar "src/lib/guias/pendientes-arriba.ts" \
  '  if (pendientes.length === 0) return null;' \
  '  if (pendientes.length === -1) return null;' \
  "5.4 con cero pendientes se arma igual el resumen"

mutar "src/app/guias/components/GuiasList.tsx" \
  '              onClick={() => abrirFila(avisoPendientes.guiaId)}' \
  '              onClick={() => {}}' \
  "5.5 la línea deja de llevar a la guía"

mutar "src/lib/guias/pendientes-arriba.ts" \
  '  if (dias <= 0) return "hoy";' \
  '  if (dias <= 0) return "hace 0 días";' \
  "5.6 el día de hoy se dice como «hace 0 días»"

echo "── 6. LA PENDIENTE, ARRIBA Y CON SU ACCIÓN ──────────────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                    {pendientes.length > 0 && (
                      <div className="space-y-1 mb-3">{pendientes.map(_rc)}</div>
                    )}' \
  '' \
  "6.1 la pendiente vuelve a quedar enterrada entre las 221"

mutar "src/lib/guias/pendientes-arriba.ts" \
  '  for (const g of guias) (esPendiente(g) ? pendientes : resto).push(g);' \
  '  for (const g of guias) resto.push(g);' \
  "6.2 nada se separa: no hay pendientes nunca"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                              {canEdit && !isDispatched && g.estado === "Pendiente Bodega" && (' \
  '                              {canEdit && isDispatched && g.estado === "Pendiente Bodega" && (' \
  "6.3 «Despachar» desaparece de la guía que espera"

echo "── 7. LAS ACCIONES EN LA FILA, Y EL PAPEL COMPLETO ──────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                aria-label={`Imprimir la guía ${fmtGuia(g.numero)}`}' \
  '                                aria-label={`Papel ${fmtGuia(g.numero)}`}' \
  "7.1 «Imprimir» pierde su nombre y deja de encontrarse"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                    ...(canEdit ? [{ label: "Editar", onClick: () => onEditar(g.id) }] : []),' \
  '' \
  "7.2 «Editar» se cae del menú y no queda en ningún lado"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                    ...(canDelete ? [{ label: "Eliminar guía", onClick: () => onDelete(g.id), destructive: true }] : []),' \
  '                                    { label: "Eliminar guía", onClick: () => onDelete(g.id), destructive: true },' \
  "7.3 bodega y vendedor pueden borrar una guía desde el menú"

mutar "src/app/guias/components/GuiasList.tsx" \
  '    if ("firma_base64" in g) return Promise.resolve(g);' \
  '    return Promise.resolve(g);' \
  "7.4 el papel se imprime SIN las firmas: la fila no las trae"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                onPointerDown={() => prepararPapel(g)}
                                onClick={() => { void imprimirEsta(g); }}' \
  '                                onClick={() => { void imprimirEsta(g); }}' \
  "7.5 la lectura deja de arrancar en el pointerdown"

echo "── 8. LA VENTANA DEL ÚLTIMO MES ─────────────────────────────────────────"

mutar "src/lib/guias/ventana-lista.ts" \
  'export const DIAS_VENTANA_GUIAS = 30;' \
  'export const DIAS_VENTANA_GUIAS = 3650;' \
  "8.1 la ventana se abre a diez años: vuelven las 222 de un golpe"

mutar "src/lib/guias/ventana-lista.ts" \
  '  const hoy = new Date(`${diaPanama(ahora)}T00:00:00Z`);' \
  '  const hoy = ahora;' \
  "8.2 el corte vuelve a depender de la hora: la guía de hace un mes se cae"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                const visible = verViejas ? [...resto, ...viejas] : resto;' \
  '                const visible = resto;' \
  "8.3 «Ver guías más viejas» no trae nada"

mutar "src/lib/guias/ventana-lista.ts" \
  '  return { recientes: recientes.map((a) => a.guia), viejas: viejos.map((a) => a.guia) };' \
  '  return { recientes: recientes.map((a) => a.guia), viejas: [] };' \
  "8.4 lo viejo se pierde en silencio en vez de quedar detrás del botón"

echo "── 9. EL ORDEN DE LO QUE SE LEE ─────────────────────────────────────────"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                              <span className="flex-[3_1_0] min-w-0 truncate font-medium">
                                {clientesSummary(g.guia_items || []) || "Sin cliente"}
                              </span>
                              <span className="text-gray-400 text-xs flex-[2_1_0] min-w-0 truncate">
                                {destinosSummary(g.guia_items || [])}
                              </span>' \
  '                              <span className="flex-[3_1_0] min-w-0 truncate font-medium">
                                {g.transportista}
                              </span>
                              <span className="text-gray-400 text-xs flex-[2_1_0] min-w-0 truncate">
                                {clientesSummary(g.guia_items || [])}
                              </span>' \
  "9.1 el transportista vuelve a ser lo más grande de la fila"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                              <span className="text-gray-500 w-28 xl:w-36 shrink-0 text-xs truncate">{g.transportista}</span>' \
  '                              <span className="text-gray-500 w-28 xl:w-36 shrink-0 text-xs truncate">{fmtDate(g.fecha)}</span>' \
  "9.2 vuelve la fecha a la fila y se pierde el transportista"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                  <span className="font-medium truncate">
                                    {clientesSummary(g.guia_items || []) || "Sin cliente"}
                                  </span>' \
  '                                  <span className="font-medium truncate">{g.transportista}</span>' \
  "9.3 en el teléfono vuelve el transportista arriba y en negrita"

mutar "src/app/guias/components/GuiasList.tsx" \
  '                                {[destinosSummary(g.guia_items || []), `${g.total_bultos} bultos`, g.transportista]' \
  '                                {[destinosSummary(g.guia_items || []), `${g.total_bultos} bultos`]' \
  "9.4 la línea gris del teléfono se queda sin transportista"

echo "── CONTROL 2 — un cambio REAL que ninguna regla prohíbe ──────────────────"
# Si el candado caza esto, está amarrado a la letra del código en vez de a la
# conducta. Lo bueno acá es el «🔴 SOBREVIVIÓ» (0 fallos).
restaurar
python3 - <<'PY2'
p = "src/lib/guias/firmas-resumen.ts"
s = open(p).read()
s = s.replace("/** Las dos están. */", "/** Están las dos (comentario reescrito a propósito). */")
s = s.replace("export interface GuiaConFirmas {", "export interface GuiaConFirmas extends Readonly<Record<string, unknown>> {")
open(p, "w").write(s)
PY2
antes_control2=$cazadas
probar "CONTROL 2 — comentario + tipo. Lo BUENO acá es el 🔴 (0 fallos)"
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

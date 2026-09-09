#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de LA FLECHITA de Comisiones (8-sep-2026) CAZAN de verdad?
#
# Lo que cubren:
#   1  la flechita ↓ SOLO donde hay algo que bajar (una celda en guion no la lleva)
#   2  tocar el número SIGUE abriendo el detalle (la flecha agrega, no reemplaza)
#   3  la flecha de una CELDA baja UNA empresa
#   4  la flecha del TOTAL baja TODAS las empresas de esa persona, en un archivo
#   5  los dos botones de arriba: el mes en PDF y el mes en Excel
#   6  el de arriba trae LAS SEIS empresas, y el papel dice lo mismo que la pantalla
#   7  con «Todo el año» no hay flecha ni PDF (el reporte por vendedor es de un mes)
#   8  son los MISMOS archivos de siempre (mismo generador, misma lectura, mismo nombre)
#   9  imprimir con el nombre correcto vive en UN solo lugar
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-comisiones-flecha.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comisiones-flecha.test.ts \
src/__tests__/components/comisiones-flecha-pantalla.test.tsx \
src/__tests__/lib/comisiones-forma.test.ts \
src/__tests__/components/comisiones-forma-pantalla.test.tsx \
src/__tests__/iphone-comisiones-encabezado.test.ts \
src/__tests__/desplegables-flotan.test.ts \
src/__tests__/lib/comisiones-contabilidad.test.tsx \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/comisiones/descarga.ts"
  "src/lib/comisiones/matriz-celda.ts"
  "src/lib/comisiones/nombre-archivo.ts"
  "src/lib/comisiones/imprimir.ts"
  "src/lib/ventas/comisionExcel.ts"
  "src/components/ventas/ComisionesView.tsx"
  "src/components/ventas/ComisionesConsolidadoView.tsx"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
  "src/components/ventas/ComisionesTarjetas.tsx"
  "src/components/ventas/ComisionesDetalleModal.tsx"
  "src/components/ventas/comisiones-detalle/MenuDescargaComision.tsx"
  "src/components/ventas/comisiones-detalle/useDescargaComision.tsx"
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

# ═══ 1 · La flecha SOLO donde hay algo que bajar ═════════════════════════════

mutar "src/lib/comisiones/descarga.ts" \
  "  return !celdaVacia(valor, descuento);" \
  "  return true;" \
  "la flechita se dibuja también en una celda VACÍA (encima de un guion)"

mutar "src/lib/comisiones/descarga.ts" \
  "  return !celdaVacia(valor, descuento);" \
  "  return valor !== undefined;" \
  "la regla se escribe de nuevo y deja de ser la del guion (cero con flecha)"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "        const conFlecha = conDescarga && hayQueDescargar(val, desc);" \
  "        const conFlecha = false;" \
  "la flechita desaparece de la matriz"

# ═══ 2 · La flecha AGREGA un camino; no reemplaza ninguno ════════════════════

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "            onClick={conDetalle ? (e) => { e.stopPropagation(); detalleDe(k, r.vendedor); } : undefined}" \
  "            onClick={undefined}" \
  "tocar el número deja de abrir el detalle (la flecha lo reemplazó)"

mutar "src/components/ventas/comisiones-detalle/MenuDescargaComision.tsx" \
  '<span className="inline-flex" onClick={(e) => e.stopPropagation()}>' \
  '<span className="inline-flex">' \
  "tocar la flecha ADEMÁS abre el detalle (el clic se escapa a la celda)"

# ═══ 3 y 4 · Los alcances ════════════════════════════════════════════════════

mutar "src/lib/comisiones/descarga.ts" \
  "  return empresas.filter((k) =>" \
  "  return empresas.slice(0, 1).filter((k) =>" \
  "la flecha del Total baja UNA sola empresa en vez de todas"

mutar "src/lib/comisiones/descarga.ts" \
  "    hayQueDescargar(porEmpresa?.[k], descuentoPorEmpresa?.[k] ?? 0)," \
  "    porEmpresa?.[k] !== undefined," \
  "el alcance del Total mete empresas en cero (hojas vacías en el archivo)"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "    empresasConComision(r.porEmpresa, r.descuentoPorEmpresa, EMPRESAS)" \
  "    EMPRESAS.slice(0, 1)" \
  "la matriz arma el alcance del Total a mano, con una empresa"

mutar "src/components/ventas/comisiones-detalle/useDescargaComision.tsx" \
  "      if (cargados.length === 1) {" \
  "      if (cargados.length >= 1) {" \
  "varias empresas bajan como si fueran una (se pierde el resto)"

mutar "src/components/ventas/comisiones-detalle/useDescargaComision.tsx" \
  "      Promise.all(empresas.map((e) => cargarUna(e, year, mes, vendedor))),
" \
  "      Promise.all(empresas.slice(0, 1).map((e) => cargarUna(e, year, mes, vendedor))),
" \
  "el motor solo lee la primera empresa del alcance"

# ═══ 5 y 6 · Los dos botones de arriba ══════════════════════════════════════

mutar "src/lib/comisiones/descarga.ts" \
  'export const ROTULO_DESCARGAR_MES_PDF = "Descargar el mes en PDF";' \
  'export const ROTULO_DESCARGAR_MES_PDF = "Exportar PDF";' \
  "el botón de arriba dice «Exportar» en vez de «Descargar»"

mutar "src/lib/comisiones/descarga.ts" \
  "  return esTodoElAnio(mes) ? base : \`\${base} en Excel\`;" \
  "  return base;" \
  "los dos botones dicen lo mismo (no se sabe cuál trae qué)"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "            ...EMPRESAS.map((k) => ({ header: nombreCortoEmpresa(k), numerica: true }))," \
  "            ...EMPRESAS.slice(0, 1).map((k) => ({ header: nombreCortoEmpresa(k), numerica: true }))," \
  "el papel del mes dibuja UNA columna de empresa en vez de las seis"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "        ...EMPRESAS.map((k) => fmtMoney(r.porEmpresa[k] ?? 0))," \
  "        ...EMPRESAS.slice(0, 1).map((k) => fmtMoney(r.porEmpresa[k] ?? 0))," \
  "el papel del mes baja UNA hoja en vez de las SEIS empresas"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "    const todas = [...conActividad, ...(sinAsignar ? [sinAsignar] : [])];" \
  "    const todas = [...activos];" \
  "el papel del mes se olvida de los que no se pagan (que el Excel sí lleva)"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "            ...EMPRESAS.map((k) => fmtMoney(colTotal(k)))," \
  "            ...EMPRESAS.map((k) => fmtMoney(0))," \
  "el pie del papel deja de decir lo mismo que el pie de la pantalla"

mutar "src/components/ventas/ComisionesView.tsx" \
  "        {conPdfDelPeriodo(mes) && (" \
  "        {false && (" \
  "se va el botón «Descargar el mes en PDF»"

# ═══ 7 · «Todo el año» no ofrece lo que no existe ═══════════════════════════

mutar "src/lib/comisiones/descarga.ts" \
  "export function conDescargaPorVendedor(mes: number): boolean {
  return !esTodoElAnio(mes);
}" \
  "export function conDescargaPorVendedor(mes: number): boolean {
  return true;
}" \
  "con «Todo el año» aparece una flecha que promete un reporte que no existe"

mutar "src/lib/comisiones/descarga.ts" \
  "export function conPdfDelPeriodo(mes: number): boolean {
  return !esTodoElAnio(mes);
}" \
  "export function conPdfDelPeriodo(mes: number): boolean {
  return true;
}" \
  "con «Todo el año» aparece el botón de PDF del mes"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "  const conDescarga = conDescargaPorVendedor(mes);" \
  "  const conDescarga = true;" \
  "la matriz decide sola y dibuja la flecha con «Todo el año»"

# ═══ 8 · Son los MISMOS archivos de siempre ═════════════════════════════════

mutar "src/lib/comisiones/nombre-archivo.ts" \
  '  return ["Comisión", quien, "Todas", sufijoArchivoPeriodo(year, mes)]' \
  '  return ["Comisión", quien, sufijoArchivoPeriodo(year, mes)]' \
  "el archivo de TODAS las empresas se llama igual que el de una sola"

mutar "src/lib/comisiones/nombre-archivo.ts" \
  "  return \`comisiones-consolidado-\${sufijoArchivoPeriodo(year, mes)}\`;" \
  "  return \`comisiones-mes-\${sufijoArchivoPeriodo(year, mes)}\`;" \
  "el PDF del mes deja de llamarse como su Excel"

mutar "src/components/ventas/comisiones-detalle/useDescargaComision.tsx" \
  "  const nombreDe = useCallback(
    (empresas: EmpresaDelAlcance[], vendedor: string) =>
      empresas.length === 1" \
  "  const nombreDe = useCallback(
    (empresas: EmpresaDelAlcance[], vendedor: string) =>
      empresas.length >= 1" \
  "el archivo de varias empresas toma el nombre de la primera"

mutar "src/components/ventas/comisiones-detalle/useDescargaComision.tsx" \
  "      porImprimir.current = true;
      setHojas(cargados);" \
  "      porImprimir.current = true;
      setHojas([]);" \
  "el PDF se manda a imprimir sin montar el papel (hoja en blanco)"

# ═══ 9 · Imprimir con el nombre correcto, en UN solo lugar ══════════════════

mutar "src/lib/comisiones/imprimir.ts" \
  "  document.title = anterior;" \
  "  document.title = document.title;" \
  "el título de toda la app queda renombrado después de imprimir"

mutar "src/lib/comisiones/imprimir.ts" \
  '  window.addEventListener("afterprint", restaurar);' \
  "" \
  "cancelar el diálogo deja la pestaña con el nombre del reporte"

mutar "src/components/ventas/comisiones-detalle/useDescargaComision.tsx" \
  "              body > [data-cds-print]:not([data-cds-lote]) { display: none !important; }" \
  "" \
  "con el detalle abierto, el PDF de una empresa arrastra el reporte de otra"

mutar "src/components/ventas/comisiones-detalle/ImpresionTablaComisiones.tsx" \
  "          body > [data-cds-print]:not([data-cds-tabla]) { display: none !important; }" \
  "" \
  "el papel del mes sale pegado al del detalle que estaba abierto"

mutar "src/components/ventas/comisiones-detalle/MenuDescargaComision.tsx" \
  '      <DesplegableFlotante
        abierto={abierto}' \
  '      <div hidden={!abierto} className="absolute right-0 top-full z-30 w-64 bg-white"
        data-abierto={abierto}' \
  "el menú vuelve a ser un \`absolute\` (lo recorta el overflow de la tabla)"

# ═══ Voseo ═════════════════════════════════════════════════════════════════

mutar "src/components/ventas/comisiones-detalle/MenuDescargaComision.tsx" \
  '{cargando && <p className="px-3 py-1.5 text-xs text-gray-500">Preparando…</p>}' \
  '{cargando && <p className="px-3 py-1.5 text-xs text-gray-500">Esperá un momento…</p>}' \
  "voseo en el menú de la flechita"

# ═══ CONTROLES: cambios inocuos que NO deben ser cazados ════════════════════
echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

# El guion ya salió por arriba (`if (celdaVacia(...)) return <td>—</td>`), así
# que esta segunda comprobación es un cinturón: quitarla NO cambia una coma de lo
# que se dibuja. Va como control, no como mutación, para que el conteo no mienta.
control "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "        const conFlecha = conDescarga && hayQueDescargar(val, desc);" \
  "        const conFlecha = conDescarga;" \
  "CONTROL: se quita el cinturón (la celda vacía ya salió antes con su guion)"

control "src/components/ventas/comisiones-detalle/MenuDescargaComision.tsx" \
  'className="truncate px-3 py-1.5 text-xs text-gray-500"' \
  'className="truncate px-3 py-1.5 text-xs text-gray-600"' \
  "CONTROL: el encabezado del menú cambia de gris"

control "src/lib/comisiones/descarga.ts" \
  "    .filter(Boolean)
    .join(\" · \");" \
  "    .filter((t) => Boolean(t))
    .join(\" · \");" \
  "CONTROL: se reescribe el filtro del título con la misma lógica"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

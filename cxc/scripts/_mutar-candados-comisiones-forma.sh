#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de LA FORMA de Comisiones (6-sep-2026) CAZAN de verdad?
#
# Lo que cubren, todo aprobado por Daniel uno por uno y sin mover un número:
#   1  la factura corta EN PANTALLA (larga en el Excel y en el papel)
#   2  el nombre CORTO de la empresa
#   3  UNA sola forma de decir «nada»: el guion
#   4  un solo botón principal en Configuración (las tasas se guardan solas)
#   5  fuera la columna «Desde»
#   6  fuera la columna «Tipo» de la pantalla
#   7  el total del detalle, ARRIBA
#   8  el detalle se abre ABAJO (el modal se queda para imprimir)
#   10 el Excel: título 1 · vacía 2 · encabezados 3 con filtro y fila fija
#   12 el nombre del PDF
#   13 el porcentaje, número de verdad
#   14 el descuento, visible en la celda
#   15 «Todo el año» en el filtro de meses
#   16 un cliente que no comisiona, en VARIAS empresas de una vez
#   18 fuera «N vendedores sin actividad este mes»
#   19 los botones dicen qué traen, y el verbo es «Descargar»
#   20 los que no se pagan, detrás de «Ver los que no se pagan»
#   +  la estructura: se fueron las 4 pestañas, un selector y un ⚙ fijo
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-comisiones-forma.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comisiones-forma.test.ts \
src/__tests__/components/comisiones-forma-pantalla.test.tsx \
src/__tests__/components/comisiones-no-se-paga.test.tsx \
src/__tests__/components/comisiones-configuracion-pantalla.test.tsx \
src/__tests__/iphone-comisiones-encabezado.test.ts \
src/__tests__/lib/multifashion-cerrado-y-espejo.test.ts \
src/__tests__/excel-exports-ventas.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/comisiones/matriz-celda.ts"
  "src/lib/comisiones/periodo.ts"
  "src/lib/comisiones/acumular-anio.ts"
  "src/lib/comisiones/nombre-archivo.ts"
  "src/lib/comisiones/vistas.ts"
  "src/lib/comisiones/sin-pago.ts"
  "src/lib/comisiones/exclusiones.ts"
  "src/lib/comisiones/factura-en-pantalla.ts"
  "src/lib/excel-panel-fijo.ts"
  "src/lib/ventas/comisionExcel.ts"
  "src/app/api/ventas/comisiones/exclusiones/route.ts"
  "src/app/api/ventas/comisiones/consolidado/route.ts"
  "src/components/ventas/ComisionesView.tsx"
  "src/components/ventas/ComisionesConsolidadoView.tsx"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
  "src/components/ventas/ComisionesTarjetas.tsx"
  "src/components/ventas/ComisionesDetalleModal.tsx"
  "src/components/ventas/comisiones-config/ClientesQueNoComisionan.tsx"
  "src/components/ventas/comisiones-config/TasasPorVendedor.tsx"
  "src/app/cxc/components/PanelCxcMobile.tsx"
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

# ═══ 3 y 14 · La celda: el guion y el desglose del descuento ═════════════════

mutar "src/lib/comisiones/matriz-celda.ts" \
  "  return valor === undefined || valor === 0;" \
  "  return valor === undefined;" \
  "la celda en cero vuelve a decir \$0.00 (dos formas de decir «nada»)"

mutar "src/lib/comisiones/matriz-celda.ts" \
  "  if ((descuento ?? 0) > 0) return false;" \
  "" \
  "una celda en cero CON descuento se tapa con el guion (esconde plata)"

mutar "src/lib/comisiones/matriz-celda.ts" \
  "  if (!(d > 0)) return null;" \
  "  return null;" \
  "el desglose del descuento nunca se arma"

mutar "src/lib/comisiones/matriz-celda.ts" \
  "  return { bruto: round2((neto ?? 0) + d), descuento: d };" \
  "  return { bruto: round2((neto ?? 0) - d), descuento: d };" \
  "el bruto se reconstruye RESTANDO el descuento en vez de sumarlo"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "        const desglose = desgloseDeCelda(val, desc);" \
  "        const desglose = null;" \
  "la celda deja de mostrar el desglose (hay que abrir el detalle otra vez)"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "        if (celdaVacia(val, desc)) {" \
  "        if (val === undefined) {" \
  "la matriz vuelve a mezclar «—» con \$0.00"

# ═══ 15 · «Todo el año» ═════════════════════════════════════════════════════

mutar "src/lib/comisiones/periodo.ts" \
  "export const MES_TODO_EL_ANIO = 0;" \
  "export const MES_TODO_EL_ANIO = 13;" \
  "«todo el año» deja de ser 0 (las rutas lo rechazarían)"

mutar "src/lib/comisiones/periodo.ts" \
  "  const hasta = year < hoy.year ? 12 : year === hoy.year ? hoy.mes : 0;" \
  "  const hasta = 12;" \
  "el año en curso pide los 12 meses, incluidos los que no empezaron"

mutar "src/lib/comisiones/periodo.ts" \
  "  return esTodoElAnio(mes) ? \"Descargar el año\" : \"Descargar el mes\";" \
  "  return \"Excel\";" \
  "el botón vuelve a decir «Excel» y no qué trae"

mutar "src/lib/comisiones/periodo.ts" \
  "  return esTodoElAnio(mes) ? String(year) : \`\${year}-\${String(mes).padStart(2, \"0\")}\`;" \
  "  return String(year);" \
  "el nombre del archivo pierde el mes"

mutar "src/lib/comisiones/acumular-anio.ts" \
  "      for (const campo of CONSERVADOS) {" \
  "      for (const campo of ([] as readonly string[])) {" \
  "el año se queda con la tasa del PRIMER mes en vez de la vigente"

mutar "src/lib/comisiones/acumular-anio.ts" \
  "        acc[campo] = round2(Number(acc[campo] ?? 0) + Number(v[campo] ?? 0));" \
  "        acc[campo] = Number(acc[campo] ?? 0) + Number(v[campo] ?? 0);" \
  "la suma del año deja de redondearse (0,1 + 0,2 = 0,30000000000000004)"

mutar "src/app/api/ventas/comisiones/consolidado/route.ts" \
  "  const meses = mesesDelPeriodo(year, mes, hoyPanama());" \
  "  const meses = [mes];" \
  "el consolidado ignora el período y pide un solo mes"

# ═══ 12 · El nombre del PDF ═════════════════════════════════════════════════

mutar "src/lib/comisiones/nombre-archivo.ts" \
  "  const donde = trozo(nombreCortoEmpresa(empresaKey));" \
  '  const donde = "";' \
  "el nombre del archivo pierde la empresa"

mutar "src/lib/comisiones/nombre-archivo.ts" \
  '  return ["Comisión", quien, donde, sufijoArchivoPeriodo(year, mes)]' \
  '  return ["Comisión", quien, donde]' \
  "el nombre del archivo pierde el período"

mutar "src/components/ventas/ComisionesDetalleModal.tsx" \
  "  window.addEventListener(\"afterprint\", restaurar);" \
  "" \
  "el título de la app queda renombrado si se cancela la impresión"

mutar "src/components/ventas/ComisionesDetalleModal.tsx" \
  "          onClick={() => imprimirComo(nombreArchivo)}" \
  "          onClick={() => window.print()}" \
  "vuelve el PDF llamado «Fashion Group.pdf»"

# ═══ 10 y 13 · El Excel del detalle ═════════════════════════════════════════

mutar "src/lib/ventas/comisionExcel.ts" \
  '  ws["!autofilter"] = { ref: filtro };' \
  "" \
  "el Excel del detalle se queda sin filtro (y sin fila fija)"

mutar "src/lib/ventas/comisionExcel.ts" \
  "  heights[r] = 14; r++;" \
  "  r++; r++;" \
  "los encabezados se corren de la fila 3"

mutar "src/lib/ventas/comisionExcel.ts" \
  "    ws[addr(r, 2)] = tdN(tasa, alt, { fmt: PCT_FMT });" \
  "    ws[addr(r, 2)] = td(\`× \${(tasa * 100).toFixed(2)}%\`, alt, { ha: \"right\" });" \
  "la tasa del cierre vuelve a ser TEXTO"

mutar "src/lib/excel-panel-fijo.ts" \
  "  const PANEL_FIJO = panelFijo(fila);" \
  "  const PANEL_FIJO = panelFijo(1);" \
  "la fila fija vuelve a estar clavada en la 1 (el detalle la pierde)"

# ═══ 1 y 6 · La factura y el tipo, en pantalla ══════════════════════════════

mutar "src/components/ventas/ComisionesDetalleModal.tsx" \
  "{facturaParaMostrar(v.secuencial)}" \
  "{v.secuencial}" \
  "vuelve la factura larga en pantalla (parte la fila en dos líneas)"

mutar "src/lib/ventas/comisionExcel.ts" \
  "    ws[addr(r, 2)] = td(v.secuencial, alt);" \
  "    ws[addr(r, 2)] = td(String(v.secuencial).slice(-4), alt);" \
  "el Excel recorta la factura (Daniel dijo «no»)"

# ═══ 20 · Los que no se pagan ═══════════════════════════════════════════════

mutar "src/lib/comisiones/sin-pago.ts" \
  '  return `${ROTULO_VER_NO_SE_PAGAN} (${cuantos})`;' \
  "  return ROTULO_VER_NO_SE_PAGAN;" \
  "el enlace deja de decir cuántos hay (se abre a ciegas)"

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "  const activos = useMemo(() => conActividad.filter((r) => r.se_paga !== false), [conActividad]);" \
  "  const activos = useMemo(() => conActividad, [conActividad]);" \
  "los que no se pagan vuelven a la vista (lo visible no suma el pie)"

# ═══ 18 · «N vendedores sin actividad este mes» ═════════════════════════════

mutar "src/components/ventas/ComisionesPorEmpresaView.tsx" \
  "                      {verNoSePagan ? ROTULO_VER_MENOS : rotuloVerNoSePagan(noSePagan.length)}" \
  "                      {noSePagan.length} vendedores sin actividad este mes" \
  "vuelve el renglón que dice que no hay nada que decir"

# ═══ 16 · Varias empresas de una vez ════════════════════════════════════════

mutar "src/lib/comisiones/exclusiones.ts" \
  "  for (const empresa of empresas) {" \
  "  for (const empresa of empresas.slice(0, 1)) {" \
  "el alta solo guarda la PRIMERA empresa marcada"

mutar "src/app/api/ventas/comisiones/exclusiones/route.ts" \
  "    if (r.status === 409) { yaEstaban.push(valor.empresa_key); continue; }" \
  "" \
  "una empresa que ya lo tenía tira el alta de las demás"

# ═══ 2 · El nombre corto de la empresa ══════════════════════════════════════

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  'import { nombreCortoEmpresa } from "@/lib/empresa-mapping";' \
  'import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping"; const nombreCortoEmpresa = (k: string) => EMPRESA_KEY_TO_NAME[k] ?? k;' \
  "la matriz vuelve al nombre largo («Vistana International»)"

# ═══ Estructura: un selector, un ⚙ ══════════════════════════════════════════

mutar "src/lib/comisiones/vistas.ts" \
  'export const ROTULO_GRUPO = "Fashion Group";' \
  'export const ROTULO_GRUPO = "Todas las empresas";' \
  "la primera opción vuelve a llamarse «Todas» (se lee como si incluyera ACS)"

mutar "src/lib/comisiones/vistas.ts" \
  "  { valor: VISTA_MULTIFASHION, etiqueta: nombreCortoEmpresa(VISTA_MULTIFASHION), separadorAntes: true }," \
  "  { valor: VISTA_MULTIFASHION, etiqueta: nombreCortoEmpresa(VISTA_MULTIFASHION) }," \
  "Multifashion pierde la línea que la separa de las 6 del grupo"

mutar "src/lib/comisiones/vistas.ts" \
  "    return { vista: VISTA_GRUPO, config: esAdmin };" \
  "    return { vista: VISTA_GRUPO, config: true };" \
  "un «config» guardado le abre Configuración a quien no es admin"

mutar "src/components/ventas/ComisionesView.tsx" \
  "        {hayConfig && (" \
  "        {hayConfig && !enConfig && (" \
  "el ⚙ desaparece al abrirlo (un botón que aparece y desaparece)"

# ═══ 19 · «Descargar» en los 5 botones del sistema ═════════════════════════

mutar "src/app/cxc/components/PanelCxcMobile.tsx" \
  'label="Descargar CSV"' \
  'label="Exportar CSV"' \
  "vuelve «Exportar CSV» en el CXC del celular"

# ═══ Voseo ═════════════════════════════════════════════════════════════════

mutar "src/components/ventas/ComisionesConsolidadoView.tsx" \
  '"Elige un mes para ver el detalle"' \
  '"Elegí un mes para ver el detalle"' \
  "voseo en el pie de la matriz"

# ═══ CONTROLES: cambios inocuos que NO deben ser cazados ═════════════════════
echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/lib/comisiones/matriz-celda.ts" \
  "const round2 = (n: number): number => Math.round(n * 100) / 100;" \
  "const round2 = (n: number): number => Math.round(n * 100.0) / 100.0;" \
  "CONTROL: se reescribe el redondeo con la misma aritmética"

control "src/components/ventas/ComisionesConsolidadoView.tsx" \
  "            Sin comisiones para {etiquetaPeriodo(year, mes)}." \
  "            Todavía no hay comisiones para {etiquetaPeriodo(year, mes)}." \
  "CONTROL: se alarga el texto de la pantalla vacía"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

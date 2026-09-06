#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del rediseño de VENTAS (5-sep-2026) cazan de verdad?
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. El CONTROL (sin mutar) tiene que quedar verde: mutar sobre tests
# rotos no prueba nada.
#
# Qué se muta, y por qué cada una:
#   · la tira de pestañas (que vuelvan las cinco, o que una quede sin panel)
#   · el redirect y la traducción de los enlaces viejos (`?tab=comisiones`,
#     `?tab=utilidad`) — un favorito que muere no da error, deja la pantalla
#     EN BLANCO
#   · el «#» de Clientes volviendo a dibujarse con cualquier orden (el defecto
#     que ponía a Multi Fashion #1 con $248.396 sobre City Mall con $1.256.848)
#   · el encabezado propio de la tabla hija de Productos — la columna que
#     mostraba PARTICIPACIÓN bajo el rótulo «Margen %»
#   · el «Mostrar más» volviendo a las listas
#   · el porcentaje con decimal y la plata negativa con el signo detrás
#   · la cuarta tarjeta del Resumen y su explicación
#   · las metas, que no pueden volver a dibujarse
#   · «no vendiste» volviendo a ser «n/a»
#   · el celular volviendo a abreviar la plata en millones
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: la rama trae archivos
#    NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
#    un verde.
#
#   bash scripts/_mutar-candados-ventas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/components/ventas-tres-pestanas.test.tsx \
src/__tests__/components/ventas-clientes-lista-entera.test.tsx \
src/__tests__/components/productos-columna-no-hereda-encabezado.test.tsx \
src/__tests__/components/ventas-resumen-cierre-del-anio.test.tsx \
src/__tests__/components/ventas-coherencia-modulo.test.tsx \
src/__tests__/lib/ventas-dejo-de-venderse.test.ts \
src/__tests__/lib/ventas-sin-comparativo-con-palabras.test.ts \
src/__tests__/lib/ventas-celda.test.ts \
src/__tests__/lib/ventas-tab-referencia-fuera.test.ts \
src/__tests__/lib/comisiones-en-ventas.test.tsx"

ARCHIVOS=(
  "src/app/ventas/VentasShell.tsx"
  "src/lib/ventas/pestanas.ts"
  "src/lib/ventas/format.ts"
  "src/lib/ventas/celda.ts"
  "src/lib/ventas/proyeccion-texto.ts"
  "src/lib/ventas/productos-dejados.ts"
  "src/components/ventas/ClientesView.tsx"
  "src/components/ventas/ProductosView.tsx"
  "src/components/ventas/UtilidadView.tsx"
  "src/components/ventas/ResumenView.tsx"
  "src/components/ventas/ResumenViewMobile.tsx"
  "src/components/ventas/ChipOrden.tsx"
  "src/components/ventas/ControlSegmentado.tsx"
  "next.config.js"
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
  if [ $? -eq 3 ]; then sobrevivientes=$((sobrevivientes + 1)); return 1; fi
  return 0
}

SHELL_TSX="src/app/ventas/VentasShell.tsx"
PESTANAS="src/lib/ventas/pestanas.ts"
FORMAT="src/lib/ventas/format.ts"
CELDA="src/lib/ventas/celda.ts"
PROY="src/lib/ventas/proyeccion-texto.ts"
DEJADOS="src/lib/ventas/productos-dejados.ts"
CLIENTES="src/components/ventas/ClientesView.tsx"
PRODUCTOS="src/components/ventas/ProductosView.tsx"
UTILIDAD="src/components/ventas/UtilidadView.tsx"
RESUMEN="src/components/ventas/ResumenView.tsx"
MOVIL="src/components/ventas/ResumenViewMobile.tsx"
CHIP="src/components/ventas/ChipOrden.tsx"
NEXTCFG="next.config.js"

echo "── CONTROL (sin mutar): tiene que quedar VERDE ──"
salida="$(npx vitest run $TESTS 2>&1)"
if grep -qE "^ *Tests .*[0-9]+ passed" <<<"$salida" && ! grep -qE "[0-9]+ failed" <<<"$salida"; then
  echo "  ✅ CONTROL verde"
else
  echo "  ⛔ CONTROL ROJO — no tiene sentido mutar sobre tests rotos"; exit 1
fi

# ── LA TIRA DE PESTAÑAS ──────────────────────────────────────────────────────

echo "── 1: vuelve una cuarta pestaña a la lista ──"
mutar "$PESTANAS" \
  'export const TABS_VENTAS = ["resumen", "clientes", "productos"] as const;' \
  'export const TABS_VENTAS = ["resumen", "clientes", "productos", "utilidad"] as const;' \
  x && probar "cuarta pestaña en TABS_VENTAS"

echo "── 2: vuelve el trigger de Comisiones a la tira ──"
mutar "$SHELL_TSX" \
  '          <TabsTrigger value="productos" className={TAB_TRIGGER_CLASS}>' \
  '          <TabsTrigger value="comisiones" className={TAB_TRIGGER_CLASS}>Comisiones</TabsTrigger>
          <TabsTrigger value="productos" className={TAB_TRIGGER_CLASS}>' \
  x && probar "trigger de Comisiones de vuelta"

echo "── 3: una pestaña se queda sin panel (pantalla EN BLANCO, sin error) ──"
mutar "$SHELL_TSX" \
  '        <TabsContent value="productos" className="mt-5">' \
  '        <TabsContent value="productos-x" className="mt-5">' \
  x && probar "pestaña sin su TabsContent"

# ── LOS ENLACES VIEJOS ───────────────────────────────────────────────────────

echo "── 4: se cae el redirect de ?tab=comisiones (el favorito muere en blanco) ──"
mutar "$NEXTCFG" \
  '        has: [{ type: "query", key: "tab", value: "comisiones" }],
        destination: "/comisiones",' \
  '        has: [{ type: "query", key: "tab", value: "comisionesXX" }],
        destination: "/comisiones",' \
  x && probar "sin redirect de ?tab=comisiones"

echo "── 5: ?tab=utilidad deja de traducirse ──"
mutar "$PESTANAS" \
  'return tab === "utilidad" ? { tab: "clientes", modo: "utilidad" } : null;' \
  'return null;' \
  x && probar "?tab=utilidad sin traducir"

echo "── 6: el ?modo= desconocido deja de filtrarse ──"
mutar "$SHELL_TSX" \
  'esModoClientes(modoRaw) ? modoRaw : "ventas"' \
  '(modoRaw as ModoClientes)' \
  x && probar "modo sin validar"

# ── CLIENTES ─────────────────────────────────────────────────────────────────

echo "── 7: 🩸 el «#» vuelve a dibujarse con CUALQUIER orden ──"
mutar "$CLIENTES" \
  'const mostrarRanking = sortBy === "ytd";' \
  'const mostrarRanking = true;' \
  x && probar "el # vuelve a mentir con cualquier orden"

echo "── 8: los huérfanos vuelven al pozo (se los saca de la lista) ──"
mutar "$CLIENTES" \
  'const huerfanos = filtered.filter(c => c.isOrphan && (buscando || c.ytd > 0));' \
  'const huerfanos: Cliente[] = [];' \
  x && probar "huérfanos fuera de la lista"

echo "── 9: los clientes en cero se ESCONDEN en vez de plegarse ──"
mutar "$CLIENTES" \
  'const enCero = buscando ? [] : filtered.filter(c => c.ytd <= 0);' \
  'const enCero: Cliente[] = [];' \
  x && probar "clientes en cero escondidos"

echo "── 10: buscar vuelve a NO alcanzar a los plegados ──"
mutar "$CLIENTES" \
  'const conCompras = filtered.filter(c => !c.isOrphan && (buscando || c.ytd > 0));' \
  'const conCompras = filtered.filter(c => !c.isOrphan && c.ytd > 0);' \
  x && probar "la búsqueda no llega a los que no compraron"

echo "── 11: la columna Empresa vuelve a decir el NOMBRE ──"
mutar "$CLIENTES" \
  '                {textoEmpresas(c.empresas_count)}' \
  '                {c.empresa}' \
  x && probar "Empresa vuelve a mezclar nombre y número"

echo "── 12: el universo vuelve a ser una nota al pie (no un control) ──"
mutar "$CLIENTES" \
  '              <SelectTrigger data-universo-clientes' \
  '              <SelectTrigger' \
  x && probar "el selector de universo pierde su ancla"

echo "── 13: el Excel de Clientes baja TODO, ignorando los filtros ──"
mutar "$CLIENTES" \
  'filas: enPantalla,' \
  'filas: data.rows,' \
  x && probar "el Excel ignora los filtros de la pantalla"

# ── PRODUCTOS ────────────────────────────────────────────────────────────────

echo "── 14: 🩸 la tabla hija pierde su encabezado (vuelve a heredar «Margen %») ──"
mutar "$PRODUCTOS" \
  '            <th data-col-participacion className="py-1.5 text-right font-normal">% del total</th>' \
  '' \
  x && probar "la tabla de clientes sin cabecera propia"

echo "── 15: la cabecera vuelve a decir «Margen %» sobre la participación ──"
mutar "$PRODUCTOS" \
  '<th data-col-participacion className="py-1.5 text-right font-normal">% del total</th>' \
  '<th data-col-participacion className="py-1.5 text-right font-normal">Margen %</th>' \
  x && probar "la participación rotulada como margen"

echo "── 16: vuelve el «Mostrar más» de Productos ──"
mutar "$PRODUCTOS" \
  '  const visibleRows = rows;' \
  '  const visibleRows = rows.slice(0, 20);' \
  x && probar "Productos vuelve a paginar"

echo "── 17: «Dejó de venderse» deja de dibujarse ──"
mutar "$PRODUCTOS" \
  '    return dejoDeVenderse(data.productos, prevVenta);' \
  '    return [];' \
  x && probar "sin la lista de lo que dejó de venderse"

echo "── 18: «Dejó de venderse» lista también lo que SÍ se sigue vendiendo ──"
mutar "$DEJADOS" \
  '    if (vendeHoy.has(descripcion)) continue;' \
  '    if (false) continue;' \
  x && probar "lista productos que sí se venden"

echo "── 19: el piso de \$100 se cae y la lista se llena de centavos ──"
mutar "$DEJADOS" \
  '    if (!Number.isFinite(ventaAntes) || ventaAntes < minimo) continue;' \
  '    if (!Number.isFinite(ventaAntes)) continue;' \
  x && probar "sin el piso de la lista"

echo "── 20: el rótulo «Período» se pierde ──"
mutar "$PRODUCTOS" \
  '          <span className="text-xs text-gray-500">Período</span>' \
  '' \
  x && probar "el selector de período sin rótulo"

echo "── 21: Productos pierde «Actualizar ahora» ──"
mutar "$PRODUCTOS" \
  '        <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={load} />' \
  '' \
  x && probar "Productos sin Actualizar ahora"

# ── UTILIDAD ─────────────────────────────────────────────────────────────────

echo "── 22: vuelve el «Mostrar más» de Utilidad ──"
mutar "$UTILIDAD" \
  '  const visibleRows = rows;' \
  '  const visibleRows = rows.slice(0, 25);' \
  x && probar "Utilidad vuelve a paginar"

echo "── 23: el alcance de las 6 empresas vuelve a esconderse ──"
mutar "$UTILIDAD" \
  '          <span data-alcance-utilidad className="text-xs text-gray-500">' \
  '          <span className="text-xs text-gray-500">' \
  x && probar "el alcance sin su ancla"

echo "── 24: la píldora de empresa deja de filtrar el modo Utilidad ──"
mutar "$UTILIDAD" \
  '    if (empresaFiltro !== "todas") r = r.filter((c) => c.empresaKey === empresaFiltro);' \
  '' \
  x && probar "la píldora no filtra Utilidad"

# ── FORMATO ──────────────────────────────────────────────────────────────────

echo "── 25: el porcentaje vuelve a llevar un decimal ──"
mutar "$FORMAT" \
  '  const redondeado = Math.round(Math.abs(v));
  return (v < 0 && redondeado !== 0 ? "−" : "") + redondeado + "%";' \
  '  return (v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";' \
  x && probar "porcentaje con decimal"

echo "── 26: la plata negativa vuelve a poner el signo DETRÁS del símbolo ──"
mutar "$FORMAT" \
  '  return (negativo ? "−" : "") + "$" + sinSigno;' \
  '  return "$" + (negativo ? "-" : "") + sinSigno;' \
  x && probar "signo detrás del símbolo"

echo "── 27: el porcentaje TRUNCA en vez de redondear (28,7% → 28%) ──"
mutar "$FORMAT" \
  '  const redondeado = Math.round(Math.abs(v));' \
  '  const redondeado = Math.floor(Math.abs(v));' \
  x && probar "porcentaje truncado"

# ── EL RESUMEN ───────────────────────────────────────────────────────────────

echo "── 28: se cae la cuarta tarjeta (la proyección vuelve al borde de la tabla) ──"
mutar "$RESUMEN" \
  '        {showProyeccionCol && (
          <KpiCard
            label="CIERRE DEL AÑO"' \
  '        {false && (
          <KpiCard
            label="CIERRE DEL AÑO"' \
  x && probar "sin la tarjeta Cierre del año"

echo "── 29: la tarjeta pierde su explicación (vuelve a ser un número sin origen) ──"
mutar "$RESUMEN" \
  '            detalle={explicacionProyeccionGrupo(proyeccionDelGrupo(data.proyeccion!), prevYear, { fechaCorte: data.fecha_corte })}' \
  '' \
  x && probar "la proyección sin explicación"

echo "── 30: la fracción del año se INVENTA (ytd ÷ proyección en vez de lo medido) ──"
mutar "$PROY" \
  '  return g.ventas_prev_ytd_sp / g.cierre_anio_anterior_total;' \
  '  return g.ventas_ytd / g.proyeccion_cierre;' \
  x && probar "fracción inventada"

echo "── 31: sin cierre anterior se inventa un porcentaje igual ──"
mutar "$PROY" \
  '  if (!(g.cierre_anio_anterior_total > 0)) return null;' \
  '  if (false) return null;' \
  x && probar "porcentaje sin base"

echo "── 32: vuelve una META a la pantalla ──"
mutar "$RESUMEN" \
  '            sub={`proyectado · ${deltaProyeccionTexto(data.proyeccion!.totales_grupo.delta_vs_anio_anterior_total)} vs ${prevYear}`}' \
  '            sub={`meta del año · ${deltaProyeccionTexto(data.proyeccion!.totales_grupo.delta_vs_anio_anterior_total)} vs ${prevYear}`}' \
  x && probar "una meta en pantalla"

echo "── 33: se caen los meses que todavía no llegaron ──"
mutar "$RESUMEN" \
  '  const cols = granularity === "mensual" ? MONTHS : QUARTERS;' \
  '  const cols = (granularity === "mensual" ? MONTHS : QUARTERS).slice(0, data.mesActual) as unknown as typeof MONTHS;' \
  x && probar "OCT/NOV/DIC desaparecen"

echo "── 34: «no vendiste» vuelve a ser «n/a» ──"
mutar "$CELDA" \
  '  return prevBase <= 0 ? SIN_VENTA_ANTERIOR : VENTA_ANTERIOR_MINIMA;' \
  '  return SIN_COMPARATIVO;' \
  x && probar "vuelve la sigla n/a"

echo "── 35: «no vendiste» se dice también cuando SÍ vendió (menos de \$100) ──"
mutar "$CELDA" \
  '  return prevBase <= 0 ? SIN_VENTA_ANTERIOR : VENTA_ANTERIOR_MINIMA;' \
  '  return SIN_VENTA_ANTERIOR;' \
  x && probar "«no vendiste» afirmado de más"

# ── EL CELULAR ───────────────────────────────────────────────────────────────

echo "── 36: el celular vuelve a abreviar la plata en millones ──"
mutar "$MOVIL" \
  '          value={fmtMoney(k.ventasNetasYTD)}' \
  '          value={formatCompactCurrency(k.ventasNetasYTD)}' \
  x && probar "el celular vuelve a decir \$6.27M"

echo "── 37: el celular se queda sin la tarjeta de cierre (se separa del escritorio) ──"
mutar "$MOVIL" \
  '        {proy && (
          <KpiTile
            label="Cierre del año"' \
  '        {false && proy && (
          <KpiTile
            label="Cierre del año"' \
  x && probar "el celular se queda atrás"

echo "── 38: el celular se dibuja su propio control segmentado otra vez ──"
mutar "$MOVIL" \
  '      <ControlSegmentado
        options={MODO_OPCIONES}' \
  '      <ControlSegmentado
        options={[{ value: "ventas" as const, label: "Ventas" }, { value: "utilidad" as const, label: "Utilidad" }, { value: "margen" as const, label: "Margen" }]}' \
  x && probar "opciones duplicadas en el celular"

# ── COHERENCIA ───────────────────────────────────────────────────────────────

echo "── 39: el chip de ordenar vuelve a tener dos colores ──"
mutar "$CHIP" \
  '          ? "border-teal-700 bg-teal-700 text-white"' \
  '          ? "border-gray-800 bg-gray-800 text-white"' \
  x && probar "el chip vuelve al negro"

echo "── 40: el nombre largo de la empresa vuelve a Clientes ──"
mutar "$CLIENTES" \
  '  ...B2B_EMPRESA_KEYS.map((key) => ({ id: key, label: nombreCortoEmpresa(key) })),' \
  '  ...B2B_EMPRESA_KEYS.map((key) => ({ id: key, label: key === "vistana" ? "Vistana International" : nombreCortoEmpresa(key) })),' \
  x && probar "vuelve el nombre largo"

echo "── 41: el Excel del Resumen vuelve a la barra del módulo ──"
mutar "$RESUMEN" \
  '          <Button variant="outline" size="sm" onClick={onExcel} disabled={bajando} className="min-h-[44px]">' \
  '          <Button variant="outline" size="sm" onClick={onExcel} disabled={bajando} className="min-h-[44px]" hidden>' \
  x && probar "el Resumen sin su Excel adentro"

echo "── 42: el subtítulo vuelve a decir «8 empresas» en las tres ──"
mutar "$PESTANAS" \
  '  if (tab === "clientes") return `6 empresas · ${mesesLabel}`;' \
  '' \
  x && probar "Clientes vuelve a decir 8 empresas"

restaurar
echo
echo "════════════════════════════════════════════"
echo "  CAZADAS:       $cazadas"
echo "  SOBREVIVIENTES: $sobrevivientes"
echo "════════════════════════════════════════════"
[ "$sobrevivientes" -eq 0 ] || exit 1

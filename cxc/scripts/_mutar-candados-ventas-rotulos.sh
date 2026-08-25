#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de "Ventas: joystep, rótulos y
# datos fantasma".
#
# Se rompe el arreglo, a propósito y de a UNO, y se exige que algún test se
# ponga ROJO. Un candado que no caza su propia mutación no es un candado.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
#   bash scripts/_mutar-candados-ventas-rotulos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/api/ventas/utilidad-cliente/route.ts"
  "src/lib/ventas/utilidad-cliente.ts"
  "src/lib/ventas/productos.ts"
  "src/lib/ventas/queries.ts"
  "src/lib/cxc-aging.ts"
  "src/lib/pdf-cxc.ts"
  "src/app/admin/components/KpiCards.tsx"
  "src/app/admin/components/PanelCxcMobile.tsx"
  "src/app/ventas/VentasShell.tsx"
  "src/components/ventas/ClientesView.tsx"
  "src/components/ventas/OtrosClientesDialog.tsx"
  "src/components/ventas/ProductosView.tsx"
  "src/components/ventas/ResumenView.tsx"
  "src/components/ventas/ResumenViewMobile.tsx"
  "src/components/ventas/UtilidadView.tsx"
  "src/app/clientes/[codigo]/ClienteDetail.tsx"
  "supabase/migrations/20260824180000_utilidad_por_cliente_empresas_parametro.sql"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/ventas-utilidad-joystep.test.ts \
src/__tests__/lib/ventas-datos-fantasma.test.ts \
src/__tests__/lib/cxc-papel-vocabulario.test.ts \
src/__tests__/lib/ventas-vista-general-ipad.test.ts \
src/__tests__/excel-exports-ventas.test.ts \
src/__tests__/components/ventas-rotulos-espanol.test.tsx \
src/__tests__/components/cxc-tramos-un-solo-nombre.test.tsx \
src/__tests__/components/ventas-productos-precio-periodos.test.tsx \
src/__tests__/components/ventas-poda-textos.test.tsx"

cazadas=0; sueltas=0; n=0

# Reemplazo LITERAL. Revienta si el texto no estaba: una mutación que no se
# aplica reportaría "SOBREVIVIÓ" y estaría acusando al candado de un bug del
# script. Ya pasó acá con los escapes de perl.
mutar() {
  if ! python3 scripts/_mutar.py "$1" "$2" "$3"; then
    echo "  ⚠️  SCRIPT ROTO: la mutación no se aplicó en $1"
    ROTA=1
  fi
}

probar() {
  n=$((n+1))
  local nombre="$1"
  if [ "${ROTA:-0}" = "1" ]; then
    echo "  ⚠️  SALTEADA (la mutación no se aplicó) — $nombre"
    sueltas=$((sueltas+1)); ROTA=0; restaurar; return
  fi
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE, el resumen no existe y "0 fallos" se leería como
  # "sobrevivió". Se exige encontrar el renglón de vitest.
  # ⚠️ Sin pipe: `grep -q` cierra la tubería al primer match y `printf` muere con
  # SIGPIPE, así que una mutación CAZADA se reportaba como "la corrida murió".
  if [[ ! "$salida" =~ Tests[[:space:]]+[0-9]+ ]]; then
    echo "  ⚠️  LA CORRIDA MURIÓ — $nombre"
    sueltas=$((sueltas+1)); restaurar; return
  fi
  local fallos
  fallos=$(printf '%s' "$salida" | grep -oE "Tests +[0-9]+ failed" | grep -oE "[0-9]+" | head -1)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos tests rojos) — $nombre"
    cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"
    sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── 1. Joystep vuelve a quedar afuera de Utilidad ───────────────────────────
mutar src/app/api/ventas/utilidad-cliente/route.ts \
  'p_empresas: empresasDerivadas' \
  'p_empresas: empresasDerivadas.filter((k) => k !== "joystep")'
probar "joystep vuelve a restarse de la lista que se le manda a la RPC"

mutar supabase/migrations/20260824180000_utilidad_por_cliente_empresas_parametro.sql \
  'AND empresa_key = ANY(COALESCE(p_empresas, ARRAY[]::text[]))' \
  "AND empresa_key IN ('vistana','fashion_wear','fashion_shoes','active_shoes','active_wear')"
probar "la lista vuelve a escribirse a mano DENTRO del SQL"

mutar src/app/api/ventas/utilidad-cliente/route.ts \
  'let empresas: string[] = empresasDerivadas;' \
  'let empresas: string[] = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear"];'
probar "el alcance que se declara deja de derivarse de la lista real"

mutar src/app/api/ventas/utilidad-cliente/route.ts \
  '      empresas = [...EMPRESAS_UTILIDAD_V1];' ''
probar "el fallback a la v1 miente y sigue declarando las seis"

mutar src/lib/ventas/utilidad-cliente.ts \
  'return n === 1 ? "1 empresa B2B" : `${n} empresas B2B`;' \
  'return "5 empresas B2B";'
probar "el alcance vuelve a ser un texto fijo de cinco"

mutar src/components/ventas/UtilidadView.tsx \
  '{alcanceEmpresas(data.empresas)}' '5 empresas B2B'
probar "la pantalla vuelve a escribir el número de empresas a mano"

# ── 2. El Excel escribe 0,0% donde la pantalla dice "—" ─────────────────────
mutar src/lib/ventas/utilidad-cliente.ts \
  'r.utilidad, r.margen]' 'r.utilidad, r.margen ?? 0]'
probar "el Excel de Utilidad vuelve a escribir 0,0% en la fila sin margen"

mutar src/lib/ventas/utilidad-cliente.ts \
  'resp.totales.utilidad, resp.totales.margen]' \
  'resp.totales.utilidad, resp.totales.margen ?? 0]'
probar "el TOTAL de Utilidad vuelve a escribir 0,0%"

mutar src/lib/ventas/productos.ts '      p.margen,' '      p.margen ?? 0,'
probar "el Excel de Productos vuelve a escribir 0,0% en el grupo devuelto"

mutar src/lib/ventas/productos.ts \
  'totalPrecio, resp.totales.margen]' 'totalPrecio, resp.totales.margen ?? 0]'
probar "el TOTAL de Productos vuelve a escribir 0,0%"

# ── 3. El Excel vuelve a las fechas crudas ─────────────────────────────────
mutar src/lib/ventas/productos.ts \
  'Del ${fmtDate(resp.desde)} al ${fmtDate(resp.hasta)}' \
  'Del ${resp.desde} al ${resp.hasta}'
probar "el Excel de Productos vuelve a las fechas crudas de base de datos"

# ── 4. Los rótulos vuelven al inglés ───────────────────────────────────────
mutar src/components/ventas/ResumenView.tsx \
  'const kpiVentasLabel   = "VENTAS NETAS";' \
  'const kpiVentasLabel   = "VENTAS NETAS YTD";'
probar "vuelve «VENTAS NETAS YTD» al escritorio"

mutar src/components/ventas/ResumenViewMobile.tsx 'label="Ventas"' 'label="Ventas YTD"'
probar "vuelve «Ventas YTD» al celular"

mutar src/components/ventas/ResumenViewMobile.tsx \
  '{periodoLabel} <span className="text-gray-300">·</span> comparado con {prevYear}' ''
probar "el celular deja de decir qué meses está mirando"

mutar src/components/ventas/ResumenViewMobile.tsx \
  '% vs ${prevYear}`;' "% vs '\${String(prevYear).slice(-2)}\`;"
probar "vuelve el año cortado con apóstrofo"

mutar src/components/ventas/ResumenView.tsx \
  '? `Año ${selectedYear} completo`' '? "Año completo"'
probar "el año cerrado vuelve a decir «Año completo» sin decir cuál"

# ── 5. La jerga de base de datos vuelve a la tarjeta ───────────────────────
mutar src/components/ventas/ClientesView.tsx \
  'const OTROS_CLIENTES_PISTA = "Tocar para ver el detalle";' \
  'const OTROS_CLIENTES_PISTA = "Ver detalle de huérfanos sin master";'
probar "vuelve «huérfanos sin master» a la tarjeta del celular"

mutar src/components/ventas/ClientesView.tsx \
  '<div className="text-xs leading-tight text-gray-500">{OTROS_CLIENTES_PISTA}</div>' \
  '<div className="text-xs leading-tight text-gray-500">click para ver detalle</div>'
probar "escritorio y celular vuelven a decir cosas distintas"

# ── 6. La ficha vuelve a la sigla ──────────────────────────────────────────
mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  'Por cobrar hoy</th>' 'CXC actual</th>'
probar "vuelve «CXC actual» a la ficha del cliente"

mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  'Ver en Cuentas por Cobrar →' 'Ver en CXC →'
probar "vuelve «Ver en CXC»"

mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  'Ventas {new Date().getFullYear()}</th>' 'Ventas YTD</th>'
probar "vuelve «Ventas YTD» a la ficha"

mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  '<span className="font-medium text-gray-900">Por cobrar hoy</span>' \
  '<span className="font-medium text-gray-900">CXC</span>'
probar "la explicación de por qué no cuadran deja de nombrar la columna nueva"

# ── 7. El año del comparativo vuelve a escribirse a mano ───────────────────
mutar src/components/ventas/ClientesView.tsx \
  'const anioComparativo = data.anioComparativo ?? selectedYear - 1;' \
  'const anioComparativo = 2025;'
probar "el año del rótulo vuelve a estar clavado en 2025"

mutar src/components/ventas/ClientesView.tsx \
  '`El cambio compara contra el mismo período de ${anio}`;' '"";'
probar "la pantalla deja de decir contra qué compara"

mutar src/components/ventas/OtrosClientesDialog.tsx \
  'onClick={onSort}>vs {anioComparativo}</SortHeader>' \
  'onClick={onSort}>Δ vs 2025</SortHeader>'
probar "el diálogo de Otros clientes vuelve a decir «Δ vs 2025»"

mutar src/lib/ventas/queries.ts '    anioComparativo: year - 1,' ''
probar "el servidor deja de mandar el año contra el que compara"

# ── 8. Los tramos vuelven a tener dos nombres ──────────────────────────────
mutar src/app/admin/components/KpiCards.tsx \
  '      label: tramoLabel(k),' '      label: AGING[k].colLabel,'
probar "el escritorio vuelve a rotular solo con el rango"

mutar src/app/admin/components/PanelCxcMobile.tsx \
  '{AGING[key].label}' '{"Por vencer"}'
probar "el celular vuelve a llevar su nombre escrito a mano"

mutar src/app/admin/components/PanelCxcMobile.tsx \
  '{AGING[key].colLabel}' ''
probar "el celular deja de decir el rango de días"

mutar src/lib/pdf-cxc.ts 'const tramo = tramoLabel;' \
  'const tramo = (k: AgingKey) => `${AGING[k].label} ${AGING[k].colLabel}`;'
probar "el papel vuelve a tener su propia copia del nombre"

mutar src/lib/cxc-aging.ts \
  'return `${AGING[k].label} ${AGING[k].colLabel}`;' 'return AGING[k].colLabel;'
probar "la fuente única deja de decir el nombre del tramo"

# ── 9. El período elegido se vuelve a borrar ───────────────────────────────
mutar src/components/ventas/ProductosView.tsx \
  '  const onEmpresaChange = (key: string) => {
    setEmpresa(key);
  };' \
  '  const onEmpresaChange = (key: string) => {
    setEmpresa(key);
    setMes(null);
    setPeriodo("ytd");
    setSearch("");
  };'
probar "cambiar de empresa vuelve a borrar el período y el buscador"

mutar src/app/ventas/VentasShell.tsx \
  '<ProductosView selectedYear={selectedYear} />' \
  '<ProductosView key={selectedYear} selectedYear={selectedYear} />'
probar "vuelve el remonte al cambiar el año"

mutar src/components/ventas/ProductosView.tsx \
  '    if (!data.meses.includes(mes)) setMes(null);' ''
probar "el mes que no existe en la combinación nueva ya no se suelta"

mutar src/components/ventas/ProductosView.tsx \
  'const anioNoAplica = periodo !== "ytd";' 'const anioNoAplica = false;'
probar "la pantalla deja de avisar que el año de arriba no aplica"

# ── 10. «Falló» se vuelve a confundir con «no había nada» ──────────────────
mutar src/components/ventas/ProductosView.tsx \
  '= "fallo";
      if (prevRes.ok) {' \
  '= "vacio";
      if (prevRes.ok) {'
probar "un comparativo que FALLÓ se anota como si hubiera venido vacío"

mutar src/components/ventas/ProductosView.tsx '  if (!medido) {' '  if (false) {'
probar "la columna vuelve a decir «Nuevo» con la consulta caída"

mutar src/components/ventas/ProductosView.tsx \
  '{comparativo === "fallo" && (' '{false && ('
probar "el aviso del fallo desaparece de la pantalla"

mutar src/components/ventas/ProductosView.tsx \
  'comparativoMedido={comparativo !== "fallo"}' 'comparativoMedido={true}'
probar "la celda deja de enterarse de que no hubo medición"

# ── 11. Los datos fantasma vuelven a pedirse y a viajar ────────────────────
mutar src/lib/ventas/queries.ts \
  'const [curRes, prevRes, proyRes, syncedRes] = await Promise.all([' \
  'const [curRes, prevRes, metaRes, proyRes, syncedRes] = await Promise.all([
    supabaseServer.rpc("get_app_setting", { p_key: "multifashion_meta_anual_2026" }),'
mutar src/lib/ventas/queries.ts \
  '      margen2025YTD,' \
  '      margen2025YTD,
      metaAnualMultifashion: Number(metaRes.data ?? 800000) || 800000,'
probar "vuelve la consulta de la meta fantasma y su campo en kpis"

mutar src/lib/ventas/queries.ts \
  'proyeccion = stripMetasProyeccion(proyRes.data as ProyeccionRespCruda);' \
  'proyeccion = proyRes.data as unknown as ProyeccionResp;'
probar "las metas de la proyección vuelven a viajar al navegador"

echo
echo "═══ RESULTADO: $cazadas de $n cazadas · $sueltas sueltas ═══"
[ "$sueltas" -eq 0 ]

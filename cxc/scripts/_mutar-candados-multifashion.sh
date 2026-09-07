#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DEL REDISEÑO DE MULTIFASHION CAZAN DE VERDAD? (6-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (sin mutar) tienen que quedar VERDES: un ✅
# ahí significa que los candados fallan por otra razón y toda la corrida no dice
# nada.
#
# Lo que este rediseño dejó puesto y no se puede volver a romper:
#   1. Cuatro pestañas · Metas adentro de Vendedoras · Caja fuera del menú, con
#      su ruta y su caché intactas · `?subtab=` viejo que redirige y basura que
#      NUNCA deja la pantalla en blanco.
#   2. «Multifashion» en todos lados (el título ya no dice «American Classics»).
#   3. La venta de hoy en UNA línea, sin escribir «$0» y con la frescura SIEMPRE.
#   4. UN control de tiempo, y cada pestaña solo con lo que sabe servir.
#   5. El bono como COLUMNA que dice «al cierre»; el espejo de Comisiones intacto.
#   6. La cobertura de Clientes calculada, 10 filas al abrir, mayoreo vacío que
#      no aparece.
#   7. Los nombres capitalizados sin tocar la clave de agrupación.
#   8. El año en las tarjetas; el «Panorama del año», retirado.
#   9. «Cuándo vende la tienda» en una sección, con el período en cada línea, y
#      el promedio de N meses que NO es el promedio de los promedios.
#  10. La proyección diciendo sobre cuántos días está hecha, sin tocar la fórmula.
#  11. El encabezado del teléfono en tres bloques.
#  12. El amarre código → código, con soft delete y resuelto en UNA función.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: este cambio trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-multifashion.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/multifashion-rediseno.test.ts \
src/__tests__/components/multifashion-rediseno-pantalla.test.tsx \
src/__tests__/lib/multifashion-metas.test.ts \
src/__tests__/lib/multifashion-numeros-aire.test.ts \
src/__tests__/lib/multifashion-venta-hoy.test.ts \
src/__tests__/lib/multifashion-vendedoras-rotulo.test.ts \
src/__tests__/lib/multifashion-cerrado-y-espejo.test.ts \
src/__tests__/lib/navegacion-atras-fluido.test.ts \
src/__tests__/lib/poda-textos-cxc-multifashion.test.ts \
src/__tests__/lib/backup-nada-sin-copia.test.ts \
src/__tests__/iphone-targets-operacion.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/multifashion/pestanas.ts"
  "src/lib/multifashion/periodo.ts"
  "src/lib/multifashion/patrones.ts"
  "src/lib/multifashion/clientes-cobertura.ts"
  "src/lib/multifashion/nombres.ts"
  "src/app/multifashion/MultifashionShell.tsx"
  "src/components/multifashion/MultifashionView.tsx"
  "src/components/multifashion/MultifashionResumenView.tsx"
  "src/components/multifashion/VendedorasSubtab.tsx"
  "src/components/multifashion/ClientesMultifashionSubtab.tsx"
  "src/components/multifashion/ProductosSubtab.tsx"
  "src/components/multifashion/VentaHoyCard.tsx"
  "src/components/multifashion/BonosSection.tsx"
  "src/components/multifashion/PeriodoSelect.tsx"
  "src/components/AppHeader.tsx"
  "src/app/api/multifashion/vendedoras/route.ts"
  "src/app/api/multifashion/bonos/route.ts"
  "src/app/api/multifashion/detalle-mensual/route.ts"
  "src/lib/backup/tablas.ts"
  "src/app/api/cron/backup/route.ts"
  "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql"
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

echo "── CONTROL 1 (sin mutar) ────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En el
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control1=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. LAS CUATRO PESTAÑAS ───────────────────────────────────────────────"

mutar "src/lib/multifashion/pestanas.ts" \
  '  { id: "clientes", label: "Clientes" },' \
  '  { id: "clientes", label: "Clientes" },
  { id: "caja", label: "Caja" } as never,' \
  "vuelve la pestaña Caja al menú"

mutar "src/lib/multifashion/pestanas.ts" \
  '  metas: "vendedoras",' \
  '' \
  "un ?subtab=metas guardado deja de redirigir"

mutar "src/lib/multifashion/pestanas.ts" \
  '  return { tab: "resumen", redirigido: pedida !== "" };' \
  '  return { tab: pedida as TabMultifashion, redirigido: false };' \
  "?subtab= con basura vuelve a dejar la pantalla en blanco"

mutar "src/components/multifashion/VendedorasSubtab.tsx" \
  '          <MetasSubtab />' \
  '' \
  "las Metas se pierden al mudarse (no queda el alta ni el premio)"

mutar "src/components/multifashion/VendedorasSubtab.tsx" \
  '          <MetasEnVendedoras />' \
  '' \
  "se pierde el aporte de cada una a la meta"

mutar "src/components/multifashion/MultifashionView.tsx" \
  '<VendedorasSubtab selectedYear={selectedYear} periodo={periodo} corte={corte} conMetas />' \
  '<VendedorasSubtab selectedYear={selectedYear} periodo={periodo} corte={corte} />' \
  "el módulo deja de pedir las Metas"

echo "── 2. EL NOMBRE ─────────────────────────────────────────────────────────"

mutar "src/app/multifashion/MultifashionShell.tsx" \
  '<p className="text-sm font-medium text-gray-700">Multifashion</p>' \
  '<p className="text-sm font-medium text-gray-700">{multi?.tienda}</p>' \
  "el título vuelve a decir «American Classics»"

echo "── 3. LA VENTA DE HOY ───────────────────────────────────────────────────"

mutar "src/components/multifashion/VentaHoyCard.tsx" \
  '        <span className="text-xs text-gray-700">· sin ventas todavía</span>' \
  '        <span className="font-mono text-3xl">{fmtMoney(data.ventas)}</span>' \
  "sin ventas vuelve a escribirse un \$0 grande"

mutar "src/components/multifashion/VentaHoyCard.tsx" \
  '    ? "no pudimos confirmar cuándo se actualizó"' \
  '    ? ""' \
  "el monto se puede mostrar sin decir de cuándo es"

echo "── 4. EL CONTROL DE TIEMPO ──────────────────────────────────────────────"

mutar "src/lib/multifashion/periodo.ts" \
  '  resumen:    { mes: true, anio: false, ventanas: [] },' \
  '  resumen:    { mes: true, anio: true, ventanas: [3, 6, 12] },' \
  "el Resumen ofrece rangos que no sabe dibujar"

mutar "src/lib/multifashion/periodo.ts" \
  '  productos:  { mes: true, anio: false, ventanas: [12] },' \
  '  productos:  { mes: true, anio: true, ventanas: [3, 6, 12] },' \
  "Productos ofrece ventanas que su ruta no acepta"

mutar "src/lib/multifashion/periodo.ts" \
  '  if (periodoSirve(tab, p)) return p;' \
  '  return p;' \
  "un período que la pestaña no sirve deja de ajustarse"

mutar "src/lib/multifashion/periodo.ts" \
  '    if (anio < 2000 || anio > 2100 || m < 1 || m > 12) return null;' \
  '    if (anio < 2000 || anio > 2100) return null;' \
  "la URL puede pedir un mes 13"

mutar "src/lib/multifashion/periodo.ts" \
  '      const tope = a === corte.anio ? corte.mes : 12;' \
  '      const tope = 12;' \
  "el desplegable ofrece meses del futuro"

mutar "src/app/multifashion/MultifashionShell.tsx" \
  '    const hoy = hoyPanama();' \
  '    const hoy = new Date().toISOString().slice(0, 10);' \
  "el corte deja de ser el mes de Panamá"

echo "── 5. VENDEDORAS ────────────────────────────────────────────────────────"

mutar "src/components/multifashion/VendedorasSubtab.tsx" \
  'export const BONO_AL_CIERRE = "al cierre";' \
  'export const BONO_AL_CIERRE = "—";' \
  "el bono pendiente vuelve a leerse como «no le toca»"

mutar "src/components/multifashion/VendedorasSubtab.tsx" \
  '  const conControlPropio = periodo == null;' \
  '  const conControlPropio = false;' \
  "el espejo de Comisiones se queda sin control de período"

echo "── 6. CLIENTES ──────────────────────────────────────────────────────────"

mutar "src/lib/multifashion/clientes-cobertura.ts" \
  '  return Math.round((parte / total) * 100);' \
  '  return Math.round((parte / total) * 1000) / 10;' \
  "los porcentajes vuelven a llevar decimal"

mutar "src/lib/multifashion/clientes-cobertura.ts" \
  '  if (!(total > 0)) return null;' \
  '  if (!(total > 0)) return 0;' \
  "sin tiquetes se escribe «0% — 0%» en vez de abstenerse"

mutar "src/lib/multifashion/clientes-cobertura.ts" \
  'export const FILAS_CLIENTES_AL_ABRIR = 10;' \
  'export const FILAS_CLIENTES_AL_ABRIR = 33;' \
  "la lista vuelve a abrir con las 33 filas"

mutar "src/components/multifashion/ClientesMultifashionSubtab.tsx" \
  '          {(wholesale?.clientes.length ?? 0) > 0 && (' \
  '          {true && (' \
  "el bloque de mayoreo vacío vuelve a ocupar una caja entera"

echo "── 7. LOS NOMBRES ───────────────────────────────────────────────────────"

mutar "src/lib/multifashion/nombres.ts" \
  '  return nombreVendedorEnPantalla(nombre ?? "");' \
  '  return nombre ?? "";' \
  "los nombres vuelven a convivir en MAYÚSCULAS y capitalizados"

mutar "src/components/multifashion/ClientesMultifashionSubtab.tsx" \
  'const normNombre = (s: string): string =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();' \
  'const normNombre = (s: string): string =>
  nombreEnPantalla(s);' \
  "la capitalización se mete en la CLAVE de agrupación"

echo "── 8. EL RESUMEN ────────────────────────────────────────────────────────"

mutar "src/components/multifashion/MultifashionResumenView.tsx" \
  '        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Año {year}</p>' \
  '        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Mes</p>' \
  "el año deja de tener su tarjeta"

mutar "src/components/multifashion/MultifashionResumenView.tsx" \
  '          {fmtMoney(overview.retail.ytdVentas)}' \
  '          {fmtMoney(0)}' \
  "la tarjeta del año pierde la venta del año"

echo "── 9. CUÁNDO VENDE LA TIENDA ────────────────────────────────────────────"

mutar "src/lib/multifashion/patrones.ts" \
  'export const MESES_DEL_PATRON = 3;' \
  'export const MESES_DEL_PATRON = 1;' \
  "el día más fuerte vuelve a mirar un solo mes"

mutar "src/lib/multifashion/patrones.ts" \
  '      acc.suma += (Number(d.ventas_promedio) || 0) * dias;
      acc.dias += dias;' \
  '      acc.suma += (Number(d.ventas_promedio) || 0);
      acc.dias += 1;' \
  "se promedian los promedios en vez de reconstruir la suma"

mutar "src/lib/multifashion/patrones.ts" \
  '    if (h.ventas > 0 && (horaPicoVentas == null || h.ventas > horaPicoVentas)) {' \
  '    if (horaPicoVentas == null || h.ventas > horaPicoVentas) {' \
  "sin ventas se inventa una hora pico"

mutar "src/lib/multifashion/patrones.ts" \
  'export const ROTULO_VENTANA = `últimos ${MESES_DEL_PATRON} meses`;' \
  'export const ROTULO_VENTANA = "";' \
  "las líneas dejan de decir de qué período hablan"

mutar "src/lib/multifashion/patrones.ts" \
  '    const total = anio * 12 + (mes - 1) - i;
    out.push({ anio: Math.floor(total / 12), mes: (total % 12) + 1 });' \
  '    out.push({ anio, mes: mes - i });' \
  "la ventana de N meses deja de cruzar el año"

mutar "src/app/api/multifashion/detalle-mensual/route.ts" \
  '    ...agregarPatrones(mesesPatron),' \
  '    ...agregarPatrones([mesesPatron[0]]),' \
  "la ventana se calcula con un solo mes"

echo "── 10. LA PROYECCIÓN ────────────────────────────────────────────────────"

mutar "src/components/multifashion/MultifashionResumenView.tsx" \
  '                ? `con ${dias} ${dias === 1 ? "día" : "días"}`' \
  '                ? "proyección"' \
  "la proyección deja de decir sobre cuántos días está hecha"

mutar "src/app/api/multifashion/detalle-mensual/route.ts" \
  '      proyeccion_dias: proyeccionDias?.dias ?? null,' \
  '      proyeccion_dias: 30,' \
  "los días de la proyección se inventan"

echo "── 11. EL ENCABEZADO DEL TELÉFONO ───────────────────────────────────────"

mutar "src/app/multifashion/MultifashionShell.tsx" \
  '<AppHeader module="Multifashion" acciones={accionesSync} />' \
  '<AppHeader module="Multifashion" />' \
  "«Sincronizado …» y «Actualizar ahora» se pierden en el celular"

mutar "src/components/AppHeader.tsx" \
  '            {acciones && (
              <div className="border-b border-gray-100 px-5 py-3">{acciones}</div>
            )}' \
  '' \
  "el menú ☰ deja de dibujar las acciones del módulo"

echo "── 12. EL AMARRE DE LAS VENDEDORAS ──────────────────────────────────────"

mutar "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql" \
  '  (14, 10, ' \
  '  (99, 10, ' \
  "un amarre se carga con el código equivocado"

mutar "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql" \
  '  ON public.multifashion_vendedora_alias (codigo_switch)
  WHERE activo;' \
  '  ON public.multifashion_vendedora_alias (codigo_switch);' \
  "la única deja de ser solo entre las activas"

mutar "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql" \
  '  activo            boolean NOT NULL DEFAULT true,' \
  '' \
  "se pierde el soft delete del amarre"

mutar "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql" \
  '  FOR ALL TO service_role USING (true) WITH CHECK (true);' \
  '  FOR ALL TO anon USING (true) WITH CHECK (true);' \
  "la tabla se abre a un rol que no es service_role"

mutar "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql" \
  '    SELECT vendedor_canonico AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets,
      SUM(subtotal_comision) AS base_comision' \
  '    SELECT REGEXP_REPLACE(TRIM(vendedor), '"'"'\s+'"'"', '"'"' '"'"', '"'"'g'"'"') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets,
      SUM(subtotal_comision) AS base_comision' \
  "la v4 vuelve a agrupar por el nombre crudo"

mutar "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql" \
  '    vendedor_switch_id AS vendedor_codigo,
    public.multifashion_vendedora_canonica(vendedor_switch_id, vendedor_nombre) AS vendedor_canonico
   FROM switch_facturas' \
  '    public.multifashion_vendedora_canonica(vendedor_switch_id, vendedor_nombre) AS vendedor_canonico,
    vendedor_switch_id AS vendedor_codigo
   FROM switch_facturas' \
  "las columnas nuevas de la vista cambian de orden"

mutar "supabase/migrations/20261009120000_multifashion_vendedora_alias.sql" \
  "REGEXP_REPLACE(TRIM(COALESCE(p_nombre, '')), '\\s+', ' ', 'g')" \
  "UPPER(TRIM(COALESCE(p_nombre, '')))" \
  "sin amarre el nombre deja de salir como antes"

mutar "src/app/api/multifashion/vendedoras/route.ts" \
  '    const v4 = await supabaseServer.rpc("multifashion_vendedoras_v4", args);
    if (!v4.error) return v4;
    return supabaseServer.rpc("multifashion_vendedoras_v3", args);' \
  '    return supabaseServer.rpc("multifashion_vendedoras_v3", args);' \
  "la ruta deja de llamar a la v4"

mutar "src/app/api/multifashion/bonos/route.ts" \
  '    const v4 = await supabaseServer.rpc("multifashion_bonos_v4", args);
    if (!v4.error) return v4;
    return supabaseServer.rpc("multifashion_bonos_v3", args);' \
  '    return supabaseServer.rpc("multifashion_bonos_v4", args);' \
  "se pierde la red de la v3 mientras la DDL no corre"

mutar "src/lib/backup/tablas.ts" \
  '  "multifashion_vendedora_alias",' \
  '' \
  "el amarre se queda sin copia en el respaldo"

echo "── CONTROL 2 (restaurado) ───────────────────────────────────────────────"
restaurar
total_cazadas=$cazadas
total_sobrevivientes=$sobrevivientes
cazadas=0; sobrevivientes=0
probar "CONTROL 2 — restaurado. Acá lo BUENO es el 🔴 (0 fallos)"
control2=$cazadas

echo
echo "═════════════════════════════════════════════════════════════════════════"
echo "  MUTACIONES CAZADAS: $total_cazadas"
echo "  SOBREVIVIENTES:     $total_sobrevivientes"
echo "  CONTROL 1 (fallos): $control1   ← tiene que ser 0"
echo "  CONTROL 2 (fallos): $control2   ← tiene que ser 0"
echo "═════════════════════════════════════════════════════════════════════════"

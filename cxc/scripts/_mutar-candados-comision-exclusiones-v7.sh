#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «Clientes que no comisionan» (comision_exclusion + v7) CAZAN
# de verdad? Se rompe el código a propósito, una cosa por vez, y se exige que
# los tests se pongan ROJOS. CONTROL (sin mutar) tiene que quedar verde.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
# 🩸 Las mutaciones del SQL las caza el candado ESTÁTICO y, si pglite está en
# PGLITE_DIR (o en /tmp/v6), también el de CONDUCTA (el SQL corriendo).
#
#   bash scripts/_mutar-candados-comision-exclusiones-v7.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comision-exclusion-v7.test.ts \
src/__tests__/components/comisiones-configuracion-pantalla.test.tsx \
src/__tests__/lib/comision-cobro-quien-registro.test.ts \
src/__tests__/lib/comision-cobro-sin-retenciones.test.ts \
src/__tests__/lib/comisiones-consolidado-neto.test.ts \
src/__tests__/un-solo-selector-de-cliente.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

MIG="supabase/migrations/20260912120000_comision_exclusion_v7.sql"
ARCHIVOS=(
  "$MIG"
  "src/lib/comisiones/rpc.ts"
  "src/lib/comisiones/exclusiones.ts"
  "src/lib/comisiones/exclusiones-server.ts"
  "src/app/api/ventas/comisiones/exclusiones/route.ts"
  "src/app/api/ventas/comisiones/exclusiones/[empresa]/clientes-switch/route.ts"
  "src/app/api/ventas/comisiones/route.ts"
  "src/components/ventas/ComisionesView.tsx"
  "src/components/ventas/ComisionesConfiguracionView.tsx"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
  "src/app/comisiones/ComisionesPageClient.tsx"
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

echo "── mutando ──────────────────────────────────────────────────────────────"

# 1. La exclusión deja de mirar si está ACTIVA (en ventas): una quitada seguiría restando.
mutar "$MIG" \
  "     AND ce.vendedor = UPPER(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)))
     AND ce.activa = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)), '') <> ''" \
  "     AND ce.vendedor = UPPER(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)))
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)), '') <> ''" \
  "v7 ventas: una exclusión INACTIVA sigue restando"

# 2. La venta deja de excluir (solo el cobro): «también venta» se pierde.
mutar "$MIG" \
  "    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)), '') <> ''" \
  "    WHERE f.empresa_key = p_empresa_key
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)), '') <> ''" \
  "v7 ventas: la VENTA deja de excluir"

# 3. El cobro deja de excluir.
mutar "$MIG" \
  "    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false" \
  "    WHERE r.empresa_key = p_empresa_key
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false" \
  "v7 cobros: el COBRO deja de excluir"

# 4. La exclusión deja de mirar al VENDEDOR en el cobro: excluiría al cliente para todos.
mutar "$MIG" \
  "     AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo))
     AND ce.vendedor = UPPER(TRIM(r.vendedor_registro))
     AND ce.activa = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND NULLIF(TRIM(r.vendedor_registro), '') IS NOT NULL
    GROUP BY" \
  "     AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo))
     AND ce.activa = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND NULLIF(TRIM(r.vendedor_registro), '') IS NOT NULL
    GROUP BY" \
  "v7 cobros: el cliente queda excluido para TODOS los vendedores"

# 5. El detalle no excluye los cobros (la tabla y el modal dirían cosas distintas).
mutar "$MIG" \
  "  WHERE r.empresa_key = p_empresa_key
    AND ce.id IS NULL
    AND r.fecha BETWEEN v_inicio AND v_fin
    AND NULLIF(TRIM(r.vendedor_registro), '') = p_vendedor" \
  "  WHERE r.empresa_key = p_empresa_key
    AND r.fecha BETWEEN v_inicio AND v_fin
    AND NULLIF(TRIM(r.vendedor_registro), '') = p_vendedor" \
  "detalle v4: los cobros del modal no excluyen"

# 6. La v7 cambia otra cosa a escondidas (deja de ser la v6 + exclusión).
mutar "$MIG" \
  "          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)
          ELSE 0
        END
      ) AS base
    FROM switch_factura_utilidad f
    LEFT JOIN doc_vendedor dv ON dv.secuencial = f.secuencial
    LEFT JOIN comision_exclusion ce" \
  "          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 25 THEN ABS(f.subtotal_con_descuento)
          ELSE 0
        END
      ) AS base
    FROM switch_factura_utilidad f
    LEFT JOIN doc_vendedor dv ON dv.secuencial = f.secuencial
    LEFT JOIN comision_exclusion ce" \
  "v7: deja de ser la v6 byte a byte"

# 7. La DDL dropea la v6.
mutar "$MIG" \
  "CREATE FUNCTION comision_b2b_v7(" \
  "DROP FUNCTION IF EXISTS comision_b2b_v6(text, int, int);
CREATE FUNCTION comision_b2b_v7(" \
  "la DDL dropea la v6"

# 8. La tabla se vuelve única SIEMPRE (no solo entre activas): no se puede volver a excluir.
mutar "$MIG" \
  "  ON comision_exclusion (empresa_key, cliente_codigo, vendedor)
  WHERE activa;" \
  "  ON comision_exclusion (empresa_key, cliente_codigo, vendedor);" \
  "tabla: la unicidad deja de ser solo entre ACTIVAS"

# 9. El GRANT da DELETE.
mutar "$MIG" \
  "GRANT SELECT, INSERT, UPDATE ON comision_exclusion TO service_role;" \
  "GRANT SELECT, INSERT, UPDATE, DELETE ON comision_exclusion TO service_role;" \
  "tabla: el GRANT da DELETE"

# 10. Se pierde una exclusión de Daniel (Active Wear, REYNALDO, D-50).
mutar "$MIG" \
  "  ('active_wear', 'D-104', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-50', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05')" \
  "  ('active_wear', 'D-104', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05')" \
  "seed: falta una de las 17 (la grafía REYNALDO de El Remate)"

# 11. Reinaldo deja de ir a 1 y 1.
mutar "$MIG" \
  "SET tasa_venta = 0.0100, tasa_cobro = 0.0100, updated_at = now()" \
  "SET tasa_venta = 0.0050, tasa_cobro = 0.0100, updated_at = now()" \
  "seed: Reinaldo no queda en 1 y 1"

# 12. Vuelve la columna motivo.
mutar "$MIG" \
  "  vendedor         text NOT NULL,
  -- Soft delete." \
  "  vendedor         text NOT NULL,
  motivo           text,
  -- Soft delete." \
  "tabla: vuelve la columna motivo que Daniel no pidió"

# 13. rpc.ts vuelve a la v6.
mutar src/lib/comisiones/rpc.ts \
  'export const RPC_COMISION = "comision_b2b_v7";' \
  'export const RPC_COMISION = "comision_b2b_v6";' \
  "rpc.ts: vuelve a llamar la v6"

# 14. El fallback miente: dice que las exclusiones se aplicaron aunque cayó a la v6.
mutar src/lib/comisiones/rpc.ts \
  'exclusiones_aplicadas: version === "v7",' \
  'exclusiones_aplicadas: true,' \
  "rpc.ts: el fallback no confiesa que salió sin exclusiones"

# 15. Quitar borra la fila de verdad.
mutar src/lib/comisiones/exclusiones-server.ts \
  '    .update({ activa: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("activa", true)
    .select("id");' \
  '    .delete()
    .eq("id", id)
    .select("id");' \
  "server: quitar hace DELETE físico"

# 16. La ruta se abre a secretaria.
mutar src/app/api/ventas/comisiones/exclusiones/route.ts \
  'const SOLO_ADMIN = ["admin"];' \
  'const SOLO_ADMIN = ["admin", "secretaria"];' \
  "ruta: la configuración se abre a secretaria"

# 17. El directorio del selector se abre a contabilidad.
mutar "src/app/api/ventas/comisiones/exclusiones/[empresa]/clientes-switch/route.ts" \
  'requireRole(req, ["admin"])' \
  'requireRole(req, ["admin", "contabilidad"])' \
  "ruta: el directorio del selector se abre a contabilidad"

# 18. La validación deja pasar el mostrador.
mutar src/lib/comisiones/exclusiones.ts \
  '  if (codigo === CODIGO_CLIENTE_CONTADO) {
    return { ok: false, error: "La venta de mostrador ya no comisiona; no hace falta agregarla" };
  }' \
  '' \
  "validación: deja pasar TCKCTA"

# 19. La validación deja pasar Boston.
mutar src/lib/comisiones/exclusiones.ts \
  '  if (!(EMPRESAS_COMISIONAN as readonly string[]).includes(empresa)) {
    return { ok: false, error: "Elige una de las seis empresas que comisionan" };
  }' \
  '  if (!empresa) {
    return { ok: false, error: "Elige una de las seis empresas que comisionan" };
  }' \
  "validación: deja pasar cualquier empresa"

# 20. La marca se pega sin normalizar el nombre («REINALDO ESPINOSA » no cruza).
mutar src/lib/comisiones/exclusiones.ts \
  '    const lista = por.get(normalizarVendedor(v.vendedor));' \
  '    const lista = por.get(v.vendedor);' \
  "marca: se pierde la normalización del nombre"

# 21. La ruta de comisiones deja de pegar la marca.
mutar src/app/api/ventas/comisiones/route.ts \
  '    vendedores: adjuntarClientesSinComision(
      marcarSePaga(netearComisiones(data.vendedores, totalPorVendedor(descuentos, empresa))),
      exclusiones,
      empresa,
    ),' \
  '    vendedores: marcarSePaga(netearComisiones(data.vendedores, totalPorVendedor(descuentos, empresa))),' \
  "ruta comisiones: se pierde «clientes_sin_comision»"

# 22. El chip Configuración se dibuja para todos.
mutar src/components/ventas/ComisionesView.tsx \
  '  const hayConfig = esAdmin && conConfiguracion;' \
  '  const hayConfig = conConfiguracion;' \
  "pantalla: el chip Configuración lo ve cualquier rol"

# 23. El chip aparece también en la pestaña de Ventas.
mutar src/components/ventas/ComisionesView.tsx \
  '  const hayConfig = esAdmin && conConfiguracion;' \
  '  const hayConfig = esAdmin;' \
  "pantalla: el chip Configuración aparece en Ventas"

# 24. La pantalla vuelve a decir «exclusión».
mutar src/lib/comisiones/exclusiones.ts \
  'export const ROTULO_CLIENTES_SIN_COMISION = "Clientes que no comisionan";' \
  'export const ROTULO_CLIENTES_SIN_COMISION = "Exclusiones de comisión";' \
  "pantalla: vuelve la palabra «exclusión»"

# 25. Daniel recupera las cajas de tasa (no hay tasa que editar para quien no cobra).
mutar src/components/ventas/ComisionesConfiguracionView.tsx \
  '                const sePaga = sePagaComision(r.vendedor_nombre);' \
  '                const sePaga = true;' \
  "pantalla: Daniel vuelve a tener cajas de tasa"

# 26. Vuelve la columna Motivo a la tabla.
mutar src/components/ventas/ComisionesConfiguracionView.tsx \
  '                <th className="px-3.5 py-2 font-medium">Vendedor</th>
                <th className="px-3.5 py-2 font-medium">Desde</th>' \
  '                <th className="px-3.5 py-2 font-medium">Vendedor</th>
                <th className="px-3.5 py-2 font-medium">Motivo</th>
                <th className="px-3.5 py-2 font-medium">Desde</th>' \
  "pantalla: vuelve la columna Motivo"

# 27. Quitar ya no pide confirmación (manda el DELETE de una).
mutar src/components/ventas/ComisionesConfiguracionView.tsx \
  '                      onClick={() => setAQuitar(f)}' \
  '                      onClick={() => { setAQuitar(f); void fetch(`/api/ventas/comisiones/exclusiones?id=${f.id}`, { method: "DELETE" }); }}' \
  "pantalla: quitar sin confirmar"

# 28. Voseo en la pantalla.
mutar src/components/ventas/ComisionesConfiguracionView.tsx \
  '<option value="">Elige el vendedor</option>' \
  '<option value="">Elegí el vendedor</option>' \
  "pantalla: voseo"

# 29. Otro selector de cliente (input propio en vez de ClienteSwitchPicker).
mutar src/components/ventas/ComisionesConfiguracionView.tsx \
  'import ClienteSwitchPicker, { type ClienteSwitchOpcion } from "@/components/catalogo/ClienteSwitchPicker";' \
  'type ClienteSwitchOpcion = { id: number | null; nombre: string | null; codigo: string | null };
function ClienteSwitchPicker({ onElegir }: { api: string; directorioLabel: string; valor: ClienteSwitchOpcion | undefined; onElegir: (c: ClienteSwitchOpcion) => void; disabled?: boolean }) {
  const clientes = [{ id: 1, nombre: "x", codigo: "D-1" }];
  return <div>{clientes.map((c) => <input key={c.id} onClick={() => onElegir(c)} />)}</div>;
}' \
  "pantalla: un selector de cliente PROPIO"

restaurar
echo "── CONTROL (sin mutar) ───────────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
if grep -qE "^ *Tests .*[0-9]+ passed" <<<"$salida" && ! grep -qE "[0-9]+ failed" <<<"$salida"; then
  echo "  ✅ CONTROL verde ($(grep -oE "[0-9]+ passed" <<<"$salida" | head -1))"
else
  echo "  🔴 CONTROL ROJO — los candados no están verdes sin mutar"; sobrevivientes=$((sobrevivientes + 1))
fi

echo "─────────────────────────────────────────────────────────────────────────"
echo "cazadas: $cazadas · sobrevivientes: $sobrevivientes"
[ "$sobrevivientes" -eq 0 ]

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «el cobro se paga a quien REGISTRÓ el recibo» y de «DEFAULT y
# Daniel no se pagan» CAZAN de verdad? Se rompe el código a propósito, una
# cosa por vez, y se exige que los tests se pongan ROJOS.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-comision-cobro-v6.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comision-cobro-quien-registro.test.ts \
src/__tests__/components/comisiones-no-se-paga.test.tsx \
src/__tests__/lib/comision-cobro-sin-retenciones.test.ts \
src/__tests__/lib/comisiones-joystep-entra.test.ts \
src/__tests__/lib/comisiones-consolidado-neto.test.ts \
src/__tests__/lib/comisiones-descuentos-una-sola-resta.test.ts \
src/__tests__/excel-exports-ventas.test.ts"

ARCHIVOS=(
  "supabase/migrations/20260911120000_comision_b2b_v6_cobro_quien_registro.sql"
  "src/lib/comisiones/rpc.ts"
  "src/lib/comisiones/sin-pago.ts"
  "src/lib/comisiones/empresas.ts"
  "src/lib/comisiones/vendedor-default.ts"
  "src/lib/ventas/comisionExcel.ts"
  "src/app/api/ventas/comisiones/route.ts"
  "src/app/api/ventas/comisiones/consolidado/route.ts"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
  "src/components/ventas/ComisionesConsolidadoView.tsx"
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

MIG="supabase/migrations/20260911120000_comision_b2b_v6_cobro_quien_registro.sql"

echo "── mutando ──────────────────────────────────────────────────────────────"

# 1. El cobro vuelve a CARTERA en la v6.
mutar "$MIG" \
  "      NULLIF(TRIM(r.vendedor_registro), '') AS vendedor,
      SUM(r.total) AS base," \
  "      r.vendedor_cartera AS vendedor,
      SUM(r.total) AS base," \
  "v6: el cobro vuelve a vendedor_cartera"

# 2. El detalle sigue por cartera (la tabla y el modal dirían cosas distintas).
mutar "$MIG" \
  "    AND NULLIF(TRIM(r.vendedor_registro), '') = p_vendedor" \
  "    AND r.vendedor_cartera = p_vendedor" \
  "detalle v3: los cobros vuelven a cartera"

# 3. Sin TRIM: «DANIEL LEVY » de joystep sería otro vendedor.
mutar "$MIG" \
  "    GROUP BY NULLIF(TRIM(r.vendedor_registro), '')" \
  "    GROUP BY r.vendedor_registro" \
  "v6: se pierde el TRIM del nombre"

# 4. La venta cambia de criterio a escondidas dentro de la v6.
mutar "$MIG" \
  "          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)" \
  "          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 25 THEN ABS(f.subtotal_con_descuento)" \
  "v6: el CTE ventas deja de ser idéntico al de v5"

# 5. Las retenciones vuelven a comisionar en la v6.
mutar "$MIG" \
  "      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND NULLIF(TRIM(r.vendedor_registro), '') IS NOT NULL" \
  "      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND NULLIF(TRIM(r.vendedor_registro), '') IS NOT NULL" \
  "v6: se cae el filtro de retenciones"

# 6. La v6 pisa a la v5 (ya no se puede comparar).
mutar "$MIG" \
  "CREATE FUNCTION comision_b2b_v6(" \
  "DROP FUNCTION IF EXISTS comision_b2b_v5(text, int, int);
CREATE FUNCTION comision_b2b_v6(" \
  "la DDL dropea la v5"

# 7. El código apunta a la v5.
mutar src/lib/comisiones/rpc.ts \
  'export const RPC_COMISION = "comision_b2b_v6";' \
  'export const RPC_COMISION = "comision_b2b_v5";' \
  "rpc.ts: vuelve a llamar la v5"

# 8. El fallback miente: dice quien_registro aunque cayó a la v5.
mutar src/lib/comisiones/rpc.ts \
  'regla_cobro: usoAnterior ? "cartera" : "quien_registro",' \
  'regla_cobro: "quien_registro",' \
  "rpc.ts: el fallback no confiesa que salió por cartera"

# 9. Boston entra a la matriz.
mutar src/lib/comisiones/empresas.ts \
  "export const EMPRESAS_COMISIONAN = B2B_EMPRESA_KEYS;" \
  'export const EMPRESAS_COMISIONAN = [...B2B_EMPRESA_KEYS, "confecciones_boston"] as const;' \
  "Boston entra a EMPRESAS_COMISIONAN"

# 10. A Daniel se le paga.
mutar src/lib/comisiones/sin-pago.ts \
  'export const VENDEDORES_SIN_PAGO: readonly string[] = ["DEFAULT", "DANIEL LEVY"];' \
  'export const VENDEDORES_SIN_PAGO: readonly string[] = ["DEFAULT"];' \
  "sin-pago: Daniel sale de la lista (se le pagaría)"

# 11. El pie suma también lo que no se paga.
mutar src/lib/comisiones/sin-pago.ts \
  "return filas.reduce((acc, f) => (f.se_paga === false ? acc : acc + monto(f)), 0);" \
  "return filas.reduce((acc, f) => acc + monto(f), 0);" \
  "sin-pago: sumarPagable suma todo"

# 12. La ruta deja de marcar.
mutar src/app/api/ventas/comisiones/route.ts \
  "    vendedores: marcarSePaga(
      netearComisiones(data.vendedores, totalPorVendedor(descuentos, empresa)),
    )," \
  "    vendedores: netearComisiones(data.vendedores, totalPorVendedor(descuentos, empresa))," \
  "ruta por empresa: se pierde la marca se_paga"

# 13. La vista consolidada esconde a DEFAULT (la plata desaparece).
mutar src/components/ventas/ComisionesConsolidadoView.tsx \
  'const VENDEDORES_OCULTOS = new Set(["AGUAS"]);' \
  'const VENDEDORES_OCULTOS = new Set(["AGUAS", "DEFAULT"]);' \
  "consolidado: DEFAULT se esconde"

# 14. El pie de la matriz vuelve a sumar todo.
mutar src/components/ventas/ComisionesConsolidadoView.tsx \
  "const grandTotal = sumarPagable(allShown, (r) => r.total);" \
  "const grandTotal = allShown.reduce((a, r) => a + r.total, 0);" \
  "consolidado: el gran total suma lo que no se paga"

# 15. El pie de «Por empresa» vuelve a sumar todo.
mutar src/components/ventas/ComisionesPorEmpresaView.tsx \
  "const totalGeneral = sumarPagable(vendedores, (v) => v.comision_total ?? 0);" \
  "const totalGeneral = vendedores.reduce((a, v) => a + (v.comision_total ?? 0), 0);" \
  "por empresa: el total suma lo que no se paga"

# 16. El Excel del resumen suma todo.
mutar src/lib/ventas/comisionExcel.ts \
  "    comision_total: sumarPagable(r.vendedores, (v) => v.comision_total ?? 0)," \
  "    comision_total: r.vendedores.reduce((a, v) => a + (v.comision_total ?? 0), 0)," \
  "excel resumen: el Total suma lo que no se paga"

# 17. La oficina vuelve a decir «Sin asignar».
mutar src/lib/comisiones/vendedor-default.ts \
  'export const ETIQUETA_DEFAULT = "Oficina (DEFAULT)";' \
  'export const ETIQUETA_DEFAULT = "Sin asignar";' \
  "vendedor-default: la oficina vuelve a «Sin asignar»"

restaurar
echo "── CONTROL (sin mutación) ─────────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
resumen="$(grep -E "^ *Tests " <<<"$salida" || echo "SIN RESUMEN")"
echo "  $resumen"
if grep -qE "[0-9]+ failed" <<<"$salida"; then
  echo "  🔴 el CONTROL está rojo: el candado está roto ANTES de mutar"
  sobrevivientes=$((sobrevivientes + 1))
fi

echo
echo "cazadas: $cazadas · sobrevivientes: $sobrevivientes"
[ "$sobrevivientes" -eq 0 ]

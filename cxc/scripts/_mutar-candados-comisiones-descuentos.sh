#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de "una sola resta" CAZAN de verdad? Se rompe el código a
# propósito, una cosa por vez, y se exige que los tests se pongan ROJOS.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó en este
# repo.
#
# 🩸 Y `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: si la corrida muere, un
# "0 fallos" se leería como "sobrevivió". Un verificador que miente en verde es
# peor que no tenerlo.
#
#   bash scripts/_mutar-candados-comisiones-descuentos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comisiones-descuentos-una-sola-resta.test.ts \
src/__tests__/components/comisiones-por-empresa-neto.test.tsx \
src/__tests__/lib/comisiones-consolidado-neto.test.ts \
src/__tests__/lib/comisiones-joystep-entra.test.ts"

ARCHIVOS=(
  "src/lib/comisiones/descuentos.ts"
  "src/app/api/ventas/comisiones/route.ts"
  "src/app/api/ventas/comisiones/consolidado/route.ts"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
  "src/components/ventas/ComisionesConsolidadoView.tsx"
  "src/components/ventas/ComisionesTarjetas.tsx"
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
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:60]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

mutar src/lib/comisiones/descuentos.ts \
  "comision_total: descuento ? round2(bruto - descuento) : bruto," \
  "comision_total: bruto," \
  "netearComisiones NO resta (devuelve el subtotal)"

mutar src/lib/comisiones/descuentos.ts \
  "round2(bruto - descuento)" \
  "(bruto - descuento)" \
  "la resta no redondea (arrastra centavos de coma flotante)"

mutar src/lib/comisiones/descuentos.ts \
  'v.vendedor === DEFAULT_VENDEDOR ? 0 : Number(porVendedor[v.vendedor] ?? 0)' \
  'Number(porVendedor[v.vendedor] ?? 0)' \
  "al centinela DEFAULT también se le resta"

mutar src/app/api/ventas/comisiones/route.ts \
  "vendedores: netearComisiones(
      data.vendedores ?? [],
      totalPorVendedor(descuentos, empresa),
    )," \
  "vendedores: data.vendedores ?? []," \
  '"Por empresa" vuelve a devolver la RPC cruda (EL BUG)'

mutar src/app/api/ventas/comisiones/route.ts \
  "leerDescuentosEfectivos([empresa], year, mes).catch(() => [])" \
  "leerDescuentosEfectivos([empresa], year, mes)" \
  "los descuentos dejan de fallar ABIERTO en Por empresa"

mutar src/app/api/ventas/comisiones/route.ts \
  "if (rpc.error) {
    return NextResponse.json({ error: rpc.error.message }, { status: 500 });
  }" \
  "if (rpc.error) {
    return NextResponse.json({ vendedores: [] });
  }" \
  "un error de las COMISIONES se disfraza de tabla vacía"

mutar src/app/api/ventas/comisiones/consolidado/route.ts \
  "vendedores: netearComisiones(vendedores, totalPorVendedor(descuentos, empresa))," \
  "vendedores," \
  '"Todas las empresas" deja de restar'

mutar src/app/api/ventas/comisiones/consolidado/route.ts \
  "totalPorVendedor(descuentos, empresa)" \
  "totalPorVendedor(descuentos)" \
  "el descuento deja de caer en la celda de SU empresa"

mutar src/components/ventas/ComisionesPorEmpresaView.tsx \
  "{(v.descuento ?? 0) > 0 && (" \
  "{false && (" \
  "la pantalla deja de decir cuánto se restó"

mutar src/components/ventas/ComisionesPorEmpresaView.tsx \
  "{fmtMoney(v.comision_total)}" \
  "{fmtMoney(v.comision_total + (v.descuento ?? 0))}" \
  "la celda vuelve a pintar el subtotal"

mutar src/components/ventas/ComisionesPorEmpresaView.tsx \
  "      vendedores,
    });" \
  "      vendedores: vendedores.map((v) => ({ ...v, comision_total: v.comision_total + (v.descuento ?? 0) })),
    });" \
  "el Excel baja el subtotal aunque la pantalla muestre el neto"

mutar src/components/ventas/ComisionesConsolidadoView.tsx \
  "target.total += v.comision_total ?? 0;" \
  "target.total += (v.comision_total ?? 0) - (v.descuento ?? 0);
          target.porEmpresa[r.empresa_key] = (target.porEmpresa[r.empresa_key] ?? 0) - (v.descuento ?? 0);" \
  "vuelve una SEGUNDA resta a la vista consolidada (el descuento se cobra dos veces)"

mutar src/components/ventas/ComisionesTarjetas.tsx \
  "{(v.descuento ?? 0) > 0 && (" \
  "{false && (" \
  "la tarjeta del celular deja de decir cuánto se restó"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "CAZADAS: $cazadas · SOBREVIVIENTES: $sobrevivientes"
[ "$sobrevivientes" -eq 0 ]

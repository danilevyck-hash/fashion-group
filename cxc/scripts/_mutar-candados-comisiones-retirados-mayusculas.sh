#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «te dije que eliminaras Rey Stoute Aguas» y «capitaliza reynaldo» CAZAN de
# verdad? Se rompe el código a propósito, una cosa por vez, y se exige que los
# tests se pongan ROJOS. CONTROL (sin mutar) tiene que quedar verde.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS
# sin commitear y git abortaría el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-comisiones-retirados-mayusculas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comisiones-retirados-y-mayusculas.test.tsx \
src/__tests__/lib/comisiones-consolidado-neto.test.ts \
src/__tests__/lib/comision-alias-v8.test.ts \
src/__tests__/components/comisiones-configuracion-pantalla.test.tsx \
src/__tests__/components/comisiones-no-se-paga.test.tsx \
src/__tests__/components/comisiones-por-empresa-neto.test.tsx \
src/__tests__/lib/nada-de-voseo.test.ts"

MIG="supabase/migrations/20260916120000_retirar_rey_stoute_aguas.sql"
ARCHIVOS=(
  "$MIG"
  "src/lib/comisiones/retirados.ts"
  "src/lib/comisiones/alias.ts"
  "src/lib/ventas/comisionExcel.ts"
  "src/app/api/ventas/comisiones/config/route.ts"
  "src/app/api/ventas/comisiones/exclusiones/route.ts"
  "src/components/ventas/ComisionesConsolidadoView.tsx"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
  "src/components/ventas/ComisionesTarjetas.tsx"
  "src/components/ventas/ComisionesDetalleModal.tsx"
  "src/components/ventas/ComisionesConfiguracionView.tsx"
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
salida="$(npx vitest run $TESTS 2>&1)"
if grep -qE "[1-9][0-9]* failed" <<<"$salida" || ! grep -qE "^ *Tests " <<<"$salida"; then
  echo "  🔴 el CONTROL no está verde — no vale mutar sobre un rojo"; grep -E "×|FAIL|Tests " <<<"$salida" | head -20; exit 1
fi
echo "  ✅ verde: $(grep -E '^ *Tests ' <<<"$salida" | head -1 | xargs)"

echo "── mutando ──────────────────────────────────────────────────────────────"

OC="src/lib/comisiones/retirados.ts"
AL="src/lib/comisiones/alias.ts"
XL="src/lib/ventas/comisionExcel.ts"
CONS="src/components/ventas/ComisionesConsolidadoView.tsx"
POR="src/components/ventas/ComisionesPorEmpresaView.tsx"
TAR="src/components/ventas/ComisionesTarjetas.tsx"
MOD="src/components/ventas/ComisionesDetalleModal.tsx"
CFG="src/components/ventas/ComisionesConfiguracionView.tsx"

# ── (a) Los retirados ──────────────────────────────────────────────────────────

# 1. Se quita REY STOUTE AGUAS del set (queda solo la grafía vieja): la fila vuelve.
mutar "$OC" '["REY STOUTE AGUAS", "AGUAS"]' '["AGUAS"]' \
  "retirados: se quita REY STOUTE AGUAS del set"

# 2. Se quita AGUAS (la grafía vieja, por si el alias falla abierto).
mutar "$OC" '["REY STOUTE AGUAS", "AGUAS"]' '["REY STOUTE AGUAS"]' \
  "retirados: se quita AGUAS (grafía vieja) del set"

# 3. La lista queda vacía: nadie retirado.
mutar "$OC" '["REY STOUTE AGUAS", "AGUAS"]' '[]' \
  "retirados: lista vacía"

# 4. La comparación deja de pasar por el alias.
mutar "$OC" 'const canonico = aplicarAlias(vendedor, alias);' 'const canonico = (vendedor ?? "").trim();' \
  "retirados: se compara sin pasar por el alias"

# 5. La comparación deja de normalizar (sensible a mayúsculas/bordes).
mutar "$OC" 'return RETIRADOS.has(claveAlias(canonico));' 'return RETIRADOS.has(canonico);' \
  "retirados: se compara sin la clave (mayúsculas/bordes)"

# 6. estaRetirado contesta al revés para el control (Edwin retirado, Aguas no).
mutar "$OC" 'return RETIRADOS.has(claveAlias(canonico));' 'return !RETIRADOS.has(claveAlias(canonico));' \
  "retirados: al revés (esconde a Edwin, muestra a Aguas)"

# 7. sinRetirados no filtra.
mutar "$OC" 'return (vendedores ?? []).filter((v) => !estaRetirado(v.vendedor, alias));' 'return [...(vendedores ?? [])];' \
  "retirados: sinRetirados devuelve todo"

# 8. La matriz consolidada deja de saltarse a los retirados ANTES de sumar.
mutar "$CONS" 'if (estaRetirado(v.vendedor)) continue; // retirado: fuera de la tabla Y de los totales' '' \
  "consolidado: no se excluye antes de sumar"

# 9. Por empresa deja de filtrar.
mutar "$POR" 'const vendedores = sinRetirados(data?.vendedores ?? []);' 'const vendedores = data?.vendedores ?? [];' \
  "por empresa: no se filtra a los retirados"

# 10. El Excel resumen deja de filtrar.
mutar "$XL" 'const vendedores = sinRetirados(r.vendedores);' 'const vendedores = r.vendedores;' \
  "excel resumen: no se filtra a los retirados"

# 11. El Excel consolidado deja de filtrar.
mutar "$XL" 'const vendedores = sinRetirados(c.vendedores);' 'const vendedores = c.vendedores;' \
  "excel consolidado: no se filtra a los retirados"

# 12. El Excel resumen filtra las filas pero SUMA a los retirados en el total.
mutar "$XL" 'comision_total: sumarPagable(vendedores, (v) => v.comision_total ?? 0),' 'comision_total: sumarPagable(r.vendedores, (v) => v.comision_total ?? 0),' \
  "excel resumen: el total suma a los retirados"

# 13. La tabla de tasas de Configuración vuelve a dibujar a los retirados.
mutar "$CFG" 'sePagaComision(r.vendedor_nombre) && !estaRetirado(r.vendedor_nombre)' 'sePagaComision(r.vendedor_nombre)' \
  "configuración: la tabla de tasas dibuja a Aguas"

# 14. El desplegable de vendedores vuelve a ofrecer a los retirados.
mutar "$CFG" '(datos?.vendedores[empresa] ?? []).filter((v) => !estaRetirado(v))' '(datos?.vendedores[empresa] ?? [])' \
  "configuración: el desplegable ofrece a Aguas"

# 15. El servidor (config GET) vuelve a mandar a los retirados.
mutar "src/app/api/ventas/comisiones/config/route.ts" ' || estaRetirado(nombre, alias)) continue;' ') continue;' \
  "api config: el GET manda a Aguas"

# 16. El servidor (exclusiones GET) vuelve a ofrecer a los retirados.
mutar "src/app/api/ventas/comisiones/exclusiones/route.ts" 'if (n && !estaRetirado(n)) por.get(empresa)?.add(n);' 'if (n) por.get(empresa)?.add(n);' \
  "api exclusiones: los vendedores elegibles incluyen a Aguas"

# 16b. El servidor (config PUT) acepta una tasa para el retirado.
mutar "src/app/api/ventas/comisiones/config/route.ts" '    if (estaRetirado(nombre, alias)) {
      return NextResponse.json({ error: AVISO_VENDEDOR_RETIRADO }, { status: 400 });
    }' '' \
  "api config: el PUT acepta una tasa para Aguas"

# 16c. El servidor (exclusiones POST) acepta una exclusión para el retirado.
mutar "src/app/api/ventas/comisiones/exclusiones/route.ts" '  if (estaRetirado(valor.vendedor)) {
    return NextResponse.json({ error: AVISO_VENDEDOR_RETIRADO }, { status: 400 });
  }' '' \
  "api exclusiones: el POST acepta una exclusión para Aguas"

# 16d. La migración BORRA la fila en vez de desactivarla.
mutar "$MIG" "UPDATE comision_vendedor_tasa
SET activo = false,
    updated_at = now()
WHERE vendedor_nombre = 'REY STOUTE AGUAS';" "DELETE FROM comision_vendedor_tasa WHERE vendedor_nombre = 'REY STOUTE AGUAS';" \
  "migración: DELETE en vez de activo = false"

# 16e. La migración desactiva por parecido, no por el canónico exacto.
mutar "$MIG" "WHERE vendedor_nombre = 'REY STOUTE AGUAS';" "WHERE vendedor_nombre ILIKE '%AGUAS%';" \
  "migración: WHERE por parecido"

# ── (b) y (c) Capitalizado ───────────────────────────────────────────────────

# 17. La matriz consolidada vuelve a mostrar el nombre crudo (activos).
mutar "$CONS" '{nombreVendedorEnPantalla(r.vendedor)}
                      {!r.se_paga && <MarcaNoSePaga />}' '{r.vendedor}
                      {!r.se_paga && <MarcaNoSePaga />}' \
  "consolidado: la fila activa muestra REYNALDO ESPINOSA"

# 18. Por empresa vuelve al nombre crudo.
mutar "$POR" '{nombreVendedorEnPantalla(v.vendedor)}</span>' '{v.vendedor}</span>' \
  "por empresa: la fila muestra REYNALDO ESPINOSA"

# 19. Tarjetas de la matriz: nombre crudo.
mutar "$TAR" '<span className="truncate">{nombreVendedorEnPantalla(fila.vendedor)}</span>' '<span className="truncate">{fila.vendedor}</span>' \
  "tarjetas consolidado: nombre en mayúsculas"

# 20. Tarjetas por empresa: nombre crudo.
mutar "$TAR" '<span className="truncate">{nombreVendedorEnPantalla(v.vendedor)}</span>' '<span className="truncate">{v.vendedor}</span>' \
  "tarjetas por empresa: nombre en mayúsculas"

# 21. El modal: título en pantalla crudo.
mutar "$MOD" 'Comisión — {nombreVendedorEnPantalla(vendedor)}</h2>' 'Comisión — {vendedor}</h2>' \
  "modal: el título muestra REYNALDO ESPINOSA"

# 22. El modal: el encabezado del papel vuelve a mayúsculas.
mutar "$MOD" 'const headerLinea = `Comisión — ${nombreVendedorEnPantalla(vendedor)} ·' 'const headerLinea = `Comisión — ${vendedor.toUpperCase()} ·' \
  "modal: el encabezado impreso en mayúsculas"

# 23. El Excel: la celda del vendedor cruda.
mutar "$XL" '    : nombreVendedorEnPantalla(v.vendedor);' '    : v.vendedor;' \
  "excel: la celda del vendedor en mayúsculas"

# 24. El Excel: la marca «no se paga» con el nombre crudo.
mutar "$XL" '? `${nombreVendedorEnPantalla(v.vendedor)} (${ROTULO_NO_SE_PAGA})`' '? `${v.vendedor} (${ROTULO_NO_SE_PAGA})`' \
  "excel: «DANIEL LEVY (no se paga)» en mayúsculas"

# 25. El Excel del detalle: título crudo.
mutar "$XL" '`Comisión — ${nombreVendedorEnPantalla(d.vendedor)}`' '`Comisión — ${d.vendedor}`' \
  "excel detalle: el título en mayúsculas"

# 26. nombreVendedorEnPantalla deja de capitalizar (devuelve tal cual).
mutar "$AL" '  return v
    .toLocaleLowerCase("es")' '  return v; return v
    .toLocaleLowerCase("es")' \
  "alias: nombreVendedorEnPantalla devuelve el nombre tal cual"

# 27. nombreVendedorEnPantalla pisa la etiqueta de la oficina («Oficina (default)»).
mutar "$AL" '  if (v === ETIQUETA_DEFAULT) return ETIQUETA_DEFAULT;' '' \
  "alias: la etiqueta de la oficina se vuelve «Oficina (default)»"

# 28. La capitalización cambia la CLAVE que viaja al Excel/detalle (agrupa por el bonito).
mutar "$CONS" ': (byName.get(v.vendedor) ?? blank(v.vendedor));' ': (byName.get(v.vendedor) ?? blank(nombreVendedorEnPantalla(v.vendedor)));' \
  "consolidado: la clave de la fila se capitaliza (viaja bonita al Excel)"

echo "── resultado ────────────────────────────────────────────────────────────"
echo "  cazadas: $cazadas · sobrevivientes: $sobrevivientes · total: $((cazadas + sobrevivientes))"
[ "$sobrevivientes" -eq 0 ]

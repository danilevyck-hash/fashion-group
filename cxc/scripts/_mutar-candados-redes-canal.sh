#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «REDES SHEYNEE ES SHEYNEE» CAZAN DE VERDAD? (18-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (sin mutar) tienen que quedar VERDES: un ✅
# ahí significa que los candados fallan por otra razón y toda la corrida no dice
# nada.
#
# Lo que no se puede volver a romper:
#   1. El canal NO se deduce del nombre (columna del amarre, lista cerrada).
#   2. UNA sola fila en el ranking, con el desglose adentro (`por_canal`).
#   3. El bono usa el total junto (no se toca).
#   4. Metas usa el canónico (`meta_ventas_v2`, y cae a la v1 SOLO si no existe).
#   5. El amarre 15 → 11 viaja en la migración.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-redes-canal.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/multifashion-redes-canal.test.ts \
src/__tests__/lib/multifashion-metas.test.ts \
src/__tests__/lib/multifashion-rediseno.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

MIGRACION="supabase/migrations/20261209120000_multifashion_vendedora_canal.sql"
ARCHIVOS=(
  "$MIGRACION"
  "src/lib/multifashion/canales.ts"
  "src/lib/multifashion/metas-lectura.ts"
  "src/components/multifashion/VendedorasSubtab.tsx"
  "src/app/api/multifashion/vendedoras/route.ts"
  "docs/postmortems/multifashion.md"
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

echo "── 1. EL CANAL NO SE DEDUCE DEL NOMBRE ──────────────────────────────────"

mutar "$MIGRACION" \
  "   WHERE a.activo AND a.codigo_switch = p_codigo AND a.canal IS NOT NULL" \
  "   WHERE a.activo AND a.nombre_switch ILIKE 'REDES%'" \
  "la función adivina el canal buscando «REDES» en el nombre"

mutar "$MIGRACION" \
  "  CHECK (canal IS NULL OR canal IN ('redes'));" \
  "  CHECK (true);" \
  "la lista de canales deja de ser cerrada"

mutar "src/components/multifashion/VendedorasSubtab.tsx" \
  "  const desglose = desgloseCanales(v.ventas, v.por_canal);
  return (
    <tr" \
  "  const desglose = desgloseCanales(v.ventas, v.nombre.toUpperCase().includes(\"REDES\") ? { redes: v.ventas } : v.por_canal);
  return (
    <tr" \
  "la pantalla decide el desglose mirando el nombre"

echo "── 2. UNA SOLA FILA, CON EL DESGLOSE ADENTRO ────────────────────────────"

mutar "$MIGRACION" \
  "      'por_canal', a.por_canal," \
  "" \
  "la v5 deja de mandar por_canal (la pantalla no puede desglosar)"

mutar "$MIGRACION" \
  "    FROM por_persona_y_canal
    GROUP BY vendedor
  )," \
  "    FROM por_persona_y_canal
    GROUP BY vendedor, canal
  )," \
  "el ranking parte a Sheynee en dos filas (una por canal)"

mutar "$MIGRACION" \
  "      SUM(base_comision) AS base_comision," \
  "      SUM(ventas) AS base_comision," \
  "la comisión pasa a cobrarse sobre toda la venta (no solo contado)"

mutar "src/lib/multifashion/canales.ts" \
  "  if (partes.length === 0) return null;" \
  "  if (partes.length === 0) return \`\${ROTULO_TIENDA} \${fmtMoney(ventas)}\`;" \
  "a TODAS las vendedoras les aparece «tienda \$X»"

mutar "src/lib/multifashion/canales.ts" \
  "  const tienda = centavos(ventas - enCanales);" \
  "  const tienda = centavos(ventas);" \
  "la tienda dice el total: las partes ya no suman la fila"

mutar "src/components/multifashion/VendedorasSubtab.tsx" \
  "      {desglose && (
        <p data-desglose-canal className=\"mt-0.5 font-mono text-xs text-gray-500 tabular-nums\">{desglose}</p>
      )}
      <div className=\"mt-1 text-xs text-gray-500\">" \
  "      <div className=\"mt-1 text-xs text-gray-500\">" \
  "la tarjeta del celular pierde el desglose"

mutar "src/app/api/multifashion/vendedoras/route.ts" \
  "    const v5 = await supabaseServer.rpc(\"multifashion_vendedoras_v5\", args);
    if (!v5.error) return v5;
" \
  "" \
  "la ruta se queda en la v4: el desglose nunca llega"

echo "── 3. EL BONO USA EL TOTAL JUNTO ────────────────────────────────────────"

mutar "$MIGRACION" \
  "GRANT EXECUTE ON FUNCTION public.multifashion_meta_ventas_v2(date, date) TO service_role;" \
  "GRANT EXECUTE ON FUNCTION public.multifashion_meta_ventas_v2(date, date) TO service_role;
CREATE OR REPLACE FUNCTION public.multifashion_bonos_v4(p_year integer, p_mes integer DEFAULT NULL::integer) RETURNS jsonb LANGUAGE sql STABLE AS \$fn\$ SELECT '{}'::jsonb \$fn\$;" \
  "la migración redefine el bono"

echo "── 4. METAS USA EL CANÓNICO ─────────────────────────────────────────────"

mutar "$MIGRACION" \
  "    COALESCE(v.vendedor_canonico, '') AS vendedor," \
  "    COALESCE(v.vendedor, '')          AS vendedor," \
  "la v2 vuelve a devolver el nombre crudo"

mutar "src/lib/multifashion/metas-lectura.ts" \
  "  let { data, error } = await supabaseServer.rpc(\"multifashion_meta_ventas_v2\", args);" \
  "  let { data, error } = await supabaseServer.rpc(\"multifashion_meta_ventas_v1\", args);" \
  "la lectura pide la v1 primero"

mutar "src/lib/multifashion/metas-lectura.ts" \
  "  if (error && esFuncionAusente(error)) {" \
  "  if (error) {" \
  "cualquier error de la v2 se disfraza de «no existe»"

mutar "src/lib/multifashion/metas-lectura.ts" \
  "    const vendedor = (f.vendedor_canonico ?? f.vendedor ?? \"\").trim();" \
  "    const vendedor = (f.vendedor ?? \"\").trim();" \
  "el camino paginado vuelve al crudo"

echo "── 5. EL AMARRE 15 → 11 ─────────────────────────────────────────────────"

mutar "$MIGRACION" \
  "  (15, 11, 'REDES Sheynee', 'Sheynee Batista', 'redes', 'migracion-20261209120000')" \
  "  (15, 11, 'REDES Sheynee', 'Sheynee Batista', NULL, 'migracion-20261209120000')" \
  "el amarre se carga sin canal (Sheynee se junta pero no se desglosa)"

mutar "docs/postmortems/multifashion.md" \
  "**aplicada** — verificado contra producción el 18-sep-2026" \
  "⚠️ **PENDIENTE de aplicar** — verificado contra producción el 18-sep-2026" \
  "la doc vuelve a decir que el amarre está pendiente"

echo "── CONTROL 2 (restaurado) ───────────────────────────────────────────────"
restaurar
antes=$cazadas; sob=$sobrevivientes
probar "CONTROL 2 — restaurado. Acá lo BUENO es el 🔴 (0 fallos)"
control2=$((cazadas - antes))
# El control no es una mutación: no cuenta ni como cazada ni como sobreviviente.
cazadas=$antes; sobrevivientes=$sob

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "Mutaciones cazadas: $cazadas · sobrevivientes: $sobrevivientes"
echo "Controles verdes (0 fallos): $([ "$control1" -eq 0 ] && echo sí || echo NO) / $([ "$control2" -eq 0 ] && echo sí || echo NO)"
if [ "$sobrevivientes" -eq 0 ] && [ "$control1" -eq 0 ] && [ "$control2" -eq 0 ]; then
  echo "✅ Los candados cazan todo."
else
  echo "🔴 Hay algo que revisar."
  exit 1
fi

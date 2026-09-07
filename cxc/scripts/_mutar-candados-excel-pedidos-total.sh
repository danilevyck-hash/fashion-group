#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿El candado del TOTAL del Excel de Comprobantes CAZA de verdad? (6-sep-2026)
#
# La regla que sostiene: el Excel y la pantalla calculan el total con la MISMA
# función (`contextoDeLineas` + `totalDeLaLista`), leyendo las PIEZAS POR BULTO
# del estilo. Sin eso, seis pedidos de Tommy salían con $1.516,00 de más.
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios que no cambian nada) tienen que SOBREVIVIR.
#
# 🩸 La restauración va por COPIA, no con `git checkout`: hay archivos NUEVOS en
# el árbol y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE encontrar el resumen de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-excel-pedidos-total.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/api/excel-pedidos-mismo-total.test.ts \
src/__tests__/lib/tommy-bulto-pedido-completo.test.ts \
src/__tests__/lib/lineas-pedido.test.ts \
src/__tests__/api/catalogo-paridad-listas.test.ts \
src/__tests__/api/pedidos-export-numeros.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/app/api/catalogo/[marca]/pedidos-export/route.ts"
  "src/app/api/catalogo/[marca]/orders/route.ts"
  "src/lib/catalogo/totales-lista.ts"
  "src/lib/catalogo/lineas-pedido.ts"
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

EXPORT="src/app/api/catalogo/[marca]/pedidos-export/route.ts"
PANTALLA="src/app/api/catalogo/[marca]/orders/route.ts"
COMPARTIDO="src/lib/catalogo/totales-lista.ts"
LINEAS="src/lib/catalogo/lineas-pedido.ts"

echo "── mutando ──────────────────────────────────────────────────────────────"

# ═══ El Excel vuelve a calcular por su cuenta ════════════════════════════════

mutar "$EXPORT" \
  "        total: totalDeLaLista(items, ctxLineas)," \
  "        total: cfg.calcTotal(items as never)," \
  "el Excel vuelve a la fórmula RETIRADA (cfg.calcTotal, sin las piezas)"

mutar "$EXPORT" \
  "    const ctxLineas = await contextoDeLineas(cfg, await cfg.db(), allProductIds);" \
  "    const ctxLineas = { bultoSize: cfg.bultoSize, bultoPzasByProduct: new Map<string, number | null>() };" \
  "el Excel se arma su propio contexto a mano"

mutar "$EXPORT" \
  "    const ctxLineas = await contextoDeLineas(cfg, await cfg.db(), allProductIds);" \
  "    const ctxLineas = await contextoDeLineas(cfg, await cfg.db(), []);" \
  "el Excel pide el contexto sin decirle de qué productos"

mutar "$EXPORT" \
  "    const allProductIds = rows.flatMap((r) => (r.items || []).map((i) => i.product_id));" \
  "    const allProductIds = rows.flatMap((r) => (r.items || []).map(() => null));" \
  "el Excel manda los productos en blanco"

# ═══ La pantalla se separa del Excel ═════════════════════════════════════════

mutar "$PANTALLA" \
  "    const resumen = resumirDesdeItems(items, ctxLineas);" \
  "    const resumen = resumirDesdeItems(items, { bultoSize: cfg.bultoSize });" \
  "la pantalla se arma su propio contexto y pierde las piezas por bulto"

mutar "$PANTALLA" \
  "  const ctxLineas = await contextoDeLineas(cfg, db as never, allProductIds);" \
  "  const ctxLineas = await contextoDeLineas(cfg, db as never, []);" \
  "la pantalla pide el contexto sin decirle de qué productos"

mutar "$PANTALLA" \
  "  const total = totalDeLaLista(items, ctxLineas);" \
  "  const total = 0;" \
  "el pedido del link deja de sumar"

# ═══ La función compartida deja de leer lo que tiene que leer ════════════════

mutar "$COMPARTIDO" \
  "  const { bultoPzasByProduct } = await leerCategoriaYBulto(db as never, cfg.productsTable, ids);" \
  "  const bultoPzasByProduct = new Map<string, number | null>();" \
  "la función compartida deja de leer las piezas por bulto"

mutar "$COMPARTIDO" \
  "  const categoryByProduct = cfg.categoryLookup
    ? await cfg.categoryLookup(ids)
    : new Map<string, string>();" \
  "  const categoryByProduct = new Map<string, string>();" \
  "la función compartida deja de leer la categoría (Reebok pierde el bulto 12/6)"

mutar "$COMPARTIDO" \
  "    bultoSize: cfg.bultoSize," \
  "    bultoSize: () => 12," \
  "la función compartida clava el bulto en 12"

mutar "$COMPARTIDO" \
  "  return resumirDesdeItems(items, ctx).total;" \
  "  return resumirDesdeItems(items, ctx).piezas;" \
  "el total compartido devuelve piezas en vez de plata"

# ═══ El resolvedor de líneas ════════════════════════════════════════════════

mutar "$LINEAS" \
  "    const bultoPzas = i.bulto_pzas ?? ctx.bultoPzasByProduct?.get(pid) ?? null;" \
  "    const bultoPzas = null;" \
  "el resolvedor ignora las piezas por bulto del estilo"

# ═══ CONTROLES: cambios que NO deben ser cazados ═════════════════════════════
echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "$COMPARTIDO" \
  "  const ids = productIds.filter((id): id is string => !!id);" \
  "  const ids = productIds.filter((id): id is string => Boolean(id));" \
  "CONTROL: se reescribe el filtro de ids con la misma semántica"

control "$EXPORT" \
  "      const items = r.items || [];" \
  "      const items = r.items ?? [];" \
  "CONTROL: se cambia || por ?? donde el valor solo puede ser nulo"

control "$EXPORT" \
  '      console.error(`[${cfg.marca}/pedidos-export] Error:`, error);' \
  '      console.error(`[${cfg.marca}/pedidos-export] No se pudo leer la lista:`, error);' \
  "CONTROL: se reescribe un mensaje que solo va a la consola del servidor"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿El candado de LAS 23 DESCRIPCIONES QUE SWITCH YA TENÍA (9-sep-2026) CAZA?
#
# Lo que cubre:
#   a  las 23 filas exactas, cada una con su marca, escritas a mano (nunca un
#      SELECT), y las cuatro que van en las dos casas
#   b  las nueve marcas existen en MARCAS_CATALOGO
#   c  ninguna descripción se mueve al pasar por normalizeDescripcion
#   d  ninguna crea una casi-gemela dentro de su marca
#   e  nada se borra, la migración es idempotente y su número no choca
#   f  la conducta real cambia: cada una pasa de ALERTAR a ser del catálogo
#   g  ninguna migración posterior las saca
#
# Se rompe el código (y la migración) a propósito, una cosa por vez, y se exige
# que los tests se pongan ROJOS. Los dos CONTROLES tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA A UN DIRECTORIO TEMPORAL, NUNCA con
# `git checkout`: acá hay archivos NUEVOS sin commitear y un checkout se los
# lleva por delante sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-descripciones-tecleadas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

MIG="supabase/migrations/20261027120000_descripciones_que_switch_ya_tiene.sql"

TESTS="src/__tests__/lib/depurador-descripciones-tecleadas-en-switch.test.ts \
src/__tests__/lib/depurador-polos-core-plural.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "$MIG"
  "src/lib/depurador/logic.ts"
  "src/lib/depurador/veredicto.ts"
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

# ═══ a · las 23 filas exactas ════════════════════════════════════════════════

mutar "$MIG" \
  "  ('TH Accessories', 'Kids-Hats',                true, 'aprobada', 'daniel', now())," \
  "" \
  "se cae la fila de mayor volumen (Kids-Hats, 332 piezas)"

mutar "$MIG" \
  "  ('CK Underwear',   'Girls-Bras',               true, 'aprobada', 'daniel', now())," \
  "  ('CK Kids',        'Girls-Bras',               true, 'aprobada', 'daniel', now())," \
  "Girls-Bras entra bajo CK Kids en vez de CK Underwear"

mutar "$MIG" \
  "  ('TH Underwear',   'Girls-Panties',            true, 'aprobada', 'daniel', now())," \
  "" \
  "Girls-Panties se queda solo en la casa CK (pierde su fila de Tommy)"

mutar "$MIG" \
  "  ('CK Kids',        'Boys-1 Piece',             true, 'aprobada', 'daniel', now())" \
  "  ('CK Kids',        'Boys-1 Piece',             true, 'aprobada', 'daniel', now()),
  ('CK Kids',        'Boys-2 Piece',               true, 'aprobada', 'daniel', now())" \
  "se cuela una fila 24 que Daniel nunca aprobó"

mutar "$MIG" \
  "'aprobada', 'daniel'" \
  "'seed', 'daniel'" \
  "las altas se anotan como SEMILLA en vez de aprobación de Daniel"

mutar "$MIG" \
  "INSERT INTO depurador_descripciones (marca, descripcion, activa, origen, aprobada_por, aprobada_at)
VALUES" \
  "INSERT INTO depurador_descripciones (marca, descripcion, activa, origen, aprobada_por, aprobada_at)
SELECT marca, descripcion, true, 'aprobada', 'daniel', now() FROM (VALUES" \
  "la lista deja de ser explícita y se arma con un SELECT"

mutar "$MIG" \
  "  ('TH Menswear',    'Men-Short Knit',           true, 'aprobada', 'daniel', now())," \
  "  ('TH Menswear',    'Men-Shirts Woven Tops S/S', true, 'aprobada', 'daniel', now())," \
  "se da de alta una descripción SUCIA que normalizeDescripcion reescribe"

mutar "$MIG" \
  "  ('CK Underwear',   'Girls-Bras',               true, 'aprobada', 'daniel', now())," \
  "  ('CK Underwear',   'Girls-Bra',                true, 'aprobada', 'daniel', now())," \
  "se da de alta «Girls-Bra», la gemela por una «s» de «Women-Bras»"

mutar "$MIG" \
  "INSERT INTO depurador_descripciones (marca" \
  "INSERT INTO depurador_formulas (marca" \
  "la migración escribe en otra tabla"

mutar "$MIG" \
  "ON CONFLICT DO NOTHING;" \
  "ON CONFLICT DO NOTHING;
DELETE FROM depurador_descripciones WHERE marca = 'TH Other';" \
  "la migración aprovecha y borra filas de otra marca"

# ═══ e · idempotente, aditiva, sin choque de número ══════════════════════════

mutar "$MIG" \
  "ON CONFLICT DO NOTHING;" \
  ";" \
  "se quita el ON CONFLICT: correrla dos veces revienta contra el índice único"

mutar "$MIG" \
  "ON CONFLICT DO NOTHING;" \
  "ON CONFLICT (id) DO UPDATE SET activa = true;" \
  "el conflicto PISA la fila que alguien ya había aprobado a mano"

mutar "$MIG" \
  "  ('TH Legwear',     'Women-Socks Dress',        true, 'aprobada', 'daniel', now())," \
  "  ('TH Legwear',     'Women-Socks Dress',        false, 'aprobada', 'daniel', now())," \
  "una de las 23 nace APAGADA"

# ═══ b · las marcas existen ══════════════════════════════════════════════════

mutar "src/lib/depurador/logic.ts" \
  '  "CK Performance",
' \
  "" \
  "CK Performance desaparece del catálogo de marcas"

# ═══ c · nada se mueve al normalizarse ═══════════════════════════════════════

mutar "src/lib/depurador/logic.ts" \
  "  d = NORM_BY_KEY.get(marcaKey(d)) ?? d;                   // 3) re-chequear mapa
  return d;" \
  "  d = NORM_BY_KEY.get(marcaKey(d)) ?? d;                   // 3) re-chequear mapa
  return d.toUpperCase();" \
  "normalizeDescripcion empieza a reescribir toda descripción"

# ═══ d · la casi-gemela ══════════════════════════════════════════════════════

mutar "src/lib/depurador/veredicto.ts" \
  "export function esCasiIgual(a: string, b: string): boolean {
  if (a === b) return false;
  return difiereSoloPorSFinal(a, b);" \
  "export function esCasiIgual(a: string, b: string): boolean {
  if (a === b) return false;
  return false;" \
  "el detector de gemelas por una «s» se apaga"

# ═══ f · la conducta real ════════════════════════════════════════════════════

mutar "src/lib/depurador/veredicto.ts" \
  "  const existente = idx.completas.get(clave(normalizada));
  if (existente) return { veredicto: \"ya-existe\", normalizada, existente };" \
  "  const existente = undefined as string | undefined;
  if (existente) return { veredicto: \"ya-existe\", normalizada, existente };" \
  "el catálogo deja de reconocer lo que ya tiene: todo vuelve a alertar"

echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "$MIG" \
  "-- ─── Fashion Wear · casa TH — 13 filas ─────────────────────────────────────" \
  "-- ─── Fashion Wear · la casa de Tommy Hilfiger — 13 filas ───────────────────" \
  "CONTROL · se reescribe un comentario de la migración"

control "$MIG" \
  "  ('CK Accessories', 'Unisex-Hats',              true, 'aprobada', 'daniel', now())," \
  "  ('CK Accessories','Unisex-Hats',true,'aprobada','daniel',now())," \
  "CONTROL · se aprieta la alineación de una fila, sin cambiar un dato"

echo "─────────────────────────────────────────────────────────────────────────"
echo "  cazadas:        $cazadas"
echo "  sobrevivientes: $sobrevivientes"
echo "  controles OK:   $controles_ok"
echo "  controles mal:  $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ] && echo "  ✅ TODO BIEN" || echo "  🔴 REVISAR"

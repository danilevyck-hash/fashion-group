#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «un solo costo por producto» (Reebok).
#
# Rompe a propósito la regla del costo, una forma por vez, y exige que el
# candado se ponga ROJO. Con 2 CONTROLES al final: cambios que NO son la regla y
# tienen que seguir en verde (si se ponen rojos, el candado está atado a detalles
# que no son lo que protege).
#
#   bash scripts/_mutar-candados-costo-unico-reebok.sh
#
# No escribe nada: restaura el archivo después de cada mutación.
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVO="src/lib/depurador/reebok.ts"
CANDADOS="src/__tests__/lib/reebok-costo-unico.test.ts src/__tests__/lib/reebok-flete.test.ts"
RESPALDO="$(mktemp)"
cp "$ARCHIVO" "$RESPALDO"
restaurar() { cp "$RESPALDO" "$ARCHIVO"; }
trap restaurar EXIT

ok=0; total=0
mutar() { # nombre · esperado(rojo|verde) · sed
  local nombre="$1" esperado="$2"; shift 2
  total=$((total+1))
  restaurar
  "$@" || { echo "  ⚠️  la mutación «$nombre» no se pudo aplicar"; return; }
  if npx vitest run $CANDADOS >/dev/null 2>&1; then estado="verde"; else estado="rojo"; fi
  if [ "$estado" = "$esperado" ]; then ok=$((ok+1)); echo "  ✅ $nombre → $estado"
  else echo "  ❌ $nombre → $estado (se esperaba $esperado)"; fi
}

echo "MUTACIONES (tienen que ponerse ROJAS):"
mutar "el pedido vuelve a su × 0.80 propio" rojo \
  sed -i '' 's|const { cif: costo } = costoReebok(first.department, w, first.wholesaleOff, cfg.flete);|const costo = w === null ? null : round2(w * 0.8 * normalizarFlete(cfg.flete));|' "$ARCHIVO"
mutar "la ropa pasa a 0.80 (se pierde la rama del 70%)" rojo \
  sed -i '' 's|esFootwear(dept) ? 0.8 : 0.7|esFootwear(dept) ? 0.8 : 0.8|' "$ARCHIVO"
mutar "el calzado pasa a 0.70" rojo \
  sed -i '' 's|esFootwear(dept) ? 0.8 : 0.7|esFootwear(dept) ? 0.7 : 0.7|' "$ARCHIVO"
mutar "el descuento del proveedor se ignora" rojo \
  sed -i '' 's|if (off !== null \&\& off > 0) return off;|if (false) return off!;|' "$ARCHIVO"
mutar "un OFF en 0 se toma como descuento" rojo \
  sed -i '' 's|if (off !== null \&\& off > 0) return off;|if (off !== null) return off;|' "$ARCHIVO"
mutar "el flete se aplica ANTES de redondear el FOB" rojo \
  sed -i '' 's|const fob = round2(fobReebok(dept, wholesale, off));|const fob = fobReebok(dept, wholesale, off);|' "$ARCHIVO"
mutar "sin WholesalePrice se inventa un costo en 0" rojo \
  sed -i '' 's|if (wholesale === null) return { fob: null, cif: null };|if (wholesale === null) wholesale = 0;|' "$ARCHIVO"
mutar "la plantilla deja de usar la función única" rojo \
  sed -i '' 's|const { fob, cif } = costoReebok(first.department, w, first.wholesaleOff, cfg.flete);|const fob = w === null ? null : round2(w * 0.8); const cif = fob === null ? null : round2(fob * normalizarFlete(cfg.flete));|' "$ARCHIVO"
mutar "el flete se usa crudo, sin normalizar" rojo \
  sed -i '' 's|const flete = normalizarFlete(fleteCrudo);|const flete = fleteCrudo as number;|' "$ARCHIVO"
mutar "el descuento se aplica solo en footwear" rojo \
  sed -i '' 's|if (off !== null \&\& off > 0) return off;|if (off !== null \&\& off > 0 \&\& esFootwear(dept)) return off;|' "$ARCHIVO"

echo ""
echo "CONTROLES (tienen que seguir VERDES):"
mutar "CONTROL · se renombra una variable interna" verde \
  sed -i '' 's|const { fob, cif } = costoReebok(first.department, w, first.wholesaleOff, cfg.flete);|const costos = costoReebok(first.department, w, first.wholesaleOff, cfg.flete); const fob = costos.fob, cif = costos.cif;|' "$ARCHIVO"
mutar "CONTROL · se agrega un comentario" verde \
  sed -i '' 's|/\* ============ CONSTANTES ============ \*/|/* ============ CONSTANTES ============ */\n// comentario de prueba|' "$ARCHIVO"

restaurar
echo ""
echo "$ok de $total como se esperaba."
[ "$ok" -eq "$total" ]

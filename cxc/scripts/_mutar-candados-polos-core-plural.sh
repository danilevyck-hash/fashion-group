#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿EL CANDADO DE LOS POLOS «CORE» EN PLURAL CAZA DE VERDAD? (9-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar, y una mutación inocua en un
# comentario) tienen que quedar VERDES: un ✅ ahí significa que los candados
# fallan por otra razón y toda la corrida no dice nada.
#
# Lo que Daniel decidió y no se puede volver a romper:
#   · Los CUATRO polos «Core» del catálogo van en PLURAL. Eran dos y dos, y por
#     esa contradicción se colaron 7.219 piezas de la misma prenda partidas en
#     dos descripciones de Fashion Wear.
#   · La migración cambia DOS filas por su VALOR EXACTO, nunca un `LIKE`.
#   · No se borra nada, y no se duplica contra el índice único.
#   · TH Kids no se toca.
#   · Ninguna migración posterior puede devolver el singular.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA A /tmp, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-polos-core-plural.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/depurador-polos-core-plural.test.ts \
src/__tests__/depurador-veredicto.test.ts \
src/__tests__/depurador-validate.test.ts"

MIG="supabase/migrations/20261026120000_polos_core_en_plural.sql"
VER="src/lib/depurador/veredicto.ts"
INTRUSA="supabase/migrations/20261027120000_mutacion_de_prueba.sql"

ARCHIVOS=("$MIG" "$VER")

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() {
  for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done
  rm -f "$INTRUSA"
}
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

agregar() { # $1 archivo nuevo, $2 contenido, $3 nombre
  restaurar
  printf '%s\n' "$2" > "$1"
  probar "$3"
}

echo "── CONTROLES ────────────────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En un
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
mutar "$MIG" \
  "-- Es la fila que costó las 7.219 piezas partidas en dos." \
  "-- Es la fila que costo las 7.219 piezas repartidas en dos." \
  "CONTROL 2 — cambiar una palabra de un COMENTARIO de la migración. Lo bueno es el 🔴"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. LAS DOS FILAS QUEDAN EN PLURAL ────────────────────────────────────"

mutar "$MIG" \
  "SET descripcion = 'Men-Polos S/S Core'" \
  "SET descripcion = 'Men-Polo S/S Core'" \
  "1.1 hombre se queda en singular (la migración no hace nada)"

mutar "$MIG" \
  "SET descripcion = 'Women-Polos S/S Core'" \
  "SET descripcion = 'Women-Polo S/S Core'" \
  "1.2 mujer se queda en singular"

mutar "$MIG" \
  "   AND d.descripcion = 'Men-Polo S/S Core'" \
  "   AND d.descripcion = 'Men-Polos L/S'" \
  "1.3 el UPDATE de hombre apunta a otra descripción"

mutar "$MIG" \
  " WHERE d.marca = 'TH Womenswear'" \
  " WHERE d.marca = 'TH Tommy Jeans'" \
  "1.4 el UPDATE de mujer apunta a otra marca"

echo "── 2. EL VALOR EXACTO, JAMÁS UN LIKE ────────────────────────────────────"

mutar "$MIG" \
  "   AND d.descripcion = 'Men-Polo S/S Core'" \
  "   AND d.descripcion ILIKE 'Men-Polo S/S Core'" \
  "2.1 el WHERE pasa a ILIKE"

mutar "$MIG" \
  " WHERE d.marca = 'TH Menswear'" \
  " WHERE d.marca LIKE 'TH Mens%'" \
  "2.2 la marca se busca con comodín"

mutar "$MIG" \
  "   AND d.descripcion = 'Women-Polo S/S Core'" \
  "   AND d.descripcion ~ 'Polo'" \
  "2.3 el WHERE pasa a expresión regular"

echo "── 3. NADA SE BORRA, Y NO SE DUPLICA ────────────────────────────────────"

mutar "$MIG" \
  "UPDATE depurador_descripciones d
   SET descripcion = 'Men-Polos S/S Core'" \
  "DELETE FROM depurador_descripciones WHERE descripcion = 'Men-Polo S/S Core';
UPDATE depurador_descripciones d
   SET descripcion = 'Men-Polos S/S Core'" \
  "3.1 el singular se borra en vez de corregirse"

mutar "$MIG" \
  "   AND NOT EXISTS (
     SELECT 1 FROM depurador_descripciones x
      WHERE lower(x.marca) = lower('TH Menswear')
        AND lower(x.descripcion) = lower('Men-Polos S/S Core')
   );" \
  ";" \
  "3.2 se quita la guarda de hombre: si el plural ya está, revienta el índice"

mutar "$MIG" \
  "        AND lower(x.descripcion) = lower('Women-Polos S/S Core')" \
  "        AND x.descripcion = 'Women-Polos S/S Core'" \
  "3.3 la guarda de mujer deja de ignorar mayúsculas (el índice sí las ignora)"

mutar "$MIG" \
  "UPDATE depurador_descripciones d
   SET descripcion = 'Women-Polos S/S Core'" \
  "UPDATE tommy_products SET name = 'Men-Polos S/S Core' WHERE name = 'Men-Polo S/S Core';
UPDATE depurador_descripciones d
   SET descripcion = 'Women-Polos S/S Core'" \
  "3.4 la migración se mete con otra tabla"

echo "── 4. TH KIDS NO SE TOCA ────────────────────────────────────────────────"

mutar "$MIG" \
  "-- ─── 2) Mujer · TH Womenswear ─" \
  "UPDATE depurador_descripciones d
   SET descripcion = 'Boys-Polo S/S Core'
 WHERE d.marca = 'TH Kids'
   AND d.descripcion = 'Boys-Polos S/S Core';

-- ─── 2) Mujer · TH Womenswear ─" \
  "4.1 se le mete mano a TH Kids, que ya estaba bien"

echo "── 5. EL SINGULAR NO VUELVE POR UNA MIGRACIÓN NUEVA ─────────────────────"

agregar "$INTRUSA" \
  "insert into depurador_descripciones (marca, descripcion)
values ('TH Menswear', 'Men-Polo S/S Core');" \
  "5.1 una migración POSTERIOR reinserta el singular"

agregar "$INTRUSA" \
  "update depurador_descripciones
   set descripcion = 'Women-Polo S/S Core'
 where marca = 'TH Womenswear'
   and descripcion = 'Women-Polos S/S Core';" \
  "5.2 una migración POSTERIOR devuelve el singular de mujer"

echo "── 6. LA CONDUCTA REAL DEL VEREDICTO ────────────────────────────────────"

mutar "$VER" \
  "export const MITADES_POR_MARCA = true;" \
  "export const MITADES_POR_MARCA = false;" \
  "6.1 las mitades vuelven a valer entre marcas (el agujero de origen)"

mutar "$VER" \
  "export function esCasiIgual(a: string, b: string): boolean {
  if (a === b) return false;
  return difiereSoloPorSFinal(a, b);" \
  "export function esCasiIgual(a: string, b: string): boolean {
  if (a === b) return false;
  return false;" \
  "6.2 la casi-gemela deja de detectarse: el singular pasaría sin alarma"

mutar "$VER" \
  "  const existente = idx.completas.get(clave(normalizada));
  if (existente) return { veredicto: \"ya-existe\", normalizada, existente };" \
  "  const existente = undefined as string | undefined;
  if (existente) return { veredicto: \"ya-existe\", normalizada, existente };" \
  "6.3 lo que YA está en el catálogo deja de reconocerse"

mutar "$VER" \
  "  if (izqOk && derOk) return { veredicto: \"pasa\", normalizada };" \
  "  if (izqOk || derOk) return { veredicto: \"pasa\", normalizada };" \
  "6.4 basta UNA mitad para pasar: la gemela se cuela otra vez"

restaurar

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "  ${cazadas} cazadas · ${sobrevivientes} sobrevivientes"
echo "  controles con fallos: ${control_fallos} (tiene que ser 0)"
echo "════════════════════════════════════════════════════════════════════════"

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿EL CANDADO DE LAS TRES GRAFÍAS DE DESTINOS CAZA DE VERDAD? (8-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar, y una mutación inocua en un
# COMENTARIO) tienen que quedar VERDES: un ✅ ahí significa que los candados
# fallan por otra razón y toda la corrida no dice nada.
#
# Lo que Daniel aprobó y no se puede volver a romper:
#   1. «Changuinola» con «u» — la red del campo nunca vuelve a ofrecer el typo.
#   2. «Westland», no «Wesland» — en la lista y en los renglones vivos.
#   3. «CALLE 19» sale de la lista (no es un destino, es una calle), con soft
#      delete FIRMADO, y sus 13 renglones viejos NO se tocan.
#   4. Las tres migraciones miran el VALOR EXACTO, jamás un LIKE suelto.
#   5. Nada se parea por parecido: `claveDestino` sigue separando «Wesland» de
#      «Westland» y «CALLE 19» de «Calle 19 Central».
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-guias-grafias.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/guias-grafias-de-destinos.test.ts \
src/__tests__/lib/guias-destinos-cliente.test.ts \
src/__tests__/lib/guias-destinos-compartidos.test.ts"

MIG_CH="supabase/migrations/20261005120000_guias_changuinola.sql"
MIG_WE="supabase/migrations/20261016120000_guias_westland.sql"
MIG_C19="supabase/migrations/20261017120000_guias_calle19_fuera_de_la_lista.sql"

ARCHIVOS=(
  "$MIG_CH"
  "$MIG_WE"
  "$MIG_C19"
  "src/lib/guias/destinos-lista.ts"
  "src/lib/guias/destinos-clientes.ts"
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

echo "── CONTROLES ────────────────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En un
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
mutar "$MIG_WE" \
  "-- dato del envío: no cambia a quién se le mandó, ni cuántos bultos, ni cuándo." \
  "-- dato del envio: no cambia a quien se le mando, ni cuantas cajas, ni cuando." \
  "CONTROL 2 — reescribir un COMENTARIO de la migración. Lo bueno es el 🔴"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. LA RED DEL CAMPO NO VUELVE A OFRECER UNA GRAFÍA MALA ──────────────"

mutar "src/lib/guias/destinos-lista.ts" \
  '  "Changuinola",' \
  '  "Changinola",' \
  "1.1 la red vuelve a ofrecer «Changinola» sin la u"

mutar "src/lib/guias/destinos-lista.ts" \
  '  "Changuinola",
];' \
  '  "Changuinola",
  "CALLE 19",
];' \
  "1.2 la calle pelada vuelve a la red del campo"

mutar "src/lib/guias/destinos-lista.ts" \
  '  "Guabito",' \
  '  "Guabito",
  "Wesland",' \
  "1.3 el typo «Wesland» vuelve al código de Guías"

echo "── 2. ACOTADAS AL VALOR EXACTO, JAMÁS UN LIKE SUELTO ────────────────────"

mutar "$MIG_CH" \
  " WHERE btrim(direccion) = 'Changinola';" \
  " WHERE direccion ILIKE '%changinola%';" \
  "2.1 Changuinola pasa a un ILIKE que pisaría «Changinola pasillo 4»"

mutar "$MIG_WE" \
  " WHERE btrim(direccion) = 'Wesland';" \
  " WHERE direccion LIKE 'Wesland%';" \
  "2.2 Westland pasa a un LIKE que pisaría «WESTLAND TIENDA 5»"

mutar "$MIG_C19" \
  " WHERE destino = 'CALLE 19'" \
  " WHERE destino LIKE '%CALLE 19%'" \
  "2.3 la calle se quita con un LIKE que se llevaría «Calle 19 Central»"

mutar "$MIG_WE" \
  "   SET direccion = 'Westland'" \
  "   SET direccion = 'Wesland'" \
  "2.4 la corrección de los renglones deja de corregir nada"

echo "── 3. DE LA LISTA NO SE BORRA: SE QUITA FIRMADO ─────────────────────────"

mutar "$MIG_C19" \
  "UPDATE guias_destino_lista
   SET activo          = false,
       desactivado_por = 'migracion-20261017120000',
       desactivado_en  = now()
 WHERE destino = 'CALLE 19'
   AND activo;" \
  "DELETE FROM guias_destino_lista
 WHERE destino = 'CALLE 19';" \
  "3.1 la calle se BORRA de la lista en vez de quitarse"

mutar "$MIG_WE" \
  "       desactivado_por = 'migracion-20261016120000',
       desactivado_en  = now()" \
  "       desactivado_en  = now()" \
  "3.2 la baja de «Wesland» deja de decir quién la quitó"

mutar "$MIG_C19" \
  "       desactivado_en  = now()" \
  "       desactivado_en  = null" \
  "3.3 la baja de la calle deja de decir cuándo"

mutar "$MIG_WE" \
  "INSERT INTO guias_destino_lista (destino, creado_por, creado_en)
VALUES ('Westland', 'migracion-20261016120000', now())" \
  "INSERT INTO guias_destino_lista (destino, creado_por, creado_en)
VALUES ('Wesland ', 'migracion-20261016120000', now())" \
  "3.4 se quita el typo pero no se ofrece la grafía buena"

echo "── 4. LA CALLE NO TOCA EL HISTÓRICO; NINGUNA TOCA LA GUÍA ───────────────"

mutar "$MIG_C19" \
  "UPDATE guias_destino_lista" \
  "UPDATE guia_items SET direccion = 'Calle 19 Central' WHERE btrim(direccion) = 'CALLE 19';

UPDATE guias_destino_lista" \
  "4.1 la calle empieza a reescribir los 13 renglones viejos"

mutar "$MIG_CH" \
  "UPDATE guia_items
   SET direccion = 'Changuinola'" \
  "UPDATE guia_transporte SET estado = 'Completada' WHERE id > 0;

UPDATE guia_items
   SET direccion = 'Changuinola'" \
  "4.2 la migración del pueblo empieza a tocar la guía en sí"

mutar "$MIG_WE" \
  "UPDATE guia_items
   SET direccion = 'Westland'" \
  "UPDATE guia_items
   SET bultos = 1, direccion = 'Westland'" \
  "4.3 la migración del mall empieza a tocar los bultos"

echo "── 5. NADA SE PAREA POR PARECIDO ────────────────────────────────────────"

mutar "src/lib/guias/destinos-clientes.ts" \
  '    .replace(/[^a-z]/g, "")
    .replace(/s$/, "");' \
  '    .replace(/[^a-z]/g, "")
    .replace(/t/g, "")
    .replace(/s$/, "");' \
  "5.1 alguien ignora la «t» para que Wesland y Westland se junten solos"

mutar "src/lib/guias/destinos-clientes.ts" \
  '  return `${letras}#${digitos}`;' \
  '  return `#${digitos}`;' \
  "5.2 la clave pasa a mirar solo los números: «CALLE 19» = «Calle 19 Central»"

restaurar
echo
echo "════════════════════════════════════════════════════════════════════════"
echo "  CONTROLES que fallaron (deberían ser 0): $control_fallos"
echo "  MUTACIONES cazadas: $cazadas · sobrevivientes: $sobrevivientes"
echo "════════════════════════════════════════════════════════════════════════"

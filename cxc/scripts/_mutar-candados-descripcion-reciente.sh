#!/usr/bin/env bash
# Verificación por MUTACIÓN de «el mismo producto, un solo renglón».
#
# Se rompe el código A PROPÓSITO, una cosa por vez, y se exige que los candados
# se pongan ROJOS. Un candado que sobrevive a su propia mutación no es un
# candado: es un archivo que da permiso para romper.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NUNCA CON `git checkout`: hay archivos NUEVOS
# en la rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Este repo ya pagó
# eso (los candados del selector de cliente dieron 16/16 MINTIENDO).
#
#   bash scripts/_mutar-candados-descripcion-reciente.sh

set -uo pipefail
cd "$(dirname "$0")/.."

RUTA="src/app/api/ventas/productos/route.ts"
COD="src/app/api/ventas/productos/codigos/route.ts"
SQL="supabase/migrations/20260825160000_productos_descripcion_reciente.sql"
VER="src/lib/ventas/rpc-version.ts"
SQLCLI="supabase/migrations/20260826120000_switch_productos_por_cliente.sql"
SRVCLI="src/lib/ventas/productos-por-cliente-server.ts"
ARCHIVOS=("$RUTA" "$COD" "$SQL" "$VER" "$SQLCLI" "$SRVCLI")
TESTS=(
  "src/__tests__/components/ventas-productos-filtro-cliente.test.tsx"
  "src/__tests__/lib/ventas-productos-sql-reciente.test.ts"
  "src/__tests__/api/ventas-productos-descripcion-reciente.test.ts"
  "src/__tests__/api/ventas-productos-periodo-route.test.ts"
  "src/__tests__/components/ventas-productos-precio-periodos.test.tsx"
)

RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0
sobrevividas=0

# 🩸 UNA MUTACIÓN QUE NO CAMBIA EL ARCHIVO NO ES UNA MUTACIÓN. Pasó de verdad:
# al rebasar, dos patrones de `perl` dejaron de encajar porque el código que
# nombraban se había renombrado, y el barrido los reportó como "SOBREVIVIÓ" — o
# sea acusó a candados sanos de no cazar. Acá, si el archivo quedó idéntico, se
# dice PATRÓN MUERTO y se cuenta como fallo: hay que arreglar el patrón.
cambio() {
  local f="$1"
  ! cmp -s "$f" "$RESPALDO/$f"
}

probar() {
  local nombre="$1"
  local mutado="${2:-}"
  if [ -n "$mutado" ] && ! cambio "$mutado"; then
    echo "  💀 PATRÓN MUERTO (no mutó nada): $nombre"
    sobrevividas=$((sobrevividas + 1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run "${TESTS[@]}" --reporter=dot 2>&1)
  # 🔑 Si no aparece el resumen de vitest, la corrida MURIÓ y "0 fallos" se
  # leería como "sobrevivió". Eso es peor que no medir.
  if ! grep -qE "Tests +[0-9]+ (failed|passed)" <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no se puede juzgar: $nombre"
    sobrevividas=$((sobrevividas + 1)); restaurar; return
  fi
  # 🩸 UNA SUITE QUE NI SE PUDO CARGAR TAMBIÉN ES UN ROJO. Cuando la mutación
  # rompe algo que el archivo de tests lee al cargarse, vitest no reporta
  # "Tests N failed" sino "Test Files 1 failed" con 0 tests corridos — y mirar
  # sólo la primera línea daba SOBREVIVIÓ a una mutación que en realidad tumbó
  # el candado entero.
  if grep -qE "Tests +[0-9]+ failed|Test Files +[0-9]+ failed" <<<"$salida"; then
    local n
    n=$(grep -oE "Tests +[0-9]+ failed" <<<"$salida" | grep -oE "[0-9]+" | head -1)
    n=${n:-"suite entera"}
    echo "  ✅ CAZADA (${n} rojos): $nombre"
    cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ: $nombre"
    sobrevividas=$((sobrevividas + 1))
  fi
  restaurar
}

echo "=== MUTACIONES ==="

# ── 1. QUE AGRUPE POR EL NOMBRE VIEJO ───────────────────────────────────────

# 1 · la ruta vuelve a pedir la función que PARTE el producto
perl -0pi -e 's/supabaseServer\.rpc\("switch_top_descripciones_reciente", args\)/supabaseServer.rpc("switch_top_descripciones", args)/' "$RUTA"
probar "el nivel 1 vuelve a pedir la función vieja (producto partido)" "$RUTA"

# 2 · el desplegable pregunta por el texto congelado y muestra media fila
perl -0pi -e 's/supabaseServer\.rpc\("switch_articulos_por_descripcion_reciente", args\)/supabaseServer.rpc("switch_articulos_por_descripcion", args)/' "$COD"
probar "el desplegable vuelve a resolver por el texto congelado" "$COD"

# 3 · el SQL agrupa por la descripción de la fila y no por la reciente
perl -0pi -e 's/CASE WHEN d\.codigo IS NOT NULL THEN r\.descripcion END,/CASE WHEN FALSE THEN r.descripcion END,/' "$SQL"
probar "el SQL agrupa por el nombre congelado" "$SQL"

# 4 · "más reciente" se acota al período (el nombre cambia según la ventana)
perl -0pi -e 's/(SELECT DISTINCT ON \(codigo, descripcion\)(?:.|\n)*?AND descripcion IS NOT NULL)/${1}\n      AND fecha BETWEEN p_desde AND p_hasta/' "$SQL"
probar "el nombre reciente se calcula sólo dentro del período" "$SQL"

# ── 2. QUE EL DESEMPATE DEJE DE SER DETERMINISTA ────────────────────────────

# 5 · se cae el desempate por id (dos corridas, dos nombres distintos)
perl -0pi -e 's/ORDER BY codigo, descripcion, fecha DESC, id::text ASC/ORDER BY codigo, descripcion, fecha DESC/' "$SQL"
probar "el desempate del nombre deja de ser determinista" "$SQL"

# 6 · se desempata por `id` crudo (min(uuid) no existe antes de PG14)
perl -0pi -e 's/fecha DESC, id::text ASC/fecha DESC, id ASC/g' "$SQL"
probar "se desempata por id crudo en vez de id::text" "$SQL"

# ── 3. QUE LA VENTA TOTAL CAMBIE ────────────────────────────────────────────

# 7 · la nota de crédito SUMA (la firma del error: el doble de las NC)
perl -0pi -e "s/CASE WHEN tipo = 'NC' THEN -venta_total/CASE WHEN tipo = 'NC' THEN venta_total/" "$SQL"
probar "la NC suma en vez de restar (la venta total se mueve)" "$SQL"

# 8 · aparece un segundo tipo firmado (una definición nueva del signo)
perl -0pi -e "s/CASE WHEN tipo = 'NC' THEN -costo_total/CASE WHEN tipo IN ('NC','CNF') THEN -costo_total/" "$SQL"
probar "un segundo tipo empieza a restar" "$SQL"

# 9 · el filtro de salida deja de ser `venta <> 0`
perl -0pi -e 's/WHERE a\.venta <> 0/WHERE a.venta > 0/' "$SQL"
probar "el filtro de salida cambia (se caen las devoluciones netas)" "$SQL"

# 10 · el total de la pantalla deja de ser la suma del nivel 1
perl -0pi -e 's/const ventaTotal = productos\.reduce\(\(s, p\) => s \+ p\.venta, 0\);/const ventaTotal = productos.slice(1).reduce((s, p) => s + p.venta, 0);/' "$RUTA"
probar "el total deja de sumar todas las filas" "$RUTA"

# 11 · la migración deja de ser aditiva: pisa la función viva
perl -0pi -e 's/CREATE OR REPLACE FUNCTION switch_top_descripciones_reciente\(/CREATE OR REPLACE FUNCTION switch_top_descripciones(/' "$SQL"
probar "la migración pisa la función viva (deja de ser aditiva)" "$SQL"

# 12 · un timeout se lee como "la función no existe" y dispara otra consulta
#      contra una base que ya está sufriendo (compute Micro)
perl -0pi -e 's/  if \(isTransientDbError\(res\.error\)\) return res;/  \/\/ mutado: un timeout ya no frena el segundo viaje/' "$VER"
probar "un timeout dispara la consulta de respaldo" "$VER"

# ⛔ ACÁ IBAN LAS SECCIONES 4 y 5 — «QUE EL AVISO NO SALGA» y «QUE EL AVISO
# SALGA SIEMPRE», 11 mutaciones sobre `productos-clasificacion.ts` y sobre
# `AvisoClasificacionLinea`. Los dos archivos ya no existen: el aviso de «código
# mal clasificado» se retiró el 25-ago-2026 (Daniel ya revisó los 5 códigos y la
# clasificación de Switch resultó ser la correcta).
#
# 🩸 SE BORRAN Y NO SE COMENTAN A MEDIAS: un `perl` que no encaja con nada se
# reporta como PATRÓN MUERTO y ensucia el conteo con fallos que no son fallos.
# Lo que las reemplaza es `scripts/_mutar-candados-sin-aviso-grafias.sh`, que
# muta en la dirección de HOY: que el aviso VUELVA.

# ── 4. QUE EL FILTRO POR CLIENTE NOMBRE AL PRODUCTO DE OTRA MANERA ─────────

# 13 · la matriz del filtro vuelve a mirar sólo la ventana
perl -0pi -e 's/(WITH mapa AS(?:.|\n)*?AND d\.descripcion IS NOT NULL)/${1}\n      AND d.fecha BETWEEN p_desde AND p_hasta/' "$SQLCLI"
probar "la matriz por cliente se acota al período (nombra distinto que la tabla)" "$SQLCLI"

# 14 · y pierde el desempate
perl -0pi -e 's/ORDER BY d\.codigo, d\.fecha DESC, d\.id::text ASC/ORDER BY d.codigo, d.fecha DESC/' "$SQLCLI"
probar "la matriz por cliente desempata al azar" "$SQLCLI"

# 15 · el camino sin RPC del filtro vuelve a filtrar por fecha
perl -0pi -e 's/          \.eq\("empresa_key", empresa\);/          .eq("empresa_key", empresa).gte("fecha", desde).lte("fecha", hasta);/' "$SRVCLI"
probar "el camino sin RPC del filtro se acota al período" "$SRVCLI"

echo
echo "cazadas: $cazadas · sobrevividas: $sobrevividas"
[ "$sobrevividas" -eq 0 ] || exit 1

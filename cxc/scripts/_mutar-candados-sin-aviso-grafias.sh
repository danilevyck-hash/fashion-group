#!/usr/bin/env bash
# Verificación por MUTACIÓN de «el aviso de código mal clasificado ya no sale».
#
# ── QUÉ SE RETIRÓ, Y POR QUÉ ────────────────────────────────────────────────
# La fila de Ventas › Productos decía, en ámbar:
#     «Revisar: FW0FW05034-DW5 también está en «Women-Sandals»»
# en 18 renglones de 2.074. Nació con el #597 para que Daniel revisara los 5
# códigos mal clasificados en Switch. YA LOS REVISÓ y decidió, textual: *"si lo
# más reciente es 17-ago alguien lo pasó a Flip Flop, entonces es Flip Flop"* —
# o sea que la clasificación que Switch tiene HOY es la correcta y no queda nada
# que corregir. Un cartel que pide una acción ya tomada enseña a no leer.
#
# ── LAS DOS FORMAS DE ARRUINARLO, Y LAS DOS SE MUTAN ACÁ ────────────────────
#   A) que EL AVISO VUELVA — por la vista, por la ruta o por el SQL;
#   B) que se caiga LA AGRUPACIÓN POR EL NOMBRE MÁS RECIENTE, que es lo que
#      hace que el Agua Dana salga en un renglón de 35.305,20 y no en dos. Eso
#      NO se tocó, y el peor final de este cambio sería llevárselo por delante.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NUNCA CON `git checkout`: hay archivos NUEVOS
# en la rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Este repo ya pagó
# eso (los candados del selector de cliente dieron 16/16 MINTIENDO).
#
# 🩸 NI UN `|` COMO DELIMITADOR DE `perl -pi -e s|…|…|`: los patrones de acá
# llevan rutas y `||` de TypeScript, y el primer pipe del texto cortaría la
# expresión en dos. Se usa `/` (escapando lo que haga falta) o `{}`.
#
#   bash scripts/_mutar-candados-sin-aviso-grafias.sh

set -uo pipefail
cd "$(dirname "$0")/.."

VISTA="src/components/ventas/ProductosView.tsx"
RUTA="src/app/api/ventas/productos/route.ts"
TIPOS="src/lib/ventas/productos.ts"
SQL="supabase/migrations/20260827120000_productos_reciente_sin_grafias.sql"
ARCHIVOS=("$VISTA" "$RUTA" "$TIPOS" "$SQL")
TESTS=(
  "src/__tests__/components/ventas-productos-precio-periodos.test.tsx"
  "src/__tests__/components/ventas-productos-filtro-cliente.test.tsx"
  "src/__tests__/api/ventas-productos-descripcion-reciente.test.ts"
  "src/__tests__/lib/ventas-productos-sql-reciente.test.ts"
  "src/__tests__/api/ventas-productos-periodo-route.test.ts"
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

# 🩸 UNA MUTACIÓN QUE NO CAMBIA EL ARCHIVO NO ES UNA MUTACIÓN. Si el `perl` no
# encaja con nada, el barrido diría "SOBREVIVIÓ" y acusaría a un candado sano.
# Acá se DENUNCIA como PATRÓN MUERTO y se cuenta como fallo: hay que arreglar
# el patrón, no el candado.
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
  # 🩸 UNA SUITE QUE NI SE PUDO CARGAR TAMBIÉN ES UN ROJO (vitest reporta
  # "Test Files 1 failed" con 0 tests corridos).
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

# ── A. QUE EL AVISO VUELVA ──────────────────────────────────────────────────

# 1 · vuelve la línea ámbar entera, dibujada desde la celda de la descripción
perl -0pi -e 's{<span className="text-gray-800">\{p\.descripcion\}</span>}{<span className="text-gray-800">{p.descripcion}</span>{(p as unknown as { aviso?: { otra: string; codigo: string }[] }).aviso?.length ? <p data-aviso-clasificacion={(p as unknown as { aviso: { otra: string; codigo: string }[] }).aviso[0].codigo} className="mt-0.5 text-xs text-amber-700">Revisar: {(p as unknown as { aviso: { otra: string; codigo: string }[] }).aviso[0].codigo} tambien esta en {(p as unknown as { aviso: { otra: string; codigo: string }[] }).aviso[0].otra}</p> : null}}' "$VISTA"
probar "A1 · la línea ámbar vuelve a dibujarse en la fila" "$VISTA"

# 2 · vuelve SIN el ancla `data-aviso-clasificacion` — el texto solo. Es la
#     forma más barata de reponerlo y la que un candado por ancla dejaría pasar.
perl -0pi -e 's{<span className="text-gray-800">\{p\.descripcion\}</span>}{<span className="text-gray-800">{p.descripcion} <span className="text-amber-700">tambien esta en otra categoria</span></span>}' "$VISTA"
probar "A2 · vuelve como texto suelto, sin ancla (el candado no puede mirar sólo el atributo)" "$VISTA"

# 3 · la ruta vuelve a consultar `depurador_descripciones` en cada pantalla
perl -0pi -e 's{  const productos: ProductoNivel1\[\] = crudas\.map}{  await supabaseServer.from("depurador_descripciones").select("descripcion, activa");\n  const productos: ProductoNivel1[] = crudas.map}' "$RUTA"
probar "A3 · la ruta vuelve a gastar la consulta del catálogo aprobado" "$RUTA"

# 4 · la ruta vuelve a devolver `aviso` en la fila
perl -0pi -e 's~    margen: p\.margen != null \? Number\(p\.margen\) : null,~    margen: p.margen != null ? Number(p.margen) : null,\n    aviso: [{ otra: "X", codigo: "Y" }] as never,~' "$RUTA"
probar "A4 · la ruta vuelve a mandar un aviso en cada fila" "$RUTA"

# 5 · el SQL vuelve a calcular las grafías (el trabajo que la base hace para nadie)
perl -0pi -e 's{  \)\n  -- ⛔ ACA IBAN LOS CTE}{  ),\n  grafias AS (\n    SELECT DISTINCT ON (g.descripcion, h.descripcion)\n      g.descripcion, h.descripcion AS otra, h.codigo\n    FROM (SELECT DISTINCT descripcion, codigo FROM base WHERE codigo IS NOT NULL) g\n    JOIN historia h ON h.codigo = g.codigo AND h.descripcion <> g.descripcion\n    ORDER BY g.descripcion, h.descripcion, h.codigo\n  )\n  -- ACA IBAN LOS CTE}' "$SQL"
probar "A5 · el SQL vuelve a calcular las grafías" "$SQL"

# ⛔ ACÁ SE PROBÓ UNA 6ª: reponer el campo `aviso?` en `ProductoNivel1`
# (`$TIPOS`). SOBREVIVIÓ, y con razón — es una mutación de SOLO TIPOS: agregar
# un campo OPCIONAL que nadie escribe y nadie lee no cambia una sola respuesta
# ni un solo pixel, y `npm test` es `vitest run`, que no typechequea. Una
# mutación que no puede cambiar el comportamiento no es una mutación: sería un
# rojo permanente acusando a candados sanos. El riesgo que pretendía cubrir —
# que el aviso vuelva de verdad— ya lo cazan A1 (la vista lo dibuja), A2 (vuelve
# como texto suelto, sin ancla) y A4 (la ruta lo manda).

# 6 · el aviso vuelve por el `title` de la celda: el globito al pasar el mouse.
#     Es la reposición más silenciosa de todas — no cambia el textContent.
perl -0pi -e 's~<td data-col="descripcion" className="px-2 py-2\.5 lg:px-3">~<td data-col="descripcion" title="Revisar: tambien esta en otra categoria" className="px-2 py-2.5 lg:px-3">~' "$VISTA"
probar "A6 · el aviso vuelve escondido en el title de la celda" "$VISTA"

# ── B. QUE SE CAIGA LA AGRUPACIÓN POR EL NOMBRE MÁS RECIENTE ────────────────
#     🔴 ESTO ES LO QUE NO SE PODÍA TOCAR. Si estas mutaciones sobreviven, el
#     cambio pudo haber deshecho el #597 sin que nada se pusiera rojo.

# 7 · el SQL agrupa por la descripción congelada de la fila (producto partido)
perl -0pi -e 's/CASE WHEN d\.codigo IS NOT NULL THEN r\.descripcion END,/CASE WHEN FALSE THEN r.descripcion END,/' "$SQL"
probar "B7 · el SQL vuelve a agrupar por el nombre congelado (producto partido en dos)" "$SQL"

# 8 · "más reciente" se acota al período: el nombre cambia según la ventana
perl -0pi -e 's/(SELECT DISTINCT ON \(codigo, descripcion\)(?:.|\n)*?AND descripcion IS NOT NULL)/${1}\n      AND fecha BETWEEN p_desde AND p_hasta/' "$SQL"
probar "B8 · el nombre reciente se calcula sólo dentro del período" "$SQL"

# 9 · se cae el desempate por id (dos corridas, dos nombres distintos)
perl -0pi -e 's/ORDER BY codigo, descripcion, fecha DESC, id::text ASC/ORDER BY codigo, descripcion, fecha DESC/' "$SQL"
probar "B9 · el desempate del nombre deja de ser determinista" "$SQL"

# 10 · se desempata por `id` crudo (min(uuid) no existe antes de PG14)
perl -0pi -e 's/fecha DESC, id::text ASC/fecha DESC, id ASC/g' "$SQL"
probar "B10 · se desempata por id crudo en vez de id::text" "$SQL"

# 11 · la ruta vuelve a pedir la función que PARTE el producto
perl -0pi -e 's/supabaseServer\.rpc\("switch_top_descripciones_reciente", args\)/supabaseServer.rpc("switch_top_descripciones", args)/' "$RUTA"
probar "B11 · el nivel 1 vuelve a pedir la función vieja" "$RUTA"

# ── C. QUE UN NÚMERO SE MUEVA ───────────────────────────────────────────────
#     La poda le saca una columna JSON a la salida. Si de paso se llevara un
#     signo, un filtro o una fila, la venta total dejaría de cuadrar.

# 12 · la nota de crédito SUMA (la firma del error: la diferencia da el doble)
perl -0pi -e "s/CASE WHEN tipo = 'NC' THEN -venta_total/CASE WHEN tipo = 'NC' THEN venta_total/" "$SQL"
probar "C12 · la NC suma en vez de restar (la venta total se mueve)" "$SQL"

# 13 · aparece un segundo tipo firmado (una definición nueva del signo)
perl -0pi -e "s/CASE WHEN tipo = 'NC' THEN -costo_total/CASE WHEN tipo IN ('NC','CNF') THEN -costo_total/" "$SQL"
probar "C13 · un segundo tipo empieza a restar" "$SQL"

# 14 · el filtro de salida deja de ser `venta <> 0` (se caen las devoluciones netas)
perl -0pi -e 's/WHERE a\.venta <> 0/WHERE a.venta > 0/' "$SQL"
probar "C14 · el filtro de salida cambia y se pierden filas" "$SQL"

# 15 · la poda deja de ser aditiva: pisa la función viva, la del respaldo
perl -0pi -e 's/CREATE OR REPLACE FUNCTION switch_top_descripciones_reciente\(/CREATE OR REPLACE FUNCTION switch_top_descripciones(/' "$SQL"
probar "C15 · la migración pisa la función viva (deja de ser aditiva)" "$SQL"

# 16 · el total de la pantalla deja de ser la suma del nivel 1
perl -0pi -e 's/const ventaTotal = productos\.reduce\(\(s, p\) => s \+ p\.venta, 0\);/const ventaTotal = productos.slice(1).reduce((s, p) => s + p.venta, 0);/' "$RUTA"
probar "C16 · el total deja de sumar todas las filas" "$RUTA"

echo
echo "cazadas: $cazadas · sobrevividas: $sobrevividas"
[ "$sobrevividas" -eq 0 ] || exit 1

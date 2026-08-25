#!/usr/bin/env bash
# Verificación por MUTACIÓN del filtro por cliente de Ventas › Productos.
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
# 🩸 Y UNA MUTACIÓN QUE NO CAMBIA EL ARCHIVO NO ES UNA MUTACIÓN: si el patrón de
# `perl` dejó de encajar, se dice PATRÓN MUERTO y CUENTA COMO FALLO, en vez de
# acusar a un candado sano de no cazar.
#
#   bash scripts/_mutar-candados-productos-filtro-cliente.sh

set -uo pipefail
cd "$(dirname "$0")/.."

PURO="src/lib/ventas/productos-por-cliente.ts"
SRV="src/lib/ventas/productos-por-cliente-server.ts"
RUTA="src/app/api/ventas/productos/por-cliente/route.ts"
VISTA="src/components/ventas/ProductosView.tsx"
FUENTES=("$PURO" "$SRV" "$RUTA" "$VISTA")
TESTS=(
  "src/__tests__/lib/ventas-productos-por-cliente.test.ts"
  "src/__tests__/api/ventas-productos-por-cliente-route.test.ts"
  "src/__tests__/components/ventas-productos-filtro-cliente.test.tsx"
  "src/__tests__/components/ventas-productos-precio-periodos.test.tsx"
  "src/__tests__/un-solo-selector-de-cliente.test.ts"
)

RESPALDO=$(mktemp -d)
for f in "${FUENTES[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${FUENTES[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0
sobrevividas=0

cambio() { ! cmp -s "$1" "$RESPALDO/$1"; }

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
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    local n
    n=$(grep -oE "Tests +[0-9]+ failed" <<<"$salida" | grep -oE "[0-9]+" | head -1)
    echo "  ✅ CAZADA (${n} rojos): $nombre"
    cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ: $nombre"
    sobrevividas=$((sobrevividas + 1))
  fi
  restaurar
}

echo "=== MUTACIONES · filtro por cliente ==="

# ── El módulo puro ──────────────────────────────────────────────────────────
# 1 · la nota de crédito SUMA
perl -0pi -e 's/for \(const c of agruparPorCliente\(bolsa\)\) \{/for (const c of agruparPorCliente(bolsa.map(l => ({ ...l, tipo_comprobante: "Factura" })))) {/' "$PURO"
probar "la NC suma en vez de restar" "$PURO"

# 2 · el cruce vuelve al TEXTO de la línea en vez del código
perl -0pi -e 's/const d = l\.codigo != null \? descripcionDeCodigo\.get\(l\.codigo\) : undefined;/const d = (l as unknown as { descripcion?: string }).descripcion;/' "$PURO"
probar "el cruce vuelve al TEXTO de la línea (no al código)" "$PURO"

# 3 · el código sin descripción se inventa una en vez de contarse
perl -0pi -e 's/      sinDescripcion\+\+;\n      continue;/      sinDescripcion += 0;/' "$PURO"
probar "el código sin descripción deja de contarse" "$PURO"

# 4 · gana la grafía MÁS VIEJA en vez de la más reciente
perl -0pi -e 's/if \(previa != null && previa >= vista\) continue;/if (previa != null) continue;/' "$PURO"
probar "con dos grafías gana la más VIEJA" "$PURO"

# 5 · la llave del cliente pasa a ser el NOMBRE
perl -0pi -e 's/export function claveCliente\(id: number \| null\): string \{\n  return id == null \? "sin-cliente" : String\(id\);/export function claveCliente(id: number | null): string {\n  return "uno-solo";/' "$PURO"
probar "la llave del cliente deja de ser el id" "$PURO"

# 6 · el desplegable se ordena alfabéticamente y no por plata
perl -0pi -e 's/return \[\.\.\.acc\.values\(\)\]\.sort\(\(a, b\) => b\.venta - a\.venta\);/return [...acc.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));/' "$PURO"
probar "el desplegable se ordena alfabético en vez de por plata" "$PURO"

# 7 · «dejó de comprar» deja de distinguir lo que ya no se vende
perl -0pi -e 's/seSigueVendiendo: seVendeHoy\.has\(descripcion\),/seSigueVendiendo: true,/' "$PURO"
probar "«dejó de comprar» dice que TODO se sigue vendiendo" "$PURO"

# 8 · «dejó de comprar» se ordena por nombre en vez de por plata
perl -0pi -e 's/return salida\.sort\(\(a, b\) => b\.venta - a\.venta\);/return salida.sort((a, b) => a.descripcion.localeCompare(b.descripcion));/' "$PURO"
probar "«dejó de comprar» deja de ordenarse por plata" "$PURO"

# 9 · lo que SIGUE comprando entra igual a la lista
perl -0pi -e 's/if \(hoy && hoy\.venta > 0\) continue;//' "$PURO"
probar "lo que sigue comprando entra a «dejó de comprar»" "$PURO"

# ── El servidor ─────────────────────────────────────────────────────────────
# 10 · un timeout dispara el camino largo (empujar la caída)
perl -0pi -e 's/if \(!funcionNoCreada\(rpc\.error\)\) \{/if (false) {/' "$SRV"
probar "un timeout de la RPC cae al camino largo" "$SRV"

# 11 · con un cliente, el mapa se pide ENTERO igual (22 viajes en vez de 2)
perl -0pi -e 's/return armarMatriz\(lineas, await leerMapa\(empresa, desde, hasta, codigos\)\);/return armarMatriz(lineas, await leerMapa(empresa, desde, hasta, null));/' "$SRV"
probar "con un cliente el mapa se pide entero igual" "$SRV"

# 11b · sin cliente, las dos lecturas dejan de ir a la par (25 viajes encadenados)
perl -0pi -e 's/  if \(clienteId == null\) \{\n    const \[lineas, mapa\] = await Promise\.all\(\[/  if (false) {\n    const [lineas, mapa] = await Promise.all([/' "$SRV"
probar "sin cliente las dos lecturas dejan de ir a la par" "$SRV"

# 12 · el filtro por cliente se pierde en la lectura de líneas
perl -0pi -e 's/if \(clienteId != null\) q = q\.eq\("cliente_switch_id", clienteId\);\n      return q\.order\("id", \{ ascending: true \}\)\.range\(d, h\);\n    \},\n  \);/return q.order("id", { ascending: true }).range(d, h);\n    },\n  );/' "$SRV"
probar "la lectura de líneas ignora el cliente" "$SRV"

# 13 · la fecha entra en UTC pelado en vez de Panamá
perl -0pi -e 's/const gte = bordePanama\(desde\);/const gte = desde;/' "$SRV"
probar "la fecha entra en UTC pelado" "$SRV"

# ── La ruta ─────────────────────────────────────────────────────────────────
# 14 · la ventana previa deja de exigir cliente (el período entero, dos veces)
perl -0pi -e 's/if \(ventana === "previa" && cliente == null\) \{/if (false) {/' "$RUTA"
probar "la ventana previa deja de exigir cliente" "$RUTA"

# 15 · las dos ventanas pasan a ser LA MISMA
perl -0pi -e 's/\? productosRangoComparativo\(periodo, year, mes, ahora\)/? productosRangoPeriodo(periodo, year, mes, ahora)/' "$RUTA"
probar "la ventana previa devuelve el MISMO rango que la actual" "$RUTA"

# 16 · el id del cliente no viaja a la lectura
perl -0pi -e 's/const matriz = await matrizPorCliente\(empresa, desde, hasta, cliente\);/const matriz = await matrizPorCliente(empresa, desde, hasta, null);/' "$RUTA"
probar "el id del cliente no llega a la lectura" "$RUTA"

# 17 · el conteo de líneas sin descripción se esconde
perl -0pi -e 's/sinDescripcion: matriz\.sinDescripcion,/sinDescripcion: 0,/' "$RUTA"
probar "las líneas sin descripción se esconden" "$RUTA"

# ── La pantalla ─────────────────────────────────────────────────────────────
# 18 · la matriz se pide al CARGAR (una consulta que nadie pidió)
perl -0pi -e 's/    if \(filtroCliente !== TODOS && matrizEstado === "sin-pedir"\) pedirMatriz\(\);/    if (matrizEstado === "sin-pedir") pedirMatriz();/' "$VISTA"
probar "la matriz se pide al cargar la pantalla" "$VISTA"

# 19 · el filtro no filtra: la tabla sigue entera
perl -0pi -e 's/    if \(!comprasActual\) return data\.productos;/    return data.productos;/' "$VISTA"
probar "el filtro no filtra la tabla" "$VISTA"

# 20 · el filtro muestra la venta de la EMPRESA en vez de la del cliente
perl -0pi -e 's/      out\.push\(\{ \.\.\.p, cantidad: c\.cantidad, venta: c\.venta \}\);/      out.push({ ...p });/' "$VISTA"
probar "la fila filtrada muestra la venta de la empresa" "$VISTA"

# 21 · vuelve Margen % con el filtro puesto
perl -0pi -e 's/                \{!conCliente && \(\n                  <SortableTh label="Margen %"/                {true \&\& (\n                  <SortableTh label="Margen %"/' "$VISTA"
probar "vuelve Margen % con un cliente puesto" "$VISTA"

# 22 · el Δ vuelve a comparar contra la EMPRESA con el filtro puesto
perl -0pi -e 's/prevVenta=\{conCliente \? comprasPrevias\?\.get\(p\.descripcion\)\?\.venta : prevVenta\[p\.descripcion\]\}/prevVenta={prevVenta[p.descripcion]}/' "$VISTA"
probar "el Δ compara contra la empresa y no contra el cliente" "$VISTA"

# 23 · cambiar de empresa se queda con el cliente de la anterior
perl -0pi -e 's/    setEmpresa\(key\);\n(.*\n)*?    setFiltroCliente\(TODOS\);\n  \};/    setEmpresa(key);\n  };/' "$VISTA"
probar "cambiar de empresa arrastra el cliente de la otra" "$VISTA"

# 24 · el total de arriba sigue siendo el de la empresa
perl -0pi -e 's/\{fmtMoney\(totalCliente \? totalCliente\.venta : data\.totales\.venta\)\}/{fmtMoney(data.totales.venta)}/' "$VISTA"
probar "el total de arriba no baja al del cliente" "$VISTA"

# 25 · «dejó de comprar» desaparece de la pantalla
perl -0pi -e 's/      \{conCliente && !loading && data && \(/      {false \&\& (/' "$VISTA"
probar "«dejó de comprar» no se dibuja" "$VISTA"

# 26 · el filtro deja de decir que el mostrador no está
perl -0pi -e 's/            \{conCliente && \(\n              <>\n                <span className="mx-1\.5 text-gray-300">·<\/span>\n                <span data-sin-mostrador>/            {false \&\& (\n              <>\n                <span className="mx-1.5 text-gray-300">·<\/span>\n                <span data-sin-mostrador>/' "$VISTA"
probar "la tabla filtrada deja de decir que falta el mostrador" "$VISTA"

# 27 · el filtro estrena una búsqueda contra el directorio (el candado del sistema)
perl -0pi -e 's/  const \[filtroCliente, setFiltroCliente\] = useState<string>\(TODOS\);/  const [filtroCliente, setFiltroCliente] = useState<string>(TODOS);\n  const hits = useBusquedaClientes(filtroCliente, true);\n  void hits;/' "$VISTA"
probar "el filtro estrena una búsqueda contra el directorio" "$VISTA"

# 28 · el desplegable vacío deja de decir por qué (Multifashion: 0 líneas)
perl -0pi -e 's/\{matrizEstado === "listo" && clientesDelFiltro\.length === 0 && \(/{false \&\& (/' "$VISTA"
probar "el desplegable vacío no dice por qué está vacío" "$VISTA"

echo
echo "=== $cazadas cazadas · $sobrevividas sobrevividas/muertas de $((cazadas + sobrevividas)) ==="
[ "$sobrevividas" -eq 0 ]

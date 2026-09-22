#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — los tres cambios de Comprobantes del 22-sep-2026,
# los tres salidos de mirar la captura de Reebok del 19-sep:
#
#   1. La casilla de selección lleva a algún lado, y DICE a cuántas filas.
#   2. Una sola forma de volver —el camino de migas—, y completa en las tres
#      pantallas del módulo.
#   3. Los números cuadran: «Todos» es todos, los dos grupos de chips suman lo
#      mismo, y el pie dice cuántas se ven de cuántas hay.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
#   bash scripts/_mutar-candados-comprobantes-22sep.sh
#
# 🩸 Tres defectos ya pagados en este repo, y cómo se evitan acá:
#   1. La restauración va por COPIA, NUNCA por `git checkout`: hay archivos
#      NUEVOS (sin versionar) en la rama y git aborta el comando ENTERO sin
#      restaurar nada.
#   2. Una mutación cuyo patrón NO matchea se DENUNCIA («patrón muerto») en vez
#      de darse por cazada.
#   3. NO HAY DELIMITADOR: los textos viajan como ARGUMENTOS a python (argv).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

PANEL=src/components/catalogo/ComprobantesPanel.tsx
CHIPS=src/lib/catalogo/chips-comprobantes.ts
CUANTAS=src/lib/catalogo/cuantas-comprobantes.ts
PIE=src/lib/ui/pie-de-lista.ts
MIGAS=src/lib/catalogo/camino-de-migas.ts
NAVBAR=src/components/catalogo/CatalogoNavbar.tsx
LISTA=src/components/catalogo/PedidosListClient.tsx
ADMIN='src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx'
CATEG='src/app/catalogos/admin/[marca]/categorias/CategoriasRubroClient.tsx'
RUTA='src/app/api/catalogo/[marca]/orders/bulk-delete/route.ts'
PIEGUIAS=src/lib/guias/pie-de-la-lista.ts

CANDADOS=(
  src/__tests__/lib/comprobantes-cuadran.test.ts
  src/__tests__/components/comprobantes-seleccion-con-accion.test.tsx
  src/__tests__/components/comprobantes-una-sola-vuelta.test.tsx
  src/__tests__/lib/catalogo-una-sola-ruta-arriba.test.ts
  src/__tests__/lib/comprobantes-ventana-90-dias.test.ts
  src/__tests__/lib/comprobantes-rediseno.test.ts
  src/__tests__/components/guias-lista-que-se-lee-sola.test.tsx
)

ARCHIVOS=("$PANEL" "$CHIPS" "$CUANTAS" "$PIE" "$MIGAS" "$NAVBAR" "$LISTA" "$ADMIN" "$CATEG" "$RUTA" "$PIEGUIAS")
RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
limpiar() { restaurar; rm -rf "$RESPALDO"; }
trap limpiar EXIT

if ! npx vitest run "${CANDADOS[@]}" >/dev/null 2>&1; then
  echo "🔴 Los candados YA están rojos sin mutar nada — no hay nada que verificar."
  exit 1
fi

ok=0
fallo=0

# $1 = nombre  $2 = archivo  $3 = texto original  $4 = reemplazo
mutar() {
  local nombre="$1" archivo="$2" de="$3" a="$4"
  restaurar
  python3 - "$archivo" "$de" "$a" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
de, a = sys.argv[2], sys.argv[3]
if de not in s:
    print(f"::NO-APLICA:: no encontré el texto en {sys.argv[1]}"); sys.exit(3)
nuevo = s.replace(de, a, 1)
if nuevo == s:
    print(f"::NO-APLICA:: el reemplazo no cambió nada en {sys.argv[1]}"); sys.exit(3)
p.write_text(nuevo)
PY
  local aplicado=$?
  if [ $aplicado -ne 0 ]; then
    printf '  ⚠️  %-74s NO SE PUDO APLICAR (patrón muerto)\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  if cmp -s "$archivo" "$RESPALDO/$archivo"; then
    printf '  ⚠️  %-74s EL ARCHIVO NO CAMBIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    printf '  ⚠️  %-74s LA CORRIDA MURIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  ✅ %-74s cazada\n' "$nombre"; ok=$((ok+1))
  else
    printf '  🔴 %-74s SOBREVIVIÓ (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  fi
  restaurar
}

# $1 = nombre  $2 = archivo  $3 = de  $4 = a — un cambio que NO debe romper nada.
control() {
  local nombre="$1" archivo="$2" de="$3" a="$4"
  restaurar
  python3 - "$archivo" "$de" "$a" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
de, a = sys.argv[2], sys.argv[3]
if de not in s:
    print(f"::NO-APLICA:: no encontré el texto en {sys.argv[1]}"); sys.exit(3)
p.write_text(s.replace(de, a, 1))
PY
  if [ $? -ne 0 ]; then
    printf '  ⚠️  %-74s NO SE PUDO APLICAR (patrón muerto)\n' "CONTROL · $nombre"; fallo=$((fallo+1)); return
  fi
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  🔴 %-74s EL CONTROL SE PUSO ROJO (candado frágil)\n' "CONTROL · $nombre"; fallo=$((fallo+1))
  else
    printf '  ✅ %-74s control en verde\n' "CONTROL · $nombre"; ok=$((ok+1))
  fi
  restaurar
}

echo "═══ 1 · LA CASILLA LLEVA A ALGÚN LADO, Y DICE A CUÁNTAS ═══"

mutar "🔴 la casilla vuelve a alcanzar solo los meses ABIERTOS (2 de 13)" "$PANEL" \
  '  const seleccionables = visibles;' \
  '  const seleccionables = grupos.filter((g) => isMesOpen(g.key)).flatMap((g) => g.items);'

mutar "🔴 «Seleccionar todos» pierde su número" "$PANEL" \
  '{textoSeleccionarTodos(seleccionables.length)}' \
  'Seleccionar todos'

mutar "🔴 el botón destructivo pierde su número" "$PANEL" \
  '{textoEliminarSeleccionados(selectedRows.length)}' \
  'Eliminar seleccionados'

mutar "🔴 el rótulo miente: dice el total de la lista, no lo que alcanza" "$PANEL" \
  '{textoSeleccionarTodos(seleccionables.length)}' \
  '{textoSeleccionarTodos(pedidos.length)}'

mutar "🩸 el número del rótulo deja de seguir al filtro (cuenta lo buscado y lo no buscado)" "$PANEL" \
  '  const seleccionables = visibles;' \
  '  const seleccionables = candidatas;'

mutar "🔴 tildar todo deja de marcar lo que el rótulo prometió" "$PANEL" \
  '    setSelected(allSelected ? new Set() : new Set(seleccionables.map(rowKey)));' \
  '    setSelected(allSelected ? new Set() : new Set(seleccionables.slice(0, 2).map(rowKey)));'

mutar "🔴 la selección deja de tener botón: la casilla no lleva a ninguna parte" "$PANEL" \
  '              {selectedRows.length > 0 && (' \
  '              {false && selectedRows.length > 0 && ('

mutar "🔴 la casilla se le ofrece a quien el servidor rechaza" "$PANEL" \
  '          {puedeAdministrar && (
            <div className="flex items-center justify-between gap-3 mb-3 min-h-[38px]">' \
  '          {true && (
            <div className="flex items-center justify-between gap-3 mb-3 min-h-[38px]">'

mutar "🔴 el borrado masivo se le abre al vendedor en el SERVIDOR" "$RUTA" \
  'requireRole(req, ["admin", "secretaria"])' \
  'requireRole(req, ["admin", "secretaria", "vendedor"])'

mutar "🔴 el rótulo con cero se cuelga un «(0)» que parece un dato roto" "$CUANTAS" \
  '  return seleccionables > 0 ? `${ROTULO_SELECCIONAR_TODOS} (${seleccionables})` : ROTULO_SELECCIONAR_TODOS;' \
  '  return `${ROTULO_SELECCIONAR_TODOS} (${seleccionables})`;'

mutar "🔴 el botón de borrar deja de decir cuántos (vuelve el rótulo pelado)" "$CUANTAS" \
  '  return `Eliminar seleccionados (${seleccionados})`;' \
  '  return "Eliminar seleccionados";'

echo
echo "═══ 2 · UNA SOLA FORMA DE VOLVER, Y COMPLETA ═══"

mutar "🔴 vuelve «← Inicio» encima del camino de migas" "$NAVBAR" \
  '  const showInicio = permiteInicio && !hayCaminoDeMigas(pathname);' \
  '  const showInicio = permiteInicio;'

mutar "🩸 «← Inicio» se esconde en TODO el catálogo y el checkout queda sin salida" "$NAVBAR" \
  '  const showInicio = permiteInicio && !hayCaminoDeMigas(pathname);' \
  '  const showInicio = false;'

mutar "🔴 hayCaminoDeMigas se vuelve un includes y se come el detalle del pedido" "$MIGAS" \
  '  return /^\/catalogo\/[^/]+\/pedidos\/?$/.test(pathname);' \
  '  return pathname.includes("/pedido");'

mutar "🔴 vuelve «← Catálogo» encima del título" "$LISTA" \
  '      <h1 className="text-2xl font-light mb-6">{PANEL_COMPROBANTES}</h1>' \
  '      <a href={theme.catalogoHref} className="text-xs text-gray-400">← Catálogo</a>
      <h1 className="text-2xl font-light mt-2 mb-6">{PANEL_COMPROBANTES}</h1>'

mutar "🔴 Administrar vuelve al camino a medias («Inicio › Catálogos»)" "$ADMIN" \
  '      <AppHeader
        module="Catálogos"
        breadcrumbs={migasDeAppHeader(tramosDeAdministrar(marca), (href) => router.push(href))}
      />' \
  '      <AppHeader module="Catálogos" />'

mutar "🔴 Categorías vuelve al camino a medias" "$CATEG" \
  '      <AppHeader
        module="Catálogos"
        breadcrumbs={migasDeAppHeader(tramosDeCategorias("reebok"), (href) => router.push(href))}
      />' \
  '      <AppHeader module="Catálogos" />'

mutar "🔴 al camino de Administrar le falta el tramo de la MARCA" "$MIGAS" \
  '  return [...RAIZ, tramoDeMarca(marca), { label: TRAMO_ADMINISTRAR }];' \
  '  return [...RAIZ, { label: TRAMO_ADMINISTRAR }];'

mutar "🔴 desde Categorías ya no se puede volver a Administrar" "$MIGAS" \
  '    { label: TRAMO_ADMINISTRAR, href: `/catalogos/admin/${marca}` },' \
  '    { label: TRAMO_ADMINISTRAR },'

mutar "🔴 el tramo «Inicio» deja de llevar a ningún lado" "$MIGAS" \
  '  { label: "Inicio", href: "/home" },' \
  '  { label: "Inicio" },'

mutar "🔴 el último tramo se vuelve enlace: el camino deja de decir DÓNDE ESTÁS" "$MIGAS" \
  '  return [...RAIZ, tramoDeMarca(marca), { label: PANEL_COMPROBANTES }];' \
  '  return [...RAIZ, tramoDeMarca(marca), { label: PANEL_COMPROBANTES, href: "/home" }];'

mutar "🔑 el último tramo vuelve a llamarse «Pedidos» (el cuarto nombre del lugar)" "$MIGAS" \
  '  return [...RAIZ, tramoDeMarca(marca), { label: PANEL_COMPROBANTES }];' \
  '  return [...RAIZ, tramoDeMarca(marca), { label: "Pedidos" }];'

mutar "🔴 migasDeAppHeader repite «Inicio» y «Catálogos», que AppHeader ya pone" "$MIGAS" \
  '  return tramos.slice(RAIZ.length - 1).map((t) => ({' \
  '  return tramos.slice(0).map((t) => ({'

echo
echo "═══ 3 · LOS NÚMEROS CUADRAN ═══"

mutar "🔴 «Todos» vuelve a contarse con el otro filtro puesto (13 donde hay 15)" "$CHIPS" \
  '          conteo: candidatas.filter((p) => pasaFiltroOrigen(p.origen, f.clave)).length,' \
  '          conteo: candidatas.filter((p) => pasaVista(p, estado.vista) && pasaFiltroOrigen(p.origen, f.clave)).length,'

mutar "🔴 el grupo «Qué es» vuelve a contarse con el origen puesto" "$CHIPS" \
  '          conteo: candidatas.filter((p) => pasaVista(p, f.clave)).length,' \
  '          conteo: candidatas.filter((p) => pasaFiltroOrigen(p.origen, estado.origen) && pasaVista(p, f.clave)).length,'

mutar "🔴 el cuadre suma «Sin mandar» y cuenta dos veces los trabados" "$CHIPS" \
  '    vista: g.vista.opciones
      .filter((c) => c.clave !== VISTA_SIN_MANDAR)
      .reduce((s, c) => s + c.conteo, 0),' \
  '    vista: g.vista.opciones.reduce((s, c) => s + c.conteo, 0),'

mutar "🔴 el cuadre suma «Todos» dentro del grupo de origen (lo cuenta doble)" "$CHIPS" \
  '    origen: g.origen.opciones.filter((c) => c.clave !== "todos").reduce((s, c) => s + c.conteo, 0),' \
  '    origen: g.origen.opciones.reduce((s, c) => s + c.conteo, 0),'

mutar "🔴 se va el pie: los 5 del «Ver más» vuelven a no estar en ninguna cuenta" "$PANEL" \
  '          <p data-medir="pie-comprobantes" className="mt-4 text-center text-xs text-gray-400 tabular-nums">
            {textoPieDeComprobantes(visibles.length, pedidos.length)}
          </p>' \
  '          '

mutar "🔴 el pie deja de seguir al filtro: dice el total como si fuera lo de delante" "$PANEL" \
  '{textoPieDeComprobantes(visibles.length, pedidos.length)}' \
  '{textoPieDeComprobantes(pedidos.length, pedidos.length)}'

mutar "🔴 el pie cuenta sobre la lista ya recortada y el «de N» no aparece nunca" "$PANEL" \
  '{textoPieDeComprobantes(visibles.length, pedidos.length)}' \
  '{textoPieDeComprobantes(visibles.length, candidatas.length)}'

mutar "🔴 el «de N» sale siempre, hasta con todo a la vista" "$PIE" \
  '  if (mostradas >= total) return conPalabra(total);' \
  '  if (false) return conPalabra(total);'

mutar "🔴 el pie se dibuja como «21 de 20» cuando lo mostrado pasa al total" "$PIE" \
  '  if (mostradas >= total) return conPalabra(total);' \
  '  if (mostradas === total) return conPalabra(total);'

mutar "🔴 Comprobantes se escribe su PROPIA cuenta en vez de leer la común" "$CUANTAS" \
  '  return textoDelPie(mostradas, total, PALABRAS);' \
  '  return `${mostradas} comprobantes`;'

mutar "🩸 Guías se separa de la regla común y vuelve a tener su propia copia" "$PIEGUIAS" \
  '  return textoDelPie(mostradas, total, PALABRAS);' \
  '  return `${mostradas} guías`;'

echo
echo "═══ CONTROLES (cambios que NO deben romper nada) ═══"

control "un comentario más en el módulo de los conteos" "$CUANTAS" \
  'export const ROTULO_SELECCIONAR_TODOS = "Seleccionar todos";' \
  '// Comentario de control: no cambia ninguna regla.
export const ROTULO_SELECCIONAR_TODOS = "Seleccionar todos";'

control "el pie cambia de color gris" "$PANEL" \
  'className="mt-4 text-center text-xs text-gray-400 tabular-nums"' \
  'className="mt-4 text-center text-xs text-gray-500 tabular-nums"'

control "el camino cambia el aire entre tramos" "$MIGAS" \
  '/** Un tramo del camino. Sin `href` = es donde estás parado. */' \
  '/** Un tramo del camino (sin `href` = es donde estás parado). */'

echo
echo "═══ RESUMEN ═══"
echo "  cazadas / controles OK : $ok"
echo "  problemas              : $fallo"
[ "$fallo" -eq 0 ] || exit 1

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — LOS TRES CHIPS DE «COMPROBANTES» (25-ago-2026)
#
#   [ Pedidos ]  [ Cotizaciones ]  [ Borradores ]
#
# Daniel, textual: *"entonces haz un tap de borrador, para q esté organizado.
# No quiero opción de todos."* Se fue «Todos», el panel abre en «Pedidos», y
# «Sin mandar» pasó a «Borradores» CAMBIANDO DE CRITERIO: `status = 'borrador'`,
# no "nunca se envió". Son dos preguntas distintas y hay un caso real que las
# separa —reebok PED-018, EN Switch y con el status sin cerrar—.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
#   bash scripts/_mutar-candados-borradores.sh
#
# 🩸 TRES DEFECTOS YA PAGADOS EN ESTE REPO, Y CÓMO SE EVITAN ACÁ:
#   1. La restauración va por COPIA, NUNCA por `git checkout`: hay archivos
#      NUEVOS (sin versionar) en la rama y git aborta el comando ENTERO sin
#      restaurar nada — las mutaciones se apilan y ninguna se prueba por
#      separado. Un verificador que miente en verde es peor que no tenerlo.
#   2. Una mutación cuyo patrón NO matchea se DENUNCIA («patrón muerto») en vez
#      de darse por cazada: el archivo queda SANO, los tests pasan, y contarla
#      sería inventar una verificación que nunca ocurrió.
#   3. NO HAY DELIMITADOR. Los textos viajan como ARGUMENTOS a python (argv),
#      no dentro de un `s|de|a|` de sed: el código real tiene `||`, `/` y `#`, y
#      cualquiera de esos delimitadores se des-escapa, se come el archivo y deja
#      un "SOBREVIVIÓ" falso. Sin delimitador no hay nada que escapar.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/catalogo/numeros-pedido.ts
TAB='src/app/catalogos/admin/[marca]/PedidosTab.tsx'
RUTA='src/app/api/catalogo/[marca]/pedidos-unificado/route.ts'

CANDADOS=(
  src/__tests__/lib/comprobantes-nombre-y-tipo.test.ts
  src/__tests__/components/comprobantes-panel.test.tsx
  src/__tests__/components/pedidos-numeros-en-la-lista.test.tsx
  src/__tests__/api/pedidos-unificado-numeros.test.ts
  src/__tests__/api/catalogo-paridad-listas.test.ts
)

ARCHIVOS=("$REGLA" "$TAB" "$RUTA")
RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
limpiar() { restaurar; rm -rf "$RESPALDO"; }
trap limpiar EXIT

# Con los archivos SANOS los candados tienen que estar verdes: si no, cualquier
# "cazada" de abajo podría ser un rojo que ya estaba.
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
    printf '  ⚠️  %-70s NO SE PUDO APLICAR (patrón muerto)\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  # 🔴 EL ARCHIVO TIENE QUE HABER CAMBIADO DE VERDAD.
  if cmp -s "$archivo" "$RESPALDO/$archivo"; then
    printf '  ⚠️  %-70s EL ARCHIVO NO CAMBIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  # ⚠️ Se exige encontrar el resumen de vitest: si la corrida MUERE, "0 fallos"
  # se leería como "sobrevivió" y el veredicto mentiría en verde.
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    printf '  ⚠️  %-70s LA CORRIDA MURIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  ✅ %-70s cazada\n' "$nombre"; ok=$((ok+1))
  else
    printf '  🔴 %-70s SOBREVIVIÓ (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── 1 · «TODOS» NO VUELVE, Y SON TRES ───────────────────────────────────────

mutar "🔴 VUELVE «Todos» a la lista de chips" "$REGLA" \
  '  { clave: "pedido", label: "Pedidos" },' \
  '  { clave: "todos" as FiltroComprobante, label: "Todos" },
  { clave: "pedido", label: "Pedidos" },'

mutar "🔴 el filtro deja pasar TODO (cada chip muestra el panel entero)" "$REGLA" \
  '  return tipoComprobante(p) === filtro;' \
  '  return true;'

mutar "«Borradores» vuelve a llamarse «Sin mandar»" "$REGLA" \
  '  { clave: "borrador", label: "Borradores" },' \
  '  { clave: "borrador", label: "Sin mandar" },'

mutar "«Cotizaciones» desaparece de los chips" "$REGLA" \
  '  { clave: "cotizacion", label: "Cotizaciones" },' \
  ''

mutar "«Borradores» desaparece de los chips" "$REGLA" \
  '  { clave: "borrador", label: "Borradores" },' \
  ''

mutar "🔴 el panel deja de abrir en «Pedidos»" "$REGLA" \
  'export const FILTRO_COMPROBANTE_DEFAULT: FiltroComprobante = "pedido";' \
  'export const FILTRO_COMPROBANTE_DEFAULT: FiltroComprobante = "cotizacion";'

mutar "la pantalla ignora el default y abre donde quiere" "$TAB" \
  'useState<FiltroComprobante>(FILTRO_COMPROBANTE_DEFAULT);' \
  'useState<FiltroComprobante>("borrador");'

mutar "la pantalla dibuja su PROPIA lista de chips (con «Todos» adentro)" "$TAB" \
  '        {FILTROS_COMPROBANTE.map((f) => {' \
  '        {[{ clave: "todos" as FiltroComprobante, label: "Todos" }, { clave: "pedido" as FiltroComprobante, label: "Pedidos" }].map((f) => {'

# ── 2 · EL CRITERIO DE «BORRADORES»: EL STATUS, NO «NUNCA SE ENVIÓ» ─────────

mutar "🔴 «Borradores» vuelve al criterio VIEJO («nunca se envió»)" "$REGLA" \
  '  return String(p.status ?? "").trim().toLowerCase() === STATUS_BORRADOR;' \
  '  return !estaEnSwitch(p);'

mutar "🔴 nada es borrador nunca (el chip queda en cero)" "$REGLA" \
  '  return String(p.status ?? "").trim().toLowerCase() === STATUS_BORRADOR;' \
  '  return false;'

mutar "todo es borrador (el chip se come el panel)" "$REGLA" \
  '  return String(p.status ?? "").trim().toLowerCase() === STATUS_BORRADOR;' \
  '  return true;'

mutar "el pedido del LINK (sin fila en orders) se cuenta como borrador" "$REGLA" \
  '  return String(p.status ?? "").trim().toLowerCase() === STATUS_BORRADOR;' \
  '  return String(p.status ?? "borrador").trim().toLowerCase() === STATUS_BORRADOR;'

mutar "el status deja de tolerar espacios y mayúsculas de la columna de texto" "$REGLA" \
  '  return String(p.status ?? "").trim().toLowerCase() === STATUS_BORRADOR;' \
  '  return p.status === STATUS_BORRADOR;'

mutar "el status que se mira es otro ('confirmado' pasa a ser el borrador)" "$REGLA" \
  'export const STATUS_BORRADOR = "borrador";' \
  'export const STATUS_BORRADOR = "confirmado";'

# ── 3 · EL ORDEN DE DECISIÓN, Y LA PARTICIÓN QUE DEJA IR A «TODOS» ─────────

mutar "🔴 PED-018 (borrador Y en Switch) se cuenta como PEDIDO — orden invertido" "$REGLA" \
  '  if (esBorrador(p)) return "borrador";
  if (estaEnSwitch(p) && normalizarDocumento(p.switchDocumento) === "cotizacion") return "cotizacion";
  return "pedido";' \
  '  if (estaEnSwitch(p)) return normalizarDocumento(p.switchDocumento);
  if (esBorrador(p)) return "borrador";
  return "pedido";'

mutar "🔴 «Pedidos» deja de ser el balde de RESTO (filas invisibles, sin «Todos»)" "$REGLA" \
  '  return "pedido";
}' \
  '  return (estaEnSwitch(p) ? "pedido" : "no-enviado") as TipoComprobante;
}'

mutar "el borrador se cuela ADEMÁS en cotizaciones (los chips dejan de ser disjuntos)" "$REGLA" \
  '  return tipoComprobante(p) === filtro;' \
  '  return tipoComprobante(p) === filtro || (filtro === "cotizacion" && esBorrador(p));'

mutar "todo se cuenta como cotización" "$REGLA" \
  '  if (estaEnSwitch(p) && normalizarDocumento(p.switchDocumento) === "cotizacion") return "cotizacion";' \
  '  if (true) return "cotizacion";'

# 🩸 ACÁ NO VA UNA MUTACIÓN DEL ESCALÓN TOLERANTE DEL DDL 20260824160000, Y ES
# A PROPÓSITO. Desde el 25-ago-2026 «Pedidos» es el balde de RESTO, así que la
# tolerancia dejó de ser una rama que se pueda romper: sin la columna
# `documento` la fila cae en «Pedidos» porque es donde cae todo lo que no es
# borrador ni cotización. Se intentó `normalizarDocumento(x) === "cotizacion"`
# → `x === "cotizacion"` y SOBREVIVIÓ con razón: `normalizarDocumento` es
# igualdad exacta (no dobla mayúsculas), así que las dos formas se comportan
# idénticas. Contarla como "cazada" habría sido inventar una verificación.
# El lado positivo SÍ tiene candado: "con el DDL pendiente sigue siendo pedido"
# en `comprobantes-nombre-y-tipo.test.ts`. Y el escalón que sí es una rama —el
# de `status` en la API— está mutado abajo.

# ── 4 · LOS CONTEOS: LA MISMA LISTA QUE SE PINTA, NUNCA LA TABLA ───────────

mutar "🔴 EL CHIP CUENTA FILAS BORRADAS: la API barre orders sin filtrar por ids" "$RUTA" \
  '        .select(cols)
        .in("id", orderIds);' \
  '        .select(cols);'

mutar "🔴 el status NO viaja desde la API (nada es borrador en la pantalla)" "$RUTA" \
  '      status: statusPedido.get(r.id_natural) ?? null,' \
  '      status: null,'

mutar "el status se pide en una consulta APARTE (la base está en compute Micro)" "$RUTA" \
  '    for (const cols of ["id, order_number, status", "id, order_number"]) {' \
  '    for (const cols of ["id, order_number"]) {'

mutar "se pierde el escalon tolerante de status (la lista se cae sin la columna)" "$RUTA" \
  '    for (const cols of ["id, order_number, status", "id, order_number"]) {' \
  '    for (const cols of ["id, order_number, status"]) {'

mutar "el status no llega a la fila de la pantalla" "$TAB" \
  '    status: pedido.status ?? null,' \
  '    status: null,'

mutar "los conteos del chip se calculan sobre lo YA filtrado" "$TAB" \
  '  const countsTipo = contarComprobantes(pedidos.map((p) => datosNumeros(p, esFilaOrders(p))));' \
  '  const countsTipo = contarComprobantes([]);'

mutar "los conteos se quedan en cero (el número no dice nada)" "$REGLA" \
  '  for (const f of filas) out[tipoComprobante(f)] += 1;' \
  '  '

mutar "los conteos dejan afuera a los borradores" "$REGLA" \
  '  for (const f of filas) out[tipoComprobante(f)] += 1;' \
  '  for (const f of filas) if (!esBorrador(f)) out[tipoComprobante(f)] += 1;'

# ── 5 · LA PANTALLA ─────────────────────────────────────────────────────────

mutar "la pantalla no dibuja el filtro por tipo" "$TAB" \
  '      <div data-medir="filtro-tipo-comprobante" className="flex flex-wrap gap-2 mb-4">' \
  '      <div data-medir="filtro-tipo-comprobante" className="hidden">'

mutar "🔴 el filtro por tipo se ignora al filtrar" "$TAB" \
  '    if (!pasaFiltroComprobante(datosNumeros(p, esFilaOrders(p)), tipoFilter)) return false;' \
  ''

mutar "el filtro por tipo pisa al de ORIGEN (Todos · Del link · Míos)" "$TAB" \
  '    if (origenFilter !== "todos" && p.origen !== origenFilter) return false;' \
  ''

mutar "🔴 la tabla gana una columna (ensancha el iPad acostado)" "$TAB" \
  '                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>' \
  '                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Tipo</th>'

mutar "🩸 el vacío vuelve a mirar el filtro (diría «ninguno coincide» con 0 filas)" "$TAB" \
  '            {pedidos.length === 0 ? VACIO_SIN_COMPROBANTES : VACIO_NINGUNO_COINCIDE}' \
  '            {VACIO_NINGUNO_COINCIDE}'

mutar "el vacío se escribe a mano en la pantalla" "$TAB" \
  '            {pedidos.length === 0 ? VACIO_SIN_COMPROBANTES : VACIO_NINGUNO_COINCIDE}' \
  '            {pedidos.length === 0 ? "No hay pedidos aún" : "Ningún pedido coincide"}'

echo
echo "═══ RESULTADO: $ok cazadas · $fallo sin cazar ═══"
[ "$fallo" -eq 0 ]

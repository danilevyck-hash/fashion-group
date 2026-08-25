#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «Comprobantes»: el nombre, el filtro por tipo, el
# botón de un toque por rol, y los cuatro textos podados.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
#   bash scripts/_mutar-candados-comprobantes.sh
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
DESTINO=src/lib/catalogo/destino-comprobantes.ts
SHELL_ADMIN='src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx'
TAB='src/app/catalogos/admin/[marca]/PedidosTab.tsx'
CONF=src/components/catalogo/ConfirmacionClient.tsx
TEMA=src/lib/catalogo/marcas-ui.tsx
CHECKOUT=src/components/catalogo/CheckoutClient.tsx
DETALLE=src/components/catalogo/PedidoDetalleClient.tsx
FILTROS=src/components/catalogo/CatalogoFilters.tsx

CANDADOS=(
  src/__tests__/lib/comprobantes-nombre-y-tipo.test.ts
  src/__tests__/components/comprobantes-panel.test.tsx
  src/__tests__/components/pedidos-numeros-en-la-lista.test.tsx
  src/__tests__/lib/poda-textos-cxc-multifashion.test.ts
  src/__tests__/components/pedido-un-toque.test.tsx
  src/__tests__/lib/numeros-pedido.test.ts
  src/__tests__/lib/catalogo-roles.test.ts
  src/__tests__/api/catalogo-vendedor-switch.test.ts
)

ARCHIVOS=("$REGLA" "$DESTINO" "$SHELL_ADMIN" "$TAB" "$CONF" "$TEMA" "$CHECKOUT" "$DETALLE" "$FILTROS")
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
    printf '  ⚠️  %-66s NO SE PUDO APLICAR (patrón muerto)\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  # 🔴 EL ARCHIVO TIENE QUE HABER CAMBIADO DE VERDAD.
  if cmp -s "$archivo" "$RESPALDO/$archivo"; then
    printf '  ⚠️  %-66s EL ARCHIVO NO CAMBIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  # ⚠️ Se exige encontrar el resumen de vitest: si la corrida MUERE, "0 fallos"
  # se leería como "sobrevivió" y el veredicto mentiría en verde.
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    printf '  ⚠️  %-66s LA CORRIDA MURIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  ✅ %-66s cazada\n' "$nombre"; ok=$((ok+1))
  else
    printf '  🔴 %-66s SOBREVIVIÓ (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── 1 · EL NOMBRE DEL CONTENEDOR, Y LA LLAVE QUE NO PUEDE CAMBIAR ────────────

mutar "la pestaña vuelve a llamarse «Pedidos»" "$REGLA" \
  'export const PANEL_COMPROBANTES = "Comprobantes";' \
  'export const PANEL_COMPROBANTES = "Pedidos";'

mutar "🔴 la KEY de la pestaña cambia (rompe ?tab=pedidos guardado)" "$REGLA" \
  'export const TAB_COMPROBANTES_KEY = "pedidos";' \
  'export const TAB_COMPROBANTES_KEY = "comprobantes";'

mutar "el shell escribe el label a mano en vez de usar la constante" "$SHELL_ADMIN" \
  '    { key: TAB_COMPROBANTES_KEY, label: PANEL_COMPROBANTES },' \
  '    { key: "pedidos", label: "Comprobantes" },'

mutar "el shell deja de dibujar la pestaña del panel" "$SHELL_ADMIN" \
  '    { key: TAB_COMPROBANTES_KEY, label: PANEL_COMPROBANTES },' \
  ''

mutar "el vacío vuelve a hablar de pedidos" "$REGLA" \
  'export const VACIO_SIN_COMPROBANTES = "No hay comprobantes aún";' \
  'export const VACIO_SIN_COMPROBANTES = "No hay pedidos aún";'

mutar "el vacío del filtro vuelve a hablar de pedidos" "$REGLA" \
  'export const VACIO_NINGUNO_COINCIDE = "Ningún comprobante coincide";' \
  'export const VACIO_NINGUNO_COINCIDE = "Ningún pedido coincide";'

# ── 2-4 · EL FILTRO POR TIPO SE MUDÓ ────────────────────────────────────────
#
# Las mutaciones de `tipoComprobante`, de los chips y de sus conteos viven desde
# el 25-ago-2026 en `scripts/_mutar-candados-borradores.sh`: los tres chips
# (Pedidos · Cotizaciones · Borradores) cambiaron de criterio y de cantidad, y
# dejarlas acá con los patrones viejos sería un verificador que denuncia
# "patrón muerto" en cada corrida. Este archivo se queda con el NOMBRE del
# contenedor, el botón de un toque por rol y los textos podados.
#
# ── 5 · EL BOTÓN DE UN TOQUE, Y EL ROL ───────────────────────────────────────

mutar "🔴 el VENDEDOR sale apuntado al admin de catálogos (403 seguro)" "$DESTINO" \
  '  const esAdmin = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));' \
  '  const esAdmin = true;'

mutar "🔴 el ADMIN pierde el panel (todos van a la lista del vendedor)" "$DESTINO" \
  '  const esAdmin = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));' \
  '  const esAdmin = false;'

mutar "los roles se invierten (vendedor al admin, admin al vendedor)" "$DESTINO" \
  '  const esAdmin = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));' \
  '  const esAdmin = !(CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));'

mutar "el rótulo y la dirección se separan (dice pedidos, lleva a comprobantes)" "$DESTINO" \
  '        label: BOTON_COMPROBANTES,' \
  '        label: BOTON_PEDIDOS,'

mutar "el destino pierde el ?tab=pedidos (cae en «Faltan foto»)" "$DESTINO" \
  '        href: `${rutas.adminHref}?tab=${TAB_COMPROBANTES_KEY}`,' \
  '        href: rutas.adminHref,'

mutar "la confirmación pierde el botón de la lista" "$CONF" \
  '              href={destino.href}' \
  '              href={destino.href}
              hidden'

mutar "la confirmación escribe la dirección a mano" "$CONF" \
  '              href={destino.href}' \
  '              href={`/catalogos/admin/reebok?tab=pedidos`}'

mutar "la confirmación deja de leer el rol (todos como vendedor)" "$CONF" \
  '  useEffect(() => { setRole(sessionStorage.getItem("cxc_role") || ""); }, []);' \
  '  useEffect(() => {}, []);'

mutar "el adminHref de una marca apunta a otra" "$TEMA" \
  '  adminHref: "/catalogos/admin/tommy",' \
  '  adminHref: "/catalogos/admin/reebok",'

# ── 6 · LOS CUATRO TEXTOS PODADOS NO VUELVEN ─────────────────────────────────

mutar "vuelve «La venta se le acredita…» al checkout" "$CHECKOUT" \
  '                {/* Se podó "La venta se le acredita a esta persona."' \
  '                <div>La venta se le acredita a esta persona.</div>
                {/* Se podó "La venta se le acredita a esta persona."'

mutar "vuelve «La venta se le acredita…» al detalle" "$DETALLE" \
  '              {/* Se podó "La venta se le acredita a esta persona."' \
  '              <div>La venta se le acredita a esta persona.</div>
              {/* Se podó "La venta se le acredita a esta persona."'

mutar "vuelve «Se crea de verdad en Switch…»" "$DETALLE" \
  '                {/* Se podó "Se crea de verdad en Switch' \
  '                <p>Se crea de verdad en Switch ({theme.empresaKey}).</p>
                {/* Se podó "Se crea de verdad en Switch'

mutar "vuelve el párrafo del modal de ocultar" "$DETALLE" \
  '          ? `En Switch como #${switchEnvio?.numero_interno || switchEnvio?.pedido_switch_id || "?"}.`' \
  '          ? `El pedido sigue en Switch como #${switchEnvio?.numero_interno || switchEnvio?.pedido_switch_id || "?"} — aquí solo se oculta de la lista. Para anularlo de verdad, hazlo en el panel de Switch.`'

mutar "vuelve el instructivo del filtro de precio" "$FILTROS" \
  '      {/* Se podó "Escribe un precio y ves solo ese.' \
  '      <p className={suave}>Escribe un precio y ves solo ese. El «hasta» se llena solo.</p>
      {/* Se podó "Escribe un precio y ves solo ese.'

# ── 7 · LO QUE **SE QUEDA** NO SE PUEDE PODAR DE REBOTE ──────────────────────

mutar "🔴 se borra el aviso ANTI-DUPLICADO (el que frena de verdad)" "$DETALLE" \
  '                      Este pedido reemplaza al {pedidoOriginal.order_number}. Borra el pedido #{pedidoOriginal.switch_numero} en el panel de Switch para no duplicar.' \
  '                      Este pedido reemplaza al {pedidoOriginal.order_number}.'

mutar "🔴 se borra el aviso de «sin vendedor de Switch asignado»" "$CHECKOUT" \
  '                No tienes vendedor de Switch asignado' \
  '                Elige un vendedor'

echo
echo "═══ RESULTADO: $ok cazadas · $fallo sin cazar ═══"
[ "$fallo" -eq 0 ]

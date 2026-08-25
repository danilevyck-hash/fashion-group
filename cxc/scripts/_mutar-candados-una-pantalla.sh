#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — UNA SOLA PANTALLA DE COMPROBANTES (25-ago-2026)
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
#   bash scripts/_mutar-candados-una-pantalla.sh
#
# 🩸 Los tres defectos ya pagados en este repo, y cómo se evitan acá:
#   1. La restauración va por COPIA, NUNCA por `git checkout`: hay archivos
#      NUEVOS (sin versionar) en la rama y git aborta el comando ENTERO sin
#      restaurar nada — las mutaciones se apilan y ninguna se prueba por
#      separado. Un verificador que miente en verde es peor que no tenerlo.
#   2. Una mutación cuyo patrón NO matchea se DENUNCIA («patrón muerto») en vez
#      de darse por cazada: el archivo queda SANO, los tests pasan, y contarla
#      sería inventar una verificación que nunca ocurrió.
#   3. NO HAY DELIMITADOR. Los textos viajan como ARGUMENTOS a python (argv), no
#      dentro de un `s|de|a|` de sed: el código real tiene `||`, `/` y `#`, y
#      cualquiera de esos delimitadores se des-escapa, se come el archivo y deja
#      un "SOBREVIVIÓ" falso. Sin delimitador no hay nada que escapar.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ORDERS='src/app/api/catalogo/[marca]/orders/route.ts'
PAGINA_ADMIN='src/app/catalogos/admin/[marca]/page.tsx'
SHELL_ADMIN='src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx'
PANEL=src/components/catalogo/ComprobantesPanel.tsx
PANTALLA=src/components/catalogo/PedidosListClient.tsx
ADAPTADOR=src/lib/catalogo/fila-comprobante.ts
REGLA=src/lib/catalogo/numeros-pedido.ts
DESTINO=src/lib/catalogo/destino-comprobantes.ts
DETALLE='src/app/api/catalogo/[marca]/orders/[id]/route.ts'

CANDADOS=(
  src/__tests__/lib/pedidos-una-sola-pantalla.test.ts
  src/__tests__/lib/comprobantes-nombre-y-tipo.test.ts
  src/__tests__/components/pedidos-chips-y-verdad-de-la-fila.test.tsx
  src/__tests__/components/pedidos-lista-del-link.test.tsx
  src/__tests__/components/comprobantes-panel.test.tsx
  src/__tests__/api/catalogo-paridad-orders.test.ts
  src/__tests__/lib/catalogo-roles.test.ts
)

ARCHIVOS=("$ORDERS" "$PAGINA_ADMIN" "$SHELL_ADMIN" "$PANEL" "$PANTALLA" "$ADAPTADOR" "$REGLA" "$DESTINO" "$DETALLE")
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
  if cmp -s "$archivo" "$RESPALDO/$archivo"; then
    printf '  ⚠️  %-70s EL ARCHIVO NO CAMBIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
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

# ── 1 · EL BUG DE LOS BORRADOS (el que Daniel aprobó arreglar) ───────────────

mutar "🔴 vuelve el quirk: la lista deja de filtrar los borrados" "$ORDERS" \
  '      .eq("deleted", false)
' \
  ''

mutar "🔴 el filtro de borrados vuelve a ser opcional por marca" "$ORDERS" \
  '      .eq("deleted", false)' \
  '      .eq(cfg.marca === "reebok" ? "id" : "deleted", cfg.marca === "reebok" ? undefined : false)'

# ── 2 · EL STATUS INVENTADO DEL PEDIDO DEL LINK ─────────────────────────────

mutar "🔴 al pedido del link se le vuelve a inventar status 'borrador'" "$ORDERS" \
  '    status: null,' \
  '    status: "borrador",'

# ── 3 · «ESTÁ EN SWITCH» SE VUELVE A DEDUCIR DEL NÚMERO ─────────────────────

mutar "🔴 un envío activo SIN número se lee como «no se ha mandado»" "$REGLA" \
  '  if (typeof p.enSwitch === "boolean") return p.enSwitch;' \
  '  '

mutar "el adaptador deja de traer en_switch" "$ADAPTADOR" \
  '    en_switch: o.en_switch === true,' \
  '    en_switch: false,'

# ── 4 · LA COTIZACIÓN VUELVE A LEERSE COMO PEDIDO (TOM-027) ─────────────────

mutar "🔴 el documento no viaja: una cotización se ve igual que un pedido" "$ORDERS" \
  '      switch_documento: enviosSwitch.get(idPedido)?.documento ?? null,' \
  '      switch_documento: null,'

mutar "el adaptador tira el documento" "$ADAPTADOR" \
  '    switch_documento: doc,' \
  '    switch_documento: null,'

# ── 5 · LA PANTALLA SE VUELVE A PARTIR EN DOS ───────────────────────────────

mutar "🔴 ?tab=pedidos deja de redirigir (marcador guardado roto)" "$PAGINA_ADMIN" \
  '  if (searchParams?.tab === TAB_COMPROBANTES_KEY) redirect(`/catalogo/${theme.marca}/pedidos`);' \
  '  '

mutar "🔴 el destino vuelve a mandar al admin (403 para el vendedor)" "$DESTINO" \
  '  return { href: rutas.pedidosHref, label: BOTON_COMPROBANTES, esPanelAdmin: false };' \
  '  return { href: `${rutas.adminHref}?tab=pedidos`, label: BOTON_COMPROBANTES, esPanelAdmin: true };'

mutar "la pantalla vuelve a pedirle datos al endpoint del admin" "$PANTALLA" \
  '`${theme.api}/orders`' \
  '`${theme.api}/pedidos-unificado`'

# ── 6 · UN ROL GANA ALGO QUE NO ES SUYO ─────────────────────────────────────

mutar "🔴 el vendedor GANA el borrado, el masivo y el Excel" "$PANTALLA" \
  '  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));' \
  '  const puedeAdministrar = true;'

mutar "🔴 el vendedor entra a VER la lista de otra marca por rol nuevo" "$ORDERS" \
  'const VIEW_ROLES = ["admin", "secretaria", "vendedor"];' \
  'const VIEW_ROLES = ["admin", "secretaria", "vendedor", "bodega"];'

mutar "🔴 borrar deja de ser de admin+secretaria en el SERVIDOR" "$DETALLE" \
  'const DELETE_ROLES = ["admin", "secretaria"];' \
  'const DELETE_ROLES = ["admin", "secretaria", "vendedor"];'

# ── 7 · EL PANEL PIERDE LO QUE LA UNIFICACIÓN LE TRAJO ──────────────────────

mutar "el vendedor pierde «Duplicar», que sí era suyo" "$PANEL" \
  '                      {isOrdersRow(pedido) && (' \
  '                      {false && ('

mutar "vuelve un cuarto chip «Todos» (una fila sin chip es invisible)" "$REGLA" \
  '  { clave: "pedido", label: "Pedidos" },' \
  '  { clave: "pedido", label: "Todos" },'

echo
echo "═══ VEREDICTO ═══"
echo "  cazadas: $ok    ·    problemas: $fallo"
[ "$fallo" -eq 0 ] && echo "  ✅ todas las mutaciones murieron" || echo "  🔴 revisar las de arriba"
exit 0

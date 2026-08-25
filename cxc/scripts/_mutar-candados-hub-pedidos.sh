#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «Pedidos» en la tarjeta del hub de marcas.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
#   bash scripts/_mutar-candados-hub-pedidos.sh
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
#      no dentro de un `s|de|a|` de sed ni de un perl: el código real tiene
#      `||`, `/`, `#` y `$`, y cualquiera de esos delimitadores se des-escapa,
#      se come el archivo y deja un "SOBREVIVIÓ" falso. Sin delimitador no hay
#      nada que escapar.
#
# LAS TRES QUE DANIEL PIDIÓ EXPLÍCITAMENTE ESTÁN, Y MARCADAS 🎯:
#   · que el botón APAREZCA para un rol que no debe (bodega),
#   · que DESAPAREZCA para uno que sí (vendedor),
#   · que LLEVE A LA RUTA VIEJA (`/catalogos/admin/<marca>?tab=pedidos`).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ROLES=src/lib/catalogo/roles.ts
HUB=src/app/catalogos/marcas/page.tsx
ORDERS='src/app/api/catalogo/[marca]/orders/route.ts'
TEMA=src/lib/catalogo/marcas-ui.tsx
CATALOGO=src/components/catalogo/CatalogoVendedorPage.tsx

CANDADOS=(
  src/__tests__/lib/hub-marcas-pedidos.test.tsx
  src/__tests__/lib/catalogo-roles.test.ts
  src/__tests__/lib/pedidos-una-sola-pantalla.test.ts
  src/__tests__/lib/catalogo-pedidos-junto-a-compartir.test.ts
)

ARCHIVOS=("$ROLES" "$HUB" "$ORDERS" "$TEMA" "$CATALOGO")
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

# ── 1 · 🎯 EL BOTÓN APARECE PARA QUIEN NO DEBE ───────────────────────────────
# Bodega ve el catálogo pero el feed de la lista le responde 403. Un botón para
# ella es mandarla a una pantalla en ceros — y, peor, es la forma en que se
# regala un permiso sin decidirlo.

mutar "🎯 bodega se cuela en COMPROBANTES_ROLES (gana el botón)" "$ROLES" \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor"] as const;' \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor", "bodega"] as const;'

mutar "🎯 el hub gatea con CATALOGO_ROLES (bodega ve el botón)" "$HUB" \
  '  const puedeVerPedidos = (COMPROBANTES_ROLES as readonly string[]).includes(role);' \
  '  const puedeVerPedidos = (catalogoRoles() as readonly string[]).includes(role);'

mutar "el botón se muestra SIEMPRE (sin gate de rol)" "$HUB" \
  '                    {puedeVerPedidos && (' \
  '                    {true && ('

mutar "🔴 el SERVIDOR le abre la lista a bodega (deriva entre capas)" "$ORDERS" \
  'const VIEW_ROLES = ["admin", "secretaria", "vendedor"];' \
  'const VIEW_ROLES = ["admin", "secretaria", "vendedor", "bodega"];'

# ── 2 · 🎯 EL BOTÓN DESAPARECE PARA QUIEN SÍ DEBE ────────────────────────────
# El vendedor es justamente quien más entra a ver lo que acaba de armar (#611).

mutar "🎯 el hub gatea «Pedidos» con CATALOGO_ADMIN_ROLES (vendedor lo pierde)" "$HUB" \
  '  const puedeVerPedidos = (COMPROBANTES_ROLES as readonly string[]).includes(role);' \
  '  const puedeVerPedidos = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);'

mutar "🎯 el vendedor sale de COMPROBANTES_ROLES" "$ROLES" \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor"] as const;' \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria"] as const;'

mutar "el botón se borra de la tarjeta (nadie lo ve)" "$HUB" \
  '                    {puedeVerPedidos && (' \
  '                    {false && ('

# ── 3 · 🎯 LLEVA A LA RUTA VIEJA ─────────────────────────────────────────────
# `/catalogos/admin/<marca>?tab=pedidos` todavía REDIRIGE (un marcador guardado
# no se rompe), pero apuntar ahí a un vendedor es el bug entero del #611: esa
# pantalla es de admin+secretaria y sus peticiones mueren en 403.

mutar "🎯 el botón apunta a la ruta VIEJA del panel de administrar" "$HUB" \
  '                        href={theme.pedidosHref}' \
  '                        href={`${b.adminHref}?tab=pedidos`}'

mutar "el destino se escribe a mano en vez de salir del tema" "$HUB" \
  '                        href={theme.pedidosHref}' \
  '                        href={`/catalogo/${b.key}/pedido`}'

mutar "el destino de UNA marca apunta a otra (Tommy → Reebok)" "$TEMA" \
  '  pedidosHref: "/catalogo/tommy/pedidos",' \
  '  pedidosHref: "/catalogo/reebok/pedidos",'

# ── 4 · «ADMINISTRAR» NO SE MUEVE DE REBOTE ──────────────────────────────────
# El botón nuevo no puede abrirle el panel de fotos a nadie, ni quitárselo a la
# secretaria.

mutar "🔴 «Administrar» se le abre al vendedor de rebote" "$HUB" \
  '  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);' \
  '  const puedeAdministrar = (COMPROBANTES_ROLES as readonly string[]).includes(role);'

mutar "🔴 la secretaria PIERDE «Administrar»" "$HUB" \
  '  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);' \
  '  const puedeAdministrar = role === "admin";'

# ── 5 · EL TAMAÑO TOCABLE Y EL TEXTO ─────────────────────────────────────────
# Un botón más en la tarjeta no puede entrar por debajo del mínimo de la casa.

mutar "el botón pierde el blanco tocable de 44 px" "$HUB" \
  '                        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                      >
                        Pedidos' \
  '                        className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                      >
                        Pedidos'

mutar "la fila deja de poder bajar de línea (se aplasta en 390 px)" "$HUB" \
  '                  <div className="mt-5 flex flex-wrap gap-2.5">' \
  '                  <div className="mt-5 flex gap-2.5">'

# ── 6 · EL GATE HERMANO DEL CATÁLOGO NO SE DESALINEA ─────────────────────────
# El botón «Pedidos» de adentro del catálogo usa el MISMO trío. Si una de las
# dos capas se mueve sola, hay dos verdades sobre quién ve la lista.

mutar "🔴 el catálogo le saca «Pedidos» al vendedor (dos verdades)" "$CATALOGO" \
  'role === "admin" || role === "vendedor" || role === "secretaria"' \
  'role === "admin" || role === "secretaria"'

echo
echo "═══ RESULTADO: $ok cazadas · $fallo sin cazar ═══"
[ "$fallo" -eq 0 ]

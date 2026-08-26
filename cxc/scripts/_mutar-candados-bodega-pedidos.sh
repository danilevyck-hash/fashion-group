#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de "bodega entra a la lista, solo a mirar" CAZAN de verdad?
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest **y que haya corrido
# archivos**: si la corrida muere, o si el filtro no matchea ni un archivo, un
# "0 fallos" se leería como "sobrevivió" y un "0 tests" como verde. Un
# verificador que miente es peor que no tenerlo.
#
# 🩸 Y VA CON `bash`, NO CON `zsh`: en zsh una variable sin comillas NO se parte
# por espacios, así que `npx vitest run $TESTS` le pasaría UN argumento con los
# cuatro paths pegados, vitest no encontraría nada y todo saldría "no cazada".
# Ese bug ya dio falsos negativos en este repo. Por eso el shebang es bash y
# por eso `probar()` corta si vitest corrió 0 archivos.
#
#   bash scripts/_mutar-candados-bodega-pedidos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/api/bodega-ve-pedidos.test.ts \
src/__tests__/components/bodega-solo-mira-comprobantes.test.tsx \
src/__tests__/lib/hub-marcas-pedidos.test.tsx \
src/__tests__/lib/pedidos-una-sola-pantalla.test.ts \
src/__tests__/lib/catalogo-roles.test.ts"

ARCHIVOS=(
  "src/lib/catalogo/roles.ts"
  "src/app/api/catalogo/[marca]/orders/route.ts"
  "src/app/api/catalogo/[marca]/orders/[id]/route.ts"
  "src/app/api/catalogo/[marca]/orders/bulk-delete/route.ts"
  "src/app/api/catalogo/[marca]/pedidos-export/route.ts"
  "src/lib/catalogo/enviar-switch-route.ts"
  "src/components/catalogo/ComprobantesPanel.tsx"
  "src/components/catalogo/PedidosListClient.tsx"
  "src/components/catalogo/CatalogoVendedorPage.tsx"
  "src/app/catalogos/marcas/page.tsx"
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
  local salida fallos archivos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  # 🩸 0 archivos = el filtro no matcheó nada: NO es "sobrevivió", es que no se
  # probó. Se corta la corrida entera para no reportar un número inventado.
  archivos="$(grep -oE "Test Files.*" <<<"$salida" | head -1)"
  if grep -qE "No test files found" <<<"$salida" || [ -z "$archivos" ]; then
    echo "  🛑 VITEST CORRIÓ 0 ARCHIVOS — el filtro no matchea. Abortando."
    echo "$archivos"
    exit 2
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

echo "── mutando ──────────────────────────────────────────────────────────────"

# ── Lo que bodega GANÓ: si se lo quitan, rojo ────────────────────────────────

mutar src/lib/catalogo/roles.ts \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor", "bodega"] as const;' \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor"] as const;' \
  "bodega PIERDE el acceso de lectura (vuelve el 403 del #614)"

mutar "src/app/api/catalogo/[marca]/orders/route.ts" \
  'const VIEW_ROLES = comprobantesRoles();' \
  'const VIEW_ROLES = ["admin", "secretaria", "vendedor"];' \
  "la ruta vuelve a tener su copia a mano, sin bodega"

mutar src/components/catalogo/CatalogoVendedorPage.tsx \
  'const puedeVerPedidos = (COMPROBANTES_ROLES as readonly string[]).includes(role);' \
  'const puedeVerPedidos = role === "admin" || role === "vendedor" || role === "secretaria";' \
  "el botón «Pedidos» del catálogo vuelve a los `role ===` a mano"

mutar src/app/catalogos/marcas/page.tsx \
  'const puedeVerPedidos = (COMPROBANTES_ROLES as readonly string[]).includes(role);' \
  'const puedeVerPedidos = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);' \
  "el botón «Pedidos» de la tarjeta deja de dibujarse para bodega"

# ── Lo que bodega NO puede: si se lo abren, rojo ─────────────────────────────

mutar "src/app/api/catalogo/[marca]/orders/[id]/route.ts" \
  'const DELETE_ROLES = ["admin", "secretaria"];' \
  'const DELETE_ROLES = ["admin", "secretaria", "bodega"];' \
  "bodega puede BORRAR un pedido"

mutar "src/app/api/catalogo/[marca]/orders/bulk-delete/route.ts" \
  'requireRole(req, ["admin", "secretaria"]);' \
  'requireRole(req, ["admin", "secretaria", "bodega"]);' \
  "bodega puede BORRAR EN MASA"

mutar "src/app/api/catalogo/[marca]/pedidos-export/route.ts" \
  'requireRole(req, ["admin", "secretaria"]);' \
  'requireRole(req, ["admin", "secretaria", "bodega"]);' \
  "bodega puede EXPORTAR a Excel"

mutar src/lib/catalogo/enviar-switch-route.ts \
  'const SEND_ROLES = ["admin", "secretaria", "vendedor"];' \
  'const SEND_ROLES = ["admin", "secretaria", "vendedor", "bodega"];' \
  "bodega puede MANDAR A SWITCH"

mutar "src/app/api/catalogo/[marca]/orders/[id]/route.ts" \
  'const EDIT_ROLES = ["admin", "secretaria", "vendedor"];' \
  'const EDIT_ROLES = ["admin", "secretaria", "vendedor", "bodega"];' \
  "bodega puede EDITAR un pedido"

mutar src/lib/catalogo/roles.ts \
  'export const CATALOGO_ADMIN_ROLES = ["admin", "secretaria"] as const;' \
  'export const CATALOGO_ADMIN_ROLES = ["admin", "secretaria", "bodega"] as const;' \
  "bodega entra a ADMINISTRAR la marca (/catalogos/admin/**)"

mutar src/lib/catalogo/roles.ts \
  'export const COMPROBANTES_EDITAR_ROLES = ["admin", "secretaria", "vendedor"] as const;' \
  'export const COMPROBANTES_EDITAR_ROLES = ["admin", "secretaria", "vendedor", "bodega"] as const;' \
  "a bodega se le vuelven a ofrecer «Editar» y «Duplicar» (botones muertos)"

# ── La pantalla: lo que le promete a bodega ──────────────────────────────────

mutar src/components/catalogo/ComprobantesPanel.tsx \
  '                          : puedeEditar ? "Editar" : "Ver"}' \
  '                          : "Editar"}' \
  "la fila le dice «Editar» a quien no puede editar"

mutar src/components/catalogo/ComprobantesPanel.tsx \
  '                      {puedeEditar && isOrdersRow(pedido) && (' \
  '                      {isOrdersRow(pedido) && (' \
  "vuelve «Duplicar» para bodega (POST /orders → 403)"

mutar src/components/catalogo/ComprobantesPanel.tsx \
  '    } else if (puedeEditar) {
      handleEditLink(p);
    } else {
      router.push(`${theme.pedidoPublicoBase}/${p.id_natural}`);
    }' \
  '    } else {
      handleEditLink(p);
    }' \
  "la fila del LINK vuelve a llamar a `convertir` (403 para bodega)"

mutar src/components/catalogo/PedidosListClient.tsx \
  'const puedeEditar = (COMPROBANTES_EDITAR_ROLES as readonly string[]).includes(String(role ?? ""));' \
  'const puedeEditar = true;' \
  "la pantalla le da permiso de editar a todo el mundo"

mutar src/components/catalogo/PedidosListClient.tsx \
  'const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));' \
  'const puedeAdministrar = true;' \
  "la pantalla le ofrece a bodega borrar/exportar (mueren en 403)"

echo "─────────────────────────────────────────────────────────────────────────"
echo "cazadas: $cazadas · sobrevivientes: $sobrevivientes"
[ "$sobrevivientes" -eq 0 ] || exit 1

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «catálogo para David» (27-ago-2026)
#
# Rompe el producto a propósito, una cosa por vez, y exige que los candados se
# pongan ROJOS. Un candado que no caza su mutación no es un candado.
#
# 🩸 TRES COSAS QUE ESTE REPO YA PAGÓ Y ACÁ NO SE REPITEN:
#   · restaura por COPIA, no con `git checkout` — hay archivos NUEVOS en la
#     rama y git aborta el comando ENTERO sin restaurar nada, así que las
#     mutaciones se apilarían y ninguna se probaría por separado;
#   · el reemplazo es LITERAL con python (no `perl -0pi -e 's|…|…|'`: el `||`
#     del código real des-escapa el delimitador y se come el archivo);
#   · `probar()` EXIGE que vitest haya colectado tests — si la corrida muere,
#     "0 fallos" se leería como "SOBREVIVIÓ".
#
# Y trae una MUTACIÓN DE CONTROL que a propósito no matchea: si no sale ⛔, el
# denunciador está roto y todos los ✅ valen lo mismo que un barrido vacío.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/catalogo/roles.ts"
  "src/lib/modules.ts"
  "src/app/home/page.tsx"
  "src/components/catalogo/CatalogoAuthGuard.tsx"
  "src/lib/boston/rol.ts"
)
TESTS=(
  "src/__tests__/api/boston-ve-catalogo.test.ts"
  "src/__tests__/lib/boston-acceso.test.ts"
  "src/__tests__/lib/catalogo-roles.test.ts"
  "src/__tests__/lib/hub-marcas-pedidos.test.tsx"
  "src/__tests__/lib/comprobantes-nombre-y-tipo.test.ts"
  "src/__tests__/lib/saldos-banco-modulo.test.ts"
  "src/__tests__/api/boston-david-sin-contrasena.test.ts"
  "src/__tests__/lib/pedidos-una-sola-pantalla.test.ts"
  "src/__tests__/components/catalogo-guard-modulo-prestado.test.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT INT TERM PIPE

CAZADAS=0; SOBREVIVIENTES=0; MUERTAS=0

probar() {
  local salida
  salida="$(npx vitest run "${TESTS[@]}" --reporter=dot 2>&1)"
  # Un cero solo vale si vitest COLECTÓ tests.
  if ! grep -qE "Test Files +[0-9]" <<<"$salida"; then
    echo "CORRIDA_MUERTA"; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then echo "ROJO"; else echo "VERDE"; fi
}

mutar() {
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4"
  restaurar
  if ! python3 scripts/_mutar-aplicar-boston-catalogo.py "$archivo" "$viejo" "$nuevo" 2>/dev/null; then
    echo "⛔ PATRÓN MUERTO — $nombre (no mutó nada: el ✅ sería falso)"
    MUERTAS=$((MUERTAS + 1)); restaurar; return
  fi
  local r; r="$(probar)"
  case "$r" in
    ROJO)          echo "✅ cazada — $nombre"; CAZADAS=$((CAZADAS + 1)) ;;
    CORRIDA_MUERTA) echo "⛔ CORRIDA MUERTA — $nombre (vitest no colectó nada)"; MUERTAS=$((MUERTAS + 1)) ;;
    *)             echo "🔴 SOBREVIVIÓ — $nombre"; SOBREVIVIENTES=$((SOBREVIVIENTES + 1)) ;;
  esac
  restaurar
}

echo "── VERIFICACIÓN POR MUTACIÓN: catálogo para David ──"

# ── 1. La lista de VER ───────────────────────────────────────────────────────
mutar "David pierde el catálogo (se sale de CATALOGO_ROLES)" \
  "src/lib/catalogo/roles.ts" \
  'export const CATALOGO_ROLES = ["admin", "secretaria", "vendedor", "bodega", ROL_BOSTON] as const;' \
  'export const CATALOGO_ROLES = ["admin", "secretaria", "vendedor", "bodega"] as const;'

mutar "🔴 David gana ADMINISTRAR el catálogo" \
  "src/lib/catalogo/roles.ts" \
  'export const CATALOGO_ADMIN_ROLES = ["admin", "secretaria"] as const;' \
  'export const CATALOGO_ADMIN_ROLES = ["admin", "secretaria", ROL_BOSTON] as const;'

mutar "🔴 David gana la LISTA DE COMPROBANTES (cliente y monto del grupo)" \
  "src/lib/catalogo/roles.ts" \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor", "bodega"] as const;' \
  'export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor", "bodega", ROL_BOSTON] as const;'

mutar "🔴 David gana TRABAJAR el comprobante (editar/duplicar)" \
  "src/lib/catalogo/roles.ts" \
  'export const COMPROBANTES_EDITAR_ROLES = ["admin", "secretaria", "vendedor"] as const;' \
  'export const COMPROBANTES_EDITAR_ROLES = ["admin", "secretaria", "vendedor", ROL_BOSTON] as const;'

# ── 2. El módulo y su ficha ──────────────────────────────────────────────────
mutar "la ficha del módulo escribe su propia lista (copia a mano)" \
  "src/lib/modules.ts" \
  'roles: catalogoRoles(),                               group: "ventas-clientes" },' \
  'roles: ["admin", "secretaria", "vendedor", "bodega"], group: "ventas-clientes" },'

mutar "🔴 la ficha se le abre a TODOS los roles" \
  "src/lib/modules.ts" \
  'roles: catalogoRoles(),                               group: "ventas-clientes" },' \
  'roles: [...catalogoRoles(), "contabilidad", "gerente_acs"], group: "ventas-clientes" },'

# ── 3. El aterrizaje (fuga nº 2) ─────────────────────────────────────────────
mutar "🔴 David pierde su CASA y cae en el Inicio del GRUPO" \
  "src/lib/modules.ts" \
  'export const MODULO_CASA_POR_ROL: Record<string, string> = {
  [ROL_BOSTON]: MODULO_BOSTON,
};' \
  'export const MODULO_CASA_POR_ROL: Record<string, string> = {};'

mutar "🔴 /home deja de aterrizar al rol con casa" \
  "src/app/home/page.tsx" \
  '    const casa = visible.find((m) => m.key === moduloCasaDeRol(role));
    if (casa) router.push(casa.href);' \
  '    const casa = visible.find((m) => m.key === moduloCasaDeRol(role));
    void casa;'

mutar "/home pierde el auto-redirect de módulo único" \
  "src/app/home/page.tsx" \
  '    if (visible.length === 1) {
      router.push(visible[0].href);
      return;
    }' \
  '    if (visible.length === 1) {
      return;
    }'

mutar "🔴 todos los roles caen en Boston (la casa se reparte)" \
  "src/lib/modules.ts" \
  'export function moduloCasaDeRol(role: string): string | null {
  return MODULO_CASA_POR_ROL[role] ?? null;
}' \
  'export function moduloCasaDeRol(role: string): string | null {
  void role;
  return MODULO_BOSTON;
}'

# ── 4. El permiso prestado (la app antes de la DDL) ──────────────────────────
mutar "se cae la herencia: sin la DDL, la ficha no se pinta" \
  "src/lib/modules.ts" \
  '  "catalogos": MODULO_BOSTON,
};' \
  '};'

mutar "la herencia deja de recortar por roles[] (se la presta a cualquiera)" \
  "src/lib/modules.ts" \
  '  return heredaDe ? fgModules.includes(heredaDe) && modulo.roles.includes(role) : false;' \
  '  return heredaDe ? fgModules.includes(heredaDe) : false;'

mutar "el guard del catálogo vuelve al includes a mano (rebota a David)" \
  "src/components/catalogo/CatalogoAuthGuard.tsx" \
  'if (Array.isArray(arr) && fgModulesDaAcceso(arr, "catalogos", role)) {' \
  'if (Array.isArray(arr) && arr.includes("catalogos")) {'

mutar "el guard del catálogo deja pasar a cualquiera" \
  "src/components/catalogo/CatalogoAuthGuard.tsx" \
  'if (Array.isArray(arr) && fgModulesDaAcceso(arr, "catalogos", role)) {' \
  'if (Array.isArray(arr)) {'

# ── 5. Boston, intacto ───────────────────────────────────────────────────────
mutar "🔴 Catálogos vuelve como PESTAÑA de /boston" \
  "src/lib/boston/rol.ts" \
  '  { key: "prestamos", label: "Préstamos" },
] as const;' \
  '  { key: "prestamos", label: "Préstamos" },
  { key: "catalogos", label: "Catálogos" },
] as const;'

mutar "🔴 el módulo Boston se le abre a otro rol" \
  "src/lib/boston/rol.ts" \
  'export const ROLES_MODULO_BOSTON = ["admin", ROL_BOSTON] as const;' \
  'export const ROLES_MODULO_BOSTON = ["admin", ROL_BOSTON, "vendedor"] as const;'

# ── CONTROL: a propósito NO matchea ──────────────────────────────────────────
mutar "CONTROL (no debe matchear — si sale ✅, el denunciador está roto)" \
  "src/lib/catalogo/roles.ts" \
  'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_ARCHIVO_DEL_REPO' \
  'tampoco-este'

echo
echo "── RESULTADO ──"
echo "cazadas: $CAZADAS · sobrevivientes: $SOBREVIVIENTES · patrones muertos/corridas muertas: $MUERTAS"
echo "(la de CONTROL tiene que contarse entre los patrones muertos: es 1 de ellos)"
[ "$SOBREVIVIENTES" -eq 0 ] && [ "$MUERTAS" -eq 1 ]

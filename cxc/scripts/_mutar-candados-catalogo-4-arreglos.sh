#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE LOS CUATRO ARREGLOS DE CATÁLOGOS CAZAN DE VERDAD? (6-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar) tienen que quedar VERDES: una ✅ ahí
# significaría que los candados fallan por otra razón y el resto no dice nada.
#
# Lo que este trabajo dejó puesto y no se puede volver a romper:
#   1. Al producto ESCONDIDO A MANO se le sigue preguntando la existencia…
#      …y sigue ESCONDIDO: preguntar el número nunca lo vuelve a mostrar.
#   2. El conjunto no se abrió de más: el apagado SIN el toggle no entra.
#   3. Sin la columna `oculto_manual`, todo queda como antes (tolerancia).
#   4. Calvin gana `foto_manual` con el MISMO default que las otras tres, por
#      una migración aditiva que no borra nada.
#   5. La pantalla de administrar comprueba el rol EN EL SERVIDOR, antes de
#      dibujar, con la lista derivada de `CATALOGO_ADMIN_ROLES`.
#   6. Las cuatro rutas retiradas no vuelven, ni por archivo ni por llamada.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: este trabajo trae
# archivos NUEVOS y BORRADOS, y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-catalogo-4-arreglos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/catalogo-escondidos-existencia-viva.test.ts \
src/__tests__/lib/catalogo-calvin-foto-manual.test.ts \
src/__tests__/lib/catalogo-admin-pantalla-cerrada.test.ts \
src/__tests__/lib/rutas-de-catalogo-retiradas.test.ts \
src/__tests__/catalogo-superficie.test.ts \
src/__tests__/lib/sync-respeta-foto-manual.test.ts \
src/__tests__/lib/catalogo-sin-escrituras-iguales.test.ts \
src/__tests__/lib/catalogo-roles.test.ts"

ARCHIVOS=(
  "src/lib/switch-api/sync-catalogo.ts"
  "src/lib/catalogo/roles.ts"
  "src/lib/catalogos/variantes-server.ts"
  "src/app/catalogos/admin/[marca]/page.tsx"
  "supabase/migrations/20261011120000_calvin_foto_manual.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
BORRAR_AL_RESTAURAR=(
  "src/app/api/catalogo/joybees/seed/route.ts"
  "src/app/api/catalogo/[marca]/pedidos-unificado/route.ts"
  "src/app/api/catalogo/reebok/stats/route.ts"
  "src/app/api/catalogo/reebok/inventory/bulk/route.ts"
  "src/lib/joybees-seed.ts"
)
restaurar() {
  for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done
  for f in "${BORRAR_AL_RESTAURAR[@]}"; do rm -f "$f"; rmdir -p "$(dirname "$f")" 2>/dev/null; done
}
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
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
viejo, nuevo = viejo.replace("\\n", "\n"), nuevo.replace("\\n", "\n")
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

revivir() { # $1 archivo a recrear, $2 contenido, $3 nombre
  restaurar
  mkdir -p "$(dirname "$1")"
  printf '%s\n' "$2" > "$1"
  probar "$3"
}

echo "── CONTROL 1 (sin mutar) ────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En el
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control_1=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. LA EXISTENCIA DEL ESCONDIDO NO SE CONGELA ─────────────────────────"

# 1.1 Se vuelve al conjunto de antes: el escondido queda fuera y su existencia
#     se congela otra vez (el bug original, 465 piezas contra 213 reales).
mutar "src/lib/switch-api/sync-catalogo.ts" \
  '          activeSkus.has(String(a.codigo)) ||\n          num(a.disponible) >= 1 ||\n          ocultosManualSkus.has(String(a.codigo)),' \
  '          activeSkus.has(String(a.codigo)) || num(a.disponible) >= 1,' \
  "el conjunto vuelve a ser «activo ∪ disponible≥1»: el escondido se congela"

# 1.2 El conjunto de escondidos nunca se llena.
mutar "src/lib/switch-api/sync-catalogo.ts" \
  '        if (p.oculto_manual === true) ocultosManualSkus.add(String(p.sku));' \
  '        void p.oculto_manual;' \
  "el conjunto de escondidos se queda vacío"

# 1.3 🔴 Preguntar la existencia lo VUELVE A MOSTRAR — lo que este cambio no
#     puede hacer nunca.
mutar "src/lib/switch-api/sync-catalogo.ts" \
  '            ocultoManual: p.oculto_manual,' \
  '            ocultoManual: false,' \
  "🔴 el escondido se vuelve a MOSTRAR al actualizarle la existencia"

# 1.4 Otra forma de lo mismo: `active` deja de salir de la regla de visibilidad.
mutar "src/lib/switch-api/sync-catalogo.ts" \
  '            active: shouldShow,' \
  '            active: existencia >= 1,' \
  "🔴 la visibilidad la decide la existencia y no la regla de la casa"

# 1.5 El conjunto se abre a TODO: el apagado sin toggle también entraría (una
#     corrida el doble de larga por nada).
mutar "src/lib/switch-api/sync-catalogo.ts" \
  '          ocultosManualSkus.has(String(a.codigo)),' \
  '          true,' \
  "el conjunto se abre a TODO el universo de Switch"

# 1.6 Se pierde la tolerancia: sin la columna, `undefined` entraría igual.
mutar "src/lib/switch-api/sync-catalogo.ts" \
  '        if (p.oculto_manual === true) ocultosManualSkus.add(String(p.sku));' \
  '        if (p.oculto_manual !== true) ocultosManualSkus.add(String(p.sku));' \
  "sin la columna, el conjunto se llena al revés"

# 1.7 La existencia deja de escribirse aunque se haya preguntado.
mutar "src/lib/switch-api/sync-catalogo.ts" \
  '            ...config.stockFields(existencia, disponibilidad),\n            ...(config.articuloFields' \
  '            ...(config.articuloFields' \
  "se pregunta la existencia pero no se escribe"

echo "── 2. CALVIN Y EL CANDADO DE LA FOTO ────────────────────────────────────"

# 2.1 La migración deja a Calvin afuera (el estado de hoy).
mutar "supabase/migrations/20261011120000_calvin_foto_manual.sql" \
  'alter table calvin_products' \
  'alter table tommy_products' \
  "la migración vuelve a dejar a Calvin sin foto_manual"

# 2.2 El default se invierte: todas las fotos nacerían «elegidas a mano» y el
#     ZIP no volvería a asignar ninguna.
mutar "supabase/migrations/20261011120000_calvin_foto_manual.sql" \
  'default false;' \
  'default true;' \
  "la columna nace en true y el ZIP deja de asignar fotos"

# 2.3 La migración deja de ser aditiva.
mutar "supabase/migrations/20261011120000_calvin_foto_manual.sql" \
  'alter table calvin_products\n  add column if not exists foto_manual boolean not null default false;' \
  'alter table calvin_products\n  add column if not exists foto_manual boolean not null default false;\nupdate calvin_products set foto_manual = true;' \
  "la migración toca filas (deja de ser aditiva)"

# 2.4 Se pierde la tolerancia a la DDL pendiente: guardar una foto reventaría
#     en Calvin hasta que Daniel aplique la migración.
mutar "src/lib/catalogos/variantes-server.ts" \
  '  if (!conFlag.error.message.includes("foto_manual")) throw new Error(conFlag.error.message);' \
  '  throw new Error(conFlag.error.message);' \
  "guardar la foto revienta si la DDL no corrió"

# 2.5 `skusConFotoManual` deja de fallar abierto.
mutar "src/lib/catalogos/variantes-server.ts" \
  '  if (error) return new Set();' \
  '  if (error) throw new Error(error.message);' \
  "leer las fotos protegidas revienta sin la columna"

# 2.6 El candado deja de ser por marca y se clava en una tabla.
mutar "src/lib/catalogos/variantes-server.ts" \
  '    .from(cfg.productsTable)\n    .select("sku")' \
  '    .from("tommy_products")\n    .select("sku")' \
  "las fotos protegidas se leen siempre de la tabla de Tommy"

echo "── 3. LA PANTALLA DE ADMINISTRAR COMPRUEBA EL ROL ───────────────────────"

# 3.1 Se quita el guard: vuelve el hueco.
mutar "src/app/catalogos/admin/[marca]/page.tsx" \
  '  if (!puedeAdministrarCatalogo(role)) redirect("/home");' \
  '' \
  "🔴 la pantalla vuelve a no comprobar ningún rol"

# 3.2 El guard corre DESPUÉS de resolver la marca y montar el cliente.
mutar "src/app/catalogos/admin/[marca]/page.tsx" \
  '  if (!role) redirect("/");\n  if (!puedeAdministrarCatalogo(role)) redirect("/home");\n\n  const theme = getMarcaTheme(params.marca);\n  if (!theme) notFound();' \
  '  const theme = getMarcaTheme(params.marca);\n  if (!theme) notFound();\n  if (!role) redirect("/");\n  if (!puedeAdministrarCatalogo(role)) redirect("/home");' \
  "el guard corre después de resolver la marca"

# 3.3 La lista se escribe a mano en la página y se le cuela un rol de más.
mutar "src/app/catalogos/admin/[marca]/page.tsx" \
  '  if (!puedeAdministrarCatalogo(role)) redirect("/home");' \
  '  if (!["admin", "secretaria", "vendedor"].includes(role)) redirect("/home");' \
  "la lista se escribe a mano y entra el vendedor"

# 3.4 `puedeAdministrarCatalogo` deja de leer la lista única.
mutar "src/lib/catalogo/roles.ts" \
  '  return (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role ?? "");' \
  '  return ["admin", "secretaria", "bodega"].includes(role ?? "");' \
  "la función se hace su propia lista y entra bodega"

# 3.5 Sin sesión ya no se manda al login.
mutar "src/app/catalogos/admin/[marca]/page.tsx" \
  '  if (!role) redirect("/");' \
  '' \
  "sin sesión ya no se manda al login"

# 3.6 Administrar se sale de quien VE el catálogo.
mutar "src/lib/catalogo/roles.ts" \
  'export const CATALOGO_ADMIN_ROLES = ["admin", "secretaria"] as const;' \
  'export const CATALOGO_ADMIN_ROLES = ["admin", "contabilidad"] as const;' \
  "administrar deja de ser un subconjunto de quien ve el catálogo"

echo "── 4. LAS CUATRO RUTAS RETIRADAS NO VUELVEN ─────────────────────────────"

revivir "src/app/api/catalogo/joybees/seed/route.ts" \
  'export async function POST() { return new Response("{}"); }' \
  "🔴 vuelve POST /api/catalogo/joybees/seed"

revivir "src/app/api/catalogo/[marca]/pedidos-unificado/route.ts" \
  'export async function GET() { return new Response("[]"); }' \
  "vuelve GET /pedidos-unificado"

revivir "src/app/api/catalogo/reebok/stats/route.ts" \
  'export async function GET() { return new Response("{}"); }' \
  "vuelve GET /api/catalogo/reebok/stats"

revivir "src/app/api/catalogo/reebok/inventory/bulk/route.ts" \
  'export async function POST() { return new Response("{}"); }' \
  "vuelve POST /api/catalogo/reebok/inventory/bulk"

revivir "src/lib/joybees-seed.ts" \
  'export async function seedJoybeesProducts() { return { inserted: 0 }; }' \
  "vuelve la lista de productos escrita a mano de Joybees"

# 4.6 Alguien vuelve a llamar una ruta retirada desde una pantalla.
mutar "src/lib/catalogo/roles.ts" \
  'export const catalogoAdminRoles = (): string[] => [...CATALOGO_ADMIN_ROLES];' \
  'export const catalogoAdminRoles = (): string[] => [...CATALOGO_ADMIN_ROLES];\nexport const feedViejo = () => fetch("/api/catalogo/reebok/pedidos-unificado");' \
  "una pantalla vuelve a llamar a /pedidos-unificado"

echo "── CONTROL 2 (restaurado) ───────────────────────────────────────────────"
restaurar
cazadas_reales=$cazadas; sobrevivientes_reales=$sobrevivientes
cazadas=0; sobrevivientes=0
probar "CONTROL 2 — restaurado. Acá lo BUENO es el 🔴 (0 fallos)"
control_2=$cazadas

echo ""
echo "═════════════════════════════════════════════════════════════════════════"
echo "  MUTACIONES: $((cazadas_reales + sobrevivientes_reales))  ·  CAZADAS: $cazadas_reales  ·  SOBREVIVIENTES: $sobrevivientes_reales"
echo "  CONTROLES en verde: $(( (control_1 == 0 ? 1 : 0) + (control_2 == 0 ? 1 : 0) )) de 2"
echo "═════════════════════════════════════════════════════════════════════════"

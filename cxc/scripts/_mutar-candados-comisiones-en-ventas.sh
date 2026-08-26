#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de "Comisiones es pestaña de Ventas" CAZAN de verdad? Se rompe
# el código a propósito, UNA cosa por vez, y se exige que los tests se pongan
# ROJOS.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest **y** que haya corrido más
# de 0 archivos: si la corrida muere o no matchea ningún test, un "0 fallos" se
# leería como "la mutación sobrevivió"… o peor, como "cazada" sin haber medido
# nada. Un verificador que miente en verde es peor que no tenerlo.
#
# 🩸 Y VA CON `bash`, NO CON `zsh`: en zsh una variable sin comillas NO se parte
# por espacios, así que `npx vitest run $TESTS` le pasaría UN argumento con los
# cuatro archivos pegados, vitest no encontraría nada y las mutaciones darían
# "no cazada" en falso. Ese bug ya costó 6 falsos negativos.
#
#   bash scripts/_mutar-candados-comisiones-en-ventas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comisiones-en-ventas.test.tsx \
src/__tests__/lib/ventas-tab-referencia-fuera.test.ts \
src/__tests__/lib/ventas-vista-general-ipad.test.ts \
src/__tests__/lib/saldos-banco-modulo.test.ts"

ARCHIVOS=(
  "src/app/ventas/VentasShell.tsx"
  "src/app/ventas/page.tsx"
  "src/lib/modules.ts"
  "next.config.js"
  "src/app/api/ventas/comisiones/route.ts"
  "src/app/api/ventas/comisiones/consolidado/route.ts"
  "src/app/comisiones/ComisionesPageClient.tsx"
  "src/components/ventas/ComisionesView.tsx"
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
  # 🩸 0 archivos = no se probó NADA. No puede contarse como cazada ni como
  # sobreviviente: es una medición inválida y tiene que gritar.
  archivos="$(grep -oE "Test Files +[0-9]+ (passed|failed)" <<<"$salida" | grep -oE "[0-9]+" | head -1 || echo 0)"
  if [ "${archivos:-0}" -eq 0 ]; then
    echo "  ⚠️  VITEST CORRIÓ 0 ARCHIVOS — medición inválida: $1"
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
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  if [ $? -eq 3 ]; then sobrevivientes=$((sobrevivientes + 1)); return; fi
  probar "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# 1. La `key` del módulo cambia (rompe role_permissions y modulos_override).
mutar src/lib/modules.ts \
  '{ key: "comisiones",     label: "Comisiones",        href: "/comisiones",' \
  '{ key: "comisiones-v2",     label: "Comisiones",        href: "/comisiones",' \
  "la key del módulo pasa a comisiones-v2"

# 2. La ficha del menú se retira → la secretaria se queda sin puerta.
mutar src/lib/modules.ts \
  '{ key: "comisiones",     label: "Comisiones",        href: "/comisiones",       icon: Coins,         roles: ["admin", "secretaria"],                       group: "operacion" },' \
  '' \
  "se retira la ficha del menú (secretaria sin puerta)"

# 3. La ficha se queda pero apuntando a la pestaña → la secretaria cae en /home.
mutar src/lib/modules.ts \
  'href: "/comisiones",       icon: Coins,' \
  'href: "/ventas?tab=comisiones",       icon: Coins,' \
  "la ficha apunta a la pestaña (admin-only)"

# 4. /ventas se le abre a contabilidad → permiso NUEVO.
mutar src/lib/modules.ts \
  '{ key: "ventas",        label: "Ventas",             href: "/ventas",           icon: TrendingUp,       roles: ["admin"],' \
  '{ key: "ventas",        label: "Ventas",             href: "/ventas",           icon: TrendingUp,       roles: ["admin", "contabilidad"],' \
  "el módulo Ventas se le abre a contabilidad"

# 5. El guard SSR de /ventas se afloja → cualquiera con sesión entra a la pestaña.
mutar src/app/ventas/page.tsx \
  'if (role !== "admin") redirect("/home");' \
  'if (!["admin", "contabilidad"].includes(role)) redirect("/home");' \
  "el guard SSR de /ventas deja entrar a contabilidad"

# 6. La API se le abre a un rol que hoy recibe 403.
mutar src/app/api/ventas/comisiones/route.ts \
  'requireRole(req, ["admin", "contabilidad", "secretaria"])' \
  'requireRole(req, ["admin", "contabilidad", "secretaria", "vendedor"])' \
  "la API de comisiones se le abre al vendedor"

# 7. La API le CIERRA a un rol que hoy recibe 200 (nada se mueve, en las dos direcciones).
mutar src/app/api/ventas/comisiones/consolidado/route.ts \
  'requireRole(req, ["admin", "contabilidad", "secretaria"])' \
  'requireRole(req, ["admin", "secretaria"])' \
  "el consolidado le cierra a contabilidad (las dos rutas dejan de decir lo mismo)"

# 8. /comisiones empieza a redirigir a la pestaña → la secretaria a /home.
mutar next.config.js \
  '{ source: "/saldos-banco", destination: "/gastos-contabilidad?tab=saldos-banco", permanent: false },' \
  '{ source: "/saldos-banco", destination: "/gastos-contabilidad?tab=saldos-banco", permanent: false },
      { source: "/comisiones", destination: "/ventas?tab=comisiones", permanent: false },' \
  "/comisiones se redirige a la pestaña"

# 9. Se pierde la pestaña entera.
mutar src/app/ventas/VentasShell.tsx \
  '          <TabsTrigger value="comisiones" className={TAB_TRIGGER_CLASS}>' \
  '          <TabsTrigger value="comisiones-x" className={TAB_TRIGGER_CLASS}>' \
  "el trigger de la pestaña deja de coincidir con su contenido"

# 10. La pestaña se saca de TABS → ?tab=comisiones cae en Resumen sin avisar.
mutar src/app/ventas/VentasShell.tsx \
  'const TABS = ["resumen", "clientes", "productos", "utilidad", "comisiones"] as const;' \
  'const TABS = ["resumen", "clientes", "productos", "utilidad"] as const;' \
  "?tab=comisiones deja de ser válido y cae en Resumen"

# 11. 🔴 SE PIERDE UNO DE LOS DOS MODOS — lo que Daniel pidió explícito.
mutar src/components/ventas/ComisionesView.tsx \
  '{([["todas", "Todas las empresas"], ["empresa", "Por empresa"]] as [Mode, string][]).map(([m, label]) => (' \
  '{([["todas", "Todas las empresas"]] as [Mode, string][]).map(([m, label]) => (' \
  "se pierde el modo «Por empresa»"

# 12. Se pierde la vista consolidada («Todas las empresas»).
mutar src/components/ventas/ComisionesView.tsx \
  '        <ComisionesConsolidadoView year={year} mes={mes} onExcel={registrarExcel} refreshKey={refreshKey} />' \
  '        <ComisionesPorEmpresaView year={year} mes={mes} onExcel={registrarExcel} refreshKey={refreshKey} />' \
  "«Todas las empresas» dibuja la vista de una sola empresa"

# 13. La pestaña deja de reusar ComisionesView (una COPIA = dos totales posibles).
mutar src/app/ventas/VentasShell.tsx \
  '  () => import("@/components/ventas/ComisionesView").then((m) => m.ComisionesView),' \
  '  () => import("@/components/ventas/UtilidadView").then((m) => m.UtilidadView as never),' \
  "la pestaña monta otra vista en vez de ComisionesView"

# 14. El aviso de los COBROS se reemplaza por el de Ventas (otra familia).
mutar src/app/ventas/page.tsx \
  '    lineaDeRechazos({ familias: ["recibo"] }),' \
  '    lineaDeRechazos({ familias: ["factura"] }),' \
  "la pestaña recibe el aviso de otra familia"

# 15. La barra de arriba vuelve a dibujar SU selector de año sobre Comisiones.
mutar src/app/ventas/VentasShell.tsx \
  '          {tab !== "comisiones" && (' \
  '          {true && (' \
  "vuelven dos selectores de año en la misma pantalla"

# 16. Vuelve el Excel de la barra encima del Excel propio de Comisiones.
mutar src/app/ventas/VentasShell.tsx \
  'const TABS_CON_CONTROLES_PROPIOS = ["productos", "utilidad", "comisiones"] as const;' \
  'const TABS_CON_CONTROLES_PROPIOS = ["productos", "utilidad"] as const;' \
  "vuelven dos botones de Excel en la pestaña Comisiones"

# 17. La tira vuelve a arrastrarse: se deshace el ajuste medido de la 5ª pestaña.
mutar src/app/ventas/VentasShell.tsx \
  '"gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2 py-3 text-[13px] text-gray-500 sm:px-4 sm:text-sm' \
  '"gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2.5 py-3 text-gray-500 sm:px-4' \
  "la tira de 5 pestañas vuelve al tamaño de 4 (arrastra el iPhone)"

# 18. Los iconos vuelven en celular (100 px que nadie devuelve).
mutar src/app/ventas/VentasShell.tsx \
  '            <Coins className="hidden h-3.5 w-3.5 sm:block" /> Comisiones' \
  '            <Coins className="h-3.5 w-3.5" /> Comisiones' \
  "el icono de Comisiones vuelve a verse en el iPhone"

# 19. La tira vuelve a scrollear a lo ancho (se mueve el arrastre de lugar).
mutar src/app/ventas/VentasShell.tsx \
  '        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0' \
  '        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto' \
  "la tira vuelve a arrastrarse a lo ancho"

# 20. El gate de /comisiones se afloja (la otra puerta deja de ser la misma).
mutar src/app/comisiones/ComisionesPageClient.tsx \
  'allowedRoles: ["admin", "secretaria"]' \
  'allowedRoles: ["admin", "secretaria", "contabilidad"]' \
  "/comisiones se le abre a contabilidad"

# 21. La resta de descuentos se muda a la pantalla (dos totales posibles).
mutar src/app/api/ventas/comisiones/route.ts \
  "netearComisiones" \
  "noNetearComisiones" \
  "la ruta deja de netear en el servidor"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "CAZADAS: $cazadas   SOBREVIVIENTES: $sobrevivientes"
[ "$sobrevivientes" -eq 0 ]

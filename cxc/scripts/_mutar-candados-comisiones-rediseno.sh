#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del rediseño de Comisiones (6-sep-2026) CAZAN de verdad?
#
# Lo que cubren:
#   1. El descuento tiene fechas (desde ENERO 2026, sin «hasta»: indefinido).
#   2. La pantalla abre en el ÚLTIMO MES CERRADO, con el «hoy» de Panamá.
#   3. «Descuentos» se administra en Configuración (y se fue «Activo»).
#   4. Multi Fashion Holding sale del SQL: por CÓDIGO, con comodín de vendedor.
#   5. Multifashion se cierra a quien no tiene el módulo; su ranking de
#      vendedoras se ve desde Comisiones (espejo, no fusión).
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-comisiones-rediseno.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comisiones-descuentos-vigencia.test.ts \
src/__tests__/lib/comision-b2b-v9-por-codigo.test.ts \
src/__tests__/lib/comisiones-mes-cerrado-panama.test.ts \
src/__tests__/lib/multifashion-cerrado-y-espejo.test.ts \
src/__tests__/components/comisiones-configuracion-descuentos.test.tsx \
src/__tests__/lib/multifashion-metas.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

MIG_D="supabase/migrations/20261007120000_comision_descuentos_vigencia.sql"
MIG_V9="supabase/migrations/20261008120000_comision_b2b_v9_cliente_por_codigo.sql"

ARCHIVOS=(
  "$MIG_D"
  "$MIG_V9"
  "src/lib/comisiones/vigencia.ts"
  "src/lib/comisiones/descuentos.ts"
  "src/lib/comisiones/mes-inicial.ts"
  "src/lib/comisiones/vendedor-todos.ts"
  "src/lib/comisiones/alias.ts"
  "src/lib/comisiones/rpc.ts"
  "src/lib/multifashion/acceso.ts"
  "src/lib/multifashion/metas-permiso.ts"
  "src/app/multifashion/page.tsx"
  "src/app/api/multifashion/vendedoras/route.ts"
  "src/app/api/multifashion/overview/route.ts"
  "src/app/api/ventas/comisiones/config/route.ts"
  "src/app/api/ventas/comisiones/descuentos-fijos/route.ts"
  "src/components/ventas/ComisionesView.tsx"
  "src/components/ventas/ComisionesPeriodo.tsx"
  "src/components/ventas/comisiones-config/TasasPorVendedor.tsx"
  "src/components/ventas/comisiones-config/Descuentos.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

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

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
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
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ═══ 1. El descuento y su vigencia ═══════════════════════════════════════════

mutar "src/lib/comisiones/vigencia.ts" \
  "  if (desde !== null && k < desde) return false;" \
  "" \
  "vigencia: el «desde» deja de frenar (vuelve a restarse en enero)"

mutar "src/lib/comisiones/vigencia.ts" \
  "  if (hasta !== null && k > hasta) return false;" \
  "" \
  "vigencia: el «hasta» deja de frenar (nunca termina)"

mutar "src/lib/comisiones/vigencia.ts" \
  "  if (hasta !== null && k > hasta) return false;" \
  "  if (hasta !== null && k >= hasta) return false;" \
  "vigencia: el «hasta» corta EXCLUSIVE (se come el último mes)"

mutar "src/lib/comisiones/vigencia.ts" \
  "  if (desde !== null && k < desde) return false;" \
  "  if (desde !== null && k <= desde) return false;" \
  "vigencia: el «desde» se come su propio mes"

mutar "src/lib/comisiones/vigencia.ts" \
  "  const s = (iso ?? \"\").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return null;" \
  "  const s = (iso ?? \"\").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return 0;" \
  "vigencia: una fecha ilegible falla CERRADO (apaga el descuento en silencio)"

mutar "src/lib/comisiones/descuentos.ts" \
  "  const vigentes = (fijos ?? []).filter((f) =>
    descuentoVigente(f as { desde?: string | null; hasta?: string | null }, year, mes),
  );" \
  "  const vigentes = (fijos ?? []);" \
  "lectura: la vigencia no se aplica (el descuento vuelve a restarse siempre)"

mutar "src/lib/comisiones/descuentos.ts" \
  '    .select("*")' \
  '    .select("id, empresa_key, concepto, monto, vendedor_nombre")' \
  "lectura: pide columnas por nombre y «desde»/«hasta» nunca llegan"

mutar "$MIG_D" \
  "SET desde = DATE '2026-01-01', updated_at = now()" \
  "SET desde = DATE '2026-07-01', updated_at = now()" \
  "migración: el descuento arranca en julio y mueve seis meses de 2026"

mutar "$MIG_D" \
  "SET desde = DATE '2026-01-01', updated_at = now()" \
  "SET desde = DATE '2026-01-01', hasta = DATE '2026-12-01', updated_at = now()" \
  "migración: se le inventa un «hasta» a un descuento indefinido"

mutar "$MIG_D" \
  "      CHECK (desde IS NULL OR hasta IS NULL OR hasta >= desde);" \
  "      CHECK (true);" \
  "migración: se cae el CHECK de «Hasta» antes que «Desde»"

mutar "$MIG_D" \
  "  AND concepto IN ('Descuento', 'Descuento de adelanto');" \
  "  AND concepto IN ('Descuento');" \
  "migración: solo una de las dos filas recibe la fecha"

# ═══ 2. El mes de arranque y Panamá ══════════════════════════════════════════

mutar "src/lib/comisiones/mes-inicial.ts" \
  "  return mes === 1 ? { year: year - 1, mes: 12 } : { year, mes: mes - 1 };" \
  "  return { year, mes };" \
  "arranque: vuelve a abrir en el mes EN CURSO (el total negativo)"

mutar "src/lib/comisiones/mes-inicial.ts" \
  "  return mes === 1 ? { year: year - 1, mes: 12 } : { year, mes: mes - 1 };" \
  "  return { year, mes: mes - 1 };" \
  "arranque: enero no cruza el año (pide el mes 0)"

mutar "src/components/ventas/ComisionesView.tsx" \
  "  const inicial = periodoInicial(hoyPanama(), availableYears);" \
  "  const ahora = new Date();
  const inicial = { year: ahora.getFullYear(), mes: ahora.getMonth() + 1 };" \
  "shell: vuelve el reloj del NAVEGADOR"

mutar "src/components/ventas/ComisionesPeriodo.tsx" \
  "  const { year: currentYear, mes: currentMonth } = mesEnCurso(hoyPanama());" \
  "  const ahora = new Date();
  const currentYear = ahora.getFullYear();
  const currentMonth = ahora.getMonth() + 1;" \
  "período: los meses apagados vuelven al reloj del navegador"

# ═══ 3. Configuración: «Activo» y «Descuentos» ═══════════════════════════════

mutar "src/components/ventas/comisiones-config/TasasPorVendedor.tsx" \
  '                <th className="px-3.5 py-2 font-medium">Empresas</th>' \
  '                <th className="px-3.5 py-2 font-medium">Empresas</th>
                <th className="py-2 pl-3.5 text-right font-medium">Activo</th>' \
  "tasas: vuelve la columna «Activo»"

mutar "src/app/api/ventas/comisiones/config/route.ts" \
  '      .select("vendedor_nombre, tasa_venta, tasa_cobro")' \
  '      .select("vendedor_nombre, tasa_venta, tasa_cobro, activo")' \
  "config: el GET vuelve a leer la columna activo"

mutar "src/app/api/ventas/comisiones/config/route.ts" \
  "    tasa_venta: r.tasa_venta," \
  "    tasa_venta: r.tasa_venta,
    activo: true," \
  "config: el PUT vuelve a escribir la columna activo"

mutar "src/components/ventas/comisiones-config/Descuentos.tsx" \
  'export const ROTULO_DESCUENTOS = "Descuentos";' \
  'export const ROTULO_DESCUENTOS = "Descuentos fijos";' \
  "descuentos: en pantalla se dice «descuento fijo»"

mutar "src/components/ventas/comisiones-config/Descuentos.tsx" \
  '  return iso ? mesEnPalabras(iso) : "Sin fin";' \
  '  return mesEnPalabras(iso);' \
  "descuentos: el «Hasta» vacío vuelve a ser «—» (se lee como dato faltante)"

mutar "src/components/ventas/comisiones-config/Descuentos.tsx" \
  '            Hasta <span className="normal-case tracking-normal text-gray-400">(opcional)</span>' \
  '            Hasta' \
  "descuentos: el «Hasta» deja de decir que es opcional"

mutar "src/components/ventas/comisiones-config/Descuentos.tsx" \
  "    Number(borrador.monto) > 0 &&" \
  "    Number(borrador.monto) > 0 &&
    !!borrador.hasta &&" \
  "descuentos: se pide el «Hasta» para poder guardar"

mutar "src/components/ventas/comisiones-config/Descuentos.tsx" \
  "          desde: borrador.desde || null,
          hasta: borrador.hasta || null," \
  "" \
  "descuentos: el alta deja de mandar las fechas"

mutar "src/components/ventas/comisiones-config/Descuentos.tsx" \
  '            .filter((v) => sePagaComision(v) && !estaRetirado(v)),' \
  '            ,' \
  "descuentos: el desplegable vuelve a ofrecer a los retirados"

mutar "src/app/api/ventas/comisiones/descuentos-fijos/route.ts" \
  "    .update({ activo: false, updated_at: new Date().toISOString() })" \
  "    .delete()" \
  "descuentos: quitar pasa a ser un DELETE de verdad"

# ═══ 4. D-108 por código, con comodín ════════════════════════════════════════

mutar "src/lib/comisiones/vendedor-todos.ts" \
  'export const ROTULO_VENDEDOR_TODOS = "Todos los vendedores";' \
  'export const ROTULO_VENDEDOR_TODOS = "*";' \
  "comodin: en pantalla se veria el asterisco pelado"

mutar "src/lib/comisiones/alias.ts" \
  "  if (v === VENDEDOR_TODOS) return ROTULO_VENDEDOR_TODOS;" \
  "" \
  "comodín: el nombre en pantalla deja de traducirlo"

mutar "$MIG_V9" \
  "     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))" \
  "     AND ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)))" \
  "v9: se cae el comodín en VENTAS (D-108 vuelve a comisionar la venta)"

mutar "$MIG_V9" \
  "     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro)))" \
  "     AND ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro))" \
  "v9: se cae el comodín en COBROS"

mutar "$MIG_V9" \
  "SELECT e.k, 'D-108', '*', true, true, true, 'migracion-d108-por-codigo'" \
  "SELECT e.k, 'D-108', 'REYNALDO ESPINOSA', true, true, true, 'migracion-d108-por-codigo'" \
  "v9: D-108 se carga para UN vendedor en vez de para todos"

mutar "$MIG_V9" \
  "  ('active_wear'), ('active_shoes'), ('joystep')" \
  "  ('active_wear'), ('active_shoes')" \
  "v9: falta una de las seis empresas"

mutar "$MIG_V9" \
  "    AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')" \
  "    AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')" \
  "v9: vuelve el filtro por NOMBRE dentro del SQL"

mutar "src/lib/comisiones/rpc.ts" \
  'export const RPC_COMISION = "comision_b2b_v9";' \
  'export const RPC_COMISION = "comision_b2b_v8";' \
  "rpc: la cadena no estrena la v9"

# ═══ 5. Multifashion cerrado, y el espejo ════════════════════════════════════

mutar "src/app/multifashion/page.tsx" \
  '  if (!puedeAbrirMultifashion(role)) redirect("/home");' \
  "" \
  "página: /multifashion vuelve a no comprobar el rol"

mutar "src/app/multifashion/page.tsx" \
  '  const role = sessionRole((await cookies()).get("cxc_session")?.value);
  if (!role) redirect("/");
  if (!puedeAbrirMultifashion(role)) redirect("/home");

  const now = new Date();' \
  '  const now = new Date();' \
  "página: se va el guard entero"

mutar "src/lib/multifashion/acceso.ts" \
  '  ...(ALL_MODULES.find((m) => m.key === "multifashion")?.roles ?? ["admin"]),' \
  '  "admin", "gerente_acs", "secretaria",' \
  "acceso: la lista se escribe a mano y se le cuela secretaria"

mutar "src/lib/multifashion/acceso.ts" \
  "export const ROLES_VENDEDORAS_ESPEJO: string[] = [
  ...new Set([...ROLES_MULTIFASHION, ...ROLES_COMISIONES]),
];" \
  "export const ROLES_VENDEDORAS_ESPEJO: string[] = [...ROLES_MULTIFASHION, ...ROLES_COMISIONES];" \
  "acceso: el espejo repite roles (admin dos veces)"

mutar "src/app/api/multifashion/overview/route.ts" \
  "requireRole(req, ROLES_MULTIFASHION)" \
  'requireRole(req, ["admin", "secretaria", "contabilidad", "gerente_acs"])' \
  "overview: vuelve la lista a mano con secretaria y contabilidad"

mutar "src/app/api/multifashion/vendedoras/route.ts" \
  "requireRole(req, ROLES_VENDEDORAS_ESPEJO)" \
  "requireRole(req, ROLES_MULTIFASHION)" \
  "vendedoras: el espejo se queda sin sus roles (secretaria pierde la pestaña)"

mutar "src/lib/multifashion/metas-permiso.ts" \
  'export const ROLES_LECTURA_METAS = ["admin", "gerente_acs"] as const;' \
  'export const ROLES_LECTURA_METAS = ["admin", "gerente_acs", "secretaria"] as const;' \
  "metas: secretaria vuelve a ver el avance"

mutar "src/lib/multifashion/metas-permiso.ts" \
  'export const ROLES_ADMIN_METAS = ["admin"] as const;' \
  'export const ROLES_ADMIN_METAS = ["admin", "gerente_acs"] as const;' \
  "metas: Jennifer podría editarse su propio objetivo"

mutar "src/components/ventas/ComisionesView.tsx" \
  '  () => import("@/components/multifashion/VendedorasSubtab").then((m) => m.VendedorasSubtab),' \
  '  () => import("./ComisionesConsolidadoView").then((m) => m.ComisionesConsolidadoView),' \
  "espejo: la pestaña deja de reusar la vista de Multifashion"

mutar "src/components/ventas/ComisionesView.tsx" \
  '          ...(conMultifashion ? [["multifashion", "Multifashion"] as [Mode, string]] : []),' \
  '          ["multifashion", "Multifashion"],' \
  "espejo: la pestaña aparece también en la pestaña Comisiones de Ventas"

# ═══ Voseo ═══════════════════════════════════════════════════════════════════

mutar "src/components/ventas/comisiones-config/Descuentos.tsx" \
  '              ? "Falta elegir el vendedor"' \
  '              ? "Elegí el vendedor"' \
  "voseo en el aviso de «Descuentos»"

# ═══ CONTROLES: cambios inocuos que NO deben ser cazados ═════════════════════
echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/lib/comisiones/vigencia.ts" \
  "/** El mes se guarda como el día 1 (columna \`date\`). */" \
  "/** El mes se guarda como el día 1 de ese mes (columna \`date\`). */" \
  "CONTROL: se reescribe un comentario de vigencia.ts"

control "src/components/ventas/comisiones-config/Descuentos.tsx" \
  '          Todavía no hay descuentos.' \
  '          Todavía no hay descuentos registrados.' \
  "CONTROL: se alarga el texto de la lista vacía"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

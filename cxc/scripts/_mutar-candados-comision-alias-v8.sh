#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «una persona, una fila» (alias de vendedor + v8) y de las
# casillas Venta/Cobro CAZAN de verdad? Se rompe el código a propósito, una
# cosa por vez, y se exige que los tests se pongan ROJOS. CONTROL (sin mutar)
# tiene que quedar verde.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
# 🩸 Las mutaciones del SQL las caza el candado ESTÁTICO y, si pglite está en
# PGLITE_DIR (o en /tmp/v6), también el de CONDUCTA (el SQL corriendo).
#
#   bash scripts/_mutar-candados-comision-alias-v8.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/comision-alias-v8.test.ts \
src/__tests__/components/comisiones-configuracion-pantalla.test.tsx \
src/__tests__/lib/comision-exclusion-v7.test.ts \
src/__tests__/lib/comision-cobro-quien-registro.test.ts \
src/__tests__/lib/comision-cobro-sin-retenciones.test.ts \
src/__tests__/lib/comisiones-consolidado-neto.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

MIG="supabase/migrations/20260913120000_comision_vendedor_alias_v8.sql"
ARCHIVOS=(
  "$MIG"
  "src/lib/comisiones/rpc.ts"
  "src/lib/comisiones/alias.ts"
  "src/lib/comisiones/exclusiones.ts"
  "src/lib/comisiones/exclusiones-server.ts"
  "src/app/api/ventas/comisiones/exclusiones/route.ts"
  "src/app/api/ventas/comisiones/config/route.ts"
  "src/components/ventas/ComisionesView.tsx"
  "src/components/ventas/ComisionesConfiguracionView.tsx"
  "src/components/ventas/ComisionesPorEmpresaView.tsx"
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

# ── El SQL ───────────────────────────────────────────────────────────────────

# 1. El canónico vuelve a ser REINALDO con I («llámalo Reynaldo y no Reinaldo»).
mutar "$MIG" \
  "  ('REINALDO ESPINOSA',  'REYNALDO ESPINOSA'),
  ('REYNALDO ESPINOSA',  'REYNALDO ESPINOSA'),
  ('REINDALDO ESPINOSA', 'REYNALDO ESPINOSA')," \
  "  ('REINALDO ESPINOSA',  'REINALDO ESPINOSA'),
  ('REYNALDO ESPINOSA',  'REINALDO ESPINOSA'),
  ('REINDALDO ESPINOSA', 'REINALDO ESPINOSA')," \
  "alias: el canónico vuelve a ser REINALDO con I"

# 2. Se pierde la grafía con el tipeo (REINDALDO): la fila con cobro 0 % no colapsa.
mutar "$MIG" \
  "  ('REINDALDO ESPINOSA', 'REYNALDO ESPINOSA')," \
  "" \
  "alias: REINDALDO deja de ser Reynaldo"

# 3. AGUAS deja de ser Rey Stoute Aguas.
mutar "$MIG" \
  "  ('AGUAS',              'REY STOUTE AGUAS')," \
  "" \
  "alias: AGUAS deja de ser Rey Stoute Aguas"

# 4. La función canonicaliza en MAYÚSCULAS a todos: «Rodrigo» pasaría a «RODRIGO» y perdería su tasa.
mutar "$MIG" \
  "    NULLIF(BTRIM(p_nombre), '')" \
  "    NULLIF(UPPER(BTRIM(p_nombre)), '')" \
  "canónico: sin alias se pone en mayúsculas (Rodrigo pierde su fila)"

# 5. Reynaldo no queda en 1 y 1.
mutar "$MIG" \
  "VALUES ('REYNALDO ESPINOSA', 0.0100, 0.0100, true, now())
ON CONFLICT (vendedor_nombre) DO UPDATE
  SET tasa_venta = 0.0100, tasa_cobro = 0.0100, activo = true, updated_at = now();" \
  "VALUES ('REYNALDO ESPINOSA', 0.0100, 0.0050, true, now())
ON CONFLICT (vendedor_nombre) DO UPDATE
  SET tasa_venta = 0.0100, tasa_cobro = 0.0050, activo = true, updated_at = now();" \
  "tasas: Reynaldo queda en 1 / 0,5"

# 6. Las grafías de tasa NO se van: quedan 4 filas para la misma persona.
mutar "$MIG" \
  "DELETE FROM comision_vendedor_tasa t
USING comision_vendedor_alias a
WHERE UPPER(BTRIM(t.vendedor_nombre)) = a.nombre_switch
  AND t.vendedor_nombre <> a.vendedor_canonico;" \
  "" \
  "tasas: las 4 filas de Reinaldo se quedan"

# 7. Las exclusiones repetidas se BORRAN en vez de apagarse (nunca DELETE).
mutar "$MIG" \
  "UPDATE comision_exclusion ce
SET activa = false,
    desactivado_por = 'migracion-alias-v8',
    desactivado_en = now()
FROM canon
WHERE canon.id = ce.id
  AND canon.rn > 1;" \
  "DELETE FROM comision_exclusion ce
USING canon
WHERE canon.id = ce.id
  AND canon.rn > 1;" \
  "exclusiones: las repetidas se borran con DELETE"

# 8. Las exclusiones no se renombran a la persona: las 5 de Active Shoes quedan a nombre de REINALDO y no atrapan nada.
mutar "$MIG" \
  "UPDATE comision_exclusion ce
SET vendedor = UPPER(comision_vendedor_canonico(ce.vendedor))
WHERE ce.activa
  AND ce.vendedor <> UPPER(comision_vendedor_canonico(ce.vendedor));" \
  "" \
  "exclusiones: las activas no se renombran a la persona"

# 9. Las casillas nacen con default FALSE (las 11 de Daniel dejarían de restar).
mutar "$MIG" \
  "ADD COLUMN IF NOT EXISTS excluye_venta boolean NOT NULL DEFAULT true;" \
  "ADD COLUMN IF NOT EXISTS excluye_venta boolean NOT NULL DEFAULT false;" \
  "casillas: excluye_venta nace apagada"

# 10. Se pierde el CHECK «al menos una»: una fila con las dos apagadas entra a la base.
mutar "$MIG" \
  "      ADD CONSTRAINT comision_exclusion_excluye_algo CHECK (excluye_venta OR excluye_cobro);" \
  "      ADD CONSTRAINT comision_exclusion_excluye_algo CHECK (true);" \
  "casillas: se pierde el CHECK de al menos una"

# 11. La v8 ignora la casilla de VENTA (excluye la venta aunque esté desmarcada).
mutar "$MIG" \
  "     AND ce.activa = true
     AND ce.excluye_venta = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) IS NOT NULL" \
  "     AND ce.activa = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) IS NOT NULL" \
  "v8 ventas: ignora la casilla de Venta"

# 12. La v8 ignora la casilla de COBRO.
mutar "$MIG" \
  "     AND ce.activa = true
     AND ce.excluye_cobro = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false" \
  "     AND ce.activa = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false" \
  "v8 cobros: ignora la casilla de Cobro"

# 13. El cobro deja de pasar por el alias: las grafías vuelven a partir la fila.
mutar "$MIG" \
  "    GROUP BY comision_vendedor_canonico(r.vendedor_registro)
  )," \
  "    GROUP BY NULLIF(TRIM(r.vendedor_registro), '')
  )," \
  "v8 cobros: el GROUP BY deja de usar el alias"

# 14. La venta deja de pasar por el alias.
mutar "$MIG" \
  "      comision_vendedor_canonico(sf.vendedor_nombre) AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  ventas AS (" \
  "      NULLIF(TRIM(sf.vendedor_nombre), '') AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  ventas AS (" \
  "v8 ventas: doc_vendedor deja de usar el alias"

# 15. Se cae el filtro de retenciones en la v8.
mutar "$MIG" \
  "      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND comision_vendedor_canonico(r.vendedor_registro) IS NOT NULL" \
  "      AND r.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND comision_vendedor_canonico(r.vendedor_registro) IS NOT NULL" \
  "v8 cobros: se cae el filtro de retenciones"

# 16. La DDL pisa la v7 (CREATE OR REPLACE) en vez de crear la v8.
mutar "$MIG" \
  "CREATE FUNCTION comision_b2b_v8(p_empresa_key text, p_year int, p_mes int)" \
  "CREATE OR REPLACE FUNCTION comision_b2b_v7(p_empresa_key text, p_year int, p_mes int)" \
  "la DDL pisa la v7 en vez de crear la v8"

# 17. El detalle deja de canonicalizar p_vendedor (la grafía vieja devolvería vacío).
mutar "$MIG" \
  "  v_vendedor := comision_vendedor_canonico(p_vendedor);" \
  "  v_vendedor := p_vendedor;" \
  "detalle: no canonicaliza p_vendedor"

# 18. El detalle ignora la casilla de cobro (el modal listaría lo que la tabla no suma).
mutar "$MIG" \
  "   AND ce.activa = true
   AND ce.excluye_cobro = true
  WHERE r.empresa_key = p_empresa_key" \
  "   AND ce.activa = true
  WHERE r.empresa_key = p_empresa_key" \
  "detalle: ignora la casilla de Cobro"

# 19. El trigger de exclusiones deja de canonicalizar: una fila cargada como REINALDO no atrapa a REYNALDO.
mutar "$MIG" \
  "  NEW.vendedor := UPPER(COALESCE(comision_vendedor_canonico(NEW.vendedor), NEW.vendedor));" \
  "  NEW.vendedor := UPPER(BTRIM(NEW.vendedor));" \
  "trigger de exclusiones: deja de canonicalizar"

# ── El código ────────────────────────────────────────────────────────────────

# 20. rpc.ts vuelve a la v7.
mutar "src/lib/comisiones/rpc.ts" \
  'export const RPC_COMISION = "comision_b2b_v8";' \
  'export const RPC_COMISION = "comision_b2b_v7";' \
  "rpc.ts: la vigente vuelve a ser la v7"

# 21. El fallback miente: dice alias_aplicado aunque corrió la v7.
mutar "src/lib/comisiones/rpc.ts" \
  '      alias_aplicado: version === "v8",' \
  '      alias_aplicado: true,' \
  "rpc.ts: el fallback dice que el alias está aplicado"

# 22. aplicarAlias deja de aplicar el alias.
mutar "src/lib/comisiones/alias.ts" \
  "  return hit ? hit.vendedor_canonico : recortado;" \
  "  return recortado;" \
  "aplicarAlias: no aplica el alias"

# 23. En pantalla vuelve a salir en mayúsculas.
mutar "src/lib/comisiones/alias.ts" \
  "  return v
    .toLocaleLowerCase(\"es\")
    .replace(/(^|[\\s\\-'])(\\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toLocaleUpperCase(\"es\"));" \
  "  return v;" \
  "nombreVendedorEnPantalla: vuelve a mayúsculas"

# 24. La validación deja pasar las dos casillas apagadas.
mutar "src/lib/comisiones/exclusiones.ts" \
  "  if (!casillas.excluye_venta && !casillas.excluye_cobro) return { ok: false, error: AVISO_NINGUNA_CASILLA };
  return { ok: true, valor: { empresa_key: empresa, cliente_codigo: codigo, vendedor, ...casillas } };" \
  "  return { ok: true, valor: { empresa_key: empresa, cliente_codigo: codigo, vendedor, ...casillas } };" \
  "validarExclusionNueva: las dos apagadas pasan"

# 25. El PATCH deja pasar las dos apagadas.
mutar "src/lib/comisiones/exclusiones.ts" \
  "  if (!b.excluye_venta && !b.excluye_cobro) return { ok: false, error: AVISO_NINGUNA_CASILLA };
  return { ok: true, valor: { excluye_venta: b.excluye_venta, excluye_cobro: b.excluye_cobro } };" \
  "  return { ok: true, valor: { excluye_venta: b.excluye_venta, excluye_cobro: b.excluye_cobro } };" \
  "validarCasillas: las dos apagadas pasan"

# 26. Las casillas dejan de viajar en el alta (siempre las dos).
mutar "src/lib/comisiones/exclusiones-server.ts" \
  "  const casillas = excluye_venta && excluye_cobro ? {} : { excluye_venta, excluye_cobro };" \
  "  const casillas = {};" \
  "agregarExclusion: las casillas no viajan"

# 27. Daniel Levy vuelve a la lista de tasas.
mutar "src/app/api/ventas/comisiones/config/route.ts" \
  "    if (!nombre || vistos.has(nombre) || !sePagaComision(nombre)) continue;" \
  "    if (!nombre || vistos.has(nombre)) continue;" \
  "config GET: Daniel Levy vuelve a la lista"

# 28. El origen de las tasas deja de juntarse por persona.
mutar "src/app/api/ventas/comisiones/config/route.ts" \
  "    const nombre = aplicarAlias(String(v.nombre), alias);
    const set = origenMap.get(nombre) ?? new Set<string>();" \
  "    const nombre = String(v.nombre);
    const set = origenMap.get(nombre) ?? new Set<string>();" \
  "config GET: el origen no pasa por el alias"

# 29. El PUT escribe la grafía tal cual.
mutar "src/app/api/ventas/comisiones/config/route.ts" \
  '    const nombre = typeof r.vendedor_nombre === "string" ? aplicarAlias(r.vendedor_nombre, alias) : "";' \
  '    const nombre = typeof r.vendedor_nombre === "string" ? r.vendedor_nombre.trim() : "";' \
  "config PUT: escribe la grafía en vez de la persona"

# 30. Los vendedores elegibles dejan de pasar por el alias (REINALDO y REYNALDO como dos opciones).
mutar "src/app/api/ventas/comisiones/exclusiones/route.ts" \
  "    const n = normalizarVendedor(aplicarAlias(nombre, alias));" \
  '    const n = normalizarVendedor(nombre ?? "");' \
  "exclusiones GET: los vendedores elegibles no pasan por el alias"

# 31. El PATCH se abre a cualquier rol.
mutar "src/app/api/ventas/comisiones/exclusiones/route.ts" \
  "export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);" \
  "export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, [\"admin\", \"secretaria\", \"contabilidad\", \"vendedor\", \"bodega\", \"gerente_acs\", \"gerente_boston\"]);" \
  "exclusiones PATCH: se abre a todos los roles"

# 32. Vuelve el botón «Configurar» a Por empresa.
mutar "src/components/ventas/ComisionesPorEmpresaView.tsx" \
  "          </SelectContent>
        </Select>
      </div>" \
  "          </SelectContent>
        </Select>
        <button type=\"button\" className=\"ml-auto\">Configurar</button>
      </div>" \
  "Por empresa: vuelve el botón Configurar"

# 33. La lista deja de agruparse por empresa (una sola tabla).
mutar "src/components/ventas/ComisionesConfiguracionView.tsx" \
  "  const grupos = EMPRESAS_COMISIONAN
    .map((k) => ({ empresa: k, filas: filas.filter((f) => f.empresa_key === k) }))
    .filter((g) => g.filas.length > 0);" \
  "  const grupos = filas.length === 0 ? [] : [{ empresa: filas[0].empresa_key, filas }];" \
  "pantalla: la lista deja de agruparse por empresa"

# 34. El alta arranca con Cobro desmarcado.
mutar "src/components/ventas/ComisionesConfiguracionView.tsx" \
  "  const [excluyeCobro, setExcluyeCobro] = useState(true);" \
  "  const [excluyeCobro, setExcluyeCobro] = useState(false);" \
  "pantalla: el alta arranca con Cobro apagado"

# 35. La pantalla manda el PATCH aunque queden las dos apagadas.
mutar "src/components/ventas/ComisionesConfiguracionView.tsx" \
  "    if (!venta && !cobro) {
      setAvisoFila({ id: f.id, texto: AVISO_NINGUNA_CASILLA });
      return;
    }" \
  "" \
  "pantalla: cambiar una casilla puede dejar las dos apagadas"

# 36. La pantalla vuelve a dibujar a quien no se paga.
mutar "src/components/ventas/ComisionesConfiguracionView.tsx" \
  "      setRows(data.vendedores.filter((r) => sePagaComision(r.vendedor_nombre)));" \
  "      setRows(data.vendedores);" \
  "pantalla: Daniel Levy vuelve a dibujarse"

# 37. Vuelve la nota «N nombres en Switch».
mutar "src/components/ventas/ComisionesConfiguracionView.tsx" \
  "                    <td className=\"py-2.5 pr-3.5 text-gray-900\">{nombre}</td>" \
  "                    <td className=\"py-2.5 pr-3.5 text-gray-900\">{nombre} <span className=\"ml-1 text-xs text-gray-400\">{r.origen.length} nombres en Switch</span></td>" \
  "pantalla: vuelve la nota «N nombres en Switch»"

# 38. Voseo en un texto nuevo.
mutar "src/lib/comisiones/exclusiones.ts" \
  'export const AVISO_NINGUNA_CASILLA = "Marca al menos una: Venta o Cobro. Si no quieres ninguna, quita la fila.";' \
  'export const AVISO_NINGUNA_CASILLA = "Marcá al menos una: Venta o Cobro. Si no querés ninguna, quitá la fila.";' \
  "voseo en el aviso de las casillas"

restaurar
echo
echo "── CONTROL (sin mutar) ──────────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes ══"
[ "$sobrevivientes" -eq 0 ]

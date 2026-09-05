#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DEL MÓDULO CLIENTES CAZAN DE VERDAD? (5-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. El CONTROL (sin mutar) tiene que quedar VERDE: una ✅ ahí
# significa que los candados están fallando por otra razón y todo el resto de la
# corrida no dice nada.
#
# Lo que este PR dejó puesto y no se puede volver a romper:
#   1. Una sola página del cliente, tres listas distintas — y sus enlaces.
#   2. Un cero grande se lee como dato roto: cuando falta, se dice en palabras.
#   3. «Sin comprar» no es «se le acreditó todo» (D-119: $21.826 y neto cero).
#   4. La dirección de Switch se muestra y NO alimenta Guías.
#   5. Boston nunca se mezcla: recibos y facturas de la ficha, acotados a las 6.
#   6. Los 150 en una lista, los chips contados, el orden de mayor a menor.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-clientes.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/clientes-ficha-y-lista.test.ts \
src/__tests__/lib/clientes-direccion-no-alimenta-guias.test.ts \
src/__tests__/lib/clientes-enlaces-entre-modulos.test.ts \
src/__tests__/lib/clientes-ficha-datos.test.ts \
src/__tests__/components/clientes-ficha-pantalla.test.tsx \
src/__tests__/components/clientes-lista-pantalla.test.tsx \
src/__tests__/components/clientes-ausentes-selector-y-ficha.test.tsx \
src/__tests__/components/clientes-busqueda-en-la-url.test.tsx \
src/__tests__/lib/clientes-puerta-unica.test.ts \
src/__tests__/lib/boston-no-se-mezcla.test.ts \
src/__tests__/lib/cxc-contacto-del-cliente.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/clientes/ficha.ts"
  "src/lib/clientes/ficha-datos.ts"
  "src/lib/clientes/lista.ts"
  "src/lib/clientes/direccion-switch.ts"
  "src/lib/clientes/cliente-para-cobrar.ts"
  "src/lib/empresa-mapping.ts"
  "src/lib/switch-api/sync-clientes-master.ts"
  "src/app/clientes/page.tsx"
  "src/app/clientes/ClientesListClient.tsx"
  "src/app/clientes/[codigo]/page.tsx"
  "src/app/clientes/[codigo]/ClienteDetail.tsx"
  "src/app/clientes/[codigo]/CobrarEnFicha.tsx"
  "src/components/ventas/ClientesView.tsx"
  "src/lib/guias/destinos-clientes.ts"
  "supabase/migrations/20260930120000_clientes_master_direccion_switch.sql"
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

echo "── CONTROL (sin mutar) ──────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En el
# CONTROL la lectura es al revés — lo bueno es que NO haya fallos, o sea el
# «🔴 SOBREVIVIÓ». Lo que importa es el número: `control_fallos` tiene que ser 0.
probar "CONTROL — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. UN CERO GRANDE SE LEE COMO DATO ROTO ──────────────────────────────"

# 1.1 La tarjeta vuelve a escribir $0.00 en letra grande.
mutar "src/lib/clientes/ficha.ts" \
  '    monto: estado === "compro" ? neto : null,' \
  '    monto: neto,' \
  "ficha: «Compró» vuelve a mostrar el cero grande"

# 1.2 Deber cero deja de decirse en palabras.
mutar "src/lib/clientes/ficha.ts" \
  '  if (saldo === 0) return { monto: null, frase: "No debe nada", proporcion: null };' \
  '  if (saldo === 0) return { monto: 0, frase: null, proporcion: null };' \
  "ficha: «Debe» vuelve a mostrar \$0.00 en grande"

# 1.3 Sin pagos se inventa una fecha en vez de decir que nunca pagó.
mutar "src/lib/clientes/ficha.ts" \
  '  if (!fecha) return { cuando: null, frase: sinDato, detalle: null };' \
  '  if (!fecha) return { cuando: "hoy", frase: null, detalle: null };' \
  "ficha: «Nunca ha pagado» se convierte en «hoy»"

echo "── 2. «SIN COMPRAR» NO ES «SE LE ACREDITÓ TODO» (D-119) ─────────────────"

# 2.1 Se pierde la distinción: el que facturó $21.826 y se le acreditó todo
#     vuelve a leerse como si nunca hubiera comprado.
mutar "src/lib/clientes/ficha.ts" \
  '  return bruto > 0 ? "devuelto" : "nunca";' \
  '  return "nunca";' \
  "ficha: D-119 vuelve a decir «Sin comprar en 2026»"

# 2.2 El bruto deja de contarse: sin él la distinción es imposible.
mutar "src/lib/clientes/ficha-datos.ts" \
  '      if (firmado > 0) {' \
  '      if (false) {' \
  "datos: el bruto de compras se deja de acumular"

echo "── 3. «DEBE» Y SU PROPORCIÓN ────────────────────────────────────────────"

# 3.1 Se divide entre cero: el cliente sin compras del año saca un infinito.
mutar "src/lib/clientes/ficha.ts" \
  '      comprasDelAnio > 0' \
  '      comprasDelAnio >= 0' \
  "ficha: la proporción se calcula aunque no haya comprado"

# 3.2 Un saldo A FAVOR se pinta como deuda.
mutar "src/lib/clientes/ficha.ts" \
  '  if (saldo < 0) {' \
  '  if (false) {' \
  "ficha: el saldo a favor se muestra como deuda"

# 3.3 El porcentaje vuelve a llevar decimales (diccionario § 0, #5).
mutar "src/lib/clientes/ficha.ts" \
  '  return `${Math.round(pct)}%`;' \
  '  return `${pct.toFixed(1)}%`;' \
  "diccionario: los porcentajes vuelven a llevar decimal"

# 3.4 La plata negativa vuelve al `$-100.00` (diccionario § 0, #6).
mutar "src/lib/clientes/ficha.ts" \
  '  return n < 0 ? `−$${conCentavos(n)}` : `$${conCentavos(n)}`;' \
  '  return n < 0 ? `$-${conCentavos(n)}` : `$${conCentavos(n)}`;' \
  "diccionario: la plata negativa vuelve a «\$-100.00»"

echo "── 4. «hace N días» ─────────────────────────────────────────────────────"

# 4.1 Una fecha futura vuelve a decir «hace −3 días».
mutar "src/lib/clientes/ficha.ts" \
  '  if (d <= 0) return "hoy";' \
  '  if (d === 0) return "hoy";' \
  "ficha: una fecha futura muestra días negativos"

echo "── 5. «EMPRESA POR EMPRESA» ─────────────────────────────────────────────"

# 5.1 Sin base el año pasado se inventa un porcentaje.
mutar "src/lib/clientes/ficha.ts" \
  '  if (anterior == null || anterior === 0) return null;' \
  '  if (anterior == null) return null;' \
  "ficha: se calcula una variación contra cero"

# 5.2 El total del año anterior pasa a ser 0 en vez de «no hay con qué comparar».
mutar "src/lib/clientes/ficha.ts" \
  '      conAnterior.length > 0' \
  '      false' \
  "ficha: el total del año anterior se inventa un cero"

# 5.3 Una empresa en cero vuelve a dibujarse.
mutar "src/lib/clientes/ficha.ts" \
  '  return f.compras !== 0 || (f.comprasAnterior ?? 0) !== 0 || f.debe !== 0;' \
  '  return true;' \
  "ficha: las empresas sin nada vuelven a la tabla"

# 5.4 El nombre de empresa vuelve al largo (diccionario § 0, #4).
mutar "src/lib/empresa-mapping.ts" \
  '  vistana: "Vistana",' \
  '  vistana: "Vistana International",' \
  "diccionario: la empresa vuelve al nombre largo"

echo "── 6. LOS MISMOS DÍAS DEL AÑO PASADO ────────────────────────────────────"

# 6.1 El año pasado se suma ENTERO: se le regala el resto del año.
mutar "src/lib/clientes/ficha-datos.ts" \
  '    } else if (anioDeLaFila === anio - 1 && dia <= cortePrev) {' \
  '    } else if (anioDeLaFila === anio - 1) {' \
  "datos: el año pasado se suma entero, no hasta el mismo día"

echo "── 7. BOSTON NUNCA SE MEZCLA ────────────────────────────────────────────"

# 7.1 Los recibos de la ficha pierden su filtro de empresa.
mutar "src/lib/clientes/ficha-datos.ts" \
  '        .eq("empresa_key", empresa)' \
  '        .not("empresa_key", "is", null)' \
  "datos: los pagos de la ficha pierden el filtro de empresa"

# 7.2 Las facturas de la ficha se abren a las 8 empresas.
mutar "src/lib/clientes/ficha-datos.ts" \
  '        .in("empresa_key", [...B2B_EMPRESA_KEYS])
        .gte("fecha", desde)' \
  '        .gte("fecha", desde)' \
  "datos: las compras de la ficha dejan de acotarse a las 6"

# 7.3 El filtro de retenciones y ceros se afloja: vuelve el «\$0.00 hace 15 días».
mutar "src/lib/clientes/ficha-datos.ts" \
  '        .eq("es_retencion", false)' \
  '        .not("es_retencion", "is", null)' \
  "datos: los últimos pagos vuelven a contar retenciones"

# 7.4 La hoja «Cobrar» deja entrar filas de empresas que no son del grupo.
mutar "src/lib/clientes/cliente-para-cobrar.ts" \
  '  const delGrupo = filas.filter((f) =>
    (B2B_EMPRESA_KEYS as readonly string[]).includes(f.company_key),
  );' \
  '  const delGrupo = filas;' \
  "cobrar: el aging deja de acotarse a las 6"

# 7.5 La puerta de mundo de la ficha se abre: Boston deja de dar 404.
mutar "src/app/clientes/[codigo]/page.tsx" \
  '  if (soloClientesDelGrupo([cliente], await mundosDeClientes()).length === 0) notFound();' \
  '' \
  "ficha: Boston deja de contestar 404"

echo "── 8. LA DIRECCIÓN DE SWITCH NO ALIMENTA GUÍAS ──────────────────────────"

# 8.1 Guías empieza a leer la columna: el destino de D-26 saldría «Chorrera»
#     cuando Daniel definió Sport Corner Calidonia.
mutar "src/lib/guias/destinos-clientes.ts" \
  'export const MAX_BOTONES_DESTINO = 6;' \
  'export const MAX_BOTONES_DESTINO = 6;
/** @deprecated mutación de prueba */
export const DIRECCION_DE_SWITCH = "direccion_switch";' \
  "guías: el módulo empieza a nombrar direccion_switch"

# 8.2 El barrido deja de mirar carpetas reales (la trampa del barrido vacío).
mutar "src/lib/clientes/direccion-switch.ts" \
  '  "src/lib/guias",' \
  '  "src/lib/guias-que-no-existe",' \
  "guías: el barrido apunta a una carpeta inexistente"

# 8.3 El sync manda `null` en vez de quitar la columna: borraría la dirección
#     de los 150 si la columna sí existiera.
mutar "src/lib/switch-api/sync-clientes-master.ts" \
  '  delete copia.direccion_switch;' \
  '  copia.direccion_switch = null;' \
  "sync: el reintento borra la dirección en vez de omitirla"

# 8.4 El backfill de la migración excluye en vez de incluir.
mutar "supabase/migrations/20260930120000_clientes_master_direccion_switch.sql" \
  "     WHERE empresa_key IN ('vistana','fashion_wear','fashion_shoes',
                           'active_wear','active_shoes','joystep')" \
  "     WHERE empresa_key NOT IN ('confecciones_boston','american_classic')" \
  "migración: el backfill excluye en vez de incluir las 6"

echo "── 9. LA LISTA ──────────────────────────────────────────────────────────"

# 9.1 Los conteos de los chips dejan de salir del mismo filtro que abren.
mutar "src/lib/clientes/lista.ts" \
  '    cuantos: clientes.filter(PRUEBA[id]).length,' \
  '    cuantos: clientes.length,' \
  "lista: el número del chip deja de contar lo que el chip abre"

# 9.2 «Deben» deja fuera a los 6 con saldo a favor.
mutar "src/lib/clientes/lista.ts" \
  '  return (c.debe ?? 0) !== 0;' \
  '  return (c.debe ?? 0) > 0;' \
  "lista: «Deben» deja de contar los saldos a favor"

# 9.3 Lo que falta deja de decirse: vuelve el guion gris.
mutar "src/lib/clientes/lista.ts" \
  '      ? "Sin correo ni teléfono"' \
  '      ? null' \
  "lista: «Sin correo ni teléfono» deja de decirse"

# 9.4 El orden de la plata arranca de menor a mayor.
mutar "src/lib/clientes/lista.ts" \
  '  return { columna, sentido: columna === "cliente" ? "asc" : "desc" };' \
  '  return { columna, sentido: "asc" };' \
  "lista: la plata arranca de menor a mayor"

# 9.5 Ordenar MUTA el array de entrada.
mutar "src/lib/clientes/lista.ts" \
  '  return [...clientes].sort((a, b) => {' \
  '  return (clientes as T[]).sort((a, b) => {' \
  "lista: ordenar muta el array que le pasan"

# 9.6 El desempate deja de ser estable: dos montos iguales bailan.
mutar "src/lib/clientes/lista.ts" \
  '    return (a.codigo ?? "").localeCompare(b.codigo ?? "", "es");' \
  '    return 0;' \
  "lista: el desempate del orden deja de ser estable"

# 9.7 El ausente de Switch vuelve a la lista.
mutar "src/lib/clientes/lista.ts" \
  '  return filas.filter((f) => !f.ausente_desde);' \
  '  return filas;' \
  "lista: el que ya no está en Switch vuelve a ofrecerse"

# 9.8 La lista vuelve a pedir los ausentes por la puerta.
mutar "src/app/clientes/page.tsx" \
  '  const filas = await leerClientesDelGrupo("").catch(() => []);' \
  '  const filas = await leerClientesDelGrupo("", { incluirAusentes: true }).catch(() => []);' \
  "lista: se piden los ausentes al servidor"

# 9.9 El saldo de la lista deja de acotarse a las 6 (entraría Boston).
mutar "src/app/clientes/page.tsx" \
  '    .in("company_key", [...B2B_EMPRESA_KEYS]);' \
  '    .not("company_key", "is", null);' \
  "lista: el saldo deja de acotarse a las 6 empresas"

echo "── 10. LOS ENLACES DEL PIE ──────────────────────────────────────────────"

# 10.1 Bodega ve «Cobrar» — y las tres rutas de atrás le contestan 403.
mutar "src/lib/clientes/ficha.ts" \
  '  if (roles.includes(rol)) return true;' \
  '  return true;' \
  "ficha: bodega ve Cuentas por Cobrar y Ventas"

# 10.2 «Ver en Ventas» se abre a todos los roles.
mutar "src/lib/clientes/ficha.ts" \
  'export const ROLES_VENTAS_EN_LA_FICHA = ["admin"] as const;' \
  'export const ROLES_VENTAS_EN_LA_FICHA = ["admin", "secretaria", "vendedor", "bodega"] as const;' \
  "ficha: «Ver en Ventas» deja de ser solo de admin"

# 10.3 «Ver en Ventas» manda el NOMBRE en vez del código.
mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  'href={`/ventas?tab=clientes&cliente=${encodeURIComponent(cliente.codigo)}`}' \
  'href={`/ventas?tab=clientes&cliente=${encodeURIComponent(cliente.nombre)}`}' \
  "ficha: «Ver en Ventas» ata por nombre, no por código"

# 10.4 Ventas deja de resaltar la fila que le pidieron.
mutar "src/components/ventas/ClientesView.tsx" \
  'aria-current={resaltado ? "true" : undefined}' \
  'aria-current={undefined}' \
  "ventas: la fila del cliente deja de resaltarse"

echo "── 11. «ÚLTIMOS PAGOS» Y LA HOJA «COBRAR» ───────────────────────────────"

# 11.1 Se escribe un segundo agrupador en vez de reusar el del CXC.
mutar "src/lib/clientes/ficha-datos.ts" \
  '  const porFecha = agruparPagosPorFecha(porEmpresa.flat());' \
  '  const porFecha = porEmpresa.flat().map((p) => ({ fecha: p.fecha, monto: p.monto, empresas: [p.empresa] })).slice(0, 3);' \
  "pagos: se arma la lista a mano en vez de reusar el agrupador del CXC"

# 11.2 La hoja «Cobrar» pierde el código: el cajón pediría el estado de `null`.
mutar "src/lib/clientes/cliente-para-cobrar.ts" \
  '      codigo: datos.codigo,
      nombre: (f.nombre ?? "").trim() || datos.nombre,' \
  '      codigo: "",
      nombre: (f.nombre ?? "").trim() || datos.nombre,' \
  "cobrar: el código deja de viajar en cada empresa"

# 11.3 El correo pierde su deshacer de 5 segundos: sale al primer clic.
mutar "src/app/clientes/[codigo]/CobrarEnFicha.tsx" \
  '          scheduleAction({' \
  '          ((x: { execute: () => Promise<void> }) => void x.execute())({' \
  "cobrar: el correo sale sin los 5 segundos de deshacer"

echo "── 12. CONTACTO — SE EDITA TOCANDO EL DATO ──────────────────────────────"

# 12.1 Abrir un campo y salir sin cambiar nada vuelve a escribir.
mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  '    if (guardando && borrador.trim() !== original.current.trim()) {' \
  '    if (guardando) {' \
  "contacto: guardar aunque no haya cambiado nada"

# 12.2 El rótulo vuelve a «Email» (diccionario § 0, #8).
mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  'campo="email" rotulo="Correo"' \
  'campo="email" rotulo="Email"' \
  "diccionario: el correo vuelve a llamarse «Email»"

# 12.3 «Contacto» deja de ir primero.
mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  '              campo="contacto" rotulo="Contacto" valor={cliente.contacto ?? null}' \
  '              campo="contacto" rotulo="Zontacto" valor={cliente.contacto ?? null}' \
  "contacto: la casilla deja de llamarse «Contacto»"

echo "── 13. PAGINACIÓN PAGINADA (db-max-rows) ────────────────────────────────"

# 13.1 Las facturas de la ficha se leen sin paginar: D-25 tiene 921 en 2 años.
mutar "src/lib/clientes/ficha-datos.ts" \
  '  const facturas = await leerTodoPaginado<FilaFactura>(' \
  '  const facturas = await ((async (_e: string, f: (a: boolean, b: number, c: number) => Promise<{ data: unknown }>) => ((await f(false, 0, 999)).data ?? []) as FilaFactura[]))(' \
  "datos: las facturas de la ficha se leen sin paginar"

echo "─────────────────────────────────────────────────────────────────────────"
echo "CONTROL: $control_fallos (tiene que ser 0)"
echo "RESULTADO: $cazadas cazadas · $sobrevivientes sobrevivientes"
[ "$sobrevivientes" -eq 0 ] && [ "$control_fallos" -eq 0 ] && echo "✅ TODAS CAZADAS" || echo "🔴 REVISAR"

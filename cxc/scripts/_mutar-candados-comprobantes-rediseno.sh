#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — el rediseño de la lista de Comprobantes y los
# tres arreglos del detalle (6-sep-2026).
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
#   bash scripts/_mutar-candados-comprobantes-rediseno.sh
#
# 🩸 Tres defectos ya pagados en este repo, y cómo se evitan acá:
#   1. La restauración va por COPIA, NUNCA por `git checkout`: hay archivos
#      NUEVOS (sin versionar) en la rama y git aborta el comando ENTERO sin
#      restaurar nada.
#   2. Una mutación cuyo patrón NO matchea se DENUNCIA («patrón muerto») en vez
#      de darse por cazada.
#   3. NO HAY DELIMITADOR: los textos viajan como ARGUMENTOS a python (argv).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ORIGEN=src/lib/catalogo/origen-comprobante.ts
CHIPS=src/lib/catalogo/chips-comprobantes.ts
SINMANDAR=src/lib/catalogo/sin-mandar.ts
VENTANA=src/lib/catalogo/comprobantes-ventana.ts
MES=src/lib/catalogo/mes-comprobantes.ts
PAPEL=src/lib/catalogo/papel-de-la-fila.ts
CORREO=src/lib/catalogo/correo-del-cliente.ts
PANEL=src/components/catalogo/ComprobantesPanel.tsx
FILA=src/components/catalogo/comprobantes/FilaComprobante.tsx
ACCIONES=src/components/catalogo/comprobantes/AccionesComprobante.tsx
FILTROS=src/components/catalogo/comprobantes/FiltrosComprobantes.tsx
DETALLE=src/components/catalogo/PedidoDetalleClient.tsx
SENDORDER='src/app/api/catalogo/[marca]/send-order/route.ts'

CANDADOS=(
  src/__tests__/lib/comprobantes-rediseno.test.ts
  src/__tests__/components/comprobantes-rediseno-pantalla.test.tsx
  src/__tests__/components/pedido-detalle-rediseno.test.tsx
  src/__tests__/api/comprobantes-correo-del-cliente.test.ts
  src/__tests__/lib/comprobantes-ventana-90-dias.test.ts
  src/__tests__/lib/numeros-pedido.test.ts
)

ARCHIVOS=("$ORIGEN" "$CHIPS" "$SINMANDAR" "$VENTANA" "$MES" "$PAPEL" "$CORREO" \
          "$PANEL" "$FILA" "$ACCIONES" "$FILTROS" "$DETALLE" "$SENDORDER")
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

# $1 = nombre  $2 = archivo  $3 = de  $4 = a — un cambio que NO debe romper nada.
control() {
  local nombre="$1" archivo="$2" de="$3" a="$4"
  restaurar
  python3 - "$archivo" "$de" "$a" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
de, a = sys.argv[2], sys.argv[3]
if de not in s:
    print(f"::NO-APLICA:: no encontré el texto en {sys.argv[1]}"); sys.exit(3)
p.write_text(s.replace(de, a, 1))
PY
  if [ $? -ne 0 ]; then
    printf '  ⚠️  %-70s NO SE PUDO APLICAR (patrón muerto)\n' "CONTROL · $nombre"; fallo=$((fallo+1)); return
  fi
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  🔴 %-70s EL CONTROL SE PUSO ROJO (candado frágil)\n' "CONTROL · $nombre"; fallo=$((fallo+1))
  else
    printf '  ✅ %-70s control en verde\n' "CONTROL · $nombre"; ok=$((ok+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── 1 · LOS DOS NOMBRES DEL ORIGEN ──────────────────────────────────────────
mutar "vuelve «Del link»" "$ORIGEN" \
  '  link: "Del cliente",' '  link: "Del link",'

mutar "vuelve «Míos»" "$ORIGEN" \
  '  mio: "Del vendedor",' '  mio: "Míos",'

mutar "la fila deja de usar los nombres del módulo y escribe el suyo" "$FILA" \
  '        {ORIGEN_LABEL.link}' '        {"Del link"}'

mutar "🩸 el origen empieza a depender del usuario que entró" "src/lib/catalogo/fila-comprobante.ts" \
  'origen: o.del_link === true || fuente === "publicos" ? "link" : "mio",' \
  'origen: o.del_link === true || fuente === "publicos" ? "link" : (o.vendor_name === sessionStorage.getItem("fg_user_name") ? "mio" : "link"),'

mutar "los dos grupos se quedan sin rótulo" "$ORIGEN" \
  'export const ROTULO_GRUPO_ORIGEN = "Quién lo armó";' \
  'export const ROTULO_GRUPO_ORIGEN = "";'

# ── 2 · LOS DOS FILTROS, MISMO ASPECTO, SIN CEROS ───────────────────────────
mutar "los chips vuelven a ser pestañas subrayadas" "$FILTROS" \
  'rounded-full border text-sm font-medium' 'border-b-2 text-sm font-medium'

mutar "🔴 lo que está en cero vuelve a ocupar lugar" "$CHIPS" \
  '  return chips.filter((c) => c.conteo > 0 || c.activo);' \
  '  return chips;'

mutar "🔴 el chip ACTIVO se esconde al quedar en cero (pantalla sin salida)" "$CHIPS" \
  '  return chips.filter((c) => c.conteo > 0 || c.activo);' \
  '  return chips.filter((c) => c.conteo > 0);'

mutar "el grupo de origen deja de dibujarse" "$PANEL" \
  '        origen={chips.origen}' '        origen={{ rotulo: "", opciones: [] }}'

# ── 3 · LOS CONTEOS CUENTAN LO QUE SE MIRA ──────────────────────────────────
mutar "🔴 los conteos vuelven a contar TODO el listado" "$PANEL" \
  '  const chips = gruposDeChips(paraChips, estadoFiltros);' \
  '  const chips = gruposDeChips(pedidos.map((p) => ({ ...datosNumeros(p, esFilaOrders(p)), origen: p.origen, created_at: p.created_at })), estadoFiltros);'

mutar "el conteo de origen se calcula SIN la vista puesta" "$CHIPS" \
  '  const paraOrigen = candidatas.filter((p) => pasaVista(p, estado.vista));' \
  '  const paraOrigen = candidatas.slice();'

mutar "el conteo de vista se calcula SIN el origen puesto" "$CHIPS" \
  '  const paraVista = candidatas.filter((p) => pasaFiltroOrigen(p.origen, estado.origen));' \
  '  const paraVista = candidatas.slice();'

mutar "🔑 cada grupo se cuenta con su PROPIO filtro puesto (todos en 0 menos uno)" "$CHIPS" \
  '  const paraVista = candidatas.filter((p) => pasaFiltroOrigen(p.origen, estado.origen));' \
  '  const paraVista = candidatas.filter((p) => pasaFiltroOrigen(p.origen, estado.origen) && pasaVista(p, estado.vista));'

# ── 4 · «SIN MANDAR» ────────────────────────────────────────────────────────
mutar "🔴 «Sin mandar» cuenta también los borradores" "$SINMANDAR" \
  '  if (esBorrador(p)) return false;' '  '

mutar "🔴 «Sin mandar» se traga el pedido del link sin convertir" "$SINMANDAR" \
  '  if (p.fuente === "publicos") return false;' '  '

mutar "🩸 «está en Switch» se deduce del NÚMERO y no del envío" "$SINMANDAR" \
  '  return !(typeof p.enSwitch === "boolean"' \
  '  return !(false && typeof p.enSwitch === "boolean"'

mutar "el chip «Sin mandar» desaparece de la pantalla" "$CHIPS" \
  '  { clave: VISTA_SIN_MANDAR, label: CHIP_SIN_MANDAR },' '  '

mutar "🔴 «Sin mandar» se cuela en FILTROS_COMPROBANTE y rompe la partición" \
  src/lib/catalogo/numeros-pedido.ts \
  '  { clave: "borrador", label: "Borradores" },' \
  '  { clave: "borrador", label: "Borradores" },
  { clave: "sin_mandar" as FiltroComprobante, label: "Sin mandar" },'

mutar "la frase pierde los días" "$SINMANDAR" \
  '  if (d === 0) return `${base} · hoy`;' \
  '  return base;
  if (d === 0) return `${base} · hoy`;'

mutar "los días se cuentan con el reloj del navegador, no con el de Panamá" "$FILA" \
  '        <span data-medir="sin-mandar" className="font-medium text-red-600">' \
  '        <span data-medir="sin-mandar" className="font-medium text-red-600" data-hoy={new Date().toISOString()}>'

mutar "🔴 la frase deja de pintarse en ROJO" "$FILA" \
  '<span data-medir="sin-mandar" className="font-medium text-red-600">' \
  '<span data-medir="sin-mandar" className="text-gray-400">'

mutar "un BORRADOR también se pinta en rojo (alarma que exagera)" "$FILA" \
  '  const trabado = esSinMandar(datos);' \
  '  const trabado = !estaEnSwitch(datos);'

# ── 5 · LA VENTANA DE 30 DÍAS DEL PEDIDO DEL LINK ───────────────────────────
mutar "🔴 el pedido del link abandonado vuelve a durar 90 días" "$VENTANA" \
  'export const DIAS_VENTANA_LINK_SIN_CONFIRMAR = 30;' \
  'export const DIAS_VENTANA_LINK_SIN_CONFIRMAR = 90;'

mutar "el plazo corto se le aplica también al que SÍ confirmó" "$VENTANA" \
  '  const abandonadoDelLink = f.fuente === "publicos" && !f.confirmado_cliente_at;' \
  '  const abandonadoDelLink = f.fuente === "publicos";'

mutar "🔴 el plazo corto se le aplica a los pedidos INTERNOS" "$VENTANA" \
  '  const abandonadoDelLink = f.fuente === "publicos" && !f.confirmado_cliente_at;' \
  '  const abandonadoDelLink = !f.confirmado_cliente_at;'

mutar "🩸 lo viejo se BORRA en vez de esperar detrás de «Ver más»" "$VENTANA" \
  '    else viejos.push(f);' '    else { /* se pierde */ }'

mutar "la pantalla deja de pasar por la ventana" "$PANEL" \
  '  const candidatas = verTodo ? buscadas : recientes;' \
  '  const candidatas = buscadas;'

# ── 6 · EL MES QUE ABRE Y EL ENCABEZADO ─────────────────────────────────────
mutar "🩸 vuelve a abrir el mes del CALENDARIO (Joybees en blanco)" "$MES" \
  '  return grupos.length > 0 ? grupos[0].key : null;' \
  '  return "2026-09";'

mutar "el encabezado vuelve a decir «Julio De 2026»" "$MES" \
  '  return conMayusculaInicial(' \
  '  return capitalizarTodo(' 

mutar "el rótulo del mes pierde la mayúscula inicial" "$MES" \
  '  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;' \
  '  return texto;'

# ── 7 · «VER PDF» EN LA FILA Y EL «···» ─────────────────────────────────────
mutar "🔴 «Ver PDF» se va de la fila" "$ACCIONES" \
  '      {esOrders && (' '      {false && (' 

mutar "🔴 «Eliminar» vuelve a ser un botón suelto de la fila" "$FILA" \
  '        <AccionesComprobante' \
  '        <button>Eliminar</button>
        <AccionesComprobante'

mutar "🩸 la lectura del PDF deja de arrancar en el pointerdown (iOS pierde el gesto)" "$ACCIONES" \
  '          onPointerDown={() => leerPedido(pedido.id_natural)}' '          '

mutar "el papel de la fila deja de mirar el envío y usa siempre «Pedido»" "$PAPEL" \
  '    f.en_switch ? { estado: "enviado", documento: f.switch_documento } : null,' \
  '    null,'

mutar "🔴 «Duplicar» se ofrece en pedidos que NO están en Switch (muere en 409)" "$ACCIONES" \
  '  if (puedeEditar && esOrders && pedido.en_switch) {' \
  '  if (puedeEditar && esOrders) {'

mutar "«Reenviar el correo» desaparece del menú" "$ACCIONES" \
  '    items.push({ label: "Reenviar el correo", onClick: onReenviarCorreo });' '    '

# ── 8 · LA COLUMNA VENDEDOR Y LA FICHA ──────────────────────────────────────
mutar "🔴 se va la columna «Vendedor»" "$PANEL" \
  '                      <th className="text-left px-4 py-3 font-medium text-gray-500">Vendedor</th>' '                      '

mutar "el vendedor vacío se dibuja en blanco en vez de «—»" "$FILA" \
  '  return v ? <>{v}</> : <span className="text-gray-300">—</span>;' \
  '  return <>{v}</>;'

mutar "🔴 se va la FICHA: en el iPad las acciones vuelven a quedar fuera" "$PANEL" \
  '              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 lg:hidden">' \
  '              <div className="hidden">'

mutar "la tabla deja de esconderse en el teléfono (dos dibujos a la vez)" "$PANEL" \
  '              <div className="hidden lg:block bg-white border border-gray-200 rounded-lg overflow-x-auto">' \
  '              <div className="block bg-white border border-gray-200 rounded-lg overflow-x-auto">'

mutar "un botón de la fila baja de 44 px" "$ACCIONES" \
  '          className="min-h-[44px] px-3 rounded-md border border-gray-200 text-xs font-medium text-gray-600' \
  '          className="px-3 py-1 rounded-md border border-gray-200 text-xs font-medium text-gray-600'

# ── 9 · EL DETALLE: CORREO, PALABRA Y LO QUE SE TOCA ────────────────────────
mutar "🔴 el correo del cliente deja de venir escrito" "$DETALLE" \
  '              if (!d.client_email && cd.correo) setClientEmail(String(cd.correo));' '              '

mutar "🩸 el correo se vuelve a borrar al mandarlo" "$DETALLE" \
  '        setShowEmailInput(false);' \
  '        setShowEmailInput(false);
        setClientEmail("");'

mutar "🔴 el aviso vuelve a decir «Pedido enviado» para una cotización" "$DETALLE" \
  '        showToast(`${palabra} ${palabra === "Cotización" ? "enviada" : "enviado"} a ${correo}`);' \
  '        showToast(`Pedido enviado a ${correo}`);'

mutar "🔴 el correo se une por NOMBRE en vez de por código" "$CORREO" \
  '      .eq("codigo", cod)' '      .eq("nombre_normalized", cod)'

mutar "el correo del directorio deja de fallar abierta y revienta la pantalla" "$CORREO" \
  '    if (error) return null;' '    if (error) throw new Error("sin correo");'

mutar "🔴 el correo se anota ANTES de que Resend confirme" "$SENDORDER" \
  '    if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message }, { status: 500 }); }
    // ─────' \
  '    // ─────'

mutar "el aviso interno a Fashion Group se guarda como correo del cliente" "$SENDORDER" \
  '    if (body.orderId && esCliente) {' '    if (body.orderId) {'

mutar "🩸 el nombre del cliente vuelve a parecer texto fijo (raya invisible)" "$DETALLE" \
  'className="text-xl font-semibold border-b border-dashed border-gray-300 outline-none transition w-full bg-transparent hover:border-gray-500 focus:border-solid focus:border-black"' \
  'className="text-xl font-semibold border-b border-transparent outline-none transition w-full bg-transparent hover:border-gray-200 focus:border-black"'

mutar "🩸 el encabezado de la tabla vuelve a no quedarse fijo" "$DETALLE" \
  '        <div className="mb-4 overflow-auto max-h-[70vh]">' \
  '        <div className="mb-4 overflow-x-auto">'

mutar "el camino de vuelta vuelve a decir «Volver a Pedidos»" "$DETALLE" \
  '        ← Volver a {PANEL_COMPROBANTES}' '        ← Volver a Pedidos'

echo
echo "═══ CONTROLES (cambios que NO deben romper nada) ═══"

control "un comentario más en el módulo de chips" "$CHIPS" \
  'export const ROTULO_GRUPO_VISTA = "Qué es";' \
  '// Comentario de control: no cambia ninguna regla.
export const ROTULO_GRUPO_VISTA = "Qué es";'

control "el buscador cambia su texto de ayuda" "$PANEL" \
  'placeholder="Buscar por cliente o número…"' \
  'placeholder="Buscar cliente o número…"'

echo
echo "═══ RESUMEN ═══"
echo "  cazadas / controles OK : $ok"
echo "  problemas              : $fallo"
[ "$fallo" -eq 0 ] || exit 1

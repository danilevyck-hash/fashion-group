#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «LA PANTALLA QUE VE EL CLIENTE» CAZAN DE VERDAD? (7-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar) tienen que quedar VERDES: una ✅ ahí
# significa que los candados fallan por otra razón y el resto no dice nada.
#
# Daniel, textual: *«quiero que el cliente cuando abra el catálogo por el link
# se sienta como si fuese el mismo catálogo, solamente con par de limitaciones
# que ya sabemos, por ejemplo escoger el cliente, porque no quiero que él vea
# toda la cartera de clientes que tengo»*.
#
# Lo que este trabajo dejó puesto y no se puede volver a romper:
#   1. El espacio de abajo sale de la MEDIDA de la barra, en las tres pantallas.
#   2. El cliente TECLEA la cantidad (era un botón muerto en el público).
#   3. El cliente DESCARGA el PDF, con el hook compartido — no una segunda copia.
#   4. El cliente REVISA antes de confirmar; el precio no se toca y la cartera
#      de clientes sigue cerrada.
#   5. El aviso se cierra solo y se puede cerrar (3 s / 8 s).
#   6. La existencia física NO viaja al navegador, ni el inventario de productos
#      apagados, ni columnas que nadie dibuja. Y el catálogo interno de Reebok
#      dejó de leerse sin sesión.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: este trabajo trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-catalogo-publico.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/catalogo-publico-como-el-catalogo.test.ts \
src/__tests__/components/catalogo-publico-revisar.test.tsx \
src/__tests__/catalogo-publico-ux-paridad.test.ts \
src/__tests__/api/catalogo-paridad-products.test.ts"

ARCHIVOS=(
  "src/components/catalogo/CatalogoPublicoPage.tsx"
  "src/components/catalogo/RevisarPedidoPublico.tsx"
  "src/components/catalogo/CatalogoStickyCartBar.tsx"
  "src/components/catalogo/CatalogoGroupedCard.tsx"
  "src/components/catalogo/CatalogoProductCard.tsx"
  "src/components/catalogo/LineasPedidoEditables.tsx"
  "src/components/catalogo/CheckoutClient.tsx"
  "src/components/catalogo/CatalogoVendedorPage.tsx"
  "src/components/catalogo/useDescargarCatalogoPdf.ts"
  "src/components/ui.tsx"
  "src/lib/catalogo/publico-payload.ts"
  "src/lib/catalogo/rutas-publicas.ts"
  "src/lib/catalogo/marcas.ts"
  "src/lib/ui/toast-duracion.ts"
  "src/app/api/catalogo/[marca]/public/route.ts"
  "src/app/api/catalogo/[marca]/products/route.ts"
  "src/app/api/catalogo/reebok/inventory/route.ts"
  "src/middleware.ts"
  "src/app/catalogo-publico/[marca]/revisar/page.tsx"
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
# `\n` en el reemplazo = salto de línea de verdad (bash lo pasa literal).
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

echo "── CONTROL 1 (sin mutar) ────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En el
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control_1=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. EL ESPACIO DE ABAJO SALE DE LA MEDIDA ─────────────────────────────"

# 1.1 Vuelve el número escrito a mano que tapaba el «Agregar» de la última fila.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '    <div style={{ paddingBottom: reservaAbajo || undefined }}>' \
  '    <div className="pb-28">' \
  "público: vuelve el pb-28 escrito a mano"

# 1.2 La reserva deja de seguir a la barra y se clava en 112.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '  const reservaAbajo = cartCount > 0 && altoBarra > 0 ? altoBarra + 16 : 0;' \
  '  const reservaAbajo = cartCount > 0 ? 112 : 0;' \
  "público: la reserva se clava en 112 px"

# 1.3 El botón de subir vuelve a esconderse detrás de la barra.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '            style={reservaAbajo ? { bottom: reservaAbajo } : undefined}\n' \
  '' \
  "público: el botón de subir ya no se levanta"

# 1.4 La pantalla de revisar deja de reservar (ahí la barra es la MÁS alta).
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '  const reservaAbajo = cartCount > 0 && altoBarra > 0 ? altoBarra + 16 : 0;' \
  '  const reservaAbajo = 0;' \
  "revisar: deja de reservar el alto de la barra"

# 1.5 El vendedor vuelve al número fijo.
mutar "src/components/catalogo/CatalogoVendedorPage.tsx" \
  '  const reservaAbajo = cartCount > 0 && altoBarra > 0 ? altoBarra + 16 : 0;' \
  '  const reservaAbajo = cartCount > 0 ? 112 : 0;' \
  "vendedor: la reserva se clava en 112 px"

# 1.6 Sin ResizeObserver la barra deja de medirse una última vez.
mutar "src/components/catalogo/CatalogoStickyCartBar.tsx" \
  '    if (typeof ResizeObserver === "undefined") {' \
  '    if (false) {' \
  "barra: se pierde el respaldo sin ResizeObserver"

echo "── 2. LA CANTIDAD SE TECLEA, TAMBIÉN EN EL PÚBLICO ──────────────────────"

# 2.1 Vuelve el interruptor que dejaba el número muerto para el cliente.
mutar "src/components/catalogo/CatalogoGroupedCard.tsx" \
  '                        onClick={() => openQtyInput(v.product, qty)}' \
  '                        onClick={showBultos ? () => openQtyInput(v.product, qty) : undefined}' \
  "tarjeta agrupada: vuelve el interruptor showBultos"

# 2.2 El número deja de decir qué hace.
mutar "src/components/catalogo/CatalogoGroupedCard.tsx" \
  '                        aria-label="Escribir la cantidad"\n' \
  '' \
  "tarjeta agrupada: el número pierde su etiqueta"

# 2.3 La tarjeta plana pierde el teclado.
mutar "src/components/catalogo/CatalogoProductCard.tsx" \
  '                  onClick={openQtyInput}' \
  '                  onClick={undefined}' \
  "tarjeta plana: el número deja de abrir el teclado"

# 2.4 La tarjeta plana pierde la etiqueta.
mutar "src/components/catalogo/CatalogoProductCard.tsx" \
  '                  aria-label="Escribir la cantidad"\n' \
  '' \
  "tarjeta plana: el número pierde su etiqueta"

# 2.5 Los botones de la ventana de cantidad bajan del mínimo táctil.
mutar "src/components/catalogo/CatalogoGroupedCard.tsx" \
  '              <button onClick={() => setQtyInputFor(null)} className="flex-1 py-2 min-h-[44px] text-sm' \
  '              <button onClick={() => setQtyInputFor(null)} className="flex-1 py-2 text-sm' \
  "tarjeta agrupada: «Cancelar» baja de 44 px"

echo "── 3. EL PDF, CON EL HOOK COMPARTIDO ────────────────────────────────────"

# 3.1 El verbo deja de ser el de la casa.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '{descargandoPdf ? "Generando..." : "Descargar PDF"}' \
  '{descargandoPdf ? "Generando..." : "Bajar PDF"}' \
  "público: el botón dice «Bajar» en vez de «Descargar»"

# 3.2 Se ofrece bajar un PDF vacío.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '        {filteredCount > 0 && (' \
  '        {true && (' \
  "público: se ofrece el PDF con cero resultados"

# 3.3 El PDF se arma acá otra vez (la segunda copia que el hook evita).
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '  const { descargando: descargandoPdf, descargar: descargarPdf } = useDescargarCatalogoPdf();' \
  '  const descargandoPdf = false;\n  const descargarPdf = async () => { const { downloadCatalogPdf } = await import("@/lib/catalogo/catalog-pdf"); void downloadCatalogPdf; };' \
  "público: el PDF se arma acá en vez de en el hook"

echo "── 4. EL CLIENTE REVISA ANTES DE CONFIRMAR ──────────────────────────────"

# 4.1 La ruta se escribe a mano y deja de derivarse de la marca.
mutar "src/lib/catalogo/rutas-publicas.ts" \
  '  return `${rutaCatalogoPublico(marca)}/${SEGMENTO_REVISAR}`;' \
  '  return "/catalogo-publico/reebok/revisar";' \
  "ruta: la pantalla de revisar deja de derivarse de la marca"

# 4.2 El catálogo vuelve a confirmar de un toque.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '          actionLabel="Revisar pedido"' \
  '          actionLabel="Confirmar pedido"' \
  "público: la barra vuelve a decir «Confirmar pedido»"

# 4.3 La barra deja de llevar a la pantalla de revisar.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '    router.push(rutaRevisarPublico(marca));' \
  '    void marca;' \
  "público: «Revisar pedido» no lleva a ninguna parte"

# 4.4 Se dibuja una segunda lista a mano en vez de reusar la del checkout.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '            <LineasPedidoEditables lineas={lineas} onQty={cambiarQty} />' \
  '            <section data-medir="lineas-pedido">{lineas.map((l) => (<div key={l.product_id}>{l.name}</div>))}</section>' \
  "revisar: se dibuja una segunda lista a mano"

# 4.5 El cliente puede escribir el precio.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '            <LineasPedidoEditables lineas={lineas} onQty={cambiarQty} />' \
  '            <LineasPedidoEditables lineas={lineas} onQty={cambiarQty} renderPrecio={(l) => (<input type="number" defaultValue={l.unit_price} />)} />' \
  "revisar: 🔴 el precio se vuelve editable"

# 4.6 «Quitar» deja de quitar.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '      qty <= 0' \
  '      qty < 0' \
  "revisar: «Quitar» deja la línea en cero en vez de sacarla"

# 4.7 Se va el nombre del cliente y cualquiera confirma sin decir quién es.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '          onClientNameChange={setClientName}' \
  '          onClientNameChange={undefined}' \
  "revisar: se pierde el nombre obligatorio"

# 4.8 ⚠️ Se cuela la cartera de clientes en la pantalla del cliente.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  'import CatalogoHeader from "./CatalogoHeader";' \
  'import CatalogoHeader from "./CatalogoHeader";\nimport ClienteSwitchPicker from "./ClienteSwitchPicker";\nvoid ClienteSwitchPicker;' \
  "revisar: ⚠️ se cuela el selector de la cartera de clientes"

# 4.9 Reintentar duplica el pedido.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '      let shortId = pendingShortId;' \
  '      let shortId: string | null = null;' \
  "revisar: reintentar crea un pedido nuevo cada vez"

# 4.10 El carrito se vacía aunque la confirmación falle.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '      if (!conf.ok || !confData?.numero) {' \
  '      if (false) {' \
  "revisar: el carrito se vacía aunque falle la confirmación"

# 4.11 Lo que se cambia deja de guardarse.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '    guardarCarrito(theme.publicCartKey, siguiente);' \
  '    void siguiente;' \
  "revisar: cambiar la cantidad ya no se guarda"

# 4.12 La página de revisar se ata a una marca.
mutar "src/app/catalogo-publico/[marca]/revisar/page.tsx" \
  '  const theme = getMarcaTheme(params.marca);' \
  '  const theme = getMarcaTheme("reebok");' \
  "revisar: la página se ata a una sola marca"

# 4.13 El checkout vuelve a dibujar su propia lista.
mutar "src/components/catalogo/CheckoutClient.tsx" \
  'import { fmt } from "@/lib/format";' \
  'import { fmt } from "@/lib/format";\nimport { supabaseThumb } from "@/lib/image-thumb";\nvoid supabaseThumb;' \
  "checkout: vuelve a dibujar su propia lista de líneas"

echo "── 5. EL AVISO SE CIERRA SOLO Y SE PUEDE CERRAR ─────────────────────────"

# 5.1 Un error dura lo que un éxito.
mutar "src/lib/ui/toast-duracion.ts" \
  '  return tipo === "error" ? TOAST_MS_ERROR : TOAST_MS_EXITO;' \
  '  return TOAST_MS_EXITO;' \
  "toast: un error dura lo mismo que un éxito"

# 5.2 El error deja de durar 8 s.
mutar "src/lib/ui/toast-duracion.ts" \
  'export const TOAST_MS_ERROR = 8000;' \
  'export const TOAST_MS_ERROR = 3000;' \
  "toast: el error baja a 3 s"

# 5.3 El reloj se reinicia en cada render y el aviso no se va nunca.
mutar "src/components/ui.tsx" \
  '  }, [message, type, seCierraSolo]);' \
  '  }, [message, type, onDismiss]);' \
  "toast: el reloj se reinicia con cada render"

# 5.4 Se va la ✕ del AVISO (la otra `aria-label="Cerrar"` del archivo es la de
#     los modales, y no es la que se está vigilando).
mutar "src/components/ui.tsx" \
  '<button onClick={onDismiss} className="ml-2 p-1 rounded hover:bg-white/20 transition flex-shrink-0" aria-label="Cerrar">' \
  '<button className="ml-2 p-1 rounded hover:bg-white/20 transition flex-shrink-0">' \
  "toast: se va el botón de cerrar"

# 5.5 El catálogo público deja de decirle al aviso cómo cerrarse.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  ' onDismiss={() => setToast(null)}' \
  '' \
  "público: el aviso se queda pegado otra vez"

# 5.6 La pantalla de revisar, igual.
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  ' onDismiss={() => setToast(null)}' \
  '' \
  "revisar: el aviso se queda pegado otra vez"

# 5.7 El aviso pierde su tipo (un error dura lo que un éxito).
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  ' type={toast?.tipo}' \
  '' \
  "público: el aviso pierde su tipo"

echo "── 6. LO QUE VIAJA AL NAVEGADOR DEL CLIENTE ─────────────────────────────"

# 6.1 La existencia física vuelve a viajar.
mutar "src/lib/catalogo/publico-payload.ts" \
  'export const COLUMNAS_QUE_NO_VIAJAN = ["existencia", "stock"] as const;' \
  'export const COLUMNAS_QUE_NO_VIAJAN = ["stock"] as const;' \
  "paquete: la existencia vuelve a viajar"

# 6.2 Se deja de filtrar: viaja todo lo que se leyó.
mutar "src/lib/catalogo/publico-payload.ts" \
  '    if ((COLUMNAS_QUE_NO_VIAJAN as readonly string[]).includes(clave)) continue;' \
  '    void clave;' \
  "paquete: no se filtra ninguna columna"

# 6.3 Se pierde el respaldo a existencia y el producto se ve agotado.
mutar "src/lib/catalogo/publico-payload.ts" \
  '  salida.disponibilidad = disponibleVendible(p, fallback);' \
  '  salida.disponibilidad = p.disponibilidad ?? 0;\n  void fallback;' \
  "paquete: se pierde el respaldo a existencia"

# 6.4 Viaja el inventario de productos apagados.
mutar "src/lib/catalogo/publico-payload.ts" \
  '    inventory: inventory.filter(\n      (f) => typeof f.product_id === "string" && vivos.has(f.product_id),\n    ),' \
  '    inventory,' \
  "paquete: viaja el inventario de productos apagados"

# 6.5 La ruta arma el paquete por su cuenta.
mutar "src/app/api/catalogo/[marca]/public/route.ts" \
  '    return paquetePublico(\n      products as Record<string, unknown>[],\n      inventory as Record<string, unknown>[],\n    );' \
  '    return { products, inventory };' \
  "ruta pública: arma el paquete a mano"

# 6.6 Reebok vuelve a mandar columnas que nadie dibuja.
mutar "src/lib/catalogo/marcas.ts" \
  '      cols: "id,name,sku,category,gender,color,price,image_url,badge,active,existencia,disponibilidad",' \
  '      cols: "id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at",' \
  "marcas: Reebok vuelve a mandar las 4 columnas de más"

# 6.7 Una marca deja de leer la disponibilidad (el cliente vería existencia).
mutar "src/lib/catalogo/marcas.ts" \
  '      cols: "id,sku,name,category,gender,price,stock,existencia,disponibilidad,image_url,active,popular,is_regalia,badge",' \
  '      cols: "id,sku,name,category,gender,price,stock,existencia,image_url,active,popular,is_regalia,badge",' \
  "marcas: Joybees deja de leer la disponibilidad"

echo "── 6b. LA PUERTA DEL CATÁLOGO INTERNO DE REEBOK ─────────────────────────"

# 6b.1 Se vuelve a abrir el GET sin sesión.
mutar "src/app/api/catalogo/[marca]/products/route.ts" \
  '    const auth = requireRole(req, CATALOGO_ROLES);\n    if (auth instanceof NextResponse) return auth;\n\n    const adminScope' \
  '    const adminScope' \
  "products: Reebok vuelve a leerse sin sesión"

# 6b.2 Vuelve el estilo de auth viejo.
mutar "src/lib/catalogo/marcas.ts" \
  '      authStyle: "scope-admin",' \
  '      authStyle: "publico-scope-admin" as "scope-admin",' \
  "marcas: vuelve el authStyle público"

# 6b.3 La otra mitad de la puerta: el inventario por talla vuelve a leerse solo.
mutar "src/app/api/catalogo/reebok/inventory/route.ts" \
  '  const auth = requireRole(req, CATALOGO_ROLES)\n  if (auth instanceof NextResponse) return auth\n' \
  '' \
  "inventory: la existencia por talla vuelve a leerse sin sesión"

# 6b.4 Las rutas vuelven a la lista de caminos públicos del middleware.
mutar "src/middleware.ts" \
  '  "/api/catalogo/reebok/public",    // public catalog endpoint (no auth)' \
  '  "/api/catalogo/reebok/products",\n  "/api/catalogo/reebok/inventory",\n  "/api/catalogo/reebok/public",    // public catalog endpoint (no auth)' \
  "middleware: las dos rutas vuelven a ser públicas"

echo "── 7. EL VACÍO QUE PROMETÍA UN WHATSAPP QUE NO ESTABA ───────────────────"

# 7.1 El número se escribe a mano y deja de salir de la lista compartida.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '        {WHATSAPP_CONTACTOS.map((c) => (' \
  '        {[{ nombre: "Daniel", telefono: "50766745522", telefonoLabel: "6674-5522" }].map((c) => (' \
  "público: el WhatsApp se escribe a mano"

# 7.2 Se va el bloque entero y vuelve el texto que promete un WhatsApp que no
#     está — que es exactamente como estaba antes del 7-sep-2026.
mutar "src/components/catalogo/CatalogoPublicoPage.tsx" \
  '      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">\n        {WHATSAPP_CONTACTOS.map((c) => (' \
  '      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">\n        {[].map((c: { telefono: string; nombre: string; telefonoLabel: string }) => (' \
  "público: el WhatsApp prometido vuelve a no estar"

total_cazadas=$cazadas
total_sobrevivientes=$sobrevivientes

echo "── CONTROL 2 (sin mutar, después de restaurar todo) ─────────────────────"
restaurar
cazadas=0; sobrevivientes=0
probar "CONTROL 2 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control_2=$cazadas

echo "─────────────────────────────────────────────────────────────────────────"
echo "CONTROL 1: $control_1 · CONTROL 2: $control_2 (los dos tienen que ser 0)"
echo "RESULTADO: $total_cazadas cazadas · $total_sobrevivientes sobrevivientes"
[ "$total_sobrevivientes" -eq 0 ] && [ "$control_1" -eq 0 ] && [ "$control_2" -eq 0 ] \
  && echo "✅ TODAS CAZADAS" || echo "🔴 REVISAR"

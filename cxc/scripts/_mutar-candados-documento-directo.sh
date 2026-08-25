#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — las dos salidas DIRECTO + los dos números del Excel.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban (respaldo por COPIA) pase lo que pase.
#
#   bash scripts/_mutar-candados-documento-directo.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/catalogo/documento-switch.ts
CONTROL=src/components/catalogo/EnviarDocumentoSwitch.tsx
CHECKOUT=src/components/catalogo/CheckoutClient.tsx
DETALLE=src/components/catalogo/PedidoDetalleClient.tsx
CONFIRMACION=src/components/catalogo/ConfirmacionClient.tsx
RUTA=src/lib/catalogo/enviar-switch-route.ts
CHECKOUT_API=src/app/api/catalogo/checkout/route.ts
MOTOR=src/lib/catalogo/switch-envio.ts
EXCEL=src/lib/catalogos/pedidos-excel.ts
EXPORT_RUTA='src/app/api/catalogo/[marca]/pedidos-export/route.ts'
NUMEROS=src/lib/catalogo/numeros-pedido.ts

CANDADOS=(
  src/__tests__/lib/documento-switch.test.ts
  src/__tests__/lib/switch-envio-paralelo.test.ts
  src/__tests__/components/pedido-cliente-obligatorio.test.tsx
  src/__tests__/components/pedido-un-toque.test.tsx
  src/__tests__/api/catalogo-paridad-enviar-switch.test.ts
  src/__tests__/api/pedidos-export-numeros.test.ts
  src/__tests__/excel-exports-catalogos.test.ts
  src/__tests__/lib/switch-un-toque.test.ts
)

# 🩸 LA RESTAURACIÓN VA POR COPIA, NO POR `git checkout`.
# Hay archivos NUEVOS (sin versionar) en la rama: git aborta el comando ENTERO y
# no restaura NADA, así que las mutaciones se apilarían y ninguna se probaría por
# separado — un verificador que miente en verde es peor que no tenerlo. Ya pasó
# en este repo (16/16 "cazadas" sin haber probado una sola).
ARCHIVOS=("$REGLA" "$CONTROL" "$CHECKOUT" "$DETALLE" "$CONFIRMACION" "$RUTA" \
          "$CHECKOUT_API" "$MOTOR" "$EXCEL" "$EXPORT_RUTA" "$NUMEROS")
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
  # 🔴 UNA MUTACIÓN QUE NO MUTA SE DENUNCIA, NO SE DA POR CAZADA. Si el patrón
  # no matchea, el archivo queda SANO y los tests pasan: contarlo como "cazada"
  # sería inventar una verificación que nunca ocurrió. Ya pasó en este repo.
  if [ $aplicado -ne 0 ]; then
    printf '  ⚠️  %-64s NO SE PUDO APLICAR (patrón muerto)\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  # ⚠️ Se exige encontrar el resumen de vitest: si la corrida MUERE, "0 fallos"
  # se leería como "sobrevivió" y el veredicto mentiría en verde.
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    printf '  ⚠️  %-64s LA CORRIDA MURIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  ✅ %-64s cazada\n' "$nombre"; ok=$((ok+1))
  else
    printf '  🔴 %-64s PASÓ MUTADO (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── ENCARGO 1 · la etiqueta, lo único que quedó del párrafo ──────────────────

mutar "la etiqueta deja de decir que no aparta mercancía" "$REGLA" \
  'export const NOTA_COTIZACION = "no aparta mercancía";' \
  'export const NOTA_COTIZACION = "se manda como cotización";'

mutar "la etiqueta vuelve a ser un párrafo" "$REGLA" \
  'export const NOTA_COTIZACION = "no aparta mercancía";' \
  'export const NOTA_COTIZACION = "no aparta mercancía: si cotizas 500 pares los demás los pueden vender.";'

mutar "la cotización pierde su etiqueta" "$REGLA" \
  '  { clave: "cotizacion", titulo: "Cotización", nota: NOTA_COTIZACION },' \
  '  { clave: "cotizacion", titulo: "Cotización" },'

mutar "el PEDIDO también lleva la etiqueta (vuelven a ser gemelos)" "$REGLA" \
  '  { clave: "pedido", titulo: "Pedido" },' \
  '  { clave: "pedido", titulo: "Pedido", nota: NOTA_COTIZACION },'

mutar "un documento inventado se acepta tal cual" "$REGLA" \
  '  return esDocumentoSwitch(v) ? v : DOCUMENTO_POR_DEFECTO;' \
  '  return (typeof v === "string" ? v : DOCUMENTO_POR_DEFECTO) as DocumentoSwitch;'

mutar "el default se vuelve COTIZACIÓN" "$REGLA" \
  'export const DOCUMENTO_POR_DEFECTO: DocumentoSwitch = "pedido";' \
  'export const DOCUMENTO_POR_DEFECTO: DocumentoSwitch = "cotizacion";'

# ── ENCARGO 1 · el control: directo, sin ventana, y con las dos salidas ──────

mutar "el control dibuja su propia lista, no la del módulo" "$CONTROL" \
  '          {OPCIONES_DOCUMENTO.map((o) => {' \
  '          {[{ clave: "pedido" as const, titulo: "Pedido", nota: undefined }, { clave: "cotizacion" as const, titulo: "Cotización", nota: undefined }].map((o) => {'

mutar "el control deja de dibujar la etiqueta" "$CONTROL" \
  '                  <span className="mt-0.5 text-xs leading-tight text-amber-800">{o.nota}</span>' \
  '                  <span className="mt-0.5 text-xs leading-tight text-amber-800" />'

mutar "las dos salidas dejan de apagarse cuando falta el cliente" "$CONTROL" \
  '                disabled={deshabilitado}' \
  '                disabled={false}'

mutar "el control deja de decir QUÉ falta" "$CONTROL" \
  '      {!enviando && faltaTexto && (' \
  '      {false && faltaTexto && ('

mutar "las salidas siguen tocables mientras manda (doble envío)" "$CONTROL" \
  '      {enviando ? (' \
  '      {false ? ('

# ── ENCARGO 1 · las tres pantallas ──────────────────────────────────────────

mutar "el CHECKOUT manda sin ofrecer las dos salidas" "$CHECKOUT" \
  '              <EnviarDocumentoSwitch
                onElegir={(d) => { void confirmar(d); }}' \
  '              <button onClick={() => { void confirmar("pedido"); }} disabled={!puedeConfirmar}>Enviar a Switch</button>
              <EnviarDocumentoSwitchViejo
                onElegir={(d) => { void confirmar(d); }}'

mutar "el DETALLE manda sin ofrecer las dos salidas" "$DETALLE" \
  '                <EnviarDocumentoSwitch
                  tono="verde"' \
  '                <button onClick={() => { void enviarASwitchCon("pedido"); }}>Enviar a Switch</button>
                <EnviarDocumentoSwitchViejo
                  tono="verde"'

mutar "la CONFIRMACIÓN manda sin ofrecer las dos salidas" "$CONFIRMACION" \
  '                <EnviarDocumentoSwitch
                  onElegir={(d) => { void reintentar(d); }}' \
  '                <button onClick={() => { void reintentar("pedido"); }}>Enviar a Switch</button>
                <EnviarDocumentoSwitchViejo
                  onElegir={(d) => { void reintentar(d); }}'

mutar "el checkout deja de apagar la elección sin cliente" "$CHECKOUT" \
  '                deshabilitado={!puedeConfirmar}' \
  '                deshabilitado={false}'

mutar "el detalle deja de apagar la elección sin cliente" "$DETALLE" \
  '                  deshabilitado={!items.length || !clienteElegido}' \
  '                  deshabilitado={false}'

# ── ENCARGO 1 · 🔴 EL CANDADO QUE NO SE PUEDE SALTEAR ────────────────────────
# La elección directa NO puede ser una puerta de atrás al envío sin cliente.

mutar "🔴 EL SERVIDOR deja pasar una COTIZACIÓN sin cliente" "$RUTA" \
  '  if (!tieneClienteElegido(order)) {' '  if (false) {'

mutar "la ruta del detalle no le pasa el documento al motor" "$RUTA" \
  '    documento = normalizarDocumento(body?.documento);' \
  '    documento = normalizarDocumento(undefined);'

mutar "el checkout no le pasa el documento al motor" "$CHECKOUT_API" \
  '  const documento = normalizarDocumento(body?.documento);' \
  '  const documento = normalizarDocumento(undefined);'

mutar "🔴 todo sale como PEDIDO aunque se toque Cotización" "$MOTOR" \
  '    if (cotizacion) {' '    if (false) {'

mutar "🔴 todo sale como COTIZACIÓN" "$MOTOR" \
  '    if (cotizacion) {' '    if (true) {'

mutar "el envío no guarda QUÉ se mandó" "$MOTOR" \
  '  let insercion = await p.db.from(p.enviosTable).insert({ ...fila, documento }).select("id").single();' \
  '  let insercion = await p.db.from(p.enviosTable).insert(fila).select("id").single();'

# ── ENCARGO 2 · los dos números del Excel ───────────────────────────────────

mutar "el Excel pierde las dos columnas nuevas" "$EXCEL" \
  '    ...(conNumeros
      ? ([
          { header: "N° pedido", wch: 14 },
          { header: "Switch", wch: 30 },
        ] as ReportColumn[])
      : []),' \
  '    ...[],'

mutar "🔴 las columnas nuevas se INTERCALAN (corre la planilla de Daniel)" "$EXCEL" \
  '    ...(conOrigen ? [{ header: "Origen", wch: 10 } as ReportColumn] : []),
    { header: "Cliente", wch: 28 },' \
  '    ...(conOrigen ? [{ header: "Origen", wch: 10 } as ReportColumn] : []),
    { header: "N° pedido", wch: 14 },
    { header: "Cliente", wch: 28 },'

mutar "🔴 el que no salió vuelve a decir un GUION" "$NUMEROS" \
  'export const TEXTO_NO_ENVIADO = "No se ha mandado a Switch";' \
  'export const TEXTO_NO_ENVIADO = "—";'

mutar "🔴 la columna de Switch deja de decir si fue pedido o cotización" "$NUMEROS" \
  '  return `${etiqueta} en Switch: ${p.switchNumero!.trim()}`;' \
  '  return `Switch: ${p.switchNumero!.trim()}`;'

mutar "toda cotización se rotula como pedido en el Excel" "$NUMEROS" \
  '  const etiqueta = etiquetaDocumento(normalizarDocumento(p.switchDocumento));' \
  '  const etiqueta = etiquetaDocumento("pedido");'

mutar "el Excel escribe los textos a mano en vez de usar el módulo" "$EXCEL" \
  '      ...(conNumeros ? [textoNumeroPedido(numeros), textoEnSwitch(numeros)] : []),' \
  '      ...(conNumeros ? [p.numero_pedido ?? "—", p.switch_numero ?? "—"] : []),'

mutar "el pedido del LINK vuelve a un blanco en el Excel" "$EXCEL" \
  '      fuente: p.fuente,' \
  '      fuente: "orders" as const,'

mutar "la fila de totales no crece con las columnas (se desalinea)" "$EXCEL" \
  '    ...(conNumeros ? [null, null] : []),' \
  '    ...[],'

mutar "la ruta del export no manda el número de la casa" "$EXPORT_RUTA" \
  '        numero_pedido: numerosPedido.get(id) ?? null,' \
  '        numero_pedido: null,'

mutar "la ruta del export no manda QUÉ se mandó a Switch" "$EXPORT_RUTA" \
  '        switch_documento: switchDocumentos.get(id) ?? null,' \
  '        switch_documento: null,'

mutar "la ruta del export no manda el número de Switch" "$EXPORT_RUTA" \
  '        switch_numero: switchNumeros.get(id) ?? null,' \
  '        switch_numero: null,'

mutar "el export pierde el escalón tolerante del DDL 'documento'" "$EXPORT_RUTA" \
  '      for (const cols of [
        "order_id, numero_interno, pedido_switch_id, documento",
        "order_id, numero_interno, pedido_switch_id",
      ]) {' \
  '      for (const cols of [
        "order_id, numero_interno, pedido_switch_id, documento",
      ]) {'

mutar "el export barre la tabla de orders entera en vez de por ids" "$EXPORT_RUTA" \
  '        .select("id, order_number")
        .in("id", orderIds);' \
  '        .select("id, order_number");'

mutar "🔴 sin id_natural el Excel INVENTA que nadie salió a Switch" "$EXPORT_RUTA" \
  '    const wb = buildPedidosWorkbook({ marca: cfg.marca, titulo: cfg.exportTitulo, conOrigen: true, conNumeros, pedidos });' \
  '    const wb = buildPedidosWorkbook({ marca: cfg.marca, titulo: cfg.exportTitulo, conOrigen: true, conNumeros: true, pedidos });'

echo
echo "═══ RESULTADO: $ok cazadas · $fallo sin cazar ═══"
[ "$fallo" -eq 0 ]

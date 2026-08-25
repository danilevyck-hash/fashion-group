#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «Pedido» o «Cotización»: que el papel y la
# pantalla digan la verdad (25-ago-2026).
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban (respaldo por COPIA) pase lo que pase.
#
#   bash scripts/_mutar-candados-cotizacion-dice-la-verdad.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/catalogo/documento-switch.ts
LECTURA=src/lib/catalogo/switch-lock.ts
PDF_CORE=src/lib/catalogo/order-pdf-core.ts
PDF_RUTA='src/app/api/catalogo/[marca]/orders/[id]/pdf/route.ts'
CORREO='src/app/api/catalogo/[marca]/send-order/route.ts'
CONFIRMACION=src/components/catalogo/ConfirmacionClient.tsx
DETALLE=src/components/catalogo/PedidoDetalleClient.tsx
NUMEROS=src/lib/catalogo/numeros-pedido.ts
EXCEL=src/lib/catalogos/pedidos-excel.ts
TELEGRAM=src/lib/catalogo/telegram-pedido.ts

CANDADOS=(
  src/__tests__/lib/documento-switch.test.ts
  src/__tests__/api/pdf-pedido-o-cotizacion.test.ts
  src/__tests__/components/confirmacion-dice-la-verdad.test.tsx
  src/__tests__/components/pedido-pdf-dice-la-verdad.test.tsx
  src/__tests__/api/pedidos-export-numeros.test.ts
  src/__tests__/catalogo-pdf.test.ts
  src/__tests__/lib/switch-envio-paralelo.test.ts
  src/__tests__/components/pedido-un-toque.test.tsx
)

# 🩸 LA RESTAURACIÓN VA POR COPIA, NO POR `git checkout`.
# Hay archivos NUEVOS (sin versionar) en la rama: git aborta el comando ENTERO y
# no restaura NADA, así que las mutaciones se apilarían y ninguna se probaría por
# separado — un verificador que miente en verde es peor que no tenerlo.
ARCHIVOS=("$REGLA" "$LECTURA" "$PDF_CORE" "$PDF_RUTA" "$CORREO" "$CONFIRMACION" \
          "$DETALLE" "$NUMEROS" "$EXCEL" "$TELEGRAM")
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
#
# 🩸 EL REEMPLAZO LO HACE PYTHON, NO `perl -0pi -e 's|A|B|'`. En este repo ya
# pasó: un `||` del código real se des-escapa dentro del patrón de perl, la
# expresión se come el archivo entero y el informe dice "SOBREVIVIÓ". Acá los
# textos son literales, no regex, y no hay delimitador que se pueda romper.
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
  # sería inventar una verificación que nunca ocurrió.
  if [ $aplicado -ne 0 ]; then
    printf '  ⚠️  %-66s NO SE PUDO APLICAR (patrón muerto)\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  # ⚠️ Se exige encontrar el resumen de vitest: si la corrida MUERE, "0 fallos"
  # se leería como "sobrevivió" y el veredicto mentiría en verde.
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    printf '  ⚠️  %-66s LA CORRIDA MURIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  ✅ %-66s cazada\n' "$nombre"; ok=$((ok+1))
  else
    printf '  🔴 %-66s PASÓ MUTADO (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── La regla: qué palabra va y cuándo ────────────────────────────────────────

mutar "toda salida se rotula PEDIDO" "$REGLA" \
  '  return etiquetaDocumento(normalizarDocumento(envio.documento));' \
  '  return "Pedido";'

mutar "toda salida se rotula COTIZACIÓN" "$REGLA" \
  '  return etiquetaDocumento(normalizarDocumento(envio.documento));' \
  '  return "Cotización";'

mutar "🔴 un pedido que NO salió se rotula igual (se inventa etiqueta)" "$REGLA" \
  '  if (!ESTADOS_EN_SWITCH.includes(String(envio.estado ?? ""))) return null;' \
  '  void 0;'

mutar "un intento FALLIDO cuenta como 'está en Switch'" "$REGLA" \
  'export const ESTADOS_EN_SWITCH: readonly string[] = ["enviado", "verificado"];' \
  'export const ESTADOS_EN_SWITCH: readonly string[] = ["enviado", "verificado", "error", "pendiente"];'

mutar "la palabra del papel ignora lo que hay en Switch" "$REGLA" \
  '  return palabraEnSwitch(envio) ?? siNoSalio;' \
  '  return siNoSalio;'

mutar "sin envío el papel queda en blanco en vez de la palabra de siempre" "$REGLA" \
  '  siNoSalio: string = etiquetaDocumento(DOCUMENTO_POR_DEFECTO),' \
  '  siNoSalio: string = "",'

mutar "🔴 vuelve el PÁRRAFO que Daniel sacó" "$REGLA" \
  'export const NOTA_COTIZACION = "no aparta mercancía";' \
  'export const TEXTO_NO_RESERVA = "La cotización NO aparta la mercancía: si cotizas 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender.";
export const NOTA_COTIZACION = "no aparta mercancía";'

# ── La lectura: el escalón tolerante del DDL 20260824160000 ──────────────────

mutar "la lectura pierde el escalón tolerante y se cae sin la columna" "$LECTURA" \
  '  if (leido.error && /documento|column/i.test(leido.error.message || "")) {' \
  '  if (false) {'

mutar "un error de lectura se convierte en COTIZACIÓN" "$LECTURA" \
  '  if (leido.error || !leido.data) return null;' \
  '  if (leido.error || !leido.data) return "Cotización";'

mutar "la lectura no filtra por estado: cualquier envío rotula" "$LECTURA" \
  '      .in("estado", ESTADOS_EN_SWITCH as string[])' \
  '      .limit(50)'

# ── El papel ─────────────────────────────────────────────────────────────────

mutar "🔴 el PDF vuelve a decir siempre «Pedido:»" "$PDF_CORE" \
  '  doc.text(`${documentoLabel}: ${orderNumber}`, 90, 26);' \
  '  doc.text(`Pedido: ${orderNumber}`, 90, 26);'

mutar "el PDF ignora la palabra que le pasan" "$PDF_CORE" \
  '  const documentoLabel = opts.documentoLabel || etiquetaDocumento(DOCUMENTO_POR_DEFECTO);' \
  '  const documentoLabel = etiquetaDocumento(DOCUMENTO_POR_DEFECTO);'

mutar "el PDF pierde el número y deja solo la palabra" "$PDF_CORE" \
  '  doc.text(`${documentoLabel}: ${orderNumber}`, 90, 26);' \
  '  doc.text(`${documentoLabel}`, 90, 26);'

# ── La ruta del PDF (el "Ver PDF" de la confirmación) ────────────────────────

mutar "la ruta del PDF no mira el envío" "$PDF_RUTA" \
  '  const documentoLabel = (await palabraDelEnvioActivo(db, cfg.enviosTable, params.id)) ?? undefined;' \
  '  const documentoLabel: string | undefined = undefined;'

mutar "🔴 el nombre del archivo vuelve a decir siempre «Pedido-»" "$PDF_RUTA" \
  '        `${documentoLabel ?? "Pedido"}-${row.order_number}-${new Date().toISOString().slice(0, 10)}.pdf`,' \
  '        `Pedido-${row.order_number}-${new Date().toISOString().slice(0, 10)}.pdf`,'

mutar "el encabezado del papel y el nombre del archivo se separan" "$PDF_RUTA" \
  '    documentoLabel,
  });' \
  '  });'

mutar "🩸 el nombre del archivo pierde el RFC 6266 y la tilde viaja rota" "$PDF_RUTA" \
  "  return \`inline; filename=\"\${ascii}\"; filename*=UTF-8''\${encodeURIComponent(nombre)}\`;" \
  '  return `inline; filename="${nombre}"`;'

mutar "🔴 el NÚMERO de la casa se renombra con la palabra adelante" "$PDF_RUTA" \
  '    orderNumber: String(row.order_number),' \
  '    orderNumber: `${documentoLabel ?? "Pedido"}-${String(row.order_number)}`,'

# ── El adjunto del correo ────────────────────────────────────────────────────

mutar "el correo no mira el envío" "$CORREO" \
  '    documentoLabel = (await palabraDelEnvioActivo(db, cfg.enviosTable, body.orderId)) ?? undefined;' \
  '    documentoLabel = undefined;'

mutar "🔴 el adjunto vuelve a llamarse siempre «Pedido-»" "$CORREO" \
  '  const pdfFilename = `${documentoLabel ?? "Pedido"}-${orderNumber}-${dateStr}.pdf`;' \
  '  const pdfFilename = `Pedido-${orderNumber}-${dateStr}.pdf`;'

mutar "el papel adjunto no lleva la palabra adentro" "$CORREO" \
  '    bultoSize: cfg.bultoSize,
    documentoLabel,' \
  '    bultoSize: cfg.bultoSize,'

# ── La confirmación ──────────────────────────────────────────────────────────

mutar "🔴 el título de la confirmación vuelve a mentir" "$CONFIRMACION" \
  '  const palabra = palabraDelPapel(envio);' \
  '  const palabra = "Pedido";'

mutar "el título dice siempre Cotización" "$CONFIRMACION" \
  '  const palabra = palabraDelPapel(envio);' \
  '  const palabra = "Cotización";'

mutar "el título pierde el número del pedido" "$CONFIRMACION" \
  '              {order ? `${palabra} ${order.order_number} guardado` : `${palabra} guardado`}' \
  '              {`${palabra} guardado`}'

mutar "🔴 vuelve el párrafo a la confirmación" "$CONFIRMACION" \
  '            {order && (' \
  '            {switchOk && <p className="mt-2 text-xs text-amber-800">La cotización NO aparta la mercancía: si cotizas 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender.</p>}
            {order && ('

# ── El detalle ───────────────────────────────────────────────────────────────

mutar "el detalle vuelve a decidir SOLO por el status" "$DETALLE" \
  '      const prefix = palabraDelPapel(
        switchEnvio,
        order.status === "confirmado" ? "Pedido" : "Cotización",
      );' \
  '      const prefix = order.status === "confirmado" ? "Pedido" : "Cotización";'

mutar "el detalle pierde el #584: un borrador se baja como Pedido" "$DETALLE" \
  '        order.status === "confirmado" ? "Pedido" : "Cotización",' \
  '        "Pedido",'

mutar "en el detalle el archivo y el papel se separan" "$DETALLE" \
  '        documentoLabel: prefix,' \
  '        documentoLabel: "Pedido",'

# ── Lo que YA decía la verdad y no se puede aflojar ──────────────────────────

mutar "la LISTA del admin deja de decir cuál de las dos fue" "$NUMEROS" \
  '  const etiqueta = etiquetaDocumento(normalizarDocumento(p.switchDocumento));' \
  '  const etiqueta = "Pedido";'

mutar "el EXCEL deja de decir cuál de las dos fue" "$EXCEL" \
  '      switchDocumento: p.switch_documento ?? null,' \
  '      switchDocumento: "pedido",'

mutar "Telegram deja de distinguir 📝 de 📦" "$TELEGRAM" \
  '  const cotizacion = esCotizacion(documento);' \
  '  const cotizacion = false;'

mutar "Telegram calla que la cotización no aparta mercancía" "$TELEGRAM" \
  '      ...(cotizacion ? ["No aparta mercancía — sigue disponible para los demás."] : []),' \
  '      ...[],'

echo
echo "═══ VEREDICTO ═══"
echo "  cazadas: $ok    sin cazar / no aplicadas: $fallo"
[ "$fallo" -eq 0 ] || exit 1

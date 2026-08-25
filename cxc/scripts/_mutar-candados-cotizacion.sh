#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de "pedido o cotización".
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban (respaldo por copia) pase lo que pase.
#
#   bash scripts/_mutar-candados-cotizacion.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/catalogo/documento-switch.ts
MOTOR=src/lib/catalogo/switch-envio.ts
RUTA=src/lib/catalogo/enviar-switch-route.ts
CHECKOUT_API=src/app/api/catalogo/checkout/route.ts
CHECKOUT=src/components/catalogo/CheckoutClient.tsx
DETALLE=src/components/catalogo/PedidoDetalleClient.tsx
MODAL=src/components/catalogo/ElegirDocumentoSwitch.tsx
TELEGRAM=src/lib/catalogo/telegram-pedido.ts

CANDADOS=(
  src/__tests__/lib/documento-switch.test.ts
  src/__tests__/lib/switch-envio-paralelo.test.ts
  src/__tests__/components/pedido-cliente-obligatorio.test.tsx
  src/__tests__/api/catalogo-paridad-enviar-switch.test.ts
  src/__tests__/lib/telegram-pedido-origen.test.ts
)

# 🩸 LA RESTAURACIÓN VA POR COPIA, NO POR `git checkout`.
# Hay archivos NUEVOS (sin versionar) en la rama: git aborta el comando ENTERO y
# no restaura NADA, así que las mutaciones se apilarían y ninguna se probaría por
# separado — un verificador que miente en verde es peor que no tenerlo. Ya pasó
# en este repo (16/16 "cazadas" sin haber probado una sola).
ARCHIVOS=("$REGLA" "$MOTOR" "$RUTA" "$CHECKOUT_API" "$CHECKOUT" "$DETALLE" "$MODAL" "$TELEGRAM")
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
p.write_text(s.replace(de, a, 1))
PY
  local aplicado=$?
  if [ $aplicado -ne 0 ]; then
    printf '  ⚠️  %-62s NO SE PUDO APLICAR\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  # ⚠️ Se exige encontrar el resumen de vitest: si la corrida MUERE, "0 fallos"
  # se leería como "sobrevivió" y el veredicto mentiría en verde.
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    printf '  ⚠️  %-62s LA CORRIDA MURIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  ✅ %-62s cazada\n' "$nombre"; ok=$((ok+1))
  else
    printf '  🔴 %-62s PASÓ MUTADO (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── La regla pura ────────────────────────────────────────────────────────────

mutar "un documento inventado se acepta tal cual" "$REGLA" \
  '  return esDocumentoSwitch(v) ? v : DOCUMENTO_POR_DEFECTO;' \
  '  return (typeof v === "string" ? v : DOCUMENTO_POR_DEFECTO) as DocumentoSwitch;'

mutar "el default se vuelve COTIZACIÓN" "$REGLA" \
  'export const DOCUMENTO_POR_DEFECTO: DocumentoSwitch = "pedido";' \
  'export const DOCUMENTO_POR_DEFECTO: DocumentoSwitch = "cotizacion";'

mutar "la advertencia deja de decir que NO aparta" "$REGLA" \
  '  "La cotización NO aparta la mercancía: si cotizas 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender.";' \
  '  "Se manda como cotización.";'

mutar "la opción de cotizar pierde su advertencia" "$REGLA" \
  '    queHace: TEXTO_NO_RESERVA,' \
  '    queHace: TEXTO_SI_RESERVA,'

# ── El motor ─────────────────────────────────────────────────────────────────

mutar "🔴 todo sale como PEDIDO aunque se pida cotización" "$MOTOR" \
  '    if (cotizacion) {' '    if (false) {'

mutar "🔴 todo sale como COTIZACIÓN" "$MOTOR" \
  '    if (cotizacion) {' '    if (true) {'

mutar "la verificación usa siempre la ruta del pedido" "$MOTOR" \
  '      const info = cotizacion
        ? await client.apicotizacionInfo(pedidoSwitchId)
        : await client.apipedidoInfo(pedidoSwitchId);' \
  '      const info = await client.apipedidoInfo(pedidoSwitchId);'

mutar "el envío no guarda QUÉ se mandó" "$MOTOR" \
  '  let insercion = await p.db.from(p.enviosTable).insert({ ...fila, documento }).select("id").single();' \
  '  let insercion = await p.db.from(p.enviosTable).insert(fila).select("id").single();'

mutar "con el DDL pendiente el envío se cae (sin reintento)" "$MOTOR" \
  '  if (insercion.error && /documento|column/i.test(insercion.error.message || "")) {' \
  '  if (false) {'

mutar "un id que no existe se guarda igual (NaN)" "$MOTOR" \
  '    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;' \
  '    return n;'

mutar "el motor ignora el documento que le pasan" "$MOTOR" \
  '  const documento: DocumentoSwitch = p.documento ?? DOCUMENTO_POR_DEFECTO;' \
  '  const documento: DocumentoSwitch = DOCUMENTO_POR_DEFECTO;'

# ── Las rutas ────────────────────────────────────────────────────────────────

mutar "🔴 EL SERVIDOR deja pasar una cotización sin cliente" "$RUTA" \
  '  if (!tieneClienteElegido(order)) {' '  if (false) {'

mutar "la ruta del detalle no le pasa el documento al motor" "$RUTA" \
  '    documento = normalizarDocumento(body?.documento);' \
  '    documento = normalizarDocumento(undefined);'

mutar "el checkout no le pasa el documento al motor" "$CHECKOUT_API" \
  '  const documento = normalizarDocumento(body?.documento);' \
  '  const documento = normalizarDocumento(undefined);'

# ── Las pantallas ────────────────────────────────────────────────────────────

mutar "el checkout manda sin preguntar QUÉ" "$CHECKOUT" \
  '                  onClick={abrirEleccionDocumento}' \
  '                  onClick={() => { void confirmar("pedido"); }}'

# ⚠️ LAS GUARDAS DEL NAVEGADOR NO SE PUEDEN VERIFICAR POR MUTACIÓN, y se dice
# de frente en vez de inflar el número. Las dos que abren la elección
# (`abrirEleccionDocumento` en el checkout y `enviarASwitch` en el detalle)
# solo corren si el botón está encendido, y React NO despacha el click de un
# botón deshabilitado ni forzándole `disabled = false` desde el test — medido de
# nuevo el 24-ago-2026 quitando cada guarda: los 30 casos de conducta siguen
# verdes. Son segunda capa, no el candado.
# 🔴 EL CANDADO que no se puede saltear es el 422 del SERVIDOR, y ése SÍ está
# mutado acá arriba ("EL SERVIDOR deja pasar una cotización sin cliente").

mutar "el detalle manda sin preguntar QUÉ" "$DETALLE" \
  '                <button onClick={enviarASwitch} disabled={confirming || !items.length || !clienteElegido}' \
  '                <button onClick={() => { void enviarASwitchCon("pedido"); }} disabled={confirming || !items.length || !clienteElegido}'

mutar "el selector dibuja su propia lista, no la del módulo" "$MODAL" \
  '          {OPCIONES_DOCUMENTO.map((o) => (' \
  '          {[{ clave: "pedido" as const, titulo: "Pedido", queHace: "", detalle: undefined }, { clave: "cotizacion" as const, titulo: "Cotización", queHace: "", detalle: undefined }].map((o) => ('

mutar "el selector deja de dibujar la advertencia" "$MODAL" \
  '              <span className="mt-0.5 block text-xs leading-snug text-gray-700">{o.queHace}</span>' \
  '              <span className="mt-0.5 block text-xs leading-snug text-gray-700" />'

# ── El aviso ─────────────────────────────────────────────────────────────────

mutar "Telegram no dice cuál de las dos fue" "$TELEGRAM" \
  '    etapa: etapaTelegram(documento),' \
  '    etapa: "enviado a Switch",'

mutar "Telegram calla que la cotización no aparta mercancía" "$TELEGRAM" \
  '      ...(cotizacion ? ["No aparta mercancía — sigue disponible para los demás."] : []),' \
  '      ...[],'

echo
echo "═══ RESULTADO: $ok cazadas · $fallo sin cazar ═══"
[ "$fallo" -eq 0 ]

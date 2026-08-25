#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — los dos números en la lista de pedidos del admin.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO POR `git checkout`. Hay archivos NUEVOS
# (sin versionar) en la rama: git aborta el comando ENTERO y no restaura NADA,
# así que las mutaciones se apilarían y ninguna se probaría por separado. Ya
# pasó en este repo: 16/16 "cazadas" sin haber probado una sola.
#
#   bash scripts/_mutar-candados-pedidos-numeros.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

LIB=src/lib/catalogo/numeros-pedido.ts
TAB='src/app/catalogos/admin/[marca]/PedidosTab.tsx'
RUTA='src/app/api/catalogo/[marca]/pedidos-unificado/route.ts'

CANDADOS=(
  src/__tests__/lib/numeros-pedido.test.ts
  src/__tests__/components/pedidos-numeros-en-la-lista.test.tsx
  src/__tests__/api/pedidos-unificado-numeros.test.ts
  src/__tests__/api/catalogo-paridad-listas.test.ts
)

ARCHIVOS=("$LIB" "$TAB" "$RUTA")
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
    printf '  ⚠️  %-64s NO SE PUDO APLICAR\n' "$nombre"; fallo=$((fallo+1)); return
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

# ── La regla pura (numeros-pedido.ts) ────────────────────────────────────────

mutar "🔴 el número de Switch se pinta SOLO (no dice si es pedido o cotización)" "$LIB" \
  '  return `${etiqueta} en Switch: ${p.switchNumero!.trim()}`;' \
  '  return p.switchNumero!.trim();'

mutar "🔴 toda cotización se rotula como PEDIDO" "$LIB" \
  '  const etiqueta = etiquetaDocumento(normalizarDocumento(p.switchDocumento));' \
  '  const etiqueta = etiquetaDocumento("pedido");'

mutar "🔴 el que no salió vuelve a decir «—»" "$LIB" \
  'export const TEXTO_NO_ENVIADO = "No se ha mandado a Switch";' \
  'export const TEXTO_NO_ENVIADO = "—";'

mutar "🔴 el pedido del link vuelve a un BLANCO" "$LIB" \
  'export const TEXTO_SIN_NUMERO_DEL_LINK = "Se numera al abrirlo";' \
  'export const TEXTO_SIN_NUMERO_DEL_LINK = "";'

mutar "nadie está en Switch (todo dice «no se ha mandado»)" "$LIB" \
  '  return p.switchNumero !== null && p.switchNumero !== undefined;' \
  '  return false;'

mutar "todos están en Switch (el que no salió inventa un número)" "$LIB" \
  '  return p.switchNumero !== null && p.switchNumero !== undefined;' \
  '  return true;'

mutar "el «?» heredado se pinta como si fuera un número" "$LIB" \
  'const SIN_NUMERO_REAL = (n: string | null | undefined): boolean => !n || n.trim() === "" || n.trim() === "?";' \
  'const SIN_NUMERO_REAL = (n: string | null | undefined): boolean => !n;'

mutar "el número propio se ignora (todo dice «Sin número»)" "$LIB" \
  '  if (tieneNumeroPropio(p)) return p.numeroPedido!.trim();' \
  '  if (false) return p.numeroPedido!.trim();'

mutar "el buscador vuelve a mirar SOLO el cliente" "$LIB" \
  '  return [p.cliente ?? "", p.numeroPedido ?? "", p.switchNumero ?? ""].join(" ").toLowerCase();' \
  '  return String(p.cliente ?? "").toLowerCase();'

# ── La pantalla (PedidosTab.tsx) ─────────────────────────────────────────────

mutar "🔴 la fila deja de dibujar los números" "$TAB" \
  '                    <NumerosPedido pedido={pedido} esOrders={isOrdersRow(pedido)} />' \
  ''

mutar "la fila deja de pintar el número de Switch" "$TAB" \
  '        {textoEnSwitch(datos)}' \
  ''

mutar "la fila deja de pintar el número del pedido" "$TAB" \
  '        {textoNumeroPedido(datos)}' \
  ''

mutar "el pedido del link se trata como interno (pierde su explicación)" "$TAB" \
  '                    <NumerosPedido pedido={pedido} esOrders={isOrdersRow(pedido)} />' \
  '                    <NumerosPedido pedido={pedido} esOrders={true} />'

mutar "el buscador de la pantalla vuelve a mirar solo el cliente" "$TAB" \
  '      if (
        !textoBuscablePedido({
          cliente: p.cliente,
          numeroPedido: p.numero_pedido ?? null,
          switchNumero: p.switch_numero ?? null,
        }).includes(q)
      )
        return false;' \
  '      if (!(p.cliente || "").toLowerCase().includes(q)) return false;'

# ── La ruta (pedidos-unificado) ──────────────────────────────────────────────

mutar "🔴 el número del pedido no viaja al navegador" "$RUTA" \
  '      numero_pedido: numerosPedido.get(r.id_natural) ?? null,' \
  '      numero_pedido: null,'

mutar "🔴 QUÉ se mandó no viaja (la cotización se ve como pedido)" "$RUTA" \
  '      switch_documento: switchDocumentos.get(r.id_natural) ?? null,' \
  '      switch_documento: null,'

mutar "se pierde el escalón tolerante del DDL (la lista se caería)" "$RUTA" \
  '    for (const cols of [
      "order_id, numero_interno, pedido_switch_id, documento",
      "order_id, numero_interno, pedido_switch_id",
    ]) {' \
  '    for (const cols of [
      "order_id, numero_interno, pedido_switch_id, documento",
    ]) {'

mutar "los order_number se piden barriendo la tabla entera" "$RUTA" \
  '      .select("id, order_number")
      .in("id", orderIds);' \
  '      .select("id, order_number");'

echo
echo "═══ RESULTADO: $ok cazadas · $fallo sin cazar ═══"
[ "$fallo" -eq 0 ]

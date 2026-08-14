#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados del cliente del pedido.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban (respaldo por copia) pase lo que pase.
#
#   bash scripts/_mutar-candados-cliente-pedido.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

CHECKOUT=src/components/catalogo/CheckoutClient.tsx
DETALLE=src/components/catalogo/PedidoDetalleClient.tsx
PICKER=src/components/catalogo/ClienteSwitchPicker.tsx
REGLA=src/lib/catalogo/cliente-elegido.ts
RUTA=src/lib/catalogo/enviar-switch-route.ts

CANDADOS=(
  src/__tests__/components/pedido-cliente-obligatorio.test.tsx
  src/__tests__/lib/cliente-elegido.test.ts
  src/__tests__/components/pedido-duplicar-agregar.test.tsx
  src/__tests__/api/catalogo-paridad-enviar-switch.test.ts
)


# 🩸 LA RESTAURACIÓN VA POR COPIA, NO POR `git checkout`.
# El primer intento usaba `git checkout -- <los 4>` y `cliente-elegido.ts` es un
# archivo NUEVO (sin versionar): git aborta el comando ENTERO y no restaura
# NADA. Resultado: las mutaciones se apilaban y las 16 salían "cazadas" sin
# haber probado ninguna por separado — un verificador que miente en verde es
# peor que no tenerlo.
RESPALDO="$(mktemp -d)"
for f in "$CHECKOUT" "$DETALLE" "$PICKER" "$REGLA" "$RUTA"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"
done
restaurar() {
  for f in "$CHECKOUT" "$DETALLE" "$PICKER" "$REGLA" "$RUTA"; do cp "$RESPALDO/$f" "$f"; done
}
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
    printf '  ⚠️  %-58s NO SE PUDO APLICAR\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  if npx vitest run "${CANDADOS[@]}" >/dev/null 2>&1; then
    printf '  🔴 %-58s PASÓ MUTADO (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  else
    printf '  ✅ %-58s cazada\n' "$nombre"; ok=$((ok+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

mutar "el checkout vuelve a arrancar con Contado puesto" "$CHECKOUT" \
  'useState<Cliente | undefined>(undefined)' 'useState<Cliente | undefined>(CONTADO)'

mutar "el botón del checkout deja de exigir lo que falta" "$CHECKOUT" \
  'const puedeConfirmar = loaded && falta.length === 0 && !sending;' \
  'const puedeConfirmar = loaded && cart.length > 0 && !sending;'

mutar "el checkout deja de decir qué falta" "$CHECKOUT" \
  '{!sending && falta.length > 0 && (' '{false && falta.length > 0 && ('

mutar "Contado vuelve a un id escrito a mano" "$CHECKOUT" \
  'return real ? { ...CONTADO, id: real.id } : CONTADO;' 'return CONTADO;'

# ⚠️ Los `return` de guarda DENTRO de los handlers del navegador NO se pueden
# verificar por mutación, y se dice de frente: React no despacha el click de un
# botón deshabilitado ni forzándole `disabled = false` desde el test (se midió).
# Son segunda capa contra un cambio futuro del `disabled`, no el candado. El
# candado que no se puede saltear es el del SERVIDOR, abajo.

mutar "el detalle deja mandar sin cliente (botón)" "$DETALLE" \
  'disabled={confirming || !items.length || !clienteElegido}' \
  'disabled={confirming || !items.length}'

mutar "elegir cliente deja de escribir el título" "$DETALLE" \
  'if (!delLink) {
          const titulo = nombreDeCliente(elegido);' \
  'if (false) {
          const titulo = nombreDeCliente(elegido);'

mutar "vuelve el texto libre en los pedidos internos" "$DETALLE" \
  'const nombreEditableAMano = canEdit && delLink;' 'const nombreEditableAMano = canEdit;'

mutar "el picker del detalle vuelve a preseleccionar el mostrador" "$DETALLE" \
  'valor={clienteSwitch ? { id: clienteSwitch.id, nombre: clienteSwitch.nombre, codigo: clienteSwitch.codigo } : undefined}' \
  'valor={clienteSwitch ? { id: clienteSwitch.id, nombre: clienteSwitch.nombre, codigo: clienteSwitch.codigo } : { id: null, nombre: null, codigo: null }}'

mutar "🔴 EL SERVIDOR deja pasar un pedido sin cliente" "$RUTA" \
  '  if (!tieneClienteElegido(order)) {' '  if (false) {'

mutar "el servidor deja de leer el origen del pedido" "$RUTA" \
  'origen_short_id: (row.origen_short_id as string) ?? null,' \
  'origen_short_id: null,'

mutar "el origen del link se mira SOLO por origen_original" "$REGLA" \
  '  if (p.origen_original === "link") return true;
  return typeof p.origen_short_id === "string" && p.origen_short_id.trim().length > 0;' \
  '  return p.origen_original === "link";'

mutar "el pedido del link se traba (pierde su excepción)" "$REGLA" \
  '  if (esPedidoDelLink(p)) return true;' '  if (false) return true;'

mutar "null vuelve a contar como cliente elegido" "$REGLA" \
  '  const id = p.cliente_switch_id;
  return typeof id === "number" && Number.isInteger(id) && id > 0;' \
  '  return true;'

mutar "el selector ignora el mostrador real que manda la API" "$PICKER" \
  '          const c = d.contado as FilaCliente | null | undefined;' \
  '          const c = null as FilaCliente | null;'

mutar 'la etiqueta vuelve a "Contado" a secas' "$REGLA" \
  'export const LABEL_CONTADO = "Contado (venta de mostrador)";' \
  'export const LABEL_CONTADO = "Contado";'

mutar 'sin cliente vuelve a decir "Contado"' "$REGLA" \
  'export const SIN_CLIENTE_ELEGIDO = "Elige el cliente";' \
  'export const SIN_CLIENTE_ELEGIDO = "Contado";'

echo
echo "═══ RESULTADO: $ok cazadas · $fallo sin cazar ═══"
[ "$fallo" -eq 0 ]

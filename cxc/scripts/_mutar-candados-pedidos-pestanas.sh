#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de las DOS pestañas de pedidos.
#
# Rompe una cosa por vez y exige que el test se ponga ROJO. Un candado que pasa
# estando mutado no es un candado.
#
# 🩸 LA RESTAURACIÓN NO USA `git checkout --`: con el trabajo sin commitear eso
# revierte los cambios PROPIOS, no la mutación (y si un archivo es NUEVO, git
# aborta el comando ENTERO y no restaura nada, así que las mutaciones se apilan
# y el script informa 100% de aciertos MINTIENDO). Se copia a un temporal y se
# restaura desde ahí, con trap EXIT.
#
#   bash scripts/_mutar-candados-pedidos-pestanas.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LISTA="src/components/catalogo/PedidosListClient.tsx"
LOCK="src/lib/catalogo/switch-lock.ts"
RUTA="src/app/api/catalogo/[marca]/orders/route.ts"

T_PEST="src/__tests__/components/pedidos-dos-pestanas.test.tsx"
T_NUM="src/__tests__/lib/pedidos-numero-switch.test.ts"

RESPALDO="$(mktemp -d)"
trap 'restaurar_todo; rm -rf "$RESPALDO"' EXIT
guardar() { for f in "$@"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done; }
restaurar_todo() {
  [ -d "$RESPALDO" ] || return 0
  for f in "$LISTA" "$LOCK" "$RUTA"; do
    [ -f "$RESPALDO/$f" ] && cp "$RESPALDO/$f" "$f"
  done
}
restaurar() { for f in "$@"; do cp "$RESPALDO/$f" "$f"; done; }

guardar "$LISTA" "$LOCK" "$RUTA"
ok=0; fail=0

# $1 = nombre  $2 = archivos de test (separados por espacio)  $3... = mutados
correr() {
  local nombre="$1"; shift
  local tests="$1"; shift
  # shellcheck disable=SC2086
  if npx vitest run $tests >/tmp/t203b-mut.log 2>&1; then
    echo "  ❌ NO CAZADA: $nombre  (el test pasó estando mutado)"
    fail=$((fail+1))
  else
    echo "  ✅ cazada: $nombre"
    ok=$((ok+1))
  fi
  restaurar "$@"
}

echo "── La pestaña se decide por el NÚMERO DE SWITCH ──"

# 1. La pestaña vuelve a decidirse por el estado interno.
python3 - <<'PY'
p = "src/components/catalogo/PedidosListClient.tsx"
s = open(p).read()
s = s.replace('const enSwitch = (o: Order) => o.en_switch === true;',
              'const enSwitch = (o: Order) => o.status === "confirmado";', 1)
open(p, "w").write(s)
PY
correr "la pestaña vuelve a mirar status===confirmado" "$T_PEST" "$LISTA"

# 2. Vuelve la pestaña "Todos".
python3 - <<'PY'
p = "src/components/catalogo/PedidosListClient.tsx"
s = open(p).read()
s = s.replace('''            ["borradores", "Borradores", conteo.borradores],''',
'''            ["todos" as Pestana, "Todos", orders.length],
            ["borradores", "Borradores", conteo.borradores],''', 1)
open(p, "w").write(s)
PY
correr "vuelve la pestaña «Todos»" "$T_PEST" "$LISTA"

# 3. Vuelve la píldora de estado "Confirmado" a la fila.
python3 - <<'PY'
p = "src/components/catalogo/PedidosListClient.tsx"
s = open(p).read()
ancla = '                  {enSwitch(o) && ('
s = s.replace(ancla, '''                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100">
                    {o.status === "confirmado" ? "Confirmado" : "Borrador"}
                  </span>
''' + ancla, 1)
open(p, "w").write(s)
PY
correr "vuelve la píldora «Confirmado»" "$T_PEST" "$LISTA"

# 4. El número de Switch deja de pintarse en la fila.
#    ⚠️ El ancla se actualizó cuando el número se mudó a la segunda línea: la
#    mutación vieja apuntaba a un texto que ya no existe, o sea que NO mutaba
#    nada y el script reportaba "no cazada" sobre un candado sano. Una mutación
#    que no se aplica es tan inútil como un candado que no cierra.
python3 - <<'PY'
p = "src/components/catalogo/PedidosListClient.tsx"
s = open(p).read()
viejo = '                          #{o.switch_numero}'
assert viejo in s, "el ancla de la mutación 4 ya no existe — actualizala"
s = s.replace(viejo, '                          #', 1)
open(p, "w").write(s)
PY
correr "el número no se pinta en la fila" "$T_PEST" "$LISTA"

# 5. Un pedido en Switch SIN número se esconde en Borradores.
python3 - <<'PY'
p = "src/components/catalogo/PedidosListClient.tsx"
s = open(p).read()
s = s.replace('const enSwitch = (o: Order) => o.en_switch === true;',
              'const enSwitch = (o: Order) => o.en_switch === true && !!o.switch_numero;', 1)
open(p, "w").write(s)
PY
correr "el que no tiene número se esconde en Borradores" "$T_PEST" "$LISTA"

# 6. El helper inventa un "?" como número (lo que hacía pedidos-unificado).
python3 - <<'PY'
p = "src/lib/catalogo/switch-lock.ts"
s = open(p).read()
s = s.replace('    fuera.set(String(e.order_id), num ? String(num) : null);',
              '    fuera.set(String(e.order_id), String(num || "?"));', 1)
open(p, "w").write(s)
PY
correr "el helper inventa un «?» como número" "$T_NUM" "$LOCK"

# 7. El helper deja de acotar por estado activo (un envío con error contaría).
python3 - <<'PY'
p = "src/lib/catalogo/switch-lock.ts"
s = open(p).read()
s = s.replace('''    .in("order_id", orderIds)
    .in("estado", ["enviado", "verificado"]);''',
              '    .in("order_id", orderIds);', 1)
open(p, "w").write(s)
PY
correr "el helper cuenta envíos fallidos como «en Switch»" "$T_NUM" "$LOCK"

# 8. El helper falla CERRADO (todo a Switch) en vez de abierto.
python3 - <<'PY'
p = "src/lib/catalogo/switch-lock.ts"
s = open(p).read()
s = s.replace('  if (error || !data) return fuera;',
              '  if (error || !data) { for (const id of orderIds) fuera.set(id, null); return fuera; }', 1)
open(p, "w").write(s)
PY
correr "ante un error, manda todo a «Pedidos a Switch»" "$T_NUM" "$LOCK"

# 9. La ruta deja de mandar en_switch.
python3 - <<'PY'
p = "src/app/api/catalogo/[marca]/orders/route.ts"
s = open(p).read()
s = s.replace('      en_switch: numerosSwitch.has(idPedido),\n', '', 1)
open(p, "w").write(s)
PY
correr "la ruta deja de mandar en_switch" "$T_NUM" "$RUTA"

# 10. La ruta deja de mandar el número.
python3 - <<'PY'
p = "src/app/api/catalogo/[marca]/orders/route.ts"
s = open(p).read()
s = s.replace('      switch_numero: numerosSwitch.get(idPedido) ?? null,\n', '', 1)
open(p, "w").write(s)
PY
correr "la ruta deja de mandar el número" "$T_NUM" "$RUTA"

echo
echo "════════════════════════════════════════════"
echo "  cazadas: $ok   ·   NO cazadas: $fail"
echo "════════════════════════════════════════════"
restaurar_todo
[ "$fail" -eq 0 ]

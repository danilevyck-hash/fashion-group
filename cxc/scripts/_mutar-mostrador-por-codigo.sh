#!/usr/bin/env bash
# Verificador de mutaciones de la fila ámbar «Mostrador» de Ventas › Clientes.
#
# 🔑 LO QUE HAY QUE PROBAR NO ES QUE EL SELECTOR CAMBIÓ, ES QUE EL MONTO ESTÁ.
# El defecto del 2-sep-2026 fue que la fila decía $25.835,65 de $54.478,59: un
# candado que solo mirara «¿compara por código?» habría pasado en verde con la
# fila mostrando un sexto del total. Por eso las mutaciones de abajo atacan las
# DOS cosas por separado — la identidad (nombre vs código) y la aritmética
# (`find` vs suma) — y cada una tiene que salir cazada sola.
#
# 🩸 Mismas tres cicatrices que el verificador del reparto por empresa: restaura
# por COPIA (hay archivos nuevos y `git checkout` abortaría entero), reemplaza
# LITERAL con python (el código tiene `||` y `/`), y exige que el archivo cambie
# y que vitest COLECTE (un cero de una corrida muerta se leería como
# «sobrevivió»).
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/components/ventas-mostrador-por-codigo.test.tsx
  src/__tests__/lib/clientes-ytd.test.ts
  src/__tests__/lib/clientes-puerta-unica.test.ts
  src/__tests__/lib/clientes-master-solo-del-grupo.test.ts
)
ARCHIVOS=(
  src/components/ventas/ClientesView.tsx
  src/lib/clientes/mostrador.ts
  supabase/migrations/20260908120000_mostrador_por_codigo.sql
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}
# Igual que `mutar` pero al revés: este cambio TIENE que sobrevivir. Sin esto,
# un candado que se pusiera rojo ante cualquier byte distinto se leería como si
# estuviera cazando de verdad.
inocua() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  🔴 SE PUSO ROJO SIN MOTIVO ($n) — $4"; SOB=$((SOB+1))
  else echo "  ✅ sobrevivió, como debe — $4"; CAZ=$((CAZ+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

echo
echo "== 1. volver a identificar el mostrador POR NOMBRE =="

mutar src/components/ventas/ClientesView.tsx \
  'const base = data.rows.filter(c => !esMostrador(c.id));' \
  'const base = data.rows.filter(c => c.nombre.trim().toUpperCase() !== "VENTAS LOCAL");' \
  'el universo vuelve a sacar el mostrador por nombre (y lo mete al ranking)'

mutar src/components/ventas/ClientesView.tsx \
  'const filas = data.rows.filter(c => esMostrador(c.id));' \
  'const filas = data.rows.filter(c => c.nombre.trim().toUpperCase() === "VENTAS LOCAL");' \
  'la fila ámbar vuelve a buscarse por nombre'

mutar src/lib/clientes/mostrador.ts \
  'return (codigo ?? "").trim().toUpperCase() === CODIGO_MOSTRADOR;' \
  'return (codigo ?? "").trim().toUpperCase() === "VENTAS LOCAL";' \
  '`esMostrador` compara contra el nombre canónico en vez del código'

echo
echo "== 2. que la fila deje de decir el total de lo que llegó =="

mutar src/components/ventas/ClientesView.tsx \
  'const ytd = filas.reduce((s, f) => s + f.ytd, 0);' \
  'const ytd = filas[0].ytd;' \
  'vuelve el `find`: la fila muestra UNA empresa y la llama el total'

mutar src/components/ventas/ClientesView.tsx \
  'const ytd = filas.reduce((s, f) => s + f.ytd, 0);' \
  'const ytd = 54478.59;' \
  'la fila clava el total del grupo y suma empresas que el filtro excluyó'

mutar src/components/ventas/ClientesView.tsx \
  'const filas = data.rows.filter(c => esMostrador(c.id));' \
  'const filas = data.rows.filter(c => esMostrador(c.id) || c.empresaKey === "fashion_shoes");' \
  'la fila se cuela un cliente de una empresa que no es mostrador'

echo
echo "== 3. el SQL deja de dejarle llegar las seis =="

mutar supabase/migrations/20260908120000_mostrador_por_codigo.sql \
  "      (del_grupo AND cliente_codigo = 'TCKCTA')" \
  "      (del_grupo AND cliente_codigo = 'VENTAS LOCAL')" \
  'el filtro del año en curso vuelve a mirar un nombre'

mutar supabase/migrations/20260908120000_mostrador_por_codigo.sql \
  "            (s.del_grupo AND s.cliente_codigo = 'TCKCTA')
            OR s.c_norm NOT IN (" \
  "            s.c_norm NOT IN (" \
  'los años cerrados se quedan sin el arreglo (la fila cambiaría al elegir 2025)'

mutar supabase/migrations/20260908120000_mostrador_por_codigo.sql \
  "      (del_grupo AND cliente_codigo = 'TCKCTA')" \
  "      (cliente_codigo = 'TCKCTA')" \
  'el mostrador de Boston y de ACS se cuela a la pantalla del grupo'

echo
echo "== 4. controles =="

# 🩸 CONTROL 1: patrón que a propósito NO existe. Si no sale ⛔, el denunciador
# está roto y todos los ✅ de arriba valen lo mismo que un barrido vacío.
mutar src/components/ventas/ClientesView.tsx \
  'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO' 'x' \
  'CONTROL — debe salir ⛔ NO MUTÓ'

# 🩸 CONTROL 2: un cambio REAL que el candado no tiene por qué mirar. Si esto se
# pone rojo, el candado está atado a la pintura y no al número.
inocua src/components/ventas/ClientesView.tsx \
  '<tr data-fila-mostrador className="bg-amber-50/40">' \
  '<tr data-fila-mostrador className="bg-amber-100/40">' \
  'CONTROL — cambiar el tono del ámbar NO es un defecto'

echo
echo "cazadas: $CAZ · sobrevivieron: $SOB · no-op/muertas: $NOOP  (1 no-op es el CONTROL 1)"

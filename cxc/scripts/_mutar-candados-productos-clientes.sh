#!/usr/bin/env bash
# Verificación por MUTACIÓN de «Quién lo compra».
#
# Se rompe el código A PROPÓSITO, una cosa por vez, y se exige que los candados
# se pongan ROJOS. Un candado que sobrevive a su propia mutación no es un
# candado: es un archivo que da permiso para romper.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NUNCA CON `git checkout`: hay archivos NUEVOS
# en la rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Este repo ya pagó
# eso (los candados del selector de cliente dieron 16/16 MINTIENDO).
#
#   bash scripts/_mutar-candados-productos-clientes.sh

set -uo pipefail
cd "$(dirname "$0")/.."

PURO="src/lib/ventas/productos-clientes.ts"
SRV="src/lib/ventas/productos-clientes-server.ts"
RUTA="src/app/api/ventas/productos/codigos/route.ts"
VISTA="src/components/ventas/ProductosView.tsx"
TESTS=(
  "src/__tests__/lib/ventas-productos-clientes.test.ts"
  "src/__tests__/api/ventas-productos-clientes-route.test.ts"
  "src/__tests__/components/ventas-productos-precio-periodos.test.tsx"
)

RESPALDO=$(mktemp -d)
for f in "$PURO" "$SRV" "$RUTA" "$VISTA"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "$PURO" "$SRV" "$RUTA" "$VISTA"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0
sobrevividas=0

# 🩸 UNA MUTACIÓN QUE NO CAMBIA EL ARCHIVO NO ES UNA MUTACIÓN. Pasó de verdad:
# al rebasar, dos patrones de `perl` dejaron de encajar porque el código que
# nombraban se había renombrado, y el barrido los reportó como "SOBREVIVIÓ" — o
# sea acusó a candados sanos de no cazar. Ahora, si el archivo quedó idéntico,
# se dice PATRÓN MUERTO y se cuenta como fallo: hay que arreglar el patrón.
cambio() {
  local f="$1"
  ! cmp -s "$f" "$RESPALDO/$f"
}

probar() {
  local nombre="$1"
  local mutado="${2:-}"
  if [ -n "$mutado" ] && ! cambio "$mutado"; then
    echo "  💀 PATRÓN MUERTO (no mutó nada): $nombre"
    sobrevividas=$((sobrevividas + 1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run "${TESTS[@]}" --reporter=dot 2>&1)
  # 🔑 Si no aparece el resumen de vitest, la corrida MURIÓ y "0 fallos" se
  # leería como "sobrevivió". Eso es peor que no medir.
  if ! grep -qE "Tests +[0-9]+ (failed|passed)" <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no se puede juzgar: $nombre"
    sobrevividas=$((sobrevividas + 1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    local n
    n=$(grep -oE "Tests +[0-9]+ failed" <<<"$salida" | grep -oE "[0-9]+" | head -1)
    echo "  ✅ CAZADA (${n} rojos): $nombre"
    cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ: $nombre"
    sobrevividas=$((sobrevividas + 1))
  fi
  restaurar
}

echo "=== MUTACIONES ==="

# 1 · la nota de crédito SUMA en vez de restar
perl -0pi -e 's/const signo = signoDeTipo\(l\.tipo_comprobante\);/const signo = 1;/' "$PURO"
probar "la NC suma en vez de restar" "$PURO"

# 2 · el signo se define A MANO acá (segunda definición)
perl -0pi -e 's/const signo = signoDeTipo\(l\.tipo_comprobante\);/const signo = l.tipo_comprobante === "Nota de Credito" ? -1 : 1;/' "$PURO"
probar "el signo se redefine acá, sin tilde" "$PURO"

# 3 · la llave del agrupado es el NOMBRE y no el id
perl -0pi -e 's/const clave = l\.cliente_switch_id == null \? "sin-cliente" : String\(l\.cliente_switch_id\);/const clave = String(l.cliente_nombre ?? "sin-cliente");/' "$PURO"
probar "agrupa por nombre y no por id de cliente" "$PURO"

# 4 · el % se mide contra otra base (deja de sumar 100)
perl -0pi -e 's/if \(totalVenta <= 0\) return null;\n  return venta \/ totalVenta;/if (totalVenta <= 0) return null;\n  return venta \/ (totalVenta * 2);/' "$PURO"
probar "el % se mide contra una base que no es la lista" "$PURO"

# 5 · la lista NO se ordena (el que más compra deja de ir arriba)
perl -0pi -e 's/\.sort\(\(a, b\) => b\.venta - a\.venta\);/;/' "$PURO"
probar "la lista deja de ordenarse por venta" "$PURO"

# 6 · un cliente en cero de las dos igual se muestra
perl -0pi -e 's/\.filter\(c => c\.cantidad !== 0 \|\| c\.venta !== 0\)/.filter(() => true)/' "$PURO"
probar "el cliente en cero neto no se saca" "$PURO"

# 7 · el cruce vuelve a ser por el TEXTO de la descripción
perl -0pi -e 's/p_codigos: lista,/p_descripcion: "x",/' "$SRV"
probar "la RPC recibe la descripción en vez de los códigos" "$SRV"

# 8 · un timeout dispara el camino largo (empuja la caída)
perl -0pi -e 's/if \(!funcionNoCreada\(rpc\.error\)\) \{/if (false) {/' "$SRV"
probar "un timeout cae al camino largo" "$SRV"

# 9 · la lectura paginada pierde el orden estable
perl -0pi -e 's/\.order\("id", \{ ascending: true \}\)\n          //' "$SRV"
probar "la lectura pagina sin orden estable" "$SRV"

# 10 · la lectura deja de pedir COUNT (truncado silencioso a 1000)
perl -0pi -e 's/pedirCount \? \{ count: "exact" \} : \{\},/{},/' "$SRV"
probar "la lectura deja de verificar contra el COUNT" "$SRV"

# 11 · un fallo de clientes se lleva puestos los códigos
perl -0pi -e 's/  let detalle: ClientesDeDescripcion \| null = null;/  let detalle: ClientesDeDescripcion | null = null; if (true) throw new Error("x");/' "$RUTA"
probar "un fallo de clientes tumba también los códigos" "$RUTA"

# 12 · los códigos que se muestran NO son los que se cruzan
perl -0pi -e 's/codigos\.map\(c => c\.codigo\)/["OTRO-COD"]/' "$RUTA"
probar "se cruza con códigos distintos de los que se muestran" "$RUTA"

# 13 · vuelven los 12 meses sueltos al selector
perl -0pi -e 's/\{PERIODOS_FIJOS\.map\(p => \(/{[...PERIODOS_FIJOS, { key: "ytd" as ProductosPeriodo, nombre: "Feb 2026" }].map(p => (/' "$VISTA"
probar "vuelve un mes suelto al desplegable" "$VISTA"

# 14 · el desplegable deja de dibujar la lista de clientes
perl -0pi -e 's/\{tab === "clientes" && <BloqueClientes/{false \&\& <BloqueClientes/' "$VISTA"
probar "el desplegable no dibuja quién lo compra" "$VISTA"

# 15 · la lista vacía afirma que no lo compra nadie
perl -0pi -e 's/Todavía no tenemos el detalle por cliente de estas ventas\./No lo compra nadie./' "$VISTA"
probar "la lista vacía afirma que no lo compra nadie" "$VISTA"

# ⛔ ACÁ VIVÍAN LAS MUTACIONES 16-19 DEL AVISO ÁMBAR DE LAS DOS GRAFÍAS.
# Ese aviso decía "la lista de abajo suma más que la venta de la fila" y era
# cierto mientras la fila sumaba UNA sola grafía. Desde que Ventas › Productos
# agrupa por el nombre más reciente del código (PR de 25-ago-2026), la fila suma
# las dos: el aviso pasó a ser falso y se fue. Lo reemplazó otro —el de "código
# mal clasificado en Switch"— y sus mutaciones están en el script de esa función:
#     bash scripts/_mutar-candados-descripcion-reciente.sh
# Dejarlas acá apuntando a código que ya no existe no probaría nada: darían
# PATRÓN MUERTO, que es justo lo que este barrido está hecho para denunciar.

# 20 · las grafías se NORMALIZAN (tapa 7 casos y deja 29 mintiendo)
perl -0pi -e 's/    if \(d === descripcionDeLaFila\) continue;/    if (d.trim().toLowerCase() === descripcionDeLaFila.trim().toLowerCase()) continue;/' "$PURO"
probar "las grafías se normalizan para tapar los casos fáciles" "$PURO"

echo
echo "cazadas: $cazadas · sobrevividas: $sobrevividas"
[ "$sobrevividas" -eq 0 ] || exit 1

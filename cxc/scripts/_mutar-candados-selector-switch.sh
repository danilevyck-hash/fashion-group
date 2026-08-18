#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del SELECTOR ÚNICO DE CLIENTE DE SWITCH cazan lo que dicen?
#
# Cada mutación deshace UNA de las cosas que este cambio fijó y espera que la
# corrida se ponga ROJA. Un candado que pasa con la mutación puesta da permiso
# para romper.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO POR `git checkout`: hay archivos NUEVOS y
# BORRADOS en la rama, y git aborta el comando entero sin restaurar nada — las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
#   bash scripts/_mutar-candados-selector-switch.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

CHECKOUT="src/components/catalogo/CheckoutClient.tsx"
REGLA="src/lib/catalogo/cliente-elegido.ts"
PICKER="src/components/catalogo/ClienteSwitchPicker.tsx"

TESTS=(
  "src/__tests__/un-solo-selector-de-cliente.test.ts"
  "src/__tests__/lib/cliente-elegido.test.ts"
  "src/__tests__/components/pedido-cliente-obligatorio.test.tsx"
  "src/__tests__/api/catalogo-cliente-switch.test.ts"
)

TMP="$(mktemp -d)"
for f in "$CHECKOUT" "$REGLA" "$PICKER"; do
  mkdir -p "$TMP/$(dirname "$f")"; cp "$f" "$TMP/$f"
done
restaurar() { for f in "$CHECKOUT" "$REGLA" "$PICKER"; do cp "$TMP/$f" "$f"; done; }
trap 'restaurar; rm -rf "$TMP"' EXIT

CAZADAS=0; TOTAL=0

correr() { npx vitest run "${TESTS[@]}" --silent >/dev/null 2>&1; }

probar() {  # $1 = nombre de la mutación
  TOTAL=$((TOTAL + 1))
  if correr; then
    echo "  🔴 SOBREVIVIÓ — $1"
  else
    echo "  ✅ cazada    — $1"
    CAZADAS=$((CAZADAS + 1))
  fi
  restaurar
}

echo "Control (sin mutar): debe estar VERDE"
if correr; then echo "  ✅ verde"; else echo "  🔴 el control ya está rojo — arreglá eso antes"; exit 1; fi
echo

# 1. El checkout deja de delegar y se dibuja su propia lista de clientes.
python3 - "$CHECKOUT" <<'PY'
import sys, re
p = sys.argv[1]; s = open(p).read()
s = s.replace('import ClienteSwitchPicker, {\n  type ClienteSwitchOpcion,\n  nombreDeCliente,\n} from "@/components/catalogo/ClienteSwitchPicker";\n', '')
s = s.replace('type ClienteSwitchOpcion', 'type Kk')
s = re.sub(r'<ClienteSwitchPicker[\s\S]*?/>',
           '<><input type="search" />{(clientes as {id:number;nombre:string}[]).map((c) => (<button key={c.id} onClick={() => setCliente(c as never)}>{c.nombre}</button>))}</>', s)
s = s.replace('const [cliente, setCliente] = useState<ClienteSwitchOpcion | undefined>(undefined);',
              'const clientes: unknown[] = [];\n  const [cliente, setCliente] = useState<{id:number|null;nombre:string|null;codigo:string|null} | undefined>(undefined);')
open(p, "w").write(s)
PY
probar "el checkout vuelve a tener su PROPIA lista de clientes"

# 2. El mostrador viaja con el nombre del directorio en vez del literal histórico.
perl -0pi -e 's/return \{ id: c\.id \?\? ID_CONTADO_RESPALDO, nombre: NOMBRE_CONTADO_GUARDADO \};/return { id: c.id ?? ID_CONTADO_RESPALDO, nombre: c.nombre || NOMBRE_CONTADO_GUARDADO };/' "$REGLA"
probar "el mostrador viaja con el nombre de SU empresa (VENTAS LOCA) en vez de Contado"

# 3. Se pierde el respaldo del id del mostrador → el pedido se traba con el
#    cliente ya elegido en pantalla.
perl -0pi -e 's/c\.id \?\? ID_CONTADO_RESPALDO/c.id as number/' "$REGLA"
probar "sin id resuelto, elegir el mostrador manda un id vacío"

# 4. El mostrador se reconoce por NOMBRE en vez de por código.
perl -0pi -e 's/return \(c\.codigo \|\| ""\)\.trim\(\)\.toUpperCase\(\) === CODIGO_CLIENTE_CONTADO;/return (c.nombre || "").trim().toLowerCase() === "contado";/' "$REGLA"
probar "el mostrador se reconoce por nombre (colador: cada empresa lo llama distinto)"

# 5. El nombre puede quedar vacío → 400 del servidor con el cliente elegido.
perl -0pi -e 's/nombre: \(c\.nombre \|\| ""\)\.trim\(\) \|\| \(c\.codigo \|\| ""\)\.trim\(\) \|\| `Cliente \$\{id\}`/nombre: c.nombre as string/' "$REGLA"
probar "el nombre del cliente puede viajar vacío"

# 6. El selector vuelve a preseleccionar el mostrador.
perl -0pi -e 's/valor=\{cliente\}/valor={cliente ?? { id: null, nombre: null, codigo: null }}/' "$CHECKOUT"
probar "el selector del checkout vuelve a preseleccionar el mostrador"

# 7. El selector deja de sacar el mostrador de la lista → dos formas de lo mismo.
perl -0pi -e 's/setResultados\(\(\(d\.clientes \|\| \[\]\) as FilaCliente\[\]\)\.filter\(/setResultados(((d.clientes || []) as FilaCliente[]).filter((_x) => true).filter(/' "$PICKER"
perl -0pi -e 's/\(c\) => \(c\.codigo \|\| ""\)\.trim\(\)\.toUpperCase\(\) !== CODIGO_CLIENTE_CONTADO,\n\s*\)\);/(_c) => true,\n          ));/' "$PICKER"
probar "el mostrador vuelve a aparecer DOS veces (arriba y dentro de la lista)"

echo
echo "═══ $CAZADAS de $TOTAL cazadas ═══"
[ "$CAZADAS" -eq "$TOTAL" ]

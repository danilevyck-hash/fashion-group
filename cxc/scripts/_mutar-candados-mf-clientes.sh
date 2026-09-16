#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿El candado de Multifashion › Clientes caza de verdad, o pasa en verde?
#
# Rompe a propósito, una por una, las reglas que dice vigilar, y exige que el
# candado se ponga ROJO en cada caso. Al final, DOS controles: cambios que NO
# deben romper nada. Un candado que no falla nunca no está vigilando.
#
# Uso:  bash scripts/_mutar-candados-mf-clientes.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TEST="src/__tests__/lib/multifashion-clientes-seguimiento.test.ts"
ARCHIVOS=(
  "src/lib/multifashion/clientes-universo.ts"
  "src/lib/multifashion/clientes-lectura.ts"
  "src/lib/multifashion/clientes-seguimiento.ts"
  "src/lib/multifashion/fuera-de-seguimiento.ts"
  "src/lib/multifashion/contacto-registro.ts"
  "src/app/api/multifashion/contactos/route.ts"
  "src/app/api/multifashion/fidelizacion/route.ts"
  "src/components/multifashion/ListaSeguimientoClientes.tsx"
  "src/components/multifashion/ClientesMultifashionSubtab.tsx"
  "supabase/migrations/20261129120000_multifashion_contactos.sql"
)
RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0

verde() { npx vitest run "$TEST" >/dev/null 2>&1; }

mutar() { # $1 = qué rompe · $2 = archivo · $3 = perl -pe
  local que="$1" archivo="$2" guion="$3"
  perl -0pi -e "$guion" "$archivo"
  if verde; then
    echo "  ❌ ESCAPÓ — $que"; ESCAPADAS=$((ESCAPADAS+1))
  else
    echo "  ✅ cazada  — $que"; CAZADAS=$((CAZADAS+1))
  fi
  restaurar
}

control() { # $1 = qué cambia (y NO debe romper) · $2 = archivo · $3 = perl -pe
  local que="$1" archivo="$2" guion="$3"
  perl -0pi -e "$guion" "$archivo"
  if verde; then
    echo "  ✅ control — $que (sigue verde, como debe)"; CONTROLES_OK=$((CONTROLES_OK+1))
  else
    echo "  ❌ CONTROL ROJO — $que (el candado es demasiado literal)"; CONTROLES_MAL=$((CONTROLES_MAL+1))
  fi
  restaurar
}

echo "Antes de empezar, el candado tiene que estar VERDE:"
verde && echo "  ✅ verde" || { echo "  ❌ ya está rojo — arregla eso primero"; exit 1; }

echo
echo "── 1. Vienen TODOS, no 50 ──────────────────────────────────────────────"
mutar "la lista vuelve a pedirle los datos a la RPC del ranking" \
  "src/components/multifashion/ListaSeguimientoClientes.tsx" \
  's{const conteos = useMemo}{const _rpc = "/api/multifashion/retail-recurrentes";\n  const conteos = useMemo}'
mutar "la lectura de clientes pone un .limit(1000) en vez de paginar" \
  "src/lib/multifashion/clientes-lectura.ts" \
  's{\.order\("id", \{ ascending: true \}\)\n        \.range\(desde, hasta\),}{.limit(1000),}'

echo
echo "── 2. db-max-rows ──────────────────────────────────────────────────────"
mutar "se le quita el .order() estable a la lectura de facturas" \
  "src/lib/multifashion/clientes-lectura.ts" \
  's{      \.order\("id", \{ ascending: true \}\)\n      \.range\(desde, hasta\),}{      .range(desde, hasta),}'
mutar "el contacto deja de paginar y lee de un solo tiro" \
  "src/app/api/multifashion/contactos/route.ts" \
  's{leerTodoPaginado<FilaContacto>}{leerDeUnTiro<FilaContacto>}'

echo
echo "── 3. UN solo orden ────────────────────────────────────────────────────"
mutar "la lista abre por el que compró MÁS RECIENTE (al revés)" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{if \(da !== db\) return db - da;}{if (da !== db) return da - db;}'
mutar "el empate deja de desempatar por código (el orden se mueve solo)" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{return a\.cliente_switch_id - b\.cliente_switch_id;}{return 0;}'
mutar "vuelve el orden por encabezado a la pantalla" \
  "src/components/multifashion/ListaSeguimientoClientes.tsx" \
  's{const recorta = }{const ordenarPor = "dias";\n  const recorta = }'

echo
echo "── 4. Los tres chips ───────────────────────────────────────────────────"
mutar "vuelve «Frecuentes» como cuarto chip" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{export const CHIPS = \["no_vuelven", "nuevos", "todos"\] as const;}{export const CHIPS = ["no_vuelven", "nuevos", "frecuentes", "todos"] as const;}'
mutar "la lista abre en «Todos» en vez de en los que no vuelven" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{export const CHIP_INICIAL: Chip = "no_vuelven";}{export const CHIP_INICIAL: Chip = "todos";}'
mutar "«No vuelven» pasa a contar también a los que nunca compraron" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{c\.visitas > 0 && !estaFueraDeSeguimiento\(c\.cliente_switch_id\)}{!estaFueraDeSeguimiento(c.cliente_switch_id)}'

mutar "«Nuevos» vuelve a ser «lo registraron este mes»" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{return clientes\.filter\(\(c\) => c\.primera_compra_este_mes\);}{return clientes.filter((c) => c.nuevo_mes);}'

echo
echo "── 4-bis. El revendedor ────────────────────────────────────────────────"
mutar "Maher vuelve a la lista de llamar" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{c\.visitas > 0 && !estaFueraDeSeguimiento\(c\.cliente_switch_id\)}{c.visitas > 0}'
mutar "se le olvidan dos de sus tres códigos" \
  "src/lib/multifashion/fuera-de-seguimiento.ts" \
  's{    codigo: 48,}{    codigo: 9048,}'
mutar "el revendedor se reconoce por NOMBRE (y se lleva puesta a una MAHERLIN)" \
  "src/lib/multifashion/fuera-de-seguimiento.ts" \
  's{return typeof codigo === "number" && CODIGOS\.has\(codigo\);}{return String(codigo).toLowerCase().includes("maher");}'
mutar "un código queda sin decir por qué está afuera" \
  "src/lib/multifashion/fuera-de-seguimiento.ts" \
  's/porque: "Revendedor: le compra a la tienda para volver a vender \(Daniel, 16-sep-2026\)\."/porque: "x."/'

echo
echo "── 5. Sin teléfono no se dibuja el botón ───────────────────────────────"
mutar "el botón se dibuja siempre, aunque no haya teléfono" \
  "src/components/multifashion/ListaSeguimientoClientes.tsx" \
  's/\{cliente\.telefono_wa && \(/{true \&\& (/'
mutar "el WhatsApp sale con un texto sugerido (Daniel dijo «vacío»)" \
  "src/components/multifashion/ListaSeguimientoClientes.tsx" \
  's{href=\{cliente\.telefono_wa\}}{href={`${cliente.telefono_wa}?text=Hola`}}'

echo
echo "── 6. El registro es del MÓDULO, no del usuario ────────────────────────"
mutar "el GET filtra los contactos por quien los escribió" \
  "src/app/api/multifashion/contactos/route.ts" \
  's{\.select\("cliente_switch_id, canal, created_at"}{.eq("contactado_por", auth.userName).select("cliente_switch_id, canal, created_at"}'
mutar "el último contacto se calcula por USUARIO" \
  "src/lib/multifashion/contacto-registro.ts" \
  's{export function ultimoContactoPorCliente\(\n  filas: readonly FilaContacto\[\],\n\)}{export function ultimoContactoPorCliente(\n  filas: readonly FilaContacto[],\n  _usuario?: string,\n)}'
mutar "el POST deja de firmar quién escribió" \
  "src/app/api/multifashion/contactos/route.ts" \
  's{contactado_por: auth\.userName \?\? auth\.userId \?\? "desconocido",}{contactado_por: "tienda",}'
mutar "el contacto se guarda por NOMBRE en vez de por código" \
  "src/app/api/multifashion/contactos/route.ts" \
  's{cliente_switch_id: id,\n    canal,}{cliente_nombre: String(body.nombre_norm), canal,}'

echo
echo "── 7. El monto y las visitas ───────────────────────────────────────────"
mutar "la nota de crédito SUMA en vez de restar" \
  "src/lib/multifashion/clientes-universo.ts" \
  's{if \(tipo === "Nota de Crédito"\) return -sub;}{if (tipo === "Nota de Crédito") return sub;}'
mutar "el mayoreo entra al monto (y deja de ser la base del ranking)" \
  "src/lib/multifashion/clientes-universo.ts" \
  's{if \(f\.is_wholesale === false\) a\.total \+= subtotalFirmado\(f\);}{a.total += subtotalFirmado(f);}'
mutar "una nota de crédito cuenta como VISITA (mueve las cuatro tarjetas)" \
  "src/lib/multifashion/clientes-universo.ts" \
  's/if \(String\(f\.tipo_comprobante \?\? ""\) === "Factura"\) \{/if (true) \{/'

echo
echo "── 8. La migración ─────────────────────────────────────────────────────"
mutar "la tabla gana un empresa_key (la empresa deja de ser constante)" \
  "supabase/migrations/20261129120000_multifashion_contactos.sql" \
  's{  cliente_switch_id integer NOT NULL,}{  empresa_key text NOT NULL,\n  cliente_switch_id integer NOT NULL,}'
mutar "se le quita el CHECK al canal" \
  "supabase/migrations/20261129120000_multifashion_contactos.sql" \
  "s{CHECK \\(canal IN \\('whatsapp'\\)\\)}{CHECK (canal IS NOT NULL)}"
mutar "el cliente se guarda por nombre también" \
  "supabase/migrations/20261129120000_multifashion_contactos.sql" \
  's{  cliente_switch_id integer NOT NULL,}{  cliente_switch_id integer NOT NULL,\n  cliente_nombre text,}'

echo
echo "── 9. Lo que NO se toca ────────────────────────────────────────────────"
mutar "se retira una de las cuatro tarjetas de arriba" \
  "src/components/multifashion/ClientesMultifashionSubtab.tsx" \
  's{label="Dormidos"}{label="Los que no vuelven"}'
mutar "Mayoreo pierde su layout de tarjetas del celular" \
  "src/components/multifashion/ClientesMultifashionSubtab.tsx" \
  's{data-vista="tarjetas"}{data-tarjetas="si"}'

echo
echo "── CONTROLES: cambios que NO deben poner nada rojo ─────────────────────"
control "se reacomoda un comentario del módulo puro" \
  "src/lib/multifashion/clientes-seguimiento.ts" \
  's{// Módulo PURO: el orden, los tres chips y el renglón, sin base de datos\.}{// Módulo PURO. El orden, los chips y el renglón; sin base de datos.}'
control "se le cambia el color del chip activo" \
  "src/components/multifashion/ListaSeguimientoClientes.tsx" \
  's{border-teal-700 bg-teal-700 text-white}{border-emerald-700 bg-emerald-700 text-white}'

echo
echo "───────────────────────────────────────────────────────────────────────"
echo "Mutaciones: $((CAZADAS + ESCAPADAS)) · cazadas $CAZADAS · ESCAPADAS $ESCAPADAS"
echo "Controles : $((CONTROLES_OK + CONTROLES_MAL)) · verdes $CONTROLES_OK · ROJOS $CONTROLES_MAL"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

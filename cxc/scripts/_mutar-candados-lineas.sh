#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del detalle de línea.
#
# Rompe a propósito cada regla y exige que el test se ponga ROJO. Un candado
# que no se cae con la mutación puesta no está protegiendo nada.
#
# 🔴 La restauración va por COPIA, no por `git checkout`: con archivos NUEVOS
# (sin seguimiento) git ABORTA el comando entero y no restaura NADA, así que las
# mutaciones se apilan y ninguna se prueba por separado. Ya pasó una vez en este
# repo y el verificador reportó 16/16 MINTIENDO.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

TEST="src/__tests__/lib/factura-lineas.test.ts src/__tests__/lib/factura-lineas-sync.test.ts"
PARSE="src/lib/switch-api/factura-lineas-parse.ts"
SYNC="src/lib/switch-api/sync-factura-lineas.ts"
TIPOS="src/lib/switch-api/sync-log-tipos.ts"
TMP="$(mktemp -d)"
for f in "$PARSE" "$SYNC" "$TIPOS"; do cp "$f" "$TMP/$(basename "$f")"; done
restaurar() { for f in "$PARSE" "$SYNC" "$TIPOS"; do cp "$TMP/$(basename "$f")" "$f"; done; }
trap 'restaurar; rm -rf "$TMP"' EXIT

CAZADAS=0; ESCAPADAS=0

probar() { # $1 = nombre
  if npx vitest run $TEST >/dev/null 2>&1; then
    echo "  ❌ SOBREVIVIÓ  $1"; ESCAPADAS=$((ESCAPADAS+1))
  else
    echo "  ✅ cazada      $1"; CAZADAS=$((CAZADAS+1))
  fi
  restaurar
}

echo "MUTACIONES — detalle de línea"
echo "─────────────────────────────────────────────────────────"

# 1. guardar el dato crudo en vez de la magnitud → la NC entra con cantidad negativa
perl -0pi -e 's/cantidad: Math\.abs\(cantidad\)/cantidad: cantidad/' "$PARSE"
probar "la cantidad se guarda cruda (la NC queda negativa)"

# 2. lo mismo con el monto
perl -0pi -e 's/subtotal_con_descuento: Math\.abs\(subtotal\)/subtotal_con_descuento: subtotal/' "$PARSE"
probar "el monto se guarda crudo"

# 3. la NC deja de restar → la firma del doble
perl -0pi -e 's/return tipo === "Nota de Crédito" \? -1 : 1;/return 1;/' "$PARSE"
probar "una nota de crédito SUMA en vez de restar"

# 4. el tipo se compara SIN tilde → el signo no se aplica nunca, en silencio
perl -0pi -e 's/tipo === "Nota de Crédito"/tipo === "Nota de Credito"/' "$PARSE"
probar "el tipo se compara sin tilde"

# 5. el orden de la línea se pierde → dos líneas del mismo artículo colapsan
perl -0pi -e 's/linea_orden: orden,/linea_orden: 0,/' "$PARSE"
probar "todas las líneas quedan con el mismo orden"

# 6. la coma de miles vuelve a producir NaN
perl -0pi -e 's/const limpio = String\(v\)\.replace\(\/,\/g, ""\)\.trim\(\);/const limpio = String(v).trim();/' "$PARSE"
probar "una coma de miles produce NaN"

# 7. un texto vacío se guarda como "" en vez de null
perl -0pi -e 's/return s === "" \? null : s;/return s;/' "$PARSE"
probar "los textos vacíos se guardan como cadena vacía"

# 8. entra un tipo que NO tiene endpoint de detalle
perl -0pi -e 's/export const TIPOS_CON_DETALLE = \["Factura", "Nota de Crédito"\] as const;/export const TIPOS_CON_DETALLE = ["Factura", "Nota de Crédito", "Tiquete"] as const;/' "$PARSE"
probar "un tiquete entra como si tuviera detalle"

# 9. se cuela Multifashion en la lista de empresas
perl -0pi -e 's/return \[\.\.\.B2B_EMPRESA_KEYS\];/return [...B2B_EMPRESA_KEYS, "american_classic" as EmpresaKey];/' "$PARSE"
probar "Multifashion entra en el detalle de línea"

# 10. el sync_type se estrena sin su DDL (el bug de catalogo_tommy y articulo_marca)
perl -0pi -e 's/^  "factura_lineas",\n//m' "$TIPOS"
probar "el sync_type sale de la lista del código"

# 11. la marca se pone ANTES de escribir las líneas → hueco permanente y mudo
perl -0pi -e 's/if \(buffer\.length > 0\) \{/if (false) {/' "$SYNC"
probar "las líneas no se escriben pero el documento se marca"

# 12. se deja de paginar → db-max-rows corta en silencio
perl -0pi -e 's/const filas = await leerTodoPaginado<FilaPendiente>\(\n    `pendientes de \$\{empresaKey\}`,\n    \(_primera, desde, hasta\) =>/const { data: unaPagina } = await (async () => ({ data: null }))(); void unaPagina;\n  const filas = await (async (_e: string, f: (a: boolean, b: number, c: number) => Promise<{ data: unknown }>) => ((await f(true, 0, 999)).data ?? []) as FilaPendiente[])(\n    `pendientes de \${empresaKey}`,\n    (_primera, desde, hasta) =>/' "$SYNC"
probar "la lectura de pendientes deja de paginar (solo la 1a pagina)"

# 13. las empresas se corren en paralelo → se tumban la sesión (code 0006)
perl -0pi -e 's/for \(const empresaKey of empresas\) \{/await Promise.all(empresas.map(async (empresaKey) => {/' "$SYNC"
probar "las empresas se sincronizan en paralelo"

# 14. la sesión de Switch no se cierra
perl -0pi -e 's/await logoutAllSwitchSessions\(\);/;/' "$SYNC"
probar "la sesión de Switch queda abierta"

echo "─────────────────────────────────────────────────────────"
echo "  $CAZADAS cazadas · $ESCAPADAS sobrevivieron"
[ "$ESCAPADAS" -eq 0 ] || exit 1

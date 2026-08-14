#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de `catalogo-sin-escrituras-iguales`.
#
# Rompe cada garantía A PROPÓSITO, corre el test y exige que se ponga ROJO. Un
# candado que pasa estando mutado no es un candado: es una foto tranquilizadora.
#
#   bash scripts/_mutar-candados-catalogo.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

IG=src/lib/switch-api/catalogo-igualdad.ts
MOTOR=src/lib/switch-api/sync-catalogo.ts
TOMMY=src/lib/switch-api/sync-catalogo-tommy.ts
TEST=src/__tests__/lib/catalogo-sin-escrituras-iguales.test.ts

cp $IG /tmp/_mut_ig.bak; cp $MOTOR /tmp/_mut_motor.bak; cp $TOMMY /tmp/_mut_tommy.bak
restaurar() { cp /tmp/_mut_ig.bak $IG; cp /tmp/_mut_motor.bak $MOTOR; cp /tmp/_mut_tommy.bak $TOMMY; }
trap restaurar EXIT

fallos=0
probar() { # $1 = descripción
  local salida rojos
  salida=$(npx vitest run $TEST 2>&1)
  rojos=$(printf '%s' "$salida" | grep -oE '[0-9]+ failed' | head -1)
  if [ -z "$rojos" ]; then
    echo "   🔴 PASÓ MUTADO (candado inútil): $1"
    fallos=$((fallos+1))
  else
    echo "   ✅ cazada ($rojos): $1"
  fi
  restaurar
}

py() { python3 - "$@"; }

echo "════ MUTACIONES ════"

# 1. La comparación dice que todo es igual.
py <<'EOF'
import re,io
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
s=s.replace('  const tipo = TIPOS_CAMPO_CATALOGO[columna];','  return true;\n  const tipo = TIPOS_CAMPO_CATALOGO[columna];',1)
open(p,'w').write(s)
EOF
probar "campoIgual devuelve siempre true (el catálogo se congela)"

# 2. "No la leí" pasa a significar "es igual".
py <<'EOF'
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
s=s.replace('  if (actual === undefined) return false;','  if (actual === undefined) return true;',1)
open(p,'w').write(s)
EOF
probar "una columna que no se leyó se da por igual"

# 3. null y "" pasan a ser lo mismo (comparación laxa).
py <<'EOF'
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
s=s.replace('  if (nuevo === null || actual === null) return nuevo === null && actual === null;',
            '  if (nuevo === null || actual === null) return !nuevo === !actual;',1)
open(p,'w').write(s)
EOF
probar "null == \"\" == 0 (comparación laxa)"

# 4. Texto normalizado (trim + minúsculas).
py <<'EOF'
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
s=s.replace('      return typeof nuevo === "string" && typeof actual === "string" && nuevo === actual;',
            '      return String(nuevo).trim().toLowerCase() === String(actual).trim().toLowerCase();',1)
open(p,'w').write(s)
EOF
probar "los textos se comparan normalizados (un espacio deja de ser un cambio)"

# 5. Monto en coma flotante cruda.
py <<'EOF'
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
i=s.index('export function centavosDeMonto')
j=s.index('/**',i)
s=s[:i]+'export function centavosDeMonto(v: unknown): number | null {\n  const n = Number(v);\n  return Number.isFinite(n) ? Math.round(n * 100) : null;\n}\n\n'+s[j:]
open(p,'w').write(s)
EOF
probar "los montos se redondean en coma flotante (16.555 → 1655)"

# 6. Payload vacío = "no hay nada que comparar, está todo bien".
py <<'EOF'
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
s=s.replace('  if (columnas.length === 0) return { igual: false, motivo: "payload vacío" };',
            '  if (columnas.length === 0) return { igual: true };',1)
open(p,'w').write(s)
EOF
probar "un payload vacío se da por igual"

# 7. El guard de sanidad no marca nada.
py <<'EOF'
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
s=s.replace('  return c.comparados > 0 && c.escrituras === 0;','  return false;',1)
open(p,'w').write(s)
EOF
probar "el guard del 100% salteado nunca marca"

# 8. El motor deja de escribir aunque haya cambios.
py <<'EOF'
p='src/lib/switch-api/sync-catalogo.ts'; s=open(p).read()
s=s.replace('            if (!igualdad.igual) {\n              const { error: upErr }','            if (false) {\n              const { error: upErr }',1)
open(p,'w').write(s)
EOF
probar "el motor no escribe NUNCA (cero silencioso)"

# 9. El motor escribe siempre (la optimización desaparece).
py <<'EOF'
p='src/lib/switch-api/sync-catalogo.ts'; s=open(p).read()
s=s.replace('          const igualdad = filaIgual(cambios, p as unknown as Record<string, unknown>);',
            '          const igualdad = { igual: false } as { igual: boolean; motivo?: string };',1)
open(p,'w').write(s)
EOF
probar "el motor escribe siempre (no se ahorra nada)"

# 10. La escalera de lectura vuelve a ser de un solo escalón (se lleva nombre_manual).
py <<'EOF'
p='src/lib/switch-api/sync-catalogo.ts'; s=open(p).read()
s=s.replace('        [COLS_BASE, ...optionalCols, ...colsComparacion],\n        [COLS_BASE, ...optionalCols],\n        [COLS_BASE],',
            '        [COLS_BASE, ...optionalCols, ...colsComparacion],\n        [COLS_BASE],',1)
open(p,'w').write(s)
EOF
probar "la escalera pierde su escalón intermedio (se cae nombre_manual)"

# 11. Los contadores no llegan a switch_sync_log.
py <<'EOF'
p='src/lib/switch-api/sync-catalogo.ts'; s=open(p).read()
s=s.replace('    const detalles = dryRun ? undefined : [...(skipDetailsPrecio ?? []), detalleEscrituras(contadores)];',
            '    const detalles = skipDetailsPrecio;',1)
open(p,'w').write(s)
EOF
probar "los contadores no se registran por corrida"

# 12. El inventario de Reebok deja de escribirse cuando el producto no cambió.
py <<'EOF'
p='src/lib/switch-api/sync-catalogo.ts'; s=open(p).read()
s=s.replace('            if (inventoryTable) {\n              const { error: invErr } = await db.from(inventoryTable).upsert(\n                { product_id: p.id, size: "UNICA", quantity: existencia },',
            '            if (inventoryTable && !igualdad.igual) {\n              const { error: invErr } = await db.from(inventoryTable).upsert(\n                { product_id: p.id, size: "UNICA", quantity: existencia },',1)
open(p,'w').write(s)
EOF
probar "el inventario deja de escribirse si el producto no cambió"

# 13. Tommy deja de declarar las columnas que escribe.
py <<'EOF'
p='src/lib/switch-api/sync-catalogo-tommy.ts'; s=open(p).read()
s=s.replace('      columnasEscritas: ["existencia", "disponibilidad", "stock", "category", "gender", "bulto_pzas"],','',1)
open(p,'w').write(s)
EOF
probar "Tommy deja de declarar sus columnas (nunca podría saltear)"

# 14. Una columna del write path se queda sin tipo declarado.
py <<'EOF'
p='src/lib/switch-api/catalogo-igualdad.ts'; s=open(p).read()
s=s.replace('  gender: "texto",\n','',1)
open(p,'w').write(s)
EOF
probar "una columna del UPDATE se queda sin tipo declarado"

echo
if [ $fallos -eq 0 ]; then echo "🟢 TODAS las mutaciones se cazaron."; else echo "🔴 $fallos mutación(es) pasaron en verde."; fi
exit $fallos

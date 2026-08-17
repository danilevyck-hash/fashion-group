#!/usr/bin/env bash
# Verificación por mutación del candado del orden por código.
# Restaura por COPIA, no con `git checkout`: un archivo NUEVO hace que git aborte
# el comando entero y las mutaciones se apilan (el verificador mentiría en verde).
set -u
cd "$(dirname "$0")/.."
V=src/components/catalogo/CatalogoVendedorPage.tsx
P=src/components/catalogo/CatalogoPublicoPage.tsx
B='src/app/catalogos/admin/[marca]/ProductosBatch.tsx'
T='src/app/catalogos/admin/[marca]/ProductosTarjetas.tsx'
O=src/lib/catalogos/orden-codigo.ts
TEST=src/__tests__/components/catalogo-orden-por-codigo.test.tsx
TMP=$(mktemp -d)
for f in "$V" "$P" "$B" "$T" "$O"; do mkdir -p "$TMP/$(dirname "$f")"; cp "$f" "$TMP/$f"; done
restaurar() { for f in "$V" "$P" "$B" "$T" "$O"; do cp "$TMP/$f" "$f"; done; }
CAZADAS=0; TOTAL=0

probar() {
  TOTAL=$((TOTAL+1))
  local nombre="$1"
  local fallos
  fallos=$(npx vitest run "$TEST" --reporter=dot 2>&1 | grep -cE "^\s*(×|✕|FAIL)" || true)
  if [ "$fallos" -gt 0 ]; then CAZADAS=$((CAZADAS+1)); echo "  ✅ CAZADA ($fallos fallos) — $nombre"
  else echo "  🔴 SOBREVIVIÓ — $nombre"; fi
  restaurar
}

echo "== mutaciones =="
perl -0pi -e 's/return a\.name\.localeCompare\(b\.name\) \|\| compararCodigos\(a\.sku, b\.sku\);/return a.name.localeCompare(b.name);/' "$V"
probar "vendedor: la lista plana pierde el desempate (relevancia)"

perl -0pi -e 's/\|\| compararCodigos\(a\.group\.baseSku, b\.group\.baseSku\)//g' "$V"
probar "vendedor: la vista AGRUPADA (Joybees) pierde el desempate"

perl -0pi -e 's/return a\.name\.localeCompare\(b\.name\) \|\| compararCodigos\(a\.sku, b\.sku\);/return a.name.localeCompare(b.name);/' "$P"
probar "público: la lista plana pierde el desempate"

perl -0pi -e 's/\|\| compararCodigos\(a\.group\.baseSku, b\.group\.baseSku\)//g' "$P"
probar "público: la vista agrupada pierde el desempate"

perl -0pi -e 's/if \(sortBy === "nombre-az"\) return a\.name\.localeCompare\(b\.name\) \|\| compararCodigos\(a\.sku, b\.sku\);/if (sortBy === "nombre-az") return a.name.localeCompare(b.name);/' "$V"
probar "vendedor: Nombre A-Z pierde el desempate"

perl -0pi -e 's/\(a\.price \|\| 0\) - \(b\.price \|\| 0\) \|\| compararCodigos\(a\.sku, b\.sku\)/(a.price || 0) - (b.price || 0)/' "$V"
probar "vendedor: Precio ascendente pierde el desempate"

perl -0pi -e 's/a\.name\.localeCompare\(b\.name\) \|\| compararCodigos\(a\.sku, b\.sku\)/a.name.localeCompare(b.name)/' "$B"
probar "admin (lista): pierde el desempate"

perl -0pi -e 's/ \|\| compararCodigos\(a\.sku, b\.sku\)//' "$T"
probar "admin (tarjetas): pierde el desempate"

perl -0pi -e 's/const A = ca\.toUpperCase\(\);/const A = ca.replace(\/-\/g, "").toUpperCase();/; s/const B = cb\.toUpperCase\(\);/const B = cb.replace(\/-\/g, "").toUpperCase();/' "$O"
probar "el comparador se come los guiones (normaliza)"

perl -0pi -e 's/  const A = ca\.toUpperCase\(\);[\s\S]*?return ca < cb \? -1 : ca > cb \? 1 : 0;/  return ca.localeCompare(cb, "es", { numeric: true, sensitivity: "base" });/' "$O"
probar "el comparador vuelve a localeCompare (no portable)"

perl -0pi -e 's/^export function compararCodigos\(a: string \| null \| undefined, b: string \| null \| undefined\): number \{/export function compararCodigos(a: string | null | undefined, b: string | null | undefined): number {\n  return 0;/m' "$O"
probar "el comparador siempre devuelve 0 (no desempata nada)"

restaurar
echo
echo "RESULTADO: $CAZADAS de $TOTAL cazadas"
rm -rf "$TMP"

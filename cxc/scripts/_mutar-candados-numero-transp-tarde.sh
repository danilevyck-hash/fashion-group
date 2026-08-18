#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de "anotar el N° del transportista tarde", la ÚNICA
# excepción sobre una guía ya despachada.
#
# 🩸 La restauración va por COPIA, no con `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada.
#
#   bash scripts/_mutar-candados-numero-transp-tarde.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/guias/numero-transp-tarde.ts"
  "src/lib/guias/modo-despacho.ts"
  "src/app/api/guias/[id]/numero-transp/route.ts"
  "src/app/api/guias/[id]/item/route.ts"
  "src/app/api/guias/route.ts"
  "src/app/guias/[id]/page.tsx"
  "src/app/guias/components/ListaEnvios.tsx"
  "src/app/guias/components/useDespachoGuia.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/api/guias-numero-transp-tarde-route.test.ts \
src/__tests__/api/guias-corregir-item-route.test.ts \
src/__tests__/components/guias-anotar-numero-tarde.test.tsx \
src/__tests__/lib/guias-numero-transp-no-bloquea.test.ts"

cazadas=0; sueltas=0; n=0
probar() {
  n=$((n+1))
  local salida fallos
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  fallos=$(printf '%s' "$salida" | grep -oE "Tests +[0-9]+ failed" | grep -oE "[0-9]+" | head -1)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  OK CAZADA ($fallos tests rojos) - $1"; cazadas=$((cazadas+1))
  else
    echo "  !! SOBREVIVIO - $1"; sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "=== MUTACIONES ==="

# 1. El endpoint escribe de más (la excepción deja de ser UNA).
perl -0pi -e 's|\.update\(\{ numero_guia_transp: validado\.numero \}\)|.update({ numero_guia_transp: validado.numero, bultos: 0 })|' "src/app/api/guias/[id]/numero-transp/route.ts"
probar "el endpoint escribe tambien los bultos"

# 2. Deja de acotar a la guía: el id de cualquier renglón serviría.
perl -0pi -e 's|(\.update\(\{ numero_guia_transp: validado\.numero \}\)\n    \.eq\("id", itemId\))\n    \.eq\("guia_id", id\)|$1|' "src/app/api/guias/[id]/numero-transp/route.ts"
probar "el UPDATE deja de acotar a las lineas de ESTA guia"

# 3. Se puede guardar un "0" pelado (el papel y la marca lo leen como vacío).
perl -0pi -e 's|  if \(n === "0"\) \{|  if (false) {|' src/lib/guias/numero-transp-tarde.ts
probar "se puede guardar un 0 pelado"

# 4. Se pierde lo que CONTIENE un cero.
perl -0pi -e 's|  if \(n === "0"\) \{|  if (n.includes("0")) {|' src/lib/guias/numero-transp-tarde.ts
probar "se rechaza cualquier numero que contenga un cero"

# 5. La pantalla deja de ofrecer anotarlo.
perl -0pi -e 's|\{puedeAnotarNumero && item\.id && \(|{false \&\& item.id \&\& (|' src/app/guias/components/ListaEnvios.tsx
probar "la pantalla deja de ofrecer anotar el numero"

# 6. Se ofrece también en entrega directa (donde no hay transportista).
perl -0pi -e 's|puedeAnotarNumero=\{s\.despachada && puedeDespachar && !esEntregaDirecta\(g\)\}|puedeAnotarNumero={s.despachada \&\& puedeDespachar}|' "src/app/guias/[id]/page.tsx"
probar "se ofrece anotar el numero en entrega directa"

# 7. El renglón abierto deja escribir algo más que el número.
perl -0pi -e 's|(          placeholder="El que te dio el transportista"\n          className=\{`\$\{CAMPO\} bg-white`\}\n        />)|$1\n      <input id="colado" className={CAMPO} />|' src/app/guias/components/ListaEnvios.tsx
probar "se cuela un segundo campo en el renglon abierto"

# 8. Se afloja el candado del PUT/corrección sobre una guía despachada.
perl -0pi -e 's|if \(guia\.estado === "Completada" \|\| guia\.estado === "Rechazada"\) \{|if (false) {|' "src/app/api/guias/[id]/item/route.ts"
probar "la correccion de bodega deja de mirar el estado"

# 9. El listado deja de leer el número por línea (el chip no se apagaría nunca).
perl -0pi -e 's|guia_items\(bultos, facturas, cliente, numero_guia_transp\)|guia_items(bultos, facturas, cliente)|' src/app/api/guias/route.ts
probar "el listado deja de leer el numero por linea"

# 10. Guardar no refresca la pantalla: el aviso ámbar se queda puesto.
perl -0pi -e 's|(      const guardado = String\(cuerpo\.numero_guia_transp \?\? ""\);\n)      setGuia\(|$1      if (false) setGuia(|' src/app/guias/components/useDespachoGuia.ts
probar "guardar no apaga el aviso ambar"

echo
echo "=== RESULTADO: $cazadas de $n cazadas, $sueltas sueltas ==="
[ "$sueltas" -eq 0 ]

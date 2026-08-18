#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de "una sola lista de envíos".
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilan y ninguna se prueba por separado. Ya pasó en este repo.
#
#   bash scripts/_mutar-candados-lista-envios.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/guias/falta-para-despachar.ts"
  "src/lib/guias/modo-despacho.ts"
  "src/lib/guias/correccion-item.ts"
  "src/app/api/guias/[id]/route.ts"
  "src/app/api/guias/[id]/item/route.ts"
  "src/app/guias/components/ListaEnvios.tsx"
  "src/app/guias/components/useDespachoGuia.ts"
  "src/app/guias/components/DespachoForm.tsx"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/guias-numero-transp-no-bloquea.test.ts \
src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts \
src/__tests__/lib/guias-placa-entrega-directa.test.ts \
src/__tests__/api/guias-corregir-item-route.test.ts \
src/__tests__/components/guias-lista-unica-envios.test.tsx \
src/__tests__/components/guias-entrega-directa.test.tsx"

cazadas=0; sueltas=0; n=0

probar() {
  n=$((n+1))
  local nombre="$1"
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  local fallos
  fallos=$(printf '%s' "$salida" | grep -oE "Tests +[0-9]+ failed" | grep -oE "[0-9]+" | head -1)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos tests rojos) — $nombre"
    cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"
    sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# 1. El N° del transportista vuelve a bloquear.
perl -0pi -e 's|// 🔴 El N° del transportista NO entra acá\. Ver la cabecera del archivo\.|if (!e.receptor) falta.push("N° de guía del transportista");|' src/lib/guias/falta-para-despachar.ts
probar "el N° del transportista vuelve a bloquear el botón"

# 2. El servidor vuelve a exigirlo.
perl -0pi -e 's|(if \(tipo_despacho === "directo" && !nombre_chofer\))|if (tipo_despacho === "externo" \&\& !numero_guia_transp) return NextResponse.json({ error: "Falta el N° de guía del transportista" }, { status: 400 });\n    $1|' "src/app/api/guias/[id]/route.ts"
probar "el servidor vuelve a exigir el N° del transportista"

# 3. La marca nunca se enciende.
perl -0pi -e 's|(export function guiaSinNumeroTransp\([\s\S]*?\): boolean \{)|$1\n  return false;|' src/lib/guias/modo-despacho.ts
probar "lo que falta deja de marcarse"

# 4. La lista deja de dibujar la caja del N° en su renglón.
perl -0pi -e 's|\{externo && \(\n                    <div className="flex-1 min-w-0">|{false \&\& (\n                    <div className="flex-1 min-w-0">|' src/app/guias/components/ListaEnvios.tsx
probar "la caja del N° desaparece del renglón"

# 5. La corrección vuelve a mandar `items` por el PUT (reemplazo completo).
perl -0pi -e 's|const res = await fetch\(`/api/guias/\$\{id\}/item`, \{\n        method: "PATCH",|const res = await fetch(`/api/guias/\${id}`, {\n        method: "PUT",|' src/app/guias/components/useDespachoGuia.ts
perl -0pi -e 's|body: JSON\.stringify\(\{ itemId, \.\.\.cambios \}\),|body: JSON.stringify({ items: [{ itemId, ...cambios }] }),|' src/app/guias/components/useDespachoGuia.ts
probar "corregir vuelve a mandar items por el PUT (reemplazo completo)"

# 6. El endpoint de corrección deja de mirar el estado de la guía.
perl -0pi -e 's|if \(guia\.estado === "Completada" \|\| guia\.estado === "Rechazada"\) \{|if (false) {|' "src/app/api/guias/[id]/item/route.ts"
probar "se puede corregir una guía YA despachada"

# 7. La corrección escribe TODOS los campos, no solo los tocados.
perl -0pi -e 's|if \(!\(campo in b\) \|\| b\[campo\] === undefined\) continue;|if (false) continue;|' src/lib/guias/correccion-item.ts
probar "la corrección pisa los campos que nadie tocó"

# 8. El UPDATE deja de acotar a la guía.
perl -0pi -e 's|(\.update\(cambios\)\n    \.eq\("id", itemId\))\n    \.eq\("guia_id", id\)|$1|' "src/app/api/guias/[id]/item/route.ts"
probar "el UPDATE deja de acotar a las líneas de ESTA guía"

# 9. Vuelve la SEGUNDA lista dentro del formulario de despacho.
perl -0pi -e 's|(\{/\* Firmas \*/\})|<div>{items.map((item, idx) => (<div key={item.id \|\| idx}>{item.cliente}<input id={`transp-\${idx}`} /></div>))}</div>\n      $1|' src/app/guias/components/DespachoForm.tsx
probar "vuelve la segunda copia de la lista en el formulario"

echo
echo "═══ RESULTADO: $cazadas de $n cazadas · $sueltas sueltas ═══"
[ "$sueltas" -eq 0 ]

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los cuatro arreglos del 25-ago-2026:
#   1. el N° del transportista no se copia a todos los envíos
#   2. «Imprimir todas» baja UN PDF con todas
#   3. el Excel y el buscador miran los N° de las LÍNEAS
#   4. `__other__` no llega al papel
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS
# en esta rama y git aborta el comando entero sin restaurar nada.
#
#   bash scripts/_mutar-candados-numero-por-linea.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/guias/components/useDespachoGuia.ts"
  "src/app/guias/components/ListaEnvios.tsx"
  "src/app/guias/components/GuiasList.tsx"
  "src/app/guias/components/excel-guias.ts"
  "src/app/guias/components/GuiaForm.tsx"
  "src/app/guias/components/guia-form-logic.ts"
  "src/app/guias/components/PrintDocument.tsx"
  "src/lib/guias/modo-despacho.ts"
  "src/lib/guias/falta-para-despachar.ts"
  "src/lib/guias/despachado-por.ts"
  "src/lib/guias/pdf-guia.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/guias-numero-por-linea-y-papel.test.ts \
src/__tests__/components/guias-numero-transp-no-se-copia.test.tsx \
src/__tests__/lib/guias-modo-despacho.test.ts \
src/__tests__/lib/guias-numero-transp-no-bloquea.test.ts \
src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts"

cazadas=0; sueltas=0; n=0

probar() {
  n=$((n+1))
  local nombre="$1"
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE, "0 fallos" se leería como "sobrevivió".
  if ! grep -qE "Tests +[0-9]" <<< "$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — $nombre"
    sueltas=$((sueltas+1)); restaurar; return
  fi
  local fallos
  fallos=$(grep -oE "Tests +[0-9]+ failed" <<< "$salida" | grep -oE "[0-9]+" | sed -n 1p)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos tests rojos) — $nombre"; cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"; sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── 1 · el N° por línea ──────────────────────────────────────────────────────

# El defecto original: la cabecera se copia a las 7 cajas.
perl -0pi -e 's|items\.map\(\(it\) => it\.numero_guia_transp \|\| ""\)|items.map((it) => it.numero_guia_transp \|\| (g.numero_guia_transp \|\| ""))|' src/app/guias/components/useDespachoGuia.ts
probar "el N° de la cabecera vuelve a copiarse a todos los envíos"

# Despachar con todo vacío borra el número que se anotó al crear la guía.
perl -0pi -e 's|return numeroGuiaDeCabecera\(numerosTransp\) \|\| String\(cabeceraActual \?\? ""\)\.trim\(\);|return numeroGuiaDeCabecera(numerosTransp);|' src/lib/guias/falta-para-despachar.ts
probar "despachar con las cajas vacías BORRA el N° de la cabecera"

# La línea que sí trae número deja de ganarle a la cabecera.
perl -0pi -e 's|return numeroGuiaDeCabecera\(numerosTransp\) \|\| String\(cabeceraActual \?\? ""\)\.trim\(\);|return String(cabeceraActual ?? "").trim() \|\| numeroGuiaDeCabecera(numerosTransp);|' src/lib/guias/falta-para-despachar.ts
probar "la cabecera le gana a la línea que sí trae número"

# El hook vuelve a una expresión suelta, sin la regla con nombre.
perl -0pi -e 's|payload\.numero_guia_transp = numeroCabeceraAlDespachar\(numerosTransp, guia\.numero_guia_transp\);|payload.numero_guia_transp = numeroGuiaDeCabecera(numerosTransp);|' src/app/guias/components/useDespachoGuia.ts
perl -0pi -e 's|import \{ numeroCabeceraAlDespachar \}|import { numeroCabeceraAlDespachar, numeroGuiaDeCabecera }|' src/app/guias/components/useDespachoGuia.ts
probar "el hook vuelve a la expresión suelta"

# El número anotado al crear la guía se esconde del todo.
perl -0pi -e 's|\{String\(numeroGuiaCabecera \?\? ""\)\.trim\(\) \? \(|{false ? (|' src/app/guias/components/ListaEnvios.tsx
probar "el N° anotado al crear la guía se esconde"

# ── 3 · el Excel y el buscador ───────────────────────────────────────────────

perl -0pi -e 's|numerosTranspDeLaGuia\(g\)\.join\(", "\)|(g.numero_guia_transp \|\| "")|' src/app/guias/components/excel-guias.ts
probar "el Excel vuelve a mirar solo la cabecera"

perl -0pi -e 's|numerosTranspDeLaGuia\(g\)\.some\(\(n\) => n\.toLowerCase\(\)\.includes\(q\)\) \|\||(g.numero_guia_transp \|\| "").toLowerCase().includes(q) \|\||' src/app/guias/components/GuiasList.tsx
probar "el buscador vuelve a mirar solo la cabecera"

perl -0pi -e 's|(export function numerosTranspDeLaGuia\([\s\S]*?\): string\[\] \{)|$1\n  return [];|' src/lib/guias/modo-despacho.ts
probar "«numerosTranspDeLaGuia» no encuentra nunca nada"

perl -0pi -e 's|numeroTranspImpreso\(i\.numero_guia_transp, cabecera\)|String(i.numero_guia_transp ?? cabecera ?? "")|' src/lib/guias/modo-despacho.ts
probar "los números dejan de salir como los imprime el papel (vuelve el «0»)"

# ── 4 · `__other__` ──────────────────────────────────────────────────────────

perl -0pi -e 's|  return v !== "" && v !== ENTREGADO_POR_OTRO;|  return v !== "";|' src/lib/guias/despachado-por.ts
probar "el centinela vuelve a contar como un nombre"

perl -0pi -e 's|  return entregadoPorElegido\(valor\) \? String\(valor\)\.trim\(\) : "";|  return String(valor ?? "").trim();|' src/lib/guias/despachado-por.ts
probar "el papel vuelve a imprimir «__other__»"

perl -0pi -e 's|if \(!entregadoPorElegido\(estado\.entregadoPor\)\) errores\.add\("entregadoPor"\);|if (!estado.entregadoPor) errores.add("entregadoPor");|' src/app/guias/components/guia-form-logic.ts
probar "el formulario vuelve a dejar guardar el centinela"

perl -0pi -e 's|nombreDespachadoPor\(g\.entregado_por\)|(g.entregado_por \|\| "")|g' src/app/guias/components/PrintDocument.tsx
probar "el papel impreso se sale de la regla"

# ── 2 · «Imprimir todas» ─────────────────────────────────────────────────────

perl -0pi -e 's|    if \(i > 0\) doc\.addPage\(\);|    doc.addPage();|' src/lib/guias/pdf-guia.ts
probar "el PDF combinado deja una hoja en blanco al principio"

perl -0pi -e 's|  guias\.forEach\(\(g, i\) => \{\n    // La primera va en la página que el documento ya trae: una `addPage\(\)` de\n    // más deja una hoja en blanco al principio de todo lo que se imprima\.\n    if \(i > 0\) doc\.addPage\(\);\n    dibujarGuiaEnPdf\(doc, g\);\n  \}\);|  if (guias.length > 0) dibujarGuiaEnPdf(doc, guias[0]);|' src/lib/guias/pdf-guia.ts
probar "el PDF combinado solo dibuja la primera guía"

perl -0pi -e 's|const \{ construirPdfGuias, nombreArchivoGuias \} = await import\("\@/lib/guias/pdf-guia"\);\n      construirPdfGuias\(completas\)\.save\(nombreArchivoGuias\(completas\)\);|completas.forEach((g) => window.open(`/guias/\${g.id}/imprimir`, "_blank"));|' src/app/guias/components/GuiasList.tsx
probar "«Imprimir todas» vuelve a abrir una pestaña por guía"

perl -0pi -e 's|  if \(guias\.length === 1\) return nombreArchivoGuia\(guias\[0\]\);||' src/lib/guias/pdf-guia.ts
probar "el archivo de una sola guía pierde su nombre de siempre"

echo
echo "═══ RESULTADO: $cazadas de $n cazadas · $sueltas sueltas ═══"
[ "$sueltas" -eq 0 ]

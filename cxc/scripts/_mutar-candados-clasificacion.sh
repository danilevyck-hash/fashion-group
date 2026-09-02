#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de la clasificación del catálogo.
#
# Rompe cada garantía A PROPÓSITO, corre los tests y exige que se pongan ROJOS.
# Un candado que pasa estando mutado no es un candado: es una foto
# tranquilizadora — y este repo ya lo pagó cuatro veces.
#
# Incluye un CONTROL que NO debe dar rojo: un cambio inocuo (un comentario) que,
# si tumbara los tests, diría que los candados están mirando el texto y no la
# conducta.
#
#   bash scripts/_mutar-candados-clasificacion.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

CLAS=src/lib/reebok-clasificacion.ts
GEN=src/lib/reebok-gender.ts
REEBOK=src/lib/switch-api/sync-catalogo-reebok.ts
JOY=src/lib/switch-api/sync-catalogo-joybees.ts
DEP=src/lib/depurador/reebok.ts
GRP=src/components/catalogo/groupByModel.ts

TESTS="src/__tests__/lib/reebok-clasificacion.test.ts \
src/__tests__/lib/catalogo-cajon-neutro.test.ts \
src/__tests__/lib/catalogo-un-solo-lugar.test.ts \
src/__tests__/lib/clasificacion-aviso.test.ts \
src/__tests__/lib/catalogo-reebok-clasifica.test.ts \
src/__tests__/lib/depurador-reebok-clasificacion.test.ts"

# 🩸 Se restaura por COPIA, no con `git checkout`: varios de estos archivos son
# NUEVOS y git abortaría el comando entero, así que las mutaciones se apilarían y
# ninguna se probaría por separado.
for f in $CLAS $GEN $REEBOK $JOY $DEP $GRP; do cp "$f" "/tmp/_mutcl_$(basename $f).bak"; done
restaurar() { for f in $CLAS $GEN $REEBOK $JOY $DEP $GRP; do cp "/tmp/_mutcl_$(basename $f).bak" "$f"; done; }
trap restaurar EXIT

fallos=0
esperado_rojo() {
  local salida rojos
  salida=$(npx vitest run $TESTS 2>&1)
  rojos=$(printf '%s' "$salida" | grep -oE '[0-9]+ failed' | head -1)
  if [ -z "$rojos" ]; then
    echo "   🔴 PASÓ MUTADO (candado inútil): $1"
    fallos=$((fallos+1))
  else
    echo "   ✅ cazada ($rojos): $1"
  fi
  restaurar
}
esperado_verde() {
  local salida rojos
  salida=$(npx vitest run $TESTS 2>&1)
  rojos=$(printf '%s' "$salida" | grep -oE '[0-9]+ failed' | head -1)
  if [ -n "$rojos" ]; then
    echo "   🔴 EL CONTROL DIO ROJO ($rojos): $1 — los candados miran el texto, no la conducta"
    fallos=$((fallos+1))
  else
    echo "   ✅ control verde: $1"
  fi
  restaurar
}

py() { python3 - "$@"; }

echo "════ MUTACIONES ════"

# ── 1. El cajón por defecto vuelve a ser una categoría real ──────────────────
echo "1. defaultCategory vuelve a footwear"
py <<PY
p="$REEBOK"; s=open(p).read()
s=s.replace('defaultCategory: CATEGORIA_SIN_CLASIFICAR', 'defaultCategory: "footwear"')
open(p,"w").write(s)
PY
esperado_rojo "defaultCategory = footwear (la mitad del bug original)"

# ── 2. El cajón de género vuelve a ser male ─────────────────────────────────
echo "2. el cajón de género vuelve a ser un género real"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace('export const GENERO_SIN_CLASIFICAR = "sin_clasificar";', 'export const GENERO_SIN_CLASIFICAR = "male";')
open(p,"w").write(s)
PY
esperado_rojo "GENERO_SIN_CLASIFICAR = male (la otra mitad del bug)"

# ── 3. El INSERT deja de nombrar gender (vuelve a mandar el DEFAULT) ────────
echo "3. el INSERT deja de escribir gender"
py <<PY
p="$REEBOK"; s=open(p).read()
s=s.replace('insertExtras: { on_sale: false, gender: GENERO_SIN_CLASIFICAR },', 'insertExtras: { on_sale: false },')
s=s.replace('insertFields: (a) => clasificar(a, {}),', 'insertFields: (a) => { const c = clasificar(a, {}); return { category: c.category }; },')
open(p,"w").write(s)
PY
esperado_rojo "el INSERT no nombra gender ⇒ decide el DEFAULT de la columna"

# ── 4. El nombre deja de desempatar el UNISEX ───────────────────────────────
echo "4. el UNISEX deja de leer el nombre"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace('if (s === SUBRUBRO_EMPATE) return nombreDiceMujer(nombre) ? "female" : "male";',
            'if (s === SUBRUBRO_EMPATE) return "male";')
open(p,"w").write(s)
PY
esperado_rojo "las WOMEN LOGO TEE vuelven a Hombre (Daniel pidio que lean el nombre)"

# ── 4b. 🔴 El nombre se sale de su rama y pisa lo explícito ─────────────────
echo "4b. el nombre contradice un MALE/FEMALE explicito de Switch"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace("""  const explicito = GENERO_POR_SUBRUBRO[s];
  if (explicito) return explicito;""",
"""  if (nombreDiceMujer(nombre)) return "female";
  const explicito = GENERO_POR_SUBRUBRO[s];
  if (explicito) return explicito;""")
open(p,"w").write(s)
PY
esperado_rojo "🔴 el nombre pisa un MALE explicito (adivinar, no desempatar)"

# ── 4c. 🩸 La W deja de ser palabra completa (la trampa de LOW) ─────────────
echo "4c. la W se busca como subcadena"
py <<PY
p="$CLAS"; s=open(p).read()
viejo = "return /" + chr(92) + "bWOMEN" + chr(92) + "b/.test(n) || /" + chr(92) + "bW" + chr(92) + "b/.test(n);"
s=s.replace(viejo, 'return n.includes("WOMEN") || n.trimEnd().endsWith("W");')
open(p,"w").write(s)
PY
esperado_rojo "🩸 la W de LOW manda REEBOK TERRAIN EDGE LOW a Mujer"

# ── 4d. El nombre rescata cualquier subrubro desconocido ───────────────────
echo "4d. el nombre rescata subrubros que nadie conoce"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace("""  if (s === SUBRUBRO_EMPATE) return nombreDiceMujer(nombre) ? "female" : "male";
  return null;""",
"""  return nombreDiceMujer(nombre) ? "female" : "male";""")
open(p,"w").write(s)
PY
esperado_rojo "un subrubro desconocido se salva leyendo el nombre (el cajon neutro deja de existir)"

# ── 5. Un unisex cae bajo dos chips ─────────────────────────────────────────
echo "5. unisex también en el chip Mujer"
py <<PY
p="$GEN"; s=open(p).read()
s=s.replace('  female: ["mujer"],', '  female: ["mujer", "unisex"],')
open(p,"w").write(s)
PY
esperado_rojo "un producto unisex sale en Hombre Y en Mujer"

# ── 6. El aviso desaparece ──────────────────────────────────────────────────
echo "6. se quita el aviso de clasificación desconocida"
py <<PY
p="$REEBOK"; s=open(p).read()
s=s.replace('        await avisarClasificacionDesconocida({', '        if (false) await avisarClasificacionDesconocida({')
open(p,"w").write(s)
PY
esperado_rojo "lo desconocido cae en el cajón neutro y NO avisa"

# ── 7. 💸 Un "no sé" pisa la categoría guardada (mueve el BULTO) ────────────
echo "7. lo desconocido pisa lo ya clasificado"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace('    category: cat ?? (guardado.category || CATEGORIA_SIN_CLASIFICAR),', '    category: cat ?? CATEGORIA_SIN_CLASIFICAR,')
s=s.replace('    gender: gen ?? (guardado.gender || GENERO_SIN_CLASIFICAR),', '    gender: gen ?? GENERO_SIN_CLASIFICAR,')
open(p,"w").write(s)
PY
esperado_rojo "💸 un rubro nuevo manda las zapatillas a bulto 6"

# ── 8. Las medias vuelven a ser accesorio ───────────────────────────────────
echo "8. SOCKS vuelve a accessories"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace('  SOCKS: "apparel",', '  SOCKS: "accessories",')
open(p,"w").write(s)
PY
esperado_rojo "medias como accesorio (Daniel dijo que son ropa)"

# ── 9. UNISEX deja de resolverse y cae al cajón neutro ─────────────────────
echo "9. UNISEX deja de resolverse"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace('const SUBRUBRO_EMPATE = "UNISEX";', 'const SUBRUBRO_EMPATE = "__NUNCA__";')
open(p,"w").write(s)
PY
esperado_rojo "UNISEX sin resolver (Daniel: unisex = hombre salvo que el nombre diga mujer)"

# ── 9b. 🔴 La MARCA deja de ser la fuente primaria de la categoría ─────────
echo "9b. el rubro le gana a la marca"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace("""  const porMarca = CATEGORIA_POR_MARCA[U(marca)];
  if (porMarca) return porMarca;
  return CATEGORIA_POR_RUBRO[U(rubro)] ?? null;""",
"""  return CATEGORIA_POR_RUBRO[U(rubro)] ?? CATEGORIA_POR_MARCA[U(marca)] ?? null;""")
open(p,"w").write(s)
PY
esperado_rojo "🔴 un rubro basura tumba la marca (35 valores le ganan a 3 medidos sin contradicciones)"

# ── 9c. Department deja de mirarse en el Depurador ─────────────────────────
echo "9c. el Depurador deja de mirar Department"
py <<PY
p="$DEP"; s=open(p).read()
s=s.replace('    if (!departamentos.has(normH(it.department))) anotar("Department", it.department, id);' + chr(10), '')
open(p,"w").write(s)
PY
esperado_rojo "un Department raro (= la categoria del catalogo) pasa sin aviso"

# ── 10. La consulta de productos vuelve a filtrar por categoría ─────────────
echo "10. el sync vuelve a enumerar categorías"
py <<PY
p="$REEBOK"; s=open(p).read()
s=s.replace('categories: [] as const', 'categories: ["apparel", "accessories", "footwear"] as const')
open(p,"w").write(s)
PY
esperado_rojo "el cajón neutro se cae de la consulta ⇒ producto huérfano/duplicado"

# ── 11. La clasificación deja de refrescarse en el UPDATE ──────────────────
echo "11. la clasificación se congela desde el INSERT"
py <<PY
p="$REEBOK"; s=open(p).read()
s=s.replace('      updateFields: (a, existing) => clasificar(a, existing),', '      updateFields: () => ({}),')
open(p,"w").write(s)
PY
esperado_rojo "las 7 medias nunca se corrigen (categoría congelada)"

# ── 12. CATEGORY vuelve a ser opcional en el Depurador ─────────────────────
echo "12. CATEGORY/GENDER vuelven a ser opcionales"
py <<PY
p="$DEP"; s=open(p).read()
s=s.replace('  if (cols.category === -1) missing.push("CATEGORY");\n  if (cols.gender === -1) missing.push("GENDER");\n', '')
open(p,"w").write(s)
PY
esperado_rojo "una columna renombrada sube el archivo en blanco, sin avisar"

# ── 13. El Depurador deja de mirar los valores esperados ───────────────────
echo "13. la lista de valores esperados se vacía"
py <<PY
p="$DEP"; s=open(p).read()
s=s.replace('export function valoresInesperados(items: readonly ReebokItem[]): ValorInesperado[] {', 'export function valoresInesperados(_items: readonly ReebokItem[]): ValorInesperado[] {\n  return [];\n}\nfunction _viejo(items: readonly ReebokItem[]): ValorInesperado[] {')
open(p,"w").write(s)
PY
esperado_rojo "el Depurador ya no avisa antes de subir el archivo"

# ── 14. El fallback de la vista agrupada vuelve a "adultos" ────────────────
echo "14. groupByModel vuelve a caer en adultos"
py <<PY
p="$GRP"; s=open(p).read()
s=s.replace('  return "otros";\n}', '  return "adultos";\n}')
open(p,"w").write(s)
PY
esperado_rojo "un modelo sin género se dibuja en Adultos (cajón con valor de negocio)" || true

# ── 15. Joybees vuelve a entrar como hombre ────────────────────────────────
echo "15. Joybees vuelve a adults_m"
py <<PY
p="$JOY"; s=open(p).read()
s=s.replace('insertExtras: { gender: GENERO_SIN_CLASIFICAR },', 'insertExtras: { gender: "adults_m" },')
open(p,"w").write(s)
PY
esperado_rojo "los nuevos de Joybees vuelven a entrar como hombre"

# ── CONTROL: un cambio inocuo NO puede poner rojo ──────────────────────────
echo "── CONTROL (no debe dar rojo) ──"
py <<PY
p="$CLAS"; s=open(p).read()
s=s.replace('/** lowercase→UPPER + trim', '/** (comentario tocado por el control de mutación) lowercase→UPPER + trim')
open(p,"w").write(s)
PY
esperado_verde "cambiar un comentario no rompe nada"

echo "════════════════════"
if [ "$fallos" -eq 0 ]; then
  echo "✅ TODAS las mutaciones cazadas y el control verde."
else
  echo "🔴 $fallos problema(s). Un candado que pasa mutado no protege nada."
  exit 1
fi

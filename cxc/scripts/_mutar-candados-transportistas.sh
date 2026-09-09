#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «agregar un transportista nuevo» (9-sep-2026)
#
# Rompe cada regla A PROPÓSITO, comprueba que el candado se pone ROJO, y
# devuelve el código como estaba. Al final se reporta «N mutaciones, N cazadas».
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, JAMÁS CON `git checkout` (lección del
# 9-sep-2026): un agente puso `trap 'git checkout -- …' EXIT`, se colgó en medio
# de la verificación, el trap disparó al morir el proceso y `git checkout`
# devolvió los archivos a HEAD — le borró su propia implementación sin
# commitear. Acá se copia lo que hay AL EMPEZAR a un directorio temporal y se
# restaura de ahí: vuelve lo que había, esté commiteado o no. (Y hay un segundo
# motivo ya conocido: con archivos NUEVOS en la rama, `git checkout` aborta el
# comando entero sin restaurar nada.)
#
#   bash scripts/_mutar-candados-transportistas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

CANDADOS=(
  src/__tests__/lib/guias-transportistas.test.ts
  src/__tests__/lib/guias-transportistas-servidor.test.ts
  src/__tests__/components/guias-transportistas-pantalla.test.tsx
  src/__tests__/iphone-targets-guias.test.ts
)

ARCHIVOS=(
  src/lib/guias/transportistas.ts
  src/lib/guias/transportistas-server.ts
  src/app/api/transportistas/route.ts
  src/app/guias/components/TransportistasConfig.tsx
  src/app/guias/components/GuiaForm.tsx
  src/app/guias/components/useGuiaFormState.ts
  src/app/guias/components/AddNewInline.tsx
  src/app/guias/components/GuiasConfiguracionView.tsx
  supabase/migrations/20261025120000_transportistas_alta_y_baja.sql
)

# ── La copia de seguridad, hecha ANTES de tocar nada ─────────────────────────
RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() {
  for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done
}
trap 'restaurar' EXIT

TOTAL=0; CAZADAS=0; CONTROLES=0; CONTROLES_MAL=0

corren_verde() {
  npx vitest run "${CANDADOS[@]}" >/dev/null 2>&1
}

# mutar "descripción" archivo "python-de-reemplazo"
mutar() {
  local desc="$1" archivo="$2" py="$3"
  TOTAL=$((TOTAL+1))
  python3 - "$archivo" <<PY
import sys
p = sys.argv[1]
s = open(p).read()
$py
open(p, "w").write(s)
PY
  if corren_verde; then
    echo "  ❌ NO CAZADA — $desc"
  else
    echo "  ✅ cazada    — $desc"
    CAZADAS=$((CAZADAS+1))
  fi
  restaurar
}

echo "═══ Control: en verde antes de empezar ═══"
if corren_verde; then echo "  ✅ los candados pasan"; else echo "  ❌ ya estaban rojos: abortar"; exit 1; fi

echo
echo "═══ MUTACIONES ═══"

# 1 · el repetido entra
mutar "entra un repetido: se deja de comparar por clave en el servidor" \
  src/lib/guias/transportistas-server.ts \
  's = s.replace("if (yaEsUnTransportista(nombre, activos.map((f) => f.nombre))) {", "if (false) {")'

# 2 · el repetido entra por la pantalla
mutar "entra un repetido: la pantalla deja de comprobarlo" \
  src/app/guias/components/TransportistasConfig.tsx \
  's = s.replace("if (yaEsUnTransportista(nombre, lista.map((f) => f.nombre))) {", "if (false) {")'

# 3 · se junta por parecido
mutar "se junta por PARECIDO: la clave se recorta a las 4 primeras letras" \
  src/lib/guias/transportistas.ts \
  's = s.replace("return claveDestino(nombre);", "return claveDestino(nombre).slice(0, 4);")'

# 4 · se junta por parecido, sin normalizar nada
mutar "se compara el texto CRUDO: «REDNBLUE» entraría de nuevo" \
  src/lib/guias/transportistas.ts \
  's = s.replace("return claveDestino(nombre);", "return String(nombre).trim();")'

# 5 · quitar borra de verdad
mutar "quitar BORRA de verdad (DELETE en vez de soft delete)" \
  src/lib/guias/transportistas-server.ts \
  's = s.replace(""".update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })""", ".delete()")'

# 6 · la baja deja de firmarse
mutar "la baja deja de firmarse (sin quién ni cuándo)" \
  src/lib/guias/transportistas-server.ts \
  's = s.replace("{ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() }", "{ activo: false }")'

# 7 · la migración deja de exigir la firma
mutar "la migración deja de exigir la firma de la baja" \
  supabase/migrations/20261025120000_transportistas_alta_y_baja.sql \
  's = s.replace("CHECK (activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))", "CHECK (true)")'

# 8 · una guía vieja pierde el nombre del transportista quitado
mutar "una guía vieja PIERDE el nombre: la baja también limpia guia_transporte" \
  src/lib/guias/transportistas-server.ts \
  's = s.replace(
     "export async function desactivarTransportista(",
     """export async function limpiarGuias(id: string) {
  await supabaseServer.from(\"guia_transporte\").update({ transportista_id: null }).eq(\"transportista_id\", id);
}

export async function desactivarTransportista(""")'

# 9 · el único deja de ser parcial: el que vuelve no puede volver
mutar "el índice único deja de ser parcial (WHERE activo)" \
  supabase/migrations/20261025120000_transportistas_alta_y_baja.sql \
  's = s.replace("  ON transportistas (nombre)\n  WHERE activo;", "  ON transportistas (nombre);")'

# 10 · el que vuelve crea una fila NUEVA en vez de revivir
mutar "el que vuelve NO revive su fila: se crea una segunda" \
  src/lib/guias/transportistas-server.ts \
  's = s.replace("  if (quitado) {", "  if (false && quitado) {")'

# 11 · bodega pierde el ＋ (pierde el permiso de agregar)
mutar "bodega pierde el permiso de agregar" \
  src/lib/guias/transportistas.ts \
  's = s.replace("""export const TRANSPORTISTAS_ROLES_ESCRITURA = [\"admin\", \"secretaria\", \"bodega\"] as const;""", """export const TRANSPORTISTAS_ROLES_ESCRITURA = [\"admin\", \"secretaria\"] as const;""")'

# 12 · bodega PUEDE quitar
mutar "bodega puede QUITAR (el DELETE se abre a los que agregan)" \
  src/app/api/transportistas/route.ts \
  's = s.replace("  const auth = requireRole(req, [...CONFIG_GUIAS_ROLES]);", "  const auth = requireRole(req, [...TRANSPORTISTAS_ROLES_ESCRITURA]);")'

# 13 · el POST se cierra a bodega en la ruta
mutar "la ruta cierra el POST con la lista de administradores" \
  src/app/api/transportistas/route.ts \
  's = s.replace("  const auth = requireRole(req, [...TRANSPORTISTAS_ROLES_ESCRITURA]);", "  const auth = requireRole(req, [...CONFIG_GUIAS_ROLES]);")'

# 14 · el ＋ no llega a 44 px
mutar "el ＋ no llega a 44 px de alto" \
  src/app/guias/components/AddNewInline.tsx \
  's = s.replace("min-w-[44px] min-h-[44px]", "min-w-[24px] min-h-[24px]")'

# 15 · el ＋ pierde el rótulo visible (queda solo el title)
mutar "el ＋ del transportista pierde el rótulo VISIBLE" \
  src/app/guias/components/GuiaForm.tsx \
  's = s.replace("                    textoBoton=\"Agregar transportista\"\n", "")'

# 16 · el ＋ desaparece del formulario
mutar "el ＋ desaparece del desplegable de la guía" \
  src/app/guias/components/GuiaForm.tsx \
  's = s.replace("""                  <AddNewInline
                    placeholder=\"Nombre\"
                    onAdd={onAddTransportista}
                    etiqueta=\"Agregar transportista a la lista que ve todo el equipo\"
                    textoBoton=\"Agregar transportista\"
                  />""", "")'

# 17 · lo agregado desde la guía se guarda en el navegador
mutar "lo que se agrega desde la guía se queda en ESTE navegador" \
  src/app/guias/components/useGuiaFormState.ts \
  's = s.replace("""      const r = await fetch(\"/api/transportistas\", {""", """      localStorage.setItem(\"fg_transportistas\", nombre);
      const r = await fetch(\"/api/transportistas-viejo\", {""")'

# 18 · lo agregado no queda elegido
mutar "lo agregado NO queda elegido en la guía" \
  src/app/guias/components/useGuiaFormState.ts \
  's = s.replace("      setTransportistaId(fila.id);", "")'

# 19 · se manda de nuevo uno que ya está
mutar "se vuelve a mandar uno que ya está en la lista" \
  src/app/guias/components/useGuiaFormState.ts \
  's = s.replace("    const yaEsta = transportistas.find((t) => yaEsUnTransportista(nombre, [t.nombre]));", "    const yaEsta = undefined as { id: string } | undefined;")'

# 20 · la tarjeta deja de decir cuántas guías lleva
mutar "la fila deja de decir cuántas guías lleva" \
  src/app/guias/components/TransportistasConfig.tsx \
  's = s.replace("<span className=\"block text-xs text-gray-400\">{textoGuiasDelTransportista(f.guias)}</span>", "")'

# 21 · un cero grande: «0 guías»
mutar "un cero pelado: «0 guías» en vez de «Todavía sin guías»" \
  src/lib/guias/transportistas.ts \
  's = s.replace("  if (guias <= 0) return \"Todavía sin guías\";", "")'

# 22 · la cuenta suma las de Entrega directa
mutar "la cuenta suma las guías de Entrega directa (sin transportista)" \
  src/lib/guias/transportistas.ts \
  's = s.replace("    if (!id) continue;", "    if (!id) { cuenta.set(\"\", (cuenta.get(\"\") ?? 0) + 1); continue; }")'

# 23 · el orden deja de poner primero al más usado
mutar "el orden deja de poner primero al más usado" \
  src/lib/guias/transportistas.ts \
  's = s.replace(".sort((a, b) => b.guias - a.guias || a.nombre.localeCompare(b.nombre, \"es\"));", ".sort((a, b) => a.nombre.localeCompare(b.nombre, \"es\"));")'

# 24 · contar guías se corta en silencio a las 1.000
mutar "contar guías se corta en silencio a las 1.000 filas" \
  src/lib/guias/transportistas-server.ts \
  's = s.replace("import { leerTodoPaginado } from \"@/lib/supabase-paginado\";", "")'

# 25 · la migración siembra los escritos a mano
mutar "la migración SIEMBRA los cinco escritos a mano" \
  supabase/migrations/20261025120000_transportistas_alta_y_baja.sql \
  "s += \"\\nINSERT INTO transportistas (nombre, creado_por) VALUES ('CITY MODA', 'sistema');\\n\""

# 26 · la migración toca las guías viejas
mutar "la migración TOCA las guías viejas" \
  supabase/migrations/20261025120000_transportistas_alta_y_baja.sql \
  "s += \"\\nUPDATE guia_transporte SET transportista = NULL WHERE transportista_id IS NULL;\\n\""

# 27 · se piden campos de más
mutar "se pide teléfono además del nombre" \
  src/app/guias/components/TransportistasConfig.tsx \
  's = s.replace("            placeholder=\"Nombre del transportista\"", "            placeholder=\"Teléfono del transportista\"")'

# 28 · el validador acepta el vacío
mutar "el validador acepta un nombre vacío" \
  src/lib/guias/transportistas.ts \
  's = s.replace("  if (!nombre) return { ok: false, error: \"Escribe el nombre del transportista\" };", "")'

# 29 · el módulo puro deja de ser puro
mutar "el módulo puro deja de ser puro (toca la base)" \
  src/lib/guias/transportistas.ts \
  's = s.replace("import { claveDestino } from \"@/lib/guias/destinos-clientes\";", "import { claveDestino } from \"@/lib/guias/destinos-clientes\";\nimport { supabaseServer } from \"@/lib/supabase-server\";\nvoid supabaseServer;")'

# 30 · la tarjeta desaparece de Configuración
mutar "la tarjeta desaparece de Guías › Configuración" \
  src/app/guias/components/GuiasConfiguracionView.tsx \
  's = s.replace("      <TransportistasConfig onAviso={setToast} />", "")'

# 31 · el GET pelado cambia de forma y deja al formulario sin transportistas
mutar "el GET pelado cambia de forma (el formulario se queda sin lista)" \
  src/app/api/transportistas/route.ts \
  's = s.replace("    return NextResponse.json(await leerTransportistasActivos());", "    return NextResponse.json({ lista: await leerTransportistasActivos() });")'

# 32 · el ＋ vuelve a dibujarse una vez por FILA
mutar "el ＋ vuelve a dibujarse una vez por FILA (el defecto del iPhone)" \
  src/app/guias/components/GuiaForm.tsx \
  's = s.replace("""                  <AddNewInline
                    placeholder=\"Nombre\"""", """                  <AddNewInline placeholder=\"x\" onAdd={onAddTransportista} />
                  <AddNewInline
                    placeholder=\"Nombre\"""")'

echo
echo "═══ CONTROLES (NO deben cazarse) ═══"

control() {
  local desc="$1" archivo="$2" py="$3"
  CONTROLES=$((CONTROLES+1))
  python3 - "$archivo" <<PY
import sys
p = sys.argv[1]
s = open(p).read()
$py
open(p, "w").write(s)
PY
  if corren_verde; then
    echo "  ✅ NO cazada (correcto) — $desc"
  else
    echo "  ❌ cazada de más       — $desc"
    CONTROLES_MAL=$((CONTROLES_MAL+1))
  fi
  restaurar
}

# C1 · un cambio de redacción que no cambia ninguna regla
control "cambiar el texto de ayuda de la tarjeta" \
  src/app/guias/components/TransportistasConfig.tsx \
  's = s.replace("La ve todo el equipo. También puedes agregar uno desde la guía misma.", "La ve todo el equipo. Puedes agregar uno desde la guía también.")'

# C2 · subir el tope del nombre no rompe ninguna regla
control "subir el tope del nombre de 80 a 120" \
  src/lib/guias/transportistas.ts \
  's = s.replace("export const MAX_LARGO_TRANSPORTISTA = 80;", "export const MAX_LARGO_TRANSPORTISTA = 120;")'

echo
echo "═══════════════════════════════════════"
echo "  $TOTAL mutaciones, $CAZADAS cazadas"
echo "  $CONTROLES controles, $CONTROLES_MAL cazados de más (tiene que ser 0)"
echo "═══════════════════════════════════════"

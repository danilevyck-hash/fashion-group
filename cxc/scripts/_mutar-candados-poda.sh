#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de la poda t203.
#
# Rompe una cosa por vez y exige que el test se ponga ROJO. Un candado que
# pasa estando mutado no es un candado — y en este repo eso ya pasó cuatro
# veces con barridos que leían sus propios comentarios.
#
#   bash scripts/_mutar-candados-poda.sh
#
# 🩸 LA RESTAURACIÓN NO USA `git checkout --`: con el trabajo sin commitear eso
# revierte los CAMBIOS PROPIOS, no la mutación. Ya pasó una vez en este PR y se
# perdieron tres archivos. Se copia a /tmp y se restaura desde ahí, así que el
# script es seguro con o sin commit.
set -uo pipefail
cd "$(dirname "$0")/.."

RESPALDO="$(mktemp -d)"
trap 'restaurar_todo; rm -rf "$RESPALDO"' EXIT

guardar() { for f in "$@"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done; }
restaurar_todo() {
  [ -d "$RESPALDO" ] || return 0
  (cd "$RESPALDO" && find . -type f -print0) 2>/dev/null | while IFS= read -r -d "" f; do
    cp "$RESPALDO/${f#./}" "${f#./}"
  done
}

FILTROS="src/components/catalogo/CatalogoFilters.tsx"
VENDEDOR="src/components/catalogo/CatalogoVendedorPage.tsx"
GUIAS="src/app/guias/components/GuiasList.tsx"
MODO="src/lib/guias/modo-despacho.ts"

T_FILTROS="src/__tests__/catalogo-filtros-desplegable.test.ts"
T_GUIAS="src/__tests__/components/guias-sin-rechazo.test.tsx"

guardar "$FILTROS" "$VENDEDOR" "$GUIAS" "$MODO"

ok=0; fail=0

restaurar() { for f in "$@"; do cp "$RESPALDO/$f" "$f"; done; }

# $1 = nombre  $2 = archivo de test  $3... = archivos mutados
correr() {
  local nombre="$1"; shift
  local test="$1"; shift
  if npx vitest run "$test" >/tmp/t203-mut.log 2>&1; then
    echo "  ❌ NO CAZADA: $nombre  (el test pasó estando mutado)"
    fail=$((fail+1))
  else
    echo "  ✅ cazada: $nombre"
    ok=$((ok+1))
  fi
  restaurar "$@"
}

echo "── Catálogo: los chips de Oferta/Nuevo/Próximamente ──"

# 1. Vuelve un chip de "Oferta" a la fila de escritorio.
python3 - <<'PY'
p = "src/components/catalogo/CatalogoFilters.tsx"
s = open(p).read()
ancla = '      {/* Sort + count + clear.'
assert ancla in s
s = s.replace(ancla, '''      <button className="px-3 py-1.5 rounded-full text-xs min-h-[44px]">Oferta</button>

''' + ancla, 1)
open(p, "w").write(s)
PY
correr "vuelve el chip 'Oferta'" "$T_FILTROS" "$FILTROS"

# 2. Vuelve el chip "Próximamente".
python3 - <<'PY'
p = "src/components/catalogo/CatalogoFilters.tsx"
s = open(p).read()
ancla = '      {/* Sort + count + clear.'
s = s.replace(ancla, '''      <button className="px-3 py-1.5 rounded-full text-xs min-h-[44px]">Próximamente</button>

''' + ancla, 1)
open(p, "w").write(s)
PY
correr "vuelve el chip 'Próximamente'" "$T_FILTROS" "$FILTROS"

# 3. Vuelve el grupo desplegable "Estado" en la fila de celular.
python3 - <<'PY'
p = "src/components/catalogo/CatalogoFilters.tsx"
s = open(p).read()
ancla = '''        {conCategorias && (
          <FiltroDesplegable
            etiqueta="Categoría"'''
assert ancla in s
s = s.replace(ancla, '''        <FiltroDesplegable
          etiqueta="Estado"
          valor=""
          opciones={[{ value: "", label: "Todos" }, { value: "oferta", label: "Oferta" }]}
          onChange={() => {}}
          chipActive={f.chipActive}
          chipInactive={f.chipInactive}
        />

''' + ancla, 1)
open(p, "w").write(s)
PY
correr "vuelve el grupo 'Estado' de celular" "$T_FILTROS" "$FILTROS"

# 4. Vuelve a exportarse el tipo SaleFilter.
python3 - <<'PY'
p = "src/components/catalogo/CatalogoFilters.tsx"
s = open(p).read()
s = s.replace('interface FiltroDesplegableProps {',
  'export type SaleFilter = "" | "oferta";\n\ninterface FiltroDesplegableProps {', 1)
open(p, "w").write(s)
PY
correr "vuelve el tipo SaleFilter exportado" "$T_FILTROS" "$FILTROS"

echo
echo "── Guías: Rechazar/Devolver ──"

# 5. Vuelve el item "Rechazar/Devolver" al menú «···».
python3 - <<'PY'
p = "src/app/guias/components/GuiasList.tsx"
s = open(p).read()
ancla = '''                                      const menuItems = [
                                        ...(canDelete'''
assert ancla in s
s = s.replace(ancla, '''                                      const menuItems = [
                                        { label: "Rechazar/Devolver", onClick: () => {} },
                                        ...(canDelete''', 1)
open(p, "w").write(s)
PY
correr "vuelve 'Rechazar/Devolver' al menú" "$T_GUIAS" "$GUIAS"

# 6. Vuelve el display del motivo de rechazo.
python3 - <<'PY'
p = "src/app/guias/components/GuiasList.tsx"
s = open(p).read()
ancla = '                                  {/* Dispatched: read-only despacho data */}'
assert ancla in s
s = s.replace(ancla, '''                                  {expandedGuia.motivo_rechazo && (
                                    <div><p>Motivo de rechazo</p><p>{expandedGuia.motivo_rechazo}</p></div>
                                  )}

''' + ancla, 1)
open(p, "w").write(s)
PY
correr "vuelve el motivo de rechazo en pantalla" "$T_GUIAS" "$GUIAS"

# 7. Vuelve el borde rojo de "Rechazada".
python3 - <<'PY'
p = "src/app/guias/components/GuiasList.tsx"
s = open(p).read()
ancla = '''                      const statusBorderClass = isDispatched
                        ? "border-l-4 border-l-emerald-400"'''
assert ancla in s
s = s.replace(ancla, '''                      const statusBorderClass = g.estado === "Rechazada"
                        ? "border-l-4 border-l-red-400"
                        : isDispatched
                        ? "border-l-4 border-l-emerald-400"''', 1)
open(p, "w").write(s)
PY
correr "vuelve el borde rojo de 'Rechazada'" "$T_GUIAS" "$GUIAS"

# 8. Se AFLOJA el guard: una guía rechazada se vuelve editable.
python3 - <<'PY'
p = "src/lib/guias/modo-despacho.ts"
s = open(p).read()
old = '  return estado === "Completada" || estado === "Rechazada";'
assert old in s
s = s.replace(old, '  return estado === "Completada";', 1)
open(p, "w").write(s)
PY
correr "se afloja guiaYaDespachada (Rechazada editable)" "$T_GUIAS" "$MODO"

echo
echo "════════════════════════════════════════════"
echo "  cazadas: $ok   ·   NO cazadas: $fail"
echo "════════════════════════════════════════════"
restaurar "$FILTROS" "$VENDEDOR" "$GUIAS" "$MODO"
[ "$fail" -eq 0 ]

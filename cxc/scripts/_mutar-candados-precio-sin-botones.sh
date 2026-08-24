#!/usr/bin/env bash
# Verificación por mutación del filtro de precio SIN botones (24-ago-2026).
#
# Lo que se defiende, y son DOS cosas que hay que poder romper por separado:
#   (a) la FILA DE BOTONES no vuelve (Daniel: "no quiero botones de precios,
#       solo escribirlo y ya" · "ninguno" sobre cuántos mostrar en Tommy);
#   (b) el AVISO de "ese precio no existe" SIGUE VIVO — es lo que evita que la
#       pantalla parezca rota (Tommy tiene $17.50 y NO tiene $17).
# Por eso hay una mutación que devuelve los botones y otra que apaga el aviso.
#
# Restaura por COPIA, no con `git checkout`: si en la rama hay archivos NUEVOS,
# git aborta el comando entero y no restaura NADA — las mutaciones se apilan y
# ninguna se prueba por separado. Un verificador que miente en verde es peor
# que no tenerlo. Y `probar()` EXIGE encontrar el resumen de vitest: si la
# corrida muere, "0 fallos" se leería como "sobrevivió".
set -u
cd "$(dirname "$0")/.."
F=src/components/catalogo/CatalogoFilters.tsx
X=src/lib/catalogo/filtros-extra.ts
M=src/lib/catalogo/marcas-ui.tsx
V=src/components/catalogo/CatalogoVendedorPage.tsx
P=src/components/catalogo/CatalogoPublicoPage.tsx
TESTS="src/__tests__/catalogo-precio-exacto.test.ts src/__tests__/catalogo-filtros-tommy.test.ts"
ARCHIVOS=("$F" "$X" "$M" "$V" "$P")
TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do mkdir -p "$TMP/$(dirname "$f")"; cp "$f" "$TMP/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$f" "$f"; done; }
CAZADAS=0; TOTAL=0

probar() {
  TOTAL=$((TOTAL+1))
  local nombre="$1" salida fallos
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  # El resumen tiene que estar: sin él, "0 fallos" sería el silencio de una
  # corrida muerta, no una mutación que sobrevive.
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no se puede juzgar: $nombre"
    restaurar; return
  fi
  fallos=$(grep -cE "^\s*(×|✕|FAIL)" <<<"$salida" || true)
  if [ "$fallos" -gt 0 ]; then CAZADAS=$((CAZADAS+1)); echo "  ✅ CAZADA ($fallos fallos) — $nombre"
  else echo "  🔴 SOBREVIVIÓ — $nombre"; fi
  restaurar
}

echo "== mutaciones =="

# ── (a) LA FILA DE BOTONES VUELVE ────────────────────────────────────────────
perl -0pi -e 's|\{/\* 🔴 ACÁ NO VA UNA FILA DE BOTONES DE PRECIO[\s\S]*?\*/\}|{precios.length > 0 \&\& (\n        <div className="flex flex-wrap items-center gap-1.5">\n          <span className={suave}>Precios de este catálogo:</span>\n          {precios.slice(0, 16).map(p => (\n            <button key={p} type="button" onClick={() => onChange({ desde: String(p), hasta: String(p) })} className={`${chipInactive} px-3 rounded-full text-xs font-medium min-h-[44px] tabular-nums`}>{`\$${p}`}</button>\n          ))}\n          {precios.length > 16 \&\& (\n            <button type="button" className={`${chipInactive} min-h-[44px] px-3 rounded-full text-xs font-medium`}>{`Ver los ${precios.length} precios`}</button>\n          )}\n        </div>\n      )}|' "$F"
probar "🔴 VUELVE LA FILA DE BOTONES de precio (con su «Ver los N precios»)"

# ── (b) EL AVISO SE APAGA ────────────────────────────────────────────────────
perl -0pi -e 's/const aviso = mensajeFiltroPrecio\(precio\.desde, precio\.hasta, precios\);/const aviso = null;/' "$F"
probar "🔴 SE APAGA EL AVISO de «ese precio no existe» en el componente"

perl -0pi -e 's/^export function mensajeFiltroPrecio\(([\s\S]*?)\): string \| null \{/export function mensajeFiltroPrecio($1): string | null {\n  return null;/m' "$X"
probar "🔴 SE APAGA EL AVISO en la regla (mensajeFiltroPrecio siempre null)"

perl -0pi -e 's/\{aviso && \(\s*\n\s*<p role="status" className="text-xs text-amber-700">\s*\n\s*\{aviso\}\s*\n\s*<\/p>\s*\n\s*\)\}//' "$F"
probar "el aviso deja de dibujarse (se borra el <p role=status>)"

# ── El aviso pierde lo que lo hace útil ──────────────────────────────────────
# 🩸 La mutación NO se escribe con `perl -e` sobre el template literal del
# mensaje: `${fmt(min)}` lo interpola PERL y el comando revienta con
# "Undefined subroutine &main::fmt" — la mutación no se aplica y el resultado
# se lee como "SOBREVIVIÓ" cuando en realidad no se probó nada.
perl -0pi -e 's/^export function preciosCercanos\(/export function preciosCercanos(precio: number, precios: number[]): { abajo: number | null; arriba: number | null } { return { abajo: null, arriba: null }; }\nfunction _preciosCercanosViejo(/m' "$X"
probar "el aviso pierde el precio más cercano (queda en «no hay resultados»)"

perl -0pi -e 's/^export function preciosDelCatalogo\(precios: \(number \| null \| undefined\)\[\]\): number\[\] \{/export function preciosDelCatalogo(precios: (number | null | undefined)[]): number[] {\n  return [];/m' "$X"
probar "los precios reales dejan de derivarse (el aviso se queda sin qué ofrecer)"

perl -0pi -e 's/preciosDisponibles=\{preciosDisponibles\}//' "$P"
probar "el catálogo PÚBLICO deja de pasarle los precios al filtro"

perl -0pi -e 's/preciosDisponibles=\{preciosDisponibles\}//' "$V"
probar "el catálogo INTERNO deja de pasarle los precios al filtro"

perl -0pi -e 's/preciosDelCatalogo\(products\.map\(p => p\.price\)\)/await fetch("\/api\/precios").then(r => r.json())/' "$P"
probar "los precios se piden con una CONSULTA NUEVA en vez de derivarse"

# ── (c) SE APAGA EL FILTRO EN REEBOK / JOYBEES ───────────────────────────────
perl -0pi -e 's/(marca: "reebok",[\s\S]*?)filtroPrecio: true,/${1}filtroPrecio: false,/' "$M"
probar "🔴 REEBOK vuelve a quedarse sin filtro de precio"

perl -0pi -e 's/(api: "\/api\/catalogo\/joybees",[\s\S]*?)filtroPrecio: true,/${1}filtroPrecio: false,/' "$M"
probar "🔴 JOYBEES vuelve a quedarse sin filtro de precio (rompe el espejo de Reebok)"

perl -0pi -e 's/const conPrecio = theme\.features\.filtroPrecio && !!onPrecioChange;/const conPrecio = marca === "tommy" \&\& !!onPrecioChange;/' "$F"
probar "el filtro se cablea a mano a una marca en vez de al flag"

# ── El resto del control no se puede romper de paso ──────────────────────────
perl -0pi -e 's/onChange\(\{ desde: v, hasta: espejo \? v : precio\.hasta \}\);/onChange({ desde: v, hasta: precio.hasta });/' "$F"
probar "se cae el ESPEJO (escribir en «desde» ya no llena «hasta»)"

perl -0pi -e 's/const campo = `\$\{chipInactive\} w-24 min-h-\[44px\]/const campo = `${chipInactive} w-24/' "$F"
probar "los campos bajan de 44 px de alto"

perl -0pi -e 's/const suave = "text-xs text-black\/50";/const suave = "text-[10px] text-black\/50";/' "$F"
probar "el texto del bloque baja de 12 px"

restaurar
echo
echo "RESULTADO: $CAZADAS de $TOTAL cazadas"
rm -rf "$TMP"

#!/usr/bin/env bash
# Verificación por MUTACIÓN de «encontrar rápido los días a revisar»
# (18-sep-2026): `src/__tests__/components/asistencia-solo-a-revisar.test.tsx`.
#
# Daniel: *«opcion a con mockup»* y *«si y nada más el botón de "Solo a
# revisar"»*. Nada de esto mueve un centavo: se rompe cada regla de PANTALLA a
# propósito y se comprueba que el candado se pone ROJO. Dos CONTROLES (cambios
# que NO alteran ninguna regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

MOD=src/lib/asistencia/solo-a-revisar.ts
TSX=src/app/asistencia/ReporteTab.tsx
IMPAR=src/lib/asistencia/marcas-impares.ts

TESTS=(
  src/__tests__/components/asistencia-solo-a-revisar.test.tsx
)

ARCHIVOS=("$MOD" "$TSX" "$IMPAR")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }
correr() { npx vitest run "${TESTS[@]}" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | grep -qE "Test Files" && ! echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. 🔴 EL TOTAL DEJA DE SEGUIR AL FILTRO =="
# El defecto que la regla de la casa prohíbe: la tabla recortada y el pie
# sumando la lista entera (`buscar-en-lista.ts`).
mutar "$TSX" '  const tot = (visibles ?? []).reduce((a, p) => ({' \
             '  const tot = (personas ?? []).reduce((a, p) => ({' \
&& probar 'el pie suma los 45 arriba de una tabla de 34'

echo "== 2. el pie dice cuántos son ANTES del filtro =="
mutar "$TSX" '                <td className="px-3 py-2.5" colSpan={3}>{visibles.length} {visibles.length === 1 ? "colaborador" : "colaboradores"}</td>' \
             '                <td className="px-3 py-2.5" colSpan={3}>{personas.length} {personas.length === 1 ? "colaborador" : "colaboradores"}</td>' \
&& probar 'el pie cuenta colaboradores que la tabla no muestra'

echo '== 3. 🔴 EL FILTRO PASA A push =='
# Ensuciaría el botón Atrás del navegador: es un filtro del MISMO nivel.
mutar "$TSX" '  const [revisarUrl, setRevisarUrl] = useUrlState(PARAM_SOLO_A_REVISAR, "");' \
             '  const [revisarUrl, setRevisarUrl] = useUrlState(PARAM_SOLO_A_REVISAR, "", { history: "push" });' \
&& probar 'el filtro empuja una entrada de historial por cada toque'

echo '== 4. 🔴 EL ENLACE DEL NÚMERO PASA A push =='
mutar "$TSX" '  const [diasDeUrl, setDiasDeUrl] = useUrlState(PARAM_DIAS_DE, "");' \
             '  const [diasDeUrl, setDiasDeUrl] = useUrlState(PARAM_DIAS_DE, "", { history: "push" });' \
&& probar 'abrir los días de alguien empuja historial'

echo "== 5. 🔴 CON 0 DÍAS A REVISAR APARECE UN ENLACE =="
# Un enlace que abre una lista vacía es peor que no tenerlo.
mutar "$TSX" '        <td className="px-2 py-2.5 text-right">{r.diasARevisar' \
             '        <td className="px-2 py-2.5 text-right">{true' \
&& probar 'el guion se vuelve un enlace a ningún día'

echo "== 6. el filtro deja de filtrar =="
mutar "$MOD" '  return todas.filter((p) => tieneDiasARevisar(p));' '  return todas;' \
&& probar 'el botón se prende y no saca a nadie'

echo "== 7. el filtro se pasa de listo y saca a quien SÍ tiene algo =="
mutar "$MOD" '  return (p?.resumen?.diasARevisar ?? 0) > 0;' '  return (p?.resumen?.diasARevisar ?? 0) > 1;' \
&& probar 'quien tiene un solo día a revisar desaparece de la lista'

echo "== 8. los días de adentro dejan de recortarse =="
mutar "$MOD" '  return todos.filter((d) => Boolean(d?.revisar));' '  return todos;' \
&& probar 'el número abre la persona con la quincena entera, como antes'

echo '== 9. los días se recortan por otra cosa que revisar =='
# 🔴 La regla NO se inventa acá: la pone el motor (`reporte.ts`).
mutar "$MOD" '  return todos.filter((d) => Boolean(d?.revisar));' \
             '  return todos.filter((d) => !Boolean(d?.revisar));' \
&& probar 'se muestran justo los días que NO hay que revisar'

echo "== 10. 🔴 EL BOTÓN DE DESCARGA DEJA DE DECIR A CUÁNTOS AFECTA =="
mutar "$MOD" '  return `${base} · ${visibles}`;' '  return base;' \
&& probar 'el Excel baja 34 y el botón sigue diciendo «Excel»'

echo "== 11. el Excel baja la lista entera con la pantalla recortada =="
mutar "$TSX" '        construirExcel({ personas: visibles, desde, hasta, reglas: reglas ?? undefined }),' \
             '        construirExcel({ personas: personas ?? [], desde, hasta, reglas: reglas ?? undefined }),' \
&& probar 'la pantalla dice 2 y el archivo lleva 3'

echo "== 12. el conteo «2 de 3» desaparece =="
mutar "$MOD" '  return `${visibles} de ${total} ${total === 1 ? "colaborador" : "colaboradores"}`;' \
             '  return "";' \
&& probar 'el total recortado se lee como el de todos'

echo "== 13. el filtro se prende con cualquier cosa =="
mutar "$MOD" '  return String(valor ?? "") === VALOR_PRENDIDO;' '  return String(valor ?? "") !== "";' \
&& probar 'un «0» en la URL prende el filtro'

echo "== 14. la línea del detalle recortado se calla =="
mutar "$MOD" '  if (mostrados <= 0 || total <= mostrados) return null;' '  return null;' \
&& probar 'tres días de once y nadie lo dice'

echo "== 15. 🔴 EL ENLACE SE SALE DEL CAMINO COMÚN =="
# Dos formas de llegar al mismo día es una forma de que una deje de funcionar.
mutar "$MOD" '  const base = enlaceDiasDe(cod, rango);' \
             '  const base = `/asistencia?tab=asistencia&q=${encodeURIComponent(cod)}`;' \
&& probar 'el enlace se arma a mano y deja de llevar el período'

echo "== 16. el vacío del filtro vuelve a ser una tabla en blanco =="
mutar "$TSX" '      {!cargando && !error && !!personas?.length && visibles?.length === 0 && (' \
             '      {false && !cargando && !error && !!personas?.length && visibles?.length === 0 && (' \
&& probar 'el filtro no deja a nadie y la pantalla no dice nada'

echo "== 17. apagar el filtro deja la fila recortada =="
mutar "$TSX" '            if (!prender) setDiasDeUrl("");' '            if (false) setDiasDeUrl("");' \
&& probar 'con el filtro apagado una fila sigue mostrando 3 de 11 días'

echo "== 18. tocar la fila ya no la abre entera =="
mutar "$TSX" '                    if (diasDeUrl === p.codigo) { setDiasDeUrl(""); setAbierta(p.codigo); return; }' \
             '                    if (diasDeUrl === p.codigo) { return; }' \
&& probar 'no hay salida del detalle recortado'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$MOD" '/** El rótulo del botón, en un solo lugar: pantalla y candado leen el mismo. */' \
             '/** El rótulo del botón, en un solo lugar: la pantalla y el candado leen el mismo. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$MOD" '  const todas = (lista ?? []) as T[];
  if (!prendido) return todas;
  return todas.filter((p) => tieneDiasARevisar(p));' \
             '  const lasQueHay = (lista ?? []) as T[];
  if (!prendido) return lasQueHay;
  return lasQueHay.filter((p) => tieneDiasARevisar(p));' \
&& controlar 'nombre de la variable de la lista'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

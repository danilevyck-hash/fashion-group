#!/usr/bin/env bash
# Verificación por MUTACIÓN de «ver y quitar las marcaciones de más»
# (18-sep-2026): `src/__tests__/lib/asistencia-marcas-de-mas.test.ts` y
# `src/__tests__/components/asistencia-marcas-de-mas.test.tsx`, más el candado
# viejo `marcas-impares.test.ts`, que el mismo día cambió de dirección.
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

DIA=src/lib/asistencia/marcas-del-dia.ts
IMP=src/lib/asistencia/marcas-impares.ts
EXP=src/lib/asistencia/exportar.ts
RUTA=src/app/api/asistencia/correcciones/route.ts
MODAL=src/app/asistencia/CorregirMarcacionModal.tsx
TSX=src/app/asistencia/ReporteTab.tsx

TESTS=(
  src/__tests__/lib/asistencia-marcas-de-mas.test.ts
  src/__tests__/components/asistencia-marcas-de-mas.test.tsx
  src/__tests__/lib/marcas-impares.test.ts
)

ARCHIVOS=("$DIA" "$IMP" "$EXP" "$RUTA" "$MODAL" "$TSX")

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

echo "== 1. las cuatro columnas dejan de esconder: la 2.ª se dibuja siempre =="
mutar "$DIA" '    n >= MARCAS_NORMALES ? 1 : null,' '    n > 1 ? 1 : null,' \
&& probar 'un día de 3 marcas ya no reporta la del medio como escondida'

echo "== 2. «escondidas» dice que nunca se esconde nada =="
mutar "$DIA" '  for (let i = 0; i < n; i++) if (!visibles.has(i)) out.push(i);' '  void visibles;' \
&& probar 'el día de 5 marcas vuelve a dibujarse con cuatro celdas'

echo "== 3. el umbral de «pegadas» se apaga =="
mutar "$DIA" 'export const SEGUNDOS_PEGADAS = 300;' 'export const SEGUNDOS_PEGADAS = 0;' \
&& probar 'la marca repetida de Ramón deja de señalarse'

echo "== 4. el umbral se afloja a un día entero =="
mutar "$DIA" 'export const SEGUNDOS_PEGADAS = 300;' 'export const SEGUNDOS_PEGADAS = 86400;' \
&& probar 'un día normal empieza a salir con todas sus marcas señaladas'

echo "== 5. se compara contra la PRIMERA marca y no contra la anterior =="
mutar "$DIA" '    const a = segundosDeHora(marcas[i - 1]);' '    const a = segundosDeHora(marcas[0]);' \
&& probar 'tres marcas seguidas dejan de señalarse una por una'

echo "== 6. la regla del cierre vuelve a ser SOLO impar (lo de antes del 18-sep) =="
mutar "$IMP" '  return n % 2 === 1 || n > MARCAS_MAXIMO;' '  return n % 2 === 1;' \
&& probar 'el día de 6 marcas vuelve a cerrar la quincena sin avisar'

echo "== 7. la regla se ensancha y atrapa el día de DOS marcas =="
mutar "$IMP" '  return n % 2 === 1 || n > MARCAS_MAXIMO;' '  return n !== MARCAS_MAXIMO && n > 0;' \
&& probar 'el caso de Andrea Pérez (2 marcas) empieza a frenar el cierre'

echo "== 8. el tope deja de salir del MISMO 4 de la pantalla =="
mutar "$IMP" 'export const MARCAS_MAXIMO = MARCAS_NORMALES;' 'export const MARCAS_MAXIMO = 6;' \
&& probar 'el freno y las cuatro columnas usan números distintos'

echo "== 9. el Excel deja de escribir todas las marcas =="
mutar "$EXP" '        textoTodasLasMarcas(d.marcas),
        d.marcas.length || "",' '        "",
        "",' \
&& probar 'el archivo vuelve a esconder la cuarta marca'

echo "== 10. el Excel mete las columnas nuevas ANTES de «Salida» =="
mutar "$EXP" '    "Colaborador","Código","Día","Entrada","Sale almuerzo","Vuelve","Salida",' \
             '    "Colaborador","Código","Día","Entrada","Sale almuerzo","Vuelve",' \
&& probar 'las cuatro columnas que la contadora lee por posición se corren'

echo "== 11. la ruta ignora el campo quita =="
mutar "$RUTA" '    const quita = body?.quita === true;' '    const quita = false;' \
&& probar 'quitar una marcación vuelve a ser imposible desde Asistencia'

echo "== 12. la ruta deja quitar sin decir CUÁL marcación =="
mutar "$RUTA" '    if (quita && !marcacionId) {' '    if (false) {' \
&& probar 'se puede «quitar» una marcación que no existe'

echo "== 13. la ventana no ofrece la tercera opción =="
mutar "$MODAL" '  const sePuedeQuitar = Boolean(marca.marcacionId) && !marca.correccionId;' \
               '  const sePuedeQuitar = false;' \
&& probar 'vuelven a ser dos casos y nada más'

echo "== 14. quitando, la ventana manda igual una hora =="
mutar "$MODAL" '          hora: quitando ? null : horaGuardar,' '          hora: horaGuardar,' \
&& probar 'la corrección viaja con hora y el CHECK de la base la rechaza'

echo "== 15. la pantalla nunca toma la rama de «todas las marcas» =="
mutar "$TSX" '            {cabenLasCuatro ? (' '            {true ? (' \
&& probar 'el día de 5 marcas vuelve a mostrar cuatro'

echo "== 16. el aviso azul deja de contar las quitadas =="
mutar "$TSX" '          {correcciones.quitadas > 0 && (' '          {false && (' \
&& probar 'quitar una marca no deja rastro arriba de la tabla'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$DIA" '/** Un día bien marcado: entra, sale a almorzar, vuelve, se va. */' \
             '/** Un día bien marcado: entra, almuerza, vuelve y se va. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$DIA" '  const visibles = new Set(columnasClasicas(n).filter((i): i is number => i !== null));' \
             '  const enPantalla = new Set(columnasClasicas(n).filter((i): i is number => i !== null));
  const visibles = enPantalla;' \
&& controlar 'nombre de la variable del conjunto de visibles'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

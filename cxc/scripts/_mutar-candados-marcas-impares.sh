#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «marcas impares» (15-sep-2026):
#   `src/__tests__/lib/marcas-impares.test.ts`.
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/marcas-impares.ts
MOTOR=src/lib/asistencia/planilla.ts
CIERRE=src/lib/asistencia/planilla-guardada.ts
AVISOS=src/lib/asistencia/antes-de-cerrar.ts

TESTS=(
  src/__tests__/lib/marcas-impares.test.ts
)

ARCHIVOS=("$REGLA" "$MOTOR" "$CIERRE" "$AVISOS")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

# 🩸 SIN TUBERÍAS PARA MIRAR LA SALIDA. Con `set -o pipefail`, un
# `echo "$salida" | grep -q` sobre una salida grande devuelve 141: `grep -q`
# corta apenas encuentra la primera coincidencia, `echo` se come un SIGPIPE y
# `pipefail` se queda con ESE código. Resultado: una mutación CAZADA de verdad
# se reportaba como «corrida muerta». Se compara con el propio bash.
tiene() { case "$2" in *"$1"*) return 0;; *) return 1;; esac; }

corrio() { tiene "Test Files" "$1"; }
fallo()  { [[ "$1" =~ Tests[[:space:]]+[^$'\n']*failed ]]; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! corrio "$salida"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if fallo "$salida"; then
    echo "  ✅ CAZADA — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if corrio "$salida" && ! fallo "$salida"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. la paridad se invierte: entra el PAR y se va el impar =="
mutar "$REGLA" '    if (n % 2 === 0) continue;' '    if (n % 2 === 1) continue;' \
&& probar 'los días de 4 marcas frenarían el cierre'

echo "== 2. la regla se ENSANCHA para atrapar el 6 (lo que Daniel descartó) =="
mutar "$REGLA" '    if (n % 2 === 0) continue;' '    if (n % 2 === 0 && n !== 6) continue;' \
&& probar 'el día de 6 marcas entra: se vuelve a adivinar'

echo "== 3. el día de 2 marcas entra (el umbral que Daniel rechazó) =="
mutar "$REGLA" '    if (n % 2 === 0) continue;' '    if (n % 2 === 0 && n !== 2) continue;' \
&& probar 'Andrea Pérez del 1-sep frenaría el cierre'

echo "== 4. el sábado y el domingo pasan a frenar =="
mutar "$REGLA" '    if (!d.habil || d.enCurso || d.fueraDeVigencia || d.vacacion) continue;' '    if (d.enCurso || d.fueraDeVigencia || d.vacacion) continue;' \
&& probar 'el día no hábil deja de quedar afuera'

echo "== 5. el día EN CURSO se juzga =="
mutar "$REGLA" '    if (!d.habil || d.enCurso || d.fueraDeVigencia || d.vacacion) continue;' '    if (!d.habil || d.fueraDeVigencia || d.vacacion) continue;' \
&& probar 'hoy a las 3 de la tarde son 3 marcas y frenaría'

echo "== 6. el día fuera de vigencia se juzga =="
mutar "$REGLA" '    if (!d.habil || d.enCurso || d.fueraDeVigencia || d.vacacion) continue;' '    if (!d.habil || d.enCurso || d.vacacion) continue;' \
&& probar 'un día en que no trabajaba acá frenaría'

echo "== 7. el día de vacaciones se juzga =="
mutar "$REGLA" '    if (!d.habil || d.enCurso || d.fueraDeVigencia || d.vacacion) continue;' '    if (!d.habil || d.enCurso || d.fueraDeVigencia) continue;' \
&& probar 'las marcas ignoradas de una vacación frenarían'

echo "== 8. deja de agruparse por código: el sueldo repartido cuenta dos veces =="
mutar "$REGLA" '    porCodigo.set(l.codigo, {' '    porCodigo.set(`${l.codigo}#${porCodigo.size}`, {' \
&& probar 'la misma persona sale dos veces'

# ⚠️ `< 4` → `<= 4` sería un mutante EQUIVALENTE: a esta función solo le llegan
# días IMPARES, así que un día de 4 marcas no existe. Se mueve el corte hacia
# abajo, que sí cambia la conducta: el día de 3 marcas se cae de las dos listas.
echo "== 9. el corte entre «de menos» y «de más» se mueve =="
mutar "$REGLA" '    deMenos: filtrar((d) => d.marcas < 4),' '    deMenos: filtrar((d) => d.marcas < 2),' \
&& probar 'el día de 3 marcas desaparece del aviso'

echo "== 10. «de más» se queda sin lista propia =="
mutar "$REGLA" '    deMas: filtrar((d) => d.marcas > 4),' '    deMas: [],' \
&& probar 'los dos problemas se vuelven uno'

echo "== 11. el texto del freno deja de decir QUÉ HACER =="
mutar "$REGLA" '    + "Ve a la pestaña «Asistencia», pon la hora que falta con «Agregar hora» —o deshaz la que sobra—, y vuelve a cerrar. "' '    + "Revísalo. "' \
&& probar 'el 409 manda a buscar dónde'

echo "== 12. el cierre NO se frena =="
mutar "$CIERRE" '  const textoImpares = textoFrenoMarcasImpares(impares);' '  const textoImpares = null as string | null;' \
&& probar 'se puede cerrar con días mal marcados'

echo "== 13. el motor no calcula los días impares =="
mutar "$MOTOR" '    const impares = p ? diasConMarcasImpares(p.dias) : [];' '    const impares: DiaImpar[] = [];' \
&& probar 'la línea nunca trae el campo'

echo "== 14. el motor aprovecha para tocar el dinero al agregar el campo =="
mutar "$MOTOR" '        impares.length > 0 ? { ...lineaBase, marcasImpares: impares } : lineaBase;' '        impares.length > 0 ? { ...lineaBase, marcasImpares: impares, dinero: null } : lineaBase;' \
&& probar 'EL CÁLCULO SE TOCA — es lo que Daniel prohibió'

echo "== 15. «Antes de cerrar» deja de listarlos =="
mutar "$AVISOS" '  const impares = e.marcasImpares ?? [];' '  const impares: readonly PersonaConMarcasImpares[] = [];' \
&& probar 'la lista dice «Todo listo para cerrar» con 44 días mal marcados'

echo "== 16. el enlace deja de llevar a la persona =="
mutar "$REGLA" '  const p = new URLSearchParams({ tab: "asistencia", q: String(codigo).trim() });' '  const p = new URLSearchParams({ tab: "asistencia" });' \
&& probar 'el enlace abre la pestaña sin buscar a nadie'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '/** Cuántos días suman, que es lo que se cuenta en pantalla. */' '/** Cuántos días suman en total. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. el orden de las dos listas del reparto (misma conducta) =="
mutar "$REGLA" '  return {
    deMenos: filtrar((d) => d.marcas < 4),
    deMas: filtrar((d) => d.marcas > 4),
  };' '  const deMas = filtrar((d) => d.marcas > 4);
  const deMenos = filtrar((d) => d.marcas < 4);
  return { deMenos, deMas };' \
&& controlar 'mismas dos listas, calculadas al revés'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

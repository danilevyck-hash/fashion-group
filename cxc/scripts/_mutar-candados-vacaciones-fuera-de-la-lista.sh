#!/bin/bash
# Verificación por MUTACIÓN de «los días de vacaciones se van de la lista»
# (19-sep-2026). No escribe nada en ninguna base.
set -u
cd "$(dirname "$0")/.." || exit 1

LISTA="src/app/asistencia/ConfiguracionTab.tsx"
FICHA="src/app/asistencia/colaboradores/SeccionVacaciones.tsx"
MODULO="src/lib/asistencia/vacaciones-corresponden.ts"
CANDADOS="src/__tests__/lib/asistencia-vacaciones-fuera-de-la-lista.test.ts src/__tests__/components/asistencia-lista-que-falta.test.tsx src/__tests__/lib/persona-en-el-centro.test.ts"

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0
respaldo() { cp "$1" "$1.bak-mutacion"; }
restaurar() { for f in "$LISTA" "$FICHA" "$MODULO"; do [ -f "$f.bak-mutacion" ] && mv "$f.bak-mutacion" "$f"; done; }
trap restaurar EXIT
# $4 = "todo" para reemplazar TODAS las apariciones (si no, solo la primera).
aplicar() {
  python3 - "$1" "$2" "$3" "${4:-una}" <<'PY'
import sys
f, viejo, nuevo, cuantas = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
s = open(f).read()
if viejo not in s: sys.exit(3)
open(f, "w").write(s.replace(viejo, nuevo) if cuantas == "todo" else s.replace(viejo, nuevo, 1))
PY
}
mutar() {
  local f="$1" desc="$2"; respaldo "$f"
  aplicar "$f" "$3" "$4" "${5:-una}" || { echo "  NO SE PUDO APLICAR: $desc"; restaurar; return; }
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  ESCAPADA: $desc"; ESCAPADAS=$((ESCAPADAS+1))
  else
    echo "  cazada:   $desc"; CAZADAS=$((CAZADAS+1))
  fi
  restaurar
}
control() {
  local f="$1" desc="$2"; respaldo "$f"
  aplicar "$f" "$3" "$4" || { echo "  NO SE PUDO APLICAR: $desc"; restaurar; return; }
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  control en verde: $desc"; CONTROLES_OK=$((CONTROLES_OK+1))
  else
    echo "  control ROJO: $desc"; CONTROLES_MAL=$((CONTROLES_MAL+1))
  fi
  restaurar
}

echo "-- la columna no vuelve -------------------------------------------------"
mutar "$LISTA" "vuelve el encabezado «Vacaciones»" \
  '                  <span>Qué falta</span>' \
  '                  <span className="text-right">Vacaciones</span>
                  <span>Qué falta</span>'
mutar "$LISTA" "vuelve el dato «Vacaciones» de la tarjeta del celular" \
  '                          <Dato etiqueta="Salario" valor={money(p.salarioMensual)} numero />' \
  '                          <Dato etiqueta="Salario" valor={money(p.salarioMensual)} numero />
                          <Dato etiqueta="Vacaciones" valor="0" numero />'
mutar "$LISTA" "la lista vuelve a pedir los días" \
  '  const puedeTocarLaFicha = puedeCerrar(rol);' \
  '  const puedeTocarLaFicha = puedeCerrar(rol);
  void fetch("/api/asistencia/vacaciones");'
mutar "$LISTA" "vuelve la rejilla de SEIS columnas" \
  '  const rejilla = COLUMNAS;' \
  '  const rejilla = "lg:grid lg:grid-cols-[minmax(0,1fr)_9rem_5rem_6.5rem_5.5rem_minmax(0,1fr)] lg:items-center lg:gap-x-3";'

echo "-- la ficha no se toca --------------------------------------------------"
mutar "$FICHA" "la ficha deja de leer la ruta de vacaciones" \
  '/api/asistencia/vacaciones' \
  '/api/asistencia/no-existe' "todo"
mutar "$FICHA" "la ficha pierde la línea que dice qué NO incluye" \
  'NO_INCLUYE_ANTES' \
  'COMO_SE_CALCULA' "todo"

echo "-- el cálculo se queda entero -------------------------------------------"
mutar "$MODULO" "la ley pasa a 12 meses" \
  'export const MESES_POR_PERIODO = 11;' \
  'export const MESES_POR_PERIODO = 12;'
mutar "$MODULO" "sin fecha de ingreso se inventa un CERO" \
  '    return {
      codigo: cod, etiqueta, dias: null, ganados: null,
      tomados, yaPagados, faltaFechaIngreso: true,
    };' \
  '    return {
      codigo: cod, etiqueta, dias: 0, ganados: 0,
      tomados, yaPagados, faltaFechaIngreso: false,
    };'
mutar "$MODULO" "«Le corresponden» se vuelve «Le quedan»" \
  'export const ROTULO_CORRESPONDEN = "Le corresponden";' \
  'export const ROTULO_CORRESPONDEN = "Le quedan";'

echo "-- CONTROLES ------------------------------------------------------------"
control "$MODULO" "un comentario más no cambia nada" \
  'export function correspondenA(' \
  '/* los que le tocan */
export function correspondenA('
control "$LISTA" "cambiar el rótulo de «Qué falta» no toca esta regla" \
  '                  <span>Qué falta</span>' \
  '                  <span>Qué falta </span>'

echo
echo "========================================================================"
echo " Mutaciones cazadas: $CAZADAS · escapadas: $ESCAPADAS"
echo " Controles en verde: $CONTROLES_OK · en rojo: $CONTROLES_MAL"
echo "========================================================================"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

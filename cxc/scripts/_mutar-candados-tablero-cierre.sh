#!/bin/bash
# Verificación por MUTACIÓN del tablero de cierre (19-sep-2026).
# No escribe nada en ninguna base.
set -u
cd "$(dirname "$0")/.." || exit 1

MODULO="src/lib/asistencia/tablero-cierre.ts"
PANTALLA="src/app/asistencia/TableroCierre.tsx"
TAB="src/app/asistencia/PlanillaTab.tsx"
PUENTE="src/lib/asistencia/antes-de-cerrar-del-cuadro.ts"
CANDADOS="src/__tests__/components/asistencia-tablero-cierre.test.tsx"

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0
respaldo() { cp "$1" "$1.bak-mutacion"; }
restaurar() { for f in "$MODULO" "$PANTALLA" "$TAB" "$PUENTE"; do [ -f "$f.bak-mutacion" ] && mv "$f.bak-mutacion" "$f"; done; }
trap restaurar EXIT
aplicar() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
if viejo not in s: sys.exit(3)
open(f, "w").write(s.replace(viejo, nuevo, 1))
PY
}
mutar() {
  local f="$1" desc="$2"; respaldo "$f"
  aplicar "$f" "$3" "$4" || { echo "  NO SE PUDO APLICAR: $desc"; restaurar; return; }
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

echo "-- nunca un total del grupo ---------------------------------------------"
mutar "$MODULO" "el modulo suma los netos de las cuatro empresas" \
  '/** La fila en blanco de una empresa, antes de que conteste. */' \
  'export function netoDelGrupo(filas: readonly FilaTablero[]): number {
  return filas.reduce((a, f) => a + f.neto, 0);
}

/** La fila en blanco de una empresa, antes de que conteste. */'
mutar "$PANTALLA" "la pantalla pinta un pie con el total" \
  '        </table>
      </div>' \
  '        <tfoot><tr><td>Total</td></tr></tfoot>
        </table>
      </div>'
mutar "$MODULO" "se deja de decir por que no hay un total" \
  '  "Cada empresa se cierra por su lado y paga su propia planilla: acá no se suman.";' \
  '  "Una línea por empresa.";'

echo "-- cada cierre por su puerta --------------------------------------------"
mutar "$PANTALLA" "el cierre manda TODAS las empresas juntas" \
  '        body: JSON.stringify({ empresa: fila.empresa, desde, hasta }),' \
  '        body: JSON.stringify({ empresas: filas.map((f) => f.empresa), desde, hasta }),'
mutar "$PANTALLA" "el cierre va a una ruta inventada" \
  '      const res = await fetch("/api/asistencia/planilla-guardada", {' \
  '      const res = await fetch("/api/asistencia/planilla/todas", {'
mutar "$PANTALLA" "todas las empresas se piden en UNA sola lectura" \
  '        const p = new URLSearchParams({ desde, hasta, empresa });' \
  '        const p = new URLSearchParams({ desde, hasta });'
mutar "$MODULO" "se ofrece cerrar lo que ya esta cerrado" \
  '  return f.estado === "con-pendientes" || f.estado === "lista";' \
  '  return f.estado !== "cargando";'
mutar "$MODULO" "cualquiera puede cerrar desde el tablero" \
  '  if (!puedeElRol) return false;' \
  '  if (false) return false;'
mutar "$PANTALLA" "no se pregunta antes de cerrar" \
  '                      onClick={() => setConfirmar(f)}' \
  '                      onClick={() => void cerrar(f)}'
mutar "$PANTALLA" "la ventana de confirmacion es otra" \
  'import { ModalCierre } from "./PlanillaTab";' \
  'const ModalCierre = (_p: Record<string, unknown>) => null;'

echo "-- lo que no se pudo leer se dice ---------------------------------------"
mutar "$PANTALLA" "una lectura caida se disfraza de vacia" \
  '          estado: "error", error: e instanceof Error ? e.message : "No se pudo leer",' \
  '          estado: "vacia", error: null, /* se traga */ '
mutar "$MODULO" "el error no se lee: sale como si faltara algo" \
  '    case "error": return f.error ?? "No se pudo leer";' \
  '    case "error": return SIN_NADIE;'
mutar "$MODULO" "una empresa sin nadie ofrece cerrar igual" \
  '    case "vacia": return SIN_NADIE;' \
  '    case "vacia": return TODO_LISTO_TABLERO;'

echo "-- que falta sale del mismo modulo --------------------------------------"
mutar "$PANTALLA" "el tablero inventa su propia idea de que falta" \
  '        const avisos = antesDeCerrarDelCuadro(' \
  '        const avisos = { todoListo: true, arreglar: [] as Array<{numero: number|null; texto: string}> }; void antesDeCerrarDelCuadro; if (false) void antesDeCerrarDelCuadro('
mutar "$TAB" "el tablero sale tambien con UNA empresa elegida" \
  '      {sinEmpresa && (
        <TableroCierre' \
  '      {true && (
        <TableroCierre'
mutar "$PANTALLA" "no se espera al alcance: el tablero parpadea y muestra de mas" \
  '    if (alcance === undefined) return;' \
  '    if (false) return;'

echo "-- CONTROLES ------------------------------------------------------------"
control "$MODULO" "cambiar el texto de «Ya esta cerrada» no cambia la conducta" \
  'export const YA_CERRADA = "Ya está cerrada";' \
  'export const YA_CERRADA = "Ya está cerrada";  '
control "$PUENTE" "un comentario mas en el puente no rompe nada" \
  'export function antesDeCerrarDelCuadro(' \
  '/* el puente */
export function antesDeCerrarDelCuadro('

echo
echo "========================================================================"
echo " Mutaciones cazadas: $CAZADAS · escapadas: $ESCAPADAS"
echo " Controles en verde: $CONTROLES_OK · en rojo: $CONTROLES_MAL"
echo "========================================================================"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

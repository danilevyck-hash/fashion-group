#!/bin/bash
# Verificación por MUTACIÓN de «las direcciones viejas dejan de existir»
# (19-sep-2026). No escribe nada en ninguna base.
set -u
cd "$(dirname "$0")/.." || exit 1

MODULO="src/lib/asistencia/persona-en-el-centro.ts"
CLIENTE="src/app/asistencia/AsistenciaClient.tsx"
CANDADOS="src/__tests__/components/asistencia-direcciones-viejas.test.tsx src/__tests__/lib/persona-en-el-centro.test.ts"

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0
respaldo() { cp "$1" "$1.bak-mutacion"; }
restaurar() { for f in "$MODULO" "$CLIENTE"; do [ -f "$f.bak-mutacion" ] && mv "$f.bak-mutacion" "$f"; done; }
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

echo "-- la regla pura --------------------------------------------------------"
mutar "$MODULO" "la direccion vieja se deja viva (no se corrige nunca)" \
  '  if (k === mostrada) return null;
  return mostrada;' \
  '  if (k === mostrada) return null;
  return null;'
mutar "$MODULO" "se reescribe tambien la URL VACIA" \
  '  if (k === "") return null;' \
  '  if (false) return null;'
mutar "$MODULO" "se reescribe antes de saber quien mira" \
  '  if (visibles.length === 0) return null;' \
  '  if (false) return null;'
mutar "$MODULO" "una pestaña buena se reescribe igual (bucle de replace)" \
  '  if (k === mostrada) return null;' \
  '  if (false) return null;'

echo "-- la mudanza no cambia -------------------------------------------------"
mutar "$MODULO" "justificaciones deja de caer en Asistencia" \
  '  justificaciones: "asistencia",' \
  '  justificaciones: "colaboradores",'
mutar "$MODULO" "vacaciones deja de caer en Colaboradores" \
  '  vacaciones: "colaboradores",' \
  '  vacaciones: "asistencia",'
mutar "$MODULO" "la lista de mudadas se vacia" \
  'export const CLAVES_MUDADAS: readonly string[] = Object.freeze(Object.keys(MUDANZA));' \
  'export const CLAVES_MUDADAS: readonly string[] = Object.freeze([]);'

echo "-- la pantalla ----------------------------------------------------------"
mutar "$CLIENTE" "la pantalla no corrige la URL" \
  '    const aEscribir = claveQueSeReescribe(tabRaw, tab, visibles);
    if (aEscribir) setTab(aEscribir);' \
  '    void claveQueSeReescribe;'
mutar "$CLIENTE" "la pantalla se saltea el guard de «quien mira»" \
  'claveQueSeReescribe(tabRaw, tab, visibles)' \
  'claveQueSeReescribe(tabRaw, tab, [["reporte", "Reporte"]])'
mutar "$CLIENTE" "la pantalla escribe la clave VIEJA en vez de la buena" \
  '    if (aEscribir) setTab(aEscribir);' \
  '    if (aEscribir) setTab(tabRaw);'

echo "-- CONTROLES ------------------------------------------------------------"
control "$MODULO" "un comentario mas no cambia nada" \
  'export function claveQueSeReescribe(' \
  '/* corrige la URL */
export function claveQueSeReescribe('
control "$CLIENTE" "un comentario mas en la pantalla no rompe nada" \
  '  useEffect(() => {
    const aEscribir = claveQueSeReescribe(tabRaw, tab, visibles);' \
  '  /* corrige la direccion vieja */
  useEffect(() => {
    const aEscribir = claveQueSeReescribe(tabRaw, tab, visibles);'

echo
echo "========================================================================"
echo " Mutaciones cazadas: $CAZADAS · escapadas: $ESCAPADAS"
echo " Controles en verde: $CONTROLES_OK · en rojo: $CONTROLES_MAL"
echo "========================================================================"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

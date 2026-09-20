#!/bin/bash
# Verificación por MUTACIÓN de «justificar a varios desde el Reporte»
# (19-sep-2026). No escribe nada en ninguna base.
set -u
cd "$(dirname "$0")/.." || exit 1

MODULO="src/lib/asistencia/justificar-a-varios.ts"
FORM="src/app/asistencia/JustificarForm.tsx"
MODAL="src/app/asistencia/JustificarVariosModal.tsx"
PANTALLA="src/app/asistencia/ReporteTab.tsx"
CANDADOS="src/__tests__/components/asistencia-justificar-a-varios.test.tsx"

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0
respaldo() { cp "$1" "$1.bak-mutacion"; }
restaurar() { for f in "$MODULO" "$FORM" "$MODAL" "$PANTALLA"; do [ -f "$f.bak-mutacion" ] && mv "$f.bak-mutacion" "$f"; done; }
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
mutar "$MODULO" "los motivos de varios son la UNIÓN y no la intersección" \
  '    comunes = comunes.filter((m) => suyos.has(m));' \
  '    comunes = [...new Set([...comunes, ...suyos])];'
mutar "$MODULO" "se ofrecen todos aunque haya alguien de Multifashion" \
  '  let comunes = [...motivosParaElegir(empresas[0])];' \
  '  let comunes = [...motivosParaElegir(null)]; if (empresas.length) return comunes;'
mutar "$MODULO" "el lote a medias se anuncia como exito" \
  '  const nombres = fallos.map((f) => f.etiqueta).join(" · ");' \
  '  const nombres = ""; if (ok > 0) return { texto: `Listo, ${ok} justificados`, tipo: "success" as const };'
mutar "$MODULO" "no se nombra a quien quedo afuera" \
  '    texto: `Se guardaron ${ok} de ${ok + fallos.length}. Faltó: ${nombres}.`,' \
  '    texto: `Se guardaron ${ok} de ${ok + fallos.length}.`,'
mutar "$MODULO" "el singular se usa tambien para el plural" \
  '  return n === 1 ? "1 colaborador seleccionado" : `${n} colaboradores seleccionados`;' \
  '  return `${n} colaborador seleccionado`;'

echo "-- la pantalla ----------------------------------------------------------"
mutar "$PANTALLA" "no hay casilla para seleccionar" \
  '          <input
            type="checkbox"
            checked={seleccionada}' \
  '          <input
            type="hidden"
            checked={seleccionada}'
mutar "$PANTALLA" "la barra sale siempre, con la seleccion vacia" \
  '      {hayAQuienJustificar(seleccionados.length) && (' \
  '      {true && ('
mutar "$PANTALLA" "la barra no sale nunca" \
  '      {hayAQuienJustificar(seleccionados.length) && (' \
  '      {false && ('
mutar "$PANTALLA" "«Quitar la selección» no suelta nada" \
  '          <button type="button" onClick={() => setSeleccion(new Set())}' \
  '          <button type="button" onClick={() => undefined}'
mutar "$PANTALLA" "la seleccion NO se deriva de lo que se ve" \
  '    () => (visibles ?? [])
      .filter((p) => seleccion.has(p.codigo))' \
  '    () => (personas ?? [])
      .filter((p) => seleccion.has(p.codigo))'
mutar "$PANTALLA" "la empresa no viaja: se ofrecen motivos que el servidor rechaza" \
  '        empresa: (p as PersonaReporte & { empresa?: string | null }).empresa ?? null,' \
  '        empresa: null,'
mutar "$PANTALLA" "se justifica el PERÍODO ENTERO por defecto" \
  '          desdeInicial={desde}
          hastaInicial={desde}' \
  '          desdeInicial={desde}
          hastaInicial={hasta}'

echo "-- el formulario --------------------------------------------------------"
mutar "$FORM" "solo se justifica al primero de la lista" \
  '      for (const codigo of aQuienes) {' \
  '      for (const codigo of aQuienes.slice(0, 1)) {'
mutar "$FORM" "el fallo de uno se traga en silencio" \
  '          fallos.push({
            etiqueta: etiquetas?.[codigo] ?? codigo,' \
  '          void e; if (false) fallos.push({
            etiqueta: etiquetas?.[codigo] ?? codigo,'
mutar "$FORM" "con varios se ofrecen los motivos de UNO solo" \
  '  const motivos = varios ? motivosParaVarios(empresas ?? []) : motivosParaElegir(empresa);' \
  '  const motivos = motivosParaElegir(empresa);'
mutar "$FORM" "el cuerpo cambia de forma" \
  '            body: JSON.stringify({ codigo, desde, hasta, motivo, nota, ...horas }),' \
  '            body: JSON.stringify({ codigos: [codigo], desde, hasta, motivo, nota, ...horas }),'
mutar "$MODAL" "la ventana no dice a quienes" \
  '          <ul className="flex flex-wrap gap-1.5">' \
  '          <ul className="hidden flex-wrap gap-1.5" hidden>'

echo "-- CONTROLES ------------------------------------------------------------"
control "$MODULO" "cambiar el texto del boton no cambia la conducta" \
  'export const JUSTIFICAR_A_VARIOS = "Justificar a varios";' \
  '/* el rotulo */
export const JUSTIFICAR_A_VARIOS = "Justificar a varios";'
control "$PANTALLA" "un comentario mas no rompe nada" \
  '  const alternarSeleccion = useCallback(' \
  '  /* marca y desmarca */
  const alternarSeleccion = useCallback('

echo
echo "========================================================================"
echo " Mutaciones cazadas: $CAZADAS · escapadas: $ESCAPADAS"
echo " Controles en verde: $CONTROLES_OK · en rojo: $CONTROLES_MAL"
echo "========================================================================"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

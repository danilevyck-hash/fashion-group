#!/bin/bash
# Verificación por MUTACIÓN de los candados de «editar el día completo en la
# fila» (19-sep-2026). Se rompe el código a propósito y se comprueba que el
# candado lo caza. Al final, dos CONTROLES: mutaciones que NO deben romper nada.
#
#   bash scripts/_mutar-candados-editar-el-dia.sh
#
# No escribe nada en ninguna base. Restaura los archivos al terminar.
set -u
cd "$(dirname "$0")/.." || exit 1

MODULO="src/lib/asistencia/editar-el-dia.ts"
RUTA="src/app/api/asistencia/correcciones/dia/route.ts"
PANTALLA="src/app/asistencia/ReporteTab.tsx"
CANDADOS="src/__tests__/lib/asistencia-editar-el-dia.test.ts src/__tests__/components/asistencia-editar-el-dia.test.tsx"

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0

respaldo() { cp "$1" "$1.bak-mutacion"; }
restaurar() { for f in "$MODULO" "$RUTA" "$PANTALLA"; do [ -f "$f.bak-mutacion" ] && mv "$f.bak-mutacion" "$f"; done; }
trap restaurar EXIT

# $1 = archivo · $2 = descripción · $3 = viejo · $4 = nuevo
mutar() {
  local f="$1" desc="$2" viejo="$3" nuevo="$4"
  respaldo "$f"
  python3 - "$f" "$viejo" "$nuevo" <<'PY'
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
if viejo not in s:
    print("NO-APLICA"); sys.exit(3)
open(f, "w").write(s.replace(viejo, nuevo, 1))
PY
  if [ $? -eq 3 ]; then
    echo "  ⚠️  NO SE PUDO APLICAR: $desc"
    restaurar; return
  fi
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  ❌ ESCAPADA: $desc"
    ESCAPADAS=$((ESCAPADAS+1))
  else
    echo "  ✅ cazada:   $desc"
    CAZADAS=$((CAZADAS+1))
  fi
  restaurar
}

control() {
  local f="$1" desc="$2" viejo="$3" nuevo="$4"
  respaldo "$f"
  python3 - "$f" "$viejo" "$nuevo" <<'PY'
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
if viejo not in s:
    print("NO-APLICA"); sys.exit(3)
open(f, "w").write(s.replace(viejo, nuevo, 1))
PY
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  ✅ control en verde: $desc"
    CONTROLES_OK=$((CONTROLES_OK+1))
  else
    echo "  ❌ control ROJO (el candado mira de más): $desc"
    CONTROLES_MAL=$((CONTROLES_MAL+1))
  fi
  restaurar
}

echo "── A · nada se aplica solo ─────────────────────────────────────────────"
mutar "$MODULO" "la hora igual SÍ produce un cambio" \
  'if (normalizarHora(casilla.hora) === hora) continue;' \
  'if (false) continue;'
mutar "$MODULO" "una casilla vacía que sigue vacía agrega una marca" \
  '    if (crudo === "") {
      if (!casilla) continue;' \
  '    if (crudo === "") {
      if (!casilla) { cambios.push({ clave, tipo: "agregar", marcacionId: null, reemplaza: null, hora: "00:00:00" }); continue; }'
mutar "$MODULO" "vaciar una casilla BORRA la marca" \
  '      // Vaciar una casilla que tenía hora NO borra nada: quitar es otra cosa y
      // se pide explícitamente. Se deja como estaba.
      continue;' \
  '      cambios.push({ clave, tipo: "quitar", marcacionId: casilla.marcacionId, reemplaza: casilla.correccionId, hora: null });
      continue;'
mutar "$MODULO" "una hora ilegible se descarta en silencio" \
  '    if (!hora) {
      invalidas.push(clave);
      continue;
    }' \
  '    if (!hora) {
      continue;
    }'
mutar "$MODULO" "se puede quitar una marca que el reloj no registró" \
  'if (!casilla?.marcacionId) continue;' \
  'if (false) continue;'

echo "── B · reemplazar es anular + escribir ─────────────────────────────────"
mutar "$MODULO" "la corrección vieja no se anula (se pisa)" \
  '      reemplaza: casilla.correccionId,
      hora,' \
  '      reemplaza: null,
      hora,'
mutar "$MODULO" "quitar una ya corregida no anula la anterior" \
  '        tipo: "quitar",
        marcacionId: casilla.marcacionId,
        reemplaza: casilla.correccionId,' \
  '        tipo: "quitar",
        marcacionId: casilla.marcacionId,
        reemplaza: null,'
mutar "$MODULO" "la casilla no sabe cuál es su corrección viva" \
  'const c = d.correcciones.find((x) => !x.quitada && x.hora === hora) ?? null;' \
  'const c = null;'
mutar "$MODULO" "una marca QUITADA vuelve a aparecer como casilla editable" \
  'const c = d.correcciones.find((x) => !x.quitada && x.hora === hora) ?? null;' \
  'const c = d.correcciones.find((x) => x.hora === hora) ?? null;'
mutar "$RUTA" "el servidor escribe ANTES de anular" \
  '      if (c.reemplaza) {
        const a = await anularCorreccion(c.reemplaza, quien);' \
  '      if (false && c.reemplaza) {
        const a = await anularCorreccion(String(c.reemplaza), quien);'

echo "── C · el porqué sigue siendo obligatorio ──────────────────────────────"
mutar "$MODULO" "se puede guardar sin motivo" \
  '  if (!(typeof motivo === "string" && motivo.trim().length > 0)) return "Falta: el porqué";' \
  '  if (false) return "Falta: el porqué";'
mutar "$MODULO" "un plan sin cambios se deja guardar" \
  '  if (plan.cambios.length === 0) return "Todavía no cambiaste nada";' \
  '  if (false) return "Todavía no cambiaste nada";'
mutar "$MODULO" "una hora inválida NO frena el guardado" \
  '  if (plan.invalidas.length > 0) {' \
  '  if (false) {'
mutar "$RUTA" "el servidor acepta un motivo vacío" \
  '    if (!motivoValido(body?.motivo)) {' \
  '    if (false) {'

echo "── D · el servidor valida todo antes de escribir nada ──────────────────"
mutar "$RUTA" "una hora mala no tumba el pedido entero" \
  '      if (tipo !== "quitar" && !hora) {' \
  '      if (false) {'
mutar "$RUTA" "se puede quitar una marcación que no existe" \
  '      if (tipo === "quitar" && !marcacionId) {' \
  '      if (false) {'
mutar "$RUTA" "la misma marcación dos veces pasa" \
  '      if (vistas.has(huella)) {' \
  '      if (false) {'
mutar "$RUTA" "el día y la persona salen del NAVEGADOR, no de la marcación" \
  '        codigo = m.empleadoCodigo;
        fecha = diaPanama(m.ocurrioEn);' \
  '        void m;'
mutar "$RUTA" "quitar viaja SIN quita: true" \
  '        ...(c.tipo === "quitar" ? { quita: true } : {}),' \
  '        ...(false ? { quita: true } : {}),'
mutar "$RUTA" "cada corrección lleva un motivo distinto" \
  '        motivo,
        creadaPor: quien,' \
  '        motivo: `${motivo} ${c.clave}`,
        creadaPor: quien,'
mutar "$RUTA" "un cuerpo sin cambios se acepta" \
  '    if (crudos.length === 0) {' \
  '    if (false) {'

echo "── E · la pantalla ─────────────────────────────────────────────────────"
mutar "$PANTALLA" "tocar una hora vuelve a abrir la ventana" \
  'onClick={() => (seEdita ? abrirEditor() : abrir(idx))}' \
  'onClick={() => abrir(idx)}'
mutar "$PANTALLA" "el hueco deja de ser tocable" \
  '      if (!seEdita) return <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">—</td>;' \
  '      return <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">—</td>;'
mutar "$PANTALLA" "«Deshacer» se va de la línea de la corrección" \
  '            {puedeCorregir && (
              <button type="button" onClick={() => void deshacerCorreccion(c.id)}' \
  '            {false && (
              <button type="button" onClick={() => void deshacerCorreccion(c.id)}'
mutar "$PANTALLA" "los motivos frecuentes no llegan a la fila" \
  '                  motivosFrecuentes={motivosFrecuentes}
                  onGuardadoElDia={() => void cargar()}' \
  '                  motivosFrecuentes={[]}
                  onGuardadoElDia={() => void cargar()}'
mutar "$PANTALLA" "se edita aunque falte la migración de correcciones" \
  'const seEdita = EDITAR_EL_DIA && puedeCorregir && !d.fueraDeVigencia;' \
  'const seEdita = EDITAR_EL_DIA && !d.fueraDeVigencia;'

echo "── CONTROLES (no deben romper nada) ────────────────────────────────────"
control "$MODULO" "un comentario más no cambia nada" \
  'export function planDelDia(' \
  '/* comentario inofensivo */
export function planDelDia('
control "$RUTA" "subir el tope de cambios por día no cambia la conducta" \
  'const MAX_CAMBIOS = 24;' \
  'const MAX_CAMBIOS = 32;'

echo
echo "═══════════════════════════════════════════════════════════════════════"
echo " Mutaciones cazadas: $CAZADAS · escapadas: $ESCAPADAS"
echo " Controles en verde: $CONTROLES_OK · en rojo: $CONTROLES_MAL"
echo "═══════════════════════════════════════════════════════════════════════"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿SIRVE EL CANDADO? — verificación por MUTACIÓN del reparto de un sueldo.
#
# Rompe el producto de una forma REAL por vez y exige que los tests se pongan
# ROJOS. Un candado que no se puede romper no está verificando nada.
#
#   bash scripts/_mutar-candados-reparto.sh
#
# ── 🩸 TRES COSAS QUE ESTE REPO YA PAGÓ Y ACÁ NO SE REPITEN ──────────────────
#
# 1. LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`. Hay archivos NUEVOS en
#    la rama y git ABORTA el comando entero sin restaurar nada: las mutaciones
#    se apilarían y ninguna se probaría por separado.
# 2. EL REEMPLAZO ES LITERAL (python), no `perl -0pi -e 's|A|B|'`. Con el
#    delimitador `|`, un `||` del código real se des-escapa a una alternación
#    con rama vacía, matchea la cadena vacía en el byte 0 y SE COME EL ARCHIVO;
#    después vitest no colecta nada, «0 fallos» se lee como «SOBREVIVIÓ» y el
#    informe acusa al candado de un agujero que no existe.
# 3. SE DENUNCIA EL PATRÓN QUE NO MUTA. Si el texto viejo no aparece, el archivo
#    queda SANO, los tests pasan y eso NO es un sobreviviente: es un patrón
#    muerto. Y si vitest no colectó ningún test, tampoco se le cree al cero.
#
# El script trae una mutación de CONTROL que a propósito no matchea: si no sale
# ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con
# el comentario adentro.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/asistencia-reparto.test.ts
  src/__tests__/api/asistencia-reparto-route.test.ts
  src/__tests__/lib/asistencia-planilla.test.ts
  src/__tests__/lib/asistencia-seguros.test.ts
  src/__tests__/lib/asistencia-servicio-profesional.test.ts
  src/__tests__/lib/asistencia-sueldo-fijo.test.ts
  src/__tests__/lib/asistencia-aprobaciones.test.ts
)

ARCHIVOS=(
  src/lib/asistencia/planilla.ts
  src/lib/asistencia/reparto.ts
  src/lib/asistencia/aprobaciones.ts
  src/app/api/asistencia/planilla/route.ts
)

TMP="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$TMP/$(dirname "$f")"
  cp "$f" "$TMP/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$f" "$f"; done; }
trap 'restaurar; rm -rf "$TMP"' EXIT INT TERM PIPE

CAZADAS=0; SOBREVIVIERON=0; NOOP=0

probar() {
  local salida
  salida="$(npx vitest run "${TESTS[@]}" 2>&1)"
  # 🩸 Si la corrida no colectó tests, «0 fallos» NO es «sobrevivió».
  if ! grep -qE "Test Files.*(passed|failed)" <<<"$salida"; then
    echo "MUERTA"
    return
  fi
  if grep -qE "Tests .*[0-9]+ failed" <<<"$salida"; then echo "ROJO"; else echo "VERDE"; fi
}

mutar() {
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4"
  restaurar
  local antes despues
  antes="$(md5 -q "$archivo" 2>/dev/null || md5sum "$archivo" | cut -d' ' -f1)"
  python3 - "$archivo" "$viejo" "$nuevo" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta, encoding="utf8").read()
if viejo in s:
    open(ruta, "w", encoding="utf8").write(s.replace(viejo, nuevo, 1))
PY
  despues="$(md5 -q "$archivo" 2>/dev/null || md5sum "$archivo" | cut -d' ' -f1)"
  if [ "$antes" = "$despues" ]; then
    echo "  ⛔ PATRÓN MUERTO — $nombre (el archivo no cambió; la mutación NO se aplicó)"
    NOOP=$((NOOP + 1))
    return
  fi
  local r; r="$(probar)"
  case "$r" in
    ROJO)   echo "  ✅ cazada — $nombre"; CAZADAS=$((CAZADAS + 1)) ;;
    MUERTA) echo "  ⛔ LA CORRIDA MURIÓ — $nombre (no se le cree al cero)"; NOOP=$((NOOP + 1)) ;;
    *)      echo "  🔴 SOBREVIVIÓ — $nombre"; SOBREVIVIERON=$((SOBREVIVIERON + 1)) ;;
  esac
}

echo "── El motor ──"

mutar "la rata sale del monto de la PARTE, no del sueldo completo" \
  src/lib/asistencia/planilla.ts \
  'const rataHora = centavos(salarioMensual / divisor);' \
  'const rataHora = centavos(baseMensualParaRata(salarioMensual, salarioDeLaParte) / divisor);
function baseMensualParaRata(total: number, parte: number | null): number {
  return typeof parte === "number" && parte > 0 ? parte : total;
}'

mutar "el quincenal ignora la parte: cada empresa paga el sueldo entero" \
  src/lib/asistencia/planilla.ts \
  '  const salarioQuincenal = centavos((baseMensual / 2) * factor);' \
  '  const salarioQuincenal = centavos((salarioMensual / 2) * factor);'

mutar "las horas NO se reparten: las dos líneas cobran todas las extras" \
  src/lib/asistencia/planilla.ts \
  'const horasEfectivas: HorasPersona = parte ? repartirHoras(horasMedidas, parte) : horasMedidas;' \
  'const horasEfectivas: HorasPersona = horasMedidas;'

mutar "las horas extra van a la parte del RELOJ, no a la marcada" \
  src/lib/asistencia/planilla.ts \
  '  if (parte.llevaHorasExtra) for (const k of COLUMNAS_EXTRA) out[k] = h[k] || 0;' \
  '  if (parte.llevaElReloj) for (const k of COLUMNAS_EXTRA) out[k] = h[k] || 0;'

mutar "el resto del reloj se copia a TODAS las partes (ausencia doble)" \
  src/lib/asistencia/planilla.ts \
  '  if (parte.llevaElReloj) for (const k of COLUMNAS_RELOJ) out[k] = h[k] || 0;' \
  '  for (const k of COLUMNAS_RELOJ) out[k] = h[k] || 0;'

mutar "los montos escritos a mano se descuentan en las DOS líneas" \
  src/lib/asistencia/planilla.ts \
  '    parte && !parte.llevaElReloj ? MANUALES_CERO : manuales;' \
  '    manuales;'

mutar "la parte puede ENCENDER los seguros que la ficha apagó" \
  src/lib/asistencia/planilla.ts \
  '  const conSegurosLinea = ficha.pagaSeguros !== false && (parte ? parte.pagaSeguros : true);' \
  '  const conSegurosLinea = parte ? parte.pagaSeguros : ficha.pagaSeguros !== false;'

mutar "la base propia de seguros se aplica en las DOS líneas" \
  src/lib/asistencia/planilla.ts \
  '        parte && !parte.llevaElReloj ? null : (ficha.baseSeguros ?? null),' \
  '        ficha.baseSeguros ?? null,'

mutar "la línea conserva la empresa de la FICHA, no la de su parte" \
  src/lib/asistencia/planilla.ts \
  '    empresa: parte ? parte.empresa : (ficha.empresa ?? null),' \
  '    empresa: ficha.empresa ?? null,'

mutar "el motor ignora el reparto: siempre UNA línea" \
  src/lib/asistencia/planilla.ts \
  '    const partes = partesUsables(ficha);' \
  '    const partes: readonly ParteReparto[] = [];'

mutar "las dos líneas salen en TODOS los cuadros (Julio en Boston)" \
  src/lib/asistencia/planilla.ts \
  '        : partes.filter((pt) => !empresa || pt.empresa === empresa);' \
  '        : [...partes];'

mutar "el guard estructural no exige que las partes SUMEN el salario" \
  src/lib/asistencia/planilla.ts \
  '  if (suma !== centavos(salario)) return [];' \
  '  if (false) return [];'

mutar "el guard deja pasar dos partes con las horas extra marcadas" \
  src/lib/asistencia/planilla.ts \
  '  if (partes.filter((p) => p.llevaHorasExtra).length !== 1) return [];' \
  '  if (partes.filter((p) => p.llevaHorasExtra).length < 1) return [];'

mutar 'el quincenal de referencia muestra el sueldo COMPLETO en una parte de 200' \
  src/lib/asistencia/planilla.ts \
  '  const salario = parte ? parte.salarioMensual : ficha.salarioMensual;' \
  '  const salario = ficha.salarioMensual;'

echo "── El validador ──"

mutar "la suma de las partes deja de compararse contra la ficha" \
  src/lib/asistencia/reparto.ts \
  '  if (suma !== centavos(total)) {' \
  '  if (false) {'

mutar "ninguna parte con horas extra deja de ser un error" \
  src/lib/asistencia/reparto.ts \
  '  if (conExtras !== 1) {' \
  '  if (conExtras > 1) {'

mutar "un reparto de UNA sola empresa se acepta" \
  src/lib/asistencia/reparto.ts \
  '  if (crudas.length < 2) {' \
  '  if (crudas.length < 1) {'

mutar "la misma empresa dos veces se acepta" \
  src/lib/asistencia/reparto.ts \
  '    if (vistas.has(empresa)) {' \
  '    if (false) {'

mutar "una empresa que no es del reloj se acepta" \
  src/lib/asistencia/reparto.ts \
  '    if (!(EMPRESAS_ASISTENCIA as readonly string[]).includes(empresa)) {' \
  '    if (false) {'

mutar "un monto en cero se acepta" \
  src/lib/asistencia/reparto.ts \
  '    if (monto === null || monto <= 0) {' \
  '    if (monto === null) {'

mutar "el reloj lo lleva la ÚLTIMA parte, no la primera" \
  src/lib/asistencia/reparto.ts \
  '      llevaElReloj: partes.length === 0,' \
  '      llevaElReloj: true,'

mutar "el monto que llega como TEXTO se pierde" \
  src/lib/asistencia/reparto.ts \
  '  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));' \
  '  const n = typeof v === "number" ? v : NaN;'

mutar 'partesDe devuelve las partes aunque el guard las rechace' \
  src/lib/asistencia/reparto.ts \
  '  return r.ok ? r.valor : [];' \
  '  return r.ok ? r.valor : (filas ?? []).map((f) => ({ empresa: String(f.empresa ?? ""), salarioMensual: Number(f.salario_mensual ?? 0), pagaSeguros: f.paga_seguros !== false, llevaHorasExtra: f.paga_horas_extra === true, llevaElReloj: false }));'

mutar "lo que el guard rechaza se calla" \
  src/lib/asistencia/reparto.ts \
  '  if (rechazados.length === 0) return null;' \
  '  return null;
  if (rechazados.length === 0) return null;'

echo "── La ruta y las aprobaciones ──"

mutar "la ruta no le pasa el reparto al motor" \
  src/app/api/asistencia/planilla/route.ts \
  '        reparto: partesDe(salario, filasReparto),' \
  '        reparto: [],'

mutar "la ruta no dice lo que el guard rechazó" \
  src/app/api/asistencia/planilla/route.ts \
  '        avisoRepartoRechazado: textoRepartoRechazado(repartosRechazados),' \
  '        avisoRepartoRechazado: null,'

mutar "la ruta calla que falta la migración" \
  src/app/api/asistencia/planilla/route.ts \
  '        faltaMigracionReparto: repRes.faltaTabla ? avisoMigracionReparto() : null,' \
  '        faltaMigracionReparto: null,'

mutar "Aprobaciones se queda con la ÚLTIMA línea, no con la de las extras" \
  src/lib/asistencia/aprobaciones.ts \
  '    if (previa && previa.parte?.llevaHorasExtra === true) continue;' \
  '    if (false) continue;'

echo "── CONTROL (tiene que salir ⛔: si sale ✅ o 🔴, el denunciador está roto) ──"
mutar "control — un texto que NO existe en el archivo" \
  src/lib/asistencia/reparto.ts \
  'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO_12345' \
  'otro'

restaurar
echo
echo "🔎 ${CAZADAS} cazadas · ${SOBREVIVIERON} sobrevivieron · ${NOOP} sin aplicar (incluye 1 de control)"
[ "$SOBREVIVIERON" -eq 0 ] && [ "$NOOP" -eq 1 ] || exit 1

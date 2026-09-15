#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de MARCACIÓN (14-sep-2026, la prueba de Daniel en su iPhone)
# CAZAN de verdad?
#
# Lo que cubren:
#   1  🔴 12 HORAS, y SOLO en la pantalla de marcar (el reporte sigue en 24 h)
#   2  🔴 DESHACER: dos minutos, solo la última, solo lo que salió del teléfono
#   3  🔴 deshacer NO borra: quita con una corrección ENCIMA
#   4  🔴 el reloj corrido se DICE, aunque haya habido señal
#   5  🩸 la pantalla se entera cuando la cola sube la marca
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 SE RESTAURA POR COPIA, JAMÁS CON `git checkout`: un script que restaure con
# git borra el trabajo sin commitear si se cuelga en el medio.
#
#   bash scripts/_mutar-candados-marcacion-14-sep.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/marcacion-doce-horas.test.ts \
src/__tests__/lib/marcacion-reloj-corrido.test.ts \
src/__tests__/lib/marcacion-deshacer.test.ts \
src/__tests__/lib/marcacion-deshacer-pantalla.test.tsx \
src/__tests__/lib/marcacion-pantalla.test.tsx \
src/__tests__/lib/asistencia-correcciones.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/marcacion/marcacion.ts"
  "src/lib/marcacion/deshacer.ts"
  "src/lib/marcacion/estado-server.ts"
  "src/lib/marcacion/en-el-reporte.ts"
  "src/lib/marcacion/reporte-server.ts"
  "src/lib/asistencia/correcciones.ts"
  "src/app/marcacion/MarcacionClient.tsx"
  "src/app/api/marcacion/deshacer/route.ts"
  "src/app/asistencia/ReporteTab.tsx"
  "supabase/migrations/20261128120000_marcacion_deshacer.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() {
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"; sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() {
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"; controles_mal=$((controles_mal + 1))
  fi
}

aplicar() {
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { aplicar "$1" "$2" "$3"; [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }; probar "$4"; }
control() { aplicar "$1" "$2" "$3"; [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }; probar_control "$4"; }

echo "── mutando ──────────────────────────────────────────────────────────────"

# ── 1. LAS 12 HORAS ──────────────────────────────────────────────────────────

mutar "src/lib/marcacion/marcacion.ts" \
  'const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${h24 < 12 ? "a. m." : "p. m."}`;' \
  'const h12 = h24 % 12;
  return `${h12}:${m[2]} ${h24 < 12 ? "a. m." : "p. m."}`;' \
  "1 · el mediodía y la medianoche se vuelven «0»"

mutar "src/lib/marcacion/marcacion.ts" \
  'return `${h12}:${m[2]} ${h24 < 12 ? "a. m." : "p. m."}`;' \
  'return `${String(h12).padStart(2, "0")}:${m[2]} ${h24 < 12 ? "a.m." : "p.m."}`;' \
  "2 · la hora deja de tener la forma de la casa (cero adelante y sin espacio)"

mutar "src/app/marcacion/MarcacionClient.tsx" \
  '{horaAmPm(isoQueCuenta)}' \
  '{horaCorta(isoQueCuenta)}' \
  "3 · la hora grande de la pantalla de marcar vuelve a 24 h"

mutar "src/app/marcacion/MarcacionClient.tsx" \
  'enDoceHoras(d.entrada)} – {enDoceHoras(d.salida)' \
  'd.entrada} – {d.salida' \
  "4 · «Mis marcas» vuelve a 24 h"

mutar "src/lib/marcacion/en-el-reporte.ts" \
  'hora: horaCorta(f.ocurrio_en),' \
  'hora: horaAmPm(f.ocurrio_en),' \
  "5 · la hora con la que la marca PAREA con el reporte se pasa a 12 h"

mutar "src/lib/marcacion/marcacion.ts" \
  'export function horaAmPm(iso: string): string {
  return enDoceHoras(horaCorta(iso));
}' \
  'export function horaAmPm(iso: string): string {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}' \
  "6 · horaAmPm se vuelve a hacer su propia copia de la regla"

# ── 2. DESHACER: LOS DOS MINUTOS ─────────────────────────────────────────────

mutar "src/lib/marcacion/deshacer.ts" \
  'export const VENTANA_DESHACER_MS = 2 * 60_000;' \
  'export const VENTANA_DESHACER_MS = 10 * 60_000;' \
  "7 · la ventana pasa de dos minutos a diez"

mutar "src/lib/marcacion/deshacer.ts" \
  '  const pasado = ahora - t;
  if (pasado < 0) return VENTANA_DESHACER_MS;
  return Math.max(0, VENTANA_DESHACER_MS - pasado);' \
  '  return Math.max(0, VENTANA_DESHACER_MS - (ahora - t));' \
  "8 · un reloj adelantado estira la ventana (deja de capearse)"

mutar "src/lib/marcacion/deshacer.ts" \
  '  if (ultima.dispositivo !== DISPOSITIVO_TELEFONO) return null;' \
  '  if (false) return null;' \
  "9 · el teléfono empieza a deshacer lo que marcó el reloj de la tienda"

mutar "src/lib/marcacion/deshacer.ts" \
  '  if (!dentroDeLaVentana(ultima.ocurrioEn, ahoraIso)) return null;' \
  '  if (false) return null;' \
  "10 · se puede deshacer una marca de hace horas"

mutar "src/lib/marcacion/deshacer.ts" \
  '  const ultima = ordenadas[ordenadas.length - 1];' \
  '  const ultima = ordenadas[0];' \
  "11 · se deshace la PRIMERA marca del día en vez de la última"

mutar "src/lib/marcacion/deshacer.ts" \
  'return { id: ultima.id, ocurrioEn: ultima.ocurrioEn, tipo: antes === 0 ? "entrada" : "salida" };' \
  'return { id: ultima.id, ocurrioEn: ultima.ocurrioEn, tipo: "entrada" };' \
  "12 · el botón dice «entrada» cuando lo que se deshace es la salida"

mutar "src/lib/marcacion/deshacer.ts" \
  '  return vivos.reduce((a, b) => (b.restanMs > a.restanMs ? b : a));' \
  '  return vivos[0];' \
  "13 · entre lo guardado y lo pendiente se elige cualquiera, no la última"

# ── 3. DESHACER NO BORRA ─────────────────────────────────────────────────────

mutar "src/lib/asistencia/correcciones.ts" \
  '    if (!c.quita) salida.push({ ...m, ocurrio_en: instantePanama(dia, c.hora) });' \
  '    salida.push({ ...m, ocurrio_en: instantePanama(dia, c.hora) });' \
  "14 · la marcación quitada vuelve a contar para la planilla"

mutar "src/lib/asistencia/correcciones.ts" \
  '      quitada: Boolean(c.quita),' \
  '      quitada: false,' \
  "15 · el día deja de decir que se quitó una marcación"

mutar "src/lib/asistencia/correcciones.ts" \
  '    else if (!c.quita) agregadas.push(c);' \
  '    else agregadas.push(c);' \
  "16 · una correccion con quita y sin marcacion agrega una hora inventada"

mutar "src/app/api/marcacion/deshacer/route.ts" \
  '      hora: null,
      quita: true,' \
  '      hora: "00:00:00",
      quita: false,' \
  "17 · deshacer escribe una corrección de HORA en vez de quitar la marca"

mutar "src/app/api/marcacion/deshacer/route.ts" \
  '    if (!deshacer) return NextResponse.json({ error: YA_NO }, { status: 409 });' \
  '    if (!deshacer) return NextResponse.json({ ok: true }, { status: 200 });' \
  "18 · el servidor deja de frenar lo que ya no se puede deshacer"

mutar "src/app/api/marcacion/deshacer/route.ts" \
  'creadaPor: (auth.userName ?? "").trim() || nombre || `colaborador ${codigo}`,' \
  'creadaPor: "sistema",' \
  "19 · se pierde la firma de quién deshizo"

mutar "src/app/api/marcacion/deshacer/route.ts" \
  '      marcacionId: deshacer.id,' \
  '      marcacionId: null,' \
  "20 · la corrección deja de apuntar a la marcación que quita"

mutar "supabase/migrations/20261128120000_marcacion_deshacer.sql" \
  '        (quita IS TRUE  AND hora IS NULL     AND marcacion_id IS NOT NULL)' \
  '        (quita IS TRUE)' \
  "21 · la base deja de exigir que quitar apunte a una marcación de verdad"

mutar "supabase/migrations/20261128120000_marcacion_deshacer.sql" \
  'ADD COLUMN IF NOT EXISTS quita boolean NOT NULL DEFAULT false;' \
  'ADD COLUMN IF NOT EXISTS quita boolean;' \
  "22 · la columna nace sin default (las filas viejas quedan en NULL)"

# ── 4. EL RELOJ CORRIDO ──────────────────────────────────────────────────────

mutar "src/lib/marcacion/marcacion.ts" \
  'export const DESFASE_QUE_SE_DICE_MS = 5 * 60_000;' \
  'export const DESFASE_QUE_SE_DICE_MS = 60 * 60_000;' \
  "23 · hay que estar corrido una HORA para que se diga"

mutar "src/lib/marcacion/marcacion.ts" \
  '  if (ms === null || Math.abs(ms) <= DESFASE_QUE_SE_DICE_MS) return null;' \
  '  if (ms === null || ms <= DESFASE_QUE_SE_DICE_MS) return null;' \
  "24 · un reloj ATRASADO deja de avisar"

mutar "src/lib/marcacion/en-el-reporte.ts" \
  '      relojCorrido: textoRelojCorrido(f.ocurrio_en, f.hora_telefono),' \
  '      relojCorrido: f.sin_senal ? textoRelojCorrido(f.ocurrio_en, f.hora_telefono) : null,' \
  "25 · vuelve el hueco: solo se dice cuando la marca fue SIN SEÑAL"

mutar "src/lib/marcacion/marcacion.ts" \
  'return `el reloj de su teléfono está corrido ${cuantoCorrido(ms)}`;' \
  'return `llegó con el reloj de su teléfono corrido ${cuantoCorrido(ms)}`;' \
  "26 · el texto de la contadora vuelve a usar la palabra «llegó»"

mutar "src/lib/marcacion/reporte-server.ts" \
  'created_at, hora_telefono, foto_path' \
  'created_at, foto_path' \
  "27 · la hora del teléfono deja de leerse y no hay con qué comparar"

mutar "src/lib/marcacion/marcacion.ts" \
  '  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`;' \
  '  return `${Math.round(min / 60)} h`;' \
  "28 · «1 h 59 min» se redondea a «2 h» (un número que no se midió)"

# ── 5. LA PANTALLA SE ENTERA ─────────────────────────────────────────────────

mutar "src/app/marcacion/MarcacionClient.tsx" \
  '          if (res.ok) {
            const j = await res.json().catch(() => null);
            if (esEstado(j)) fresco = j;
          }' \
  '          if (res.ok) { /* no se mira lo que contestó */ }' \
  "29 · la cola vuelve a ignorar el estado que contesta el servidor"

mutar "src/app/marcacion/MarcacionClient.tsx" \
  '      if (fresco) aplicarEstado(fresco);
      else await cargar();' \
  '      if (fresco) { /* nada */ } else await cargar();' \
  "30 · el estado nuevo llega y no se aplica"

mutar "src/app/marcacion/MarcacionClient.tsx" \
  '    aviso && (aviso.tono !== "guardada" || pendientes.length > 0) ? aviso : null;' \
  '    aviso;' \
  "31 · el aviso «se va a enviar sola» sobrevive a la cola (los dos avisos juntos)"

mutar "src/app/marcacion/MarcacionClient.tsx" \
  '        {errorCarga && estado && (
          <p className="mb-3 text-sm text-gray-500">{errorCarga}</p>
        )}' \
  '        {false && errorCarga && estado && <p />}' \
  "32 · una lectura caída deja el dato viejo en pantalla sin decir nada"

mutar "src/app/marcacion/MarcacionClient.tsx" \
  '            {sePuedeDeshacer && (' \
  '            {false && sePuedeDeshacer && (' \
  "33 · se va el botón «Deshacer» de la pantalla"

mutar "src/lib/marcacion/estado-server.ts" \
  '    deshacer: quitadas.sePuedeQuitar
      ? queSePuedeDeshacer(marcas as MarcaGuardada[], new Date().toISOString())
      : null,' \
  '    deshacer: queSePuedeDeshacer(marcas as MarcaGuardada[], new Date().toISOString()),' \
  "34 · se ofrece Deshacer aunque no se pueda quitar nada (migracion sin correr)"

mutar "src/lib/marcacion/estado-server.ts" \
  '    .filter((m) => !quitadas.ids.has(m.id));' \
  '    .filter(() => true);' \
  "35 · una marca deshecha vuelve a contar en el telefono"

# ── CONTROLES: cambios inocuos que NO se deben cazar ─────────────────────────

echo "── controles ────────────────────────────────────────────────────────────"

control "src/lib/marcacion/deshacer.ts" \
  '/** «1:47» — lo que le queda al botón. Siempre m:ss. */' \
  '/** «1:47» — lo que le queda al botón (comentario cambiado a propósito). */' \
  "C1 · cambiar un comentario no rompe nada"

control "src/app/asistencia/ReporteTab.tsx" \
  'className="ml-1.5 text-amber-800"' \
  'className="ml-1.5 text-amber-700"' \
  "C2 · el tono del ámbar del reloj corrido es cosmético"

control "src/lib/marcacion/marcacion.ts" \
  'export const QUIEN_CORRIGE = "Roxana";' \
  'export const QUIEN_CORRIGE = "Roxana";
/** Un export de más, sin lectores. */
export const _NO_SE_USA = 1;' \
  "C3 · agregar algo sin lectores no rompe ningún candado"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "MUTACIONES: $((cazadas + sobrevivientes))  ·  cazadas: $cazadas  ·  sobrevivientes: $sobrevivientes"
echo "CONTROLES:  sanos: $controles_ok  ·  cazados de más: $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ] && echo "✅ TODO EN ORDEN" || echo "🔴 REVISAR"

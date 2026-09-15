#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del RELOJ DEL TELÉFONO (14-sep-2026) CAZAN de verdad?
#
# 🔴 Lo que protegen es PLATA: lo que se marca en esa pantalla son las horas
# que la planilla paga.
#
# Lo que cubren:
#    1  🔴 la hora que cuenta es la del SERVIDOR, no la del teléfono
#    2  🔴 sin señal, la que cuenta es la de la foto
#    3  🔴 un teléfono adelantado de más no entra
#    4  🔴 una marca sin señal de hace más de una semana no entra
#    5  🔴 el botón cambia de texto y SE APAGA con las dos del día
#    6  🔴 las notitas que pidió Daniel
#    7  🔴 la marca lleva su ORIGEN (`telefono`)
#    8  🔴 las DOS horas se guardan (la del teléfono queda de testigo)
#    9  🔴 la selfie es obligatoria
#   10  🔴 la ubicación es obligatoria
#   11  🔴 por quién se marca lo dice la SESIÓN, no el cuerpo del pedido
#   12  🔴 un reenvío no guarda la marca dos veces
#   13  🔴 la palabra «llegó» no aparece en lo que lee la contadora
#   14  🔴 el bucket de las selfies es PRIVADO
#   15  🔴 la selfie se firma al leer, nunca una dirección pública
#   16  🔴 la carpeta de la selfie es el CÓDIGO, nunca el nombre
#   17  🔴 la retención de 90 días
#   18  🔴 una sola puerta de escritura a `asistencia_marcaciones`
#   19  🔴 la puerta deduplica por `(dispositivo, evento_id)`
#   20  🔴 nada del módulo edita ni borra marcaciones
#   21  🔴 la pantalla dibuja la hora del servidor, no `new Date()`
#   22  🔴 sin ubicación la pantalla no envía
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 SE RESTAURA POR COPIA, NUNCA CON `git checkout`: los archivos de este
# encargo todavía no están commiteados, y un `git checkout` los borraría.
#
#   bash scripts/_mutar-candados-marcacion.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/marcacion-reloj-del-telefono.test.ts \
src/__tests__/lib/marcacion-pantalla.test.tsx \
src/__tests__/lib/asistencia-una-sola-entrada.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/marcacion/marcacion.ts"
  "src/lib/marcacion/en-el-reporte.ts"
  "src/lib/marcacion/estado-server.ts"
  "src/lib/marcacion/selfie-servidor.ts"
  "src/lib/marcacion/retencion.ts"
  "src/lib/asistencia/guardar-marcaciones.ts"
  "src/app/api/marcacion/route.ts"
  "src/app/api/asistencia/marcacion-foto/route.ts"
  "src/app/marcacion/MarcacionClient.tsx"
  "src/app/api/cron/asistencia-vigia/route.ts"
  "supabase/migrations/20261127120000_marcacion_telefono.sql"
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

# 1 · la hora del teléfono le gana a la del servidor (el defecto que Daniel quiso cerrar)
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (!x.sinSenal) return { ok: true, ocurrioEn: new Date(ahora).toISOString() };' \
  '  if (!x.sinSenal && !x.horaTelefono) return { ok: true, ocurrioEn: new Date(ahora).toISOString() };
  if (!x.sinSenal) return { ok: true, ocurrioEn: new Date(Date.parse(x.horaTelefono!)).toISOString() };' \
  "1 · con señal, la marca toma la hora del TELÉFONO"

# 2 · sin señal se usa la hora del servidor (se pierde la hora real de la marca)
mutar "src/lib/marcacion/marcacion.ts" \
  '  return { ok: true, ocurrioEn: new Date(tel).toISOString() };' \
  '  return { ok: true, ocurrioEn: new Date(ahora).toISOString() };' \
  "2 · sin señal, la marca toma la hora de cuando llegó al servidor"

# 3 · un reloj adelantado entra igual
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (tel > ahora + TOLERANCIA_ADELANTO_MS) {' \
  '  if (false) {' \
  "3 · un teléfono adelantado de más entra igual"

# 4 · una marca de hace un mes entra igual
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (tel < ahora - MAX_ATRASO_SIN_SENAL_DIAS * 86_400_000) {' \
  '  if (false) {' \
  "4 · una marca sin señal de hace un mes entra igual"

# 5 · el botón nunca se apaga
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (marcasHoy < MARCAS_POR_DIA) return { tipo: "salida", texto: "Marcar salida", apagado: false };
  return { tipo: null, texto: "Ya marcaste hoy", apagado: true };' \
  '  return { tipo: "salida", texto: "Marcar salida", apagado: false };' \
  "5 · el botón nunca se apaga: se puede marcar todo el día"

# 6 · las notitas se dan vuelta
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (marcasHoy < MARCAS_POR_DIA) return "Acuérdate de marcar la salida.";' \
  '  if (marcasHoy < MARCAS_POR_DIA) return "Mañana acuérdate de marcar la entrada.";' \
  "6 · la notita de la entrada dice lo de la salida"

# 7 · la marca pierde su origen
mutar "src/app/api/marcacion/route.ts" \
  '        dispositivo: DISPOSITIVO_TELEFONO,' \
  '        dispositivo: "reloj cboston",' \
  "7 · la marca del teléfono se hace pasar por el reloj de la tienda"

# 8 · la hora del teléfono deja de guardarse (se pierde el testigo)
mutar "src/app/api/marcacion/route.ts" \
  '        hora_telefono: horaTelefono,' \
  '        hora_telefono: null,' \
  "8 · la hora del teléfono no se guarda"

# 9 · la selfie deja de ser obligatoria
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (!p.selfie || !(p.selfie.bytes > 0)) {' \
  '  if (false) {' \
  "9 · se puede marcar sin selfie"

# 10 · la ubicación deja de ser obligatoria
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (p.lat === null || p.lng === null || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {' \
  '  if (false) {' \
  "10 · se puede marcar sin ubicación"

# 11 · el teléfono dice por quién marca
mutar "src/app/api/marcacion/route.ts" \
  '  const codigo = await leerEmpleadoCodigo(auth.userId);
  if (!codigo) return NextResponse.json({ error: SIN_CODIGO }, { status: 409 });' \
  '  const codigo = String(form0.get("codigo") ?? "") || (await leerEmpleadoCodigo(auth.userId));
  if (!codigo) return NextResponse.json({ error: SIN_CODIGO }, { status: 409 });' \
  "11 · el código de colaborador sale del cuerpo del pedido"

# 12 · un reenvío se guarda dos veces
mutar "src/app/api/marcacion/route.ts" \
  '    if (await marcaYaGuardada(DISPOSITIVO_TELEFONO, eventoId)) {' \
  '    if (false) {' \
  "12 · un reenvío sin señal vuelve a guardar la marca"

# 13 · vuelve la palabra «llegó» a lo que lee la contadora
mutar "src/lib/marcacion/marcacion.ts" \
  '  if (m.sinSenal) return `Marcada sin señal · el teléfono la envió ${horaCorta(m.creadoEn)}`;' \
  '  if (m.sinSenal) return `Marcada sin señal. Llegó a las ${horaCorta(m.creadoEn)}`;' \
  "13 · la línea de la contadora vuelve a decir «Llegó a las…»"

# 14 · el bucket de las selfies se hace público
mutar "supabase/migrations/20261127120000_marcacion_telefono.sql" \
  "values ('asistencia-marcaciones', 'asistencia-marcaciones', false)" \
  "values ('asistencia-marcaciones', 'asistencia-marcaciones', true)" \
  "14 · el bucket de las selfies pasa a público"

# 15 · la selfie se sirve por una dirección eterna
mutar "src/lib/marcacion/selfie-servidor.ts" \
  '      .createSignedUrl(p, SEGUNDOS_URL_FIRMADA);' \
  '      .getPublicUrl(p);' \
  "15 · la selfie se sirve por una URL pública que no vence"

# 16 · la carpeta de la selfie deja de ser el código
mutar "src/lib/marcacion/marcacion.ts" \
  '  return `${cod}/${dia}/${id}.jpg`;' \
  '  return `${dia}/${id}.jpg`;' \
  "16 · la selfie deja de guardarse en la carpeta de su código"

# 17 · la retención se estira a un año
mutar "src/lib/marcacion/marcacion.ts" \
  'export const RETENCION_SELFIE_DIAS = 90;' \
  'export const RETENCION_SELFIE_DIAS = 365;' \
  "17 · las selfies se guardan un año en vez de 90 días"

# 18 · nace una segunda puerta de escritura
mutar "src/app/api/marcacion/route.ts" \
  '    const { error } = await guardarMarcaciones([' \
  '    const { error } = await supabaseServer.from("asistencia_marcaciones").insert([' \
  "18 · la ruta del teléfono escribe por su cuenta"

# 19 · la puerta única deja de deduplicar
mutar "src/lib/asistencia/guardar-marcaciones.ts" \
  '.upsert(filas as T[], { onConflict: "dispositivo,evento_id", ignoreDuplicates: true });' \
  '.insert(filas as T[]);' \
  "19 · la puerta única deja de ignorar los repetidos"

# 20 · el módulo edita una marcación
mutar "src/lib/marcacion/retencion.ts" \
  '    const { data: codigos, error } = await supabaseServer.storage' \
  '    await supabaseServer.from("asistencia_marcaciones").update({ foto_path: null }).eq("id", hoy);
    const { data: codigos, error } = await supabaseServer.storage' \
  "20 · la retención EDITA la fila de la marcación"

# 21 · la pantalla dibuja el reloj del teléfono
mutar "src/app/marcacion/MarcacionClient.tsx" \
  '      setDesfase(Date.parse(j.ahora) - Date.now());' \
  '      setDesfase(0);' \
  "21 · la pantalla dibuja la hora del teléfono como si fuera la del servidor"

# 22 · la pantalla envía sin ubicación
mutar "src/app/marcacion/MarcacionClient.tsx" \
  '    const coords = ubicacion ?? (await pedirUbicacion());
    if (!coords) return;' \
  '    const coords = (ubicacion ?? (await pedirUbicacion())) ?? { latitude: 0, longitude: 0, accuracy: 1 } as GeolocationCoordinates;' \
  "22 · la pantalla envía la marca con una ubicación inventada"

echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

# CONTROL A · un comentario cambia
control "src/lib/marcacion/marcacion.ts" \
  '/** Dos marcas al día: entrada y salida. Daniel: *«dos, no cuatro»*. */' \
  '/** Dos marcas al día. */' \
  "A · se acorta un comentario"

# CONTROL B · se renombra una variable interna de la retención
control "src/lib/marcacion/retencion.ts" \
  'const MAX_POR_CORRIDA = 500;' \
  'const MAX_POR_CORRIDA = 400;' \
  "B · el tope por corrida de la retención baja de 500 a 400"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "Mutaciones cazadas: $cazadas · sobrevivientes: $sobrevivientes"
echo "Controles sanos:    $controles_ok · controles cazados: $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ] && echo "✅ TODO BIEN" || echo "🔴 REVISAR"

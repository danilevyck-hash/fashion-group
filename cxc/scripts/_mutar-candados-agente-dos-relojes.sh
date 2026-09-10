#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de LOS DOS RELOJES (10-sep-2026) CAZAN de verdad?
#
# Lo que cubren:
#   1  el `.env` de la oficina, tal como está escrito hoy, SIGUE valiendo
#   2  el segundo reloj se agrega con DOS renglones (hereda usuario y clave)
#   3  🔴 NO SE MEZCLAN: mismo nombre o misma dirección se rechazan
#   4  🔴 UNO CAÍDO NO FRENA AL OTRO (el túnel WireGuard se cae; la oficina no)
#   5  el castigo de la contraseña es de CADA reloj, no de los dos
#   6  la PANTALLA dibuja los DOS, cada uno con su botón y su nombre
#   7  con UN solo reloj la pantalla no cambia ni un píxel
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada — y un
# `checkout` en un trap que dispara a mitad de camino borra lo que no está
# commiteado.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-agente-dos-relojes.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/scripts/agente-dos-relojes.test.ts \
src/__tests__/scripts/agente-reloj.test.ts \
src/__tests__/components/asistencia-dos-relojes-pantalla.test.tsx \
src/__tests__/components/asistencia-poda-textos.test.tsx \
src/__tests__/lib/asistencia-agente.test.ts \
src/__tests__/lib/asistencia-agente-url.test.ts \
src/__tests__/lib/asistencia-una-sola-entrada.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "scripts/agente-reloj/config.mjs"
  "src/app/api/asistencia/ingest/route.ts"
  "src/app/api/cron/asistencia-vigia/route.ts"
  "scripts/agente-reloj/ronda.mjs"
  "scripts/agente-reloj/agente.mjs"
  "scripts/agente-reloj/.env.ejemplo"
  "src/lib/asistencia/agente.ts"
  "src/app/asistencia/EstadoReloj.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
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

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ═══ 1 · La config vieja SIGUE valiendo ══════════════════════════════════════

mutar "scripts/agente-reloj/config.mjs" \
  'export const DISPOSITIVO_POR_DEFECTO = "reloj cboston";' \
  'export const DISPOSITIVO_POR_DEFECTO = "reloj 1";' \
  "🩸 el reloj 1 cambia de nombre por defecto (se re-insertarían TODAS las marcaciones)"

mutar "scripts/agente-reloj/config.mjs" \
  '    dispositivo: (env.DISPOSITIVO || DISPOSITIVO_POR_DEFECTO).trim(),' \
  '    dispositivo: (env.RELOJ_1_DISPOSITIVO || DISPOSITIVO_POR_DEFECTO).trim(),' \
  "el nombre escrito en el .env de la oficina deja de leerse (hay que ir a la PC)"

mutar "scripts/agente-reloj/config.mjs" \
  '    usuario: env.RELOJ_USUARIO,
    clave: env.RELOJ_CLAVE,
  };
  const relojes = [uno];' \
  '    usuario: env.RELOJ_1_USUARIO,
    clave: env.RELOJ_1_CLAVE,
  };
  const relojes = [uno];' \
  "la contraseña del reloj 1 se busca con otro nombre de variable"

mutar "scripts/agente-reloj/config.mjs" \
  '  const relojes = [uno];' \
  '  const relojes = [];' \
  "el reloj de siempre desaparece de la lista"

# ═══ 2 · El segundo reloj: dos renglones ═════════════════════════════════════

mutar "scripts/agente-reloj/config.mjs" \
  '      usuario: env[`RELOJ_${i}_USUARIO`] || uno.usuario,' \
  '      usuario: env[`RELOJ_${i}_USUARIO`],' \
  "el reloj 2 deja de heredar el usuario (hay que escribirlo dos veces)"

mutar "scripts/agente-reloj/config.mjs" \
  '      clave: env[`RELOJ_${i}_CLAVE`] || uno.clave,' \
  '      clave: uno.clave,' \
  "la contraseña propia del reloj 2 se ignora (si le cambian una, queda muerto)"

mutar "scripts/agente-reloj/config.mjs" \
  '    const host = String(env[`RELOJ_${i}_HOST`] ?? "").trim();
    if (!host) continue;' \
  '    const host = String(env[`RELOJ_${i}_HOST`] ?? "").trim();
    if (host) continue;' \
  "el reloj 2 no se lee nunca: la lista se queda en uno"

mutar "scripts/agente-reloj/config.mjs" \
  'const conEsquema = (h) => (String(h).startsWith("http") ? String(h) : `http://${h}`);' \
  'const conEsquema = (h) => String(h);' \
  "la dirección va sin http:// y no se puede llamar"

mutar "scripts/agente-reloj/config.mjs" \
  '  for (let i = 2; i <= MAX_RELOJES; i++) {' \
  '  for (let i = 2; i <= 1; i++) {' \
  "el tope de relojes se escribe a mano y no queda ninguno más que el 1"

mutar "scripts/agente-reloj/.env.ejemplo" \
  "RELOJ_2_HOST=192.168.20.98" \
  "RELOJ_2_HOST=192.168.20.99" \
  "el ejemplo enseña una dirección que no es la medida"

mutar "scripts/agente-reloj/.env.ejemplo" \
  "RELOJ_2_DISPOSITIVO=reloj acs" \
  "RELOJ_2_DISPOSITIVO=" \
  "el ejemplo deja el reloj 2 sin nombre (config rota copiada tal cual)"

# ═══ 3 · NO SE MEZCLAN ═══════════════════════════════════════════════════════

mutar "scripts/agente-reloj/config.mjs" \
  '    if (!dispositivo) {
      throw new Error(' \
  '    if (false) {
      throw new Error(' \
  "🩸 un reloj sin nombre pasa (sus marcaciones caen bajo el nombre del otro)"

mutar "scripts/agente-reloj/config.mjs" \
  '    const dispositivo = String(env[`RELOJ_${i}_DISPOSITIVO`] ?? "").trim();' \
  '    const dispositivo = String(env[`RELOJ_${i}_DISPOSITIVO`] ?? uno.dispositivo).trim();' \
  "🔴 el reloj 2 cae en el nombre del reloj 1: las marcaciones se TAPAN"

mutar "scripts/agente-reloj/config.mjs" \
  '    if (nombres.has(r.dispositivo)) {' \
  '    if (false) {' \
  "🔴 dos relojes con el MISMO nombre se aceptan"

mutar "scripts/agente-reloj/config.mjs" \
  '    if (direcciones.has(r.host)) {' \
  '    if (false) {' \
  "🩸 el mismo aparato dos veces se acepta (horas al doble)"

mutar "scripts/agente-reloj/config.mjs" \
  '    nombres.add(r.dispositivo);' \
  '    nombres.add(r.host);' \
  "el control de repetidos mira la cosa equivocada"

mutar "scripts/agente-reloj/ronda.mjs" \
  '        config: configDeReloj(config, reloj),' \
  '        config: configDeReloj(config, config.relojes[0]),' \
  "🔴 los dos relojes se leen con los datos del PRIMERO (todo bajo un nombre)"

mutar "scripts/agente-reloj/config.mjs" \
  '    dispositivo: reloj.dispositivo,
    host: reloj.host,' \
  '    dispositivo: reloj.dispositivo,
    host: config.relojes[0].host,' \
  "la vuelta del reloj 2 apunta a la dirección del reloj 1"

# ═══ 4 · Uno caído no frena al otro ══════════════════════════════════════════

mutar "scripts/agente-reloj/ronda.mjs" \
  '    } catch (e) {
      // `darVuelta` promete no lanzar.' \
  '    } finally {
      // `darVuelta` promete no lanzar.' \
  "🔴 un error en un reloj corta la ronda y el otro se queda sin traer nada"

mutar "scripts/agente-reloj/ronda.mjs" \
  '  for (const reloj of config.relojes) {
    const pre = etiqueta' \
  '  for (const reloj of config.relojes.slice(0, 1)) {
    const pre = etiqueta' \
  "la ronda solo recorre el primer reloj"

mutar "scripts/agente-reloj/ronda.mjs" \
  '      resultados.push({ dispositivo: reloj.dispositivo, ...r });' \
  '      resultados.push({ ...r });' \
  "el resultado no dice de qué reloj es (el log no distingue cuál falló)"

# ═══ 5 · El castigo es de CADA reloj ═════════════════════════════════════════

mutar "scripts/agente-reloj/ronda.mjs" \
  '  for (const r of relojes) m.set(r.dispositivo, nuevoEstadoReloj());' \
  '  const uno = nuevoEstadoReloj();
  for (const r of relojes) m.set(r.dispositivo, uno);' \
  "🔴 los dos relojes comparten el castigo: el que rechaza la clave deja mudo al sano"

mutar "scripts/agente-reloj/ronda.mjs" \
  '        estado: estados.get(reloj.dispositivo) ?? null,' \
  '        estado: null,' \
  "sin memoria de espera: se vuelve a golpear el reloj cada 3 minutos"

# ═══ 6 · La pantalla dibuja los DOS ══════════════════════════════════════════

mutar "src/app/asistencia/EstadoReloj.tsx" \
  '      {relojes.map((reloj) => (' \
  '      {relojes.slice(0, 1).map((reloj) => (' \
  "🩸 la pantalla vuelve a dibujar SOLO el primer reloj (el otro, invisible)"

mutar "src/app/asistencia/EstadoReloj.tsx" \
  '          onPedir={() => void pedir(reloj.dispositivo)}' \
  '          onPedir={() => void pedir(relojes[0].dispositivo)}' \
  "🔴 «Traer ahora» le pide siempre al primer reloj, sea cual sea la tarjeta"

mutar "src/app/asistencia/EstadoReloj.tsx" \
  '          conNombre={relojes.length > 1}' \
  '          conNombre={false}' \
  "con dos relojes no se dice cuál es cuál"

mutar "src/app/asistencia/EstadoReloj.tsx" \
  '  const esperando = pidiendo || reloj.pedidoPendiente;' \
  '  const esperando = true;' \
  "un pedido en un reloj apaga el botón del otro"

mutar "src/lib/asistencia/agente.ts" \
  '  "reloj acs": "Reloj de Multifashion",' \
  '  "reloj acs": "Reloj de American Classics",' \
  "la pantalla dice «American Classics» y no Multifashion"

mutar "src/lib/asistencia/agente.ts" \
  '  return NOMBRE_DE_RELOJ[clave] ?? clave;' \
  '  return NOMBRE_DE_RELOJ[clave] ?? "Reloj";' \
  "un reloj desconocido se muestra con un nombre inventado"

mutar "src/lib/asistencia/agente.ts" \
  '  "reloj cboston": "Reloj de Boston",' \
  '  "reloj cboston": "Reloj de Bostón",' \
  "el nombre del reloj de Boston cambia y la pantalla deja de decirlo igual"

mutar "src/app/api/cron/asistencia-vigia/route.ts" \
  "    await enviarSistema(textoSilencio(nombreRelojEnPantalla(f.dispositivo), minutos));" \
  "    await enviarSistema(textoSilencio(f.dispositivo, minutos));" \
  "el Telegram del silencio dice la llave («reloj acs») y no el nombre legible"

mutar "src/app/api/asistencia/ingest/route.ts" \
  "      await enviarSistema(textoCaido(nombreRelojEnPantalla(dispositivo), motivo));" \
  "      await enviarSistema(textoCaido(dispositivo, motivo));" \
  "el aviso de reloj caído no dice CUÁL de los dos se cayó, en cristiano"

# ═══ Voseo ═══════════════════════════════════════════════════════════════════

# ⚠️ El barrido de voseo de la casa mira `src/**`, no `scripts/**`: la mutación
# va sobre el texto de la PANTALLA, que es el que ese candado cubre.
mutar "src/app/asistencia/EstadoReloj.tsx" \
  "              Pedido enviado. La PC de la oficina lo recoge en un par de minutos." \
  "              Pedido enviado. Esperá: la PC de la oficina lo recoge en un par de minutos." \
  "voseo en el cartel del reloj (nunca se dice «esperá»)"

# ═══ CONTROLES: cambios inocuos que NO deben ser cazados ═════════════════════
echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "scripts/agente-reloj/config.mjs" \
  'export const MAX_RELOJES = 9;' \
  'export const MAX_RELOJES = 8;' \
  "CONTROL: el tope baja a 8 (nadie tiene ocho relojes; la regla se deriva de la constante)"

control "src/app/asistencia/EstadoReloj.tsx" \
  '    <div className="space-y-2">' \
  '    <div className="space-y-3">' \
  "CONTROL: cambia la separación entre las tarjetas"

control "scripts/agente-reloj/ronda.mjs" \
  '  return relojes.length > 1 ? `[${dispositivo}] ` : "";' \
  '  return relojes.length >= 2 ? `[${dispositivo}] ` : "";' \
  "CONTROL: se reescribe la condición de la etiqueta con la misma lógica"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

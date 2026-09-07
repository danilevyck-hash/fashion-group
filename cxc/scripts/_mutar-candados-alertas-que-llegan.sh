#!/usr/bin/env bash
# VERIFICACIÓN POR MUTACIÓN de los cuatro arreglos al canal de alertas
# (7-sep-2026). Daniel: «Siempre que me llega un telegrama me dices que es falsa
# alarma. Quiero que me lleguen de veras.»
#
# Rompe el producto a propósito, una cosa por vez, y exige que los tests se
# pongan ROJOS. Un candado que sobrevive a su mutación no es un candado.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado.
#
#   bash scripts/_mutar-candados-alertas-que-llegan.sh

set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/alertas/crons-que-avisan.ts"
  "src/lib/alertas/crons-que-avisan-io.ts"
  "src/lib/alertas/silencio-de-datos.ts"
  "src/lib/alertas/silencio-de-datos-io.ts"
  "src/lib/switch-api/alert-policy.ts"
  "src/lib/switch-api/outage-resumen.ts"
  "src/lib/cron-telemetry.ts"
  "src/app/api/cron/switch-reconciliacion/route.ts"
  "src/app/api/cron/acs-fidelizacion/route.ts"
  "vercel.json"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/alertas-que-llegan.test.ts \
src/__tests__/lib/silencio-de-datos.test.ts \
src/__tests__/lib/alerta-cron-dos-fallos.test.ts"

CAZADAS=0
SOBREVIVIERON=0

probar() {
  local nombre="$1"
  local salida resumen fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  resumen="$(printf '%s' "$salida" | grep -E '^ *Tests +' | tail -1)"
  if [ -z "$resumen" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — no cuenta [$nombre]"
    SOBREVIVIERON=$((SOBREVIVIERON + 1)); restaurar; return
  fi
  fallos="$(printf '%s' "$resumen" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)"
  if [ -n "$fallos" ] && [ "$fallos" -gt 0 ]; then
    echo "  ✅ cazada — $fallos test(s) en rojo   [$nombre]"
    CAZADAS=$((CAZADAS + 1))
  else
    echo "  ❌ SOBREVIVIÓ                        [$nombre]"
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
  fi
  restaurar
}

# El CONTROL es al revés: se muta algo que NINGUNA regla protege y se exige que
# los tests sigan VERDES. Sin él, un `TESTS` mal escrito pondría todo en rojo y
# el script diría "N de N cazadas" sin haber probado nada.
control() {
  local nombre="$1"
  local salida resumen fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  resumen="$(printf '%s' "$salida" | grep -E '^ *Tests +' | tail -1)"
  fallos="$(printf '%s' "$resumen" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)"
  if [ -z "$resumen" ] || { [ -n "$fallos" ] && [ "$fallos" -gt 0 ]; }; then
    echo "  ❌ EL CONTROL SE PUSO ROJO — los candados miden de más [$nombre]"
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
  else
    echo "  ✅ control verde, como tiene que ser  [$nombre]"
    CAZADAS=$((CAZADAS + 1))
  fi
  restaurar
}

PURO="src/lib/alertas/crons-que-avisan.ts"
IO="src/lib/alertas/crons-que-avisan-io.ts"
POL="src/lib/switch-api/alert-policy.ts"
TEL="src/lib/cron-telemetry.ts"
SIL="src/lib/alertas/silencio-de-datos.ts"
SILIO="src/lib/alertas/silencio-de-datos-io.ts"
OUT="src/lib/switch-api/outage-resumen.ts"

echo
echo "═══ 1) LOS CRONS CUYA CAÍDA NO DEJA RASTRO ═══"

echo "M01 se cae cheques-alert de la lista"
perl -0pi -e 's/  "cheques-alert": "el aviso[^\n]*\n//' "$PURO"; probar "M01"

echo "M02 se cuela un sync de Switch en la lista"
perl -0pi -e 's/(export const CRONS_CUYO_TRABAJO_ES_UN_MENSAJE[^\{]*\{)/$1\n  "sync-recibos": "los pagos",/' "$PURO"; probar "M02"

echo "M03 se retira acs-fidelizacion (el que nadie más mira)"
perl -0pi -e 's/  "acs-fidelizacion":\n    "la actualización[^\n]*\n//' "$PURO"; probar "M03"

echo "M04 el anti-loop se pone en cero"
perl -0pi -e 's/export const DIAS_ENTRE_AVISOS_CRON = 7;/export const DIAS_ENTRE_AVISOS_CRON = 0;/' "$PURO"; probar "M04"

echo "M05 el vigía no dispara nunca"
perl -0pi -e 's/(\): CronCaido\[\] \{)/$1\n  return [];/' "$PURO"; probar "M05"

echo "M06 se ignora la recuperación en camino (alerta fantasma)"
perl -0pi -e 's/    if \(staleEsPendingRecovery\(cronName, ultimaIso, ahoraMs\)\) continue;\n//' "$PURO"; probar "M06"

echo "M07 se usa un 26 h fijo en vez del umbral por cron (el mensual alertaría)"
perl -0pi -e 's/if \(!cronIsStale\(cronName, ultimaIso, ahoraMs\)\) continue;/if (!(!ultimaIso || new Date(ultimaIso).getTime() < ahoraMs - 26 * 3_600_000)) continue;/' "$PURO"; probar "M07"

echo "M08 un cron SIN heartbeat deja de contar como caído"
perl -0pi -e 's/    const ultimaIso = porNombre.get\(cronName\) \?\? null;/    const ultimaIso = porNombre.get(cronName) ?? null;\n    if (!ultimaIso) continue;/' "$PURO"; probar "M08"

echo "M09 el mensaje nombra el cron en vez de decir qué deja de pasar"
perl -0pi -e 's/\$\{c\.que\}: lo último salió/\${c.cronName}: lo último salió/' "$PURO"; probar "M09"

echo "M10 se cae la nota de «una vez por semana»"
perl -0pi -e 's/  lineas.push\("Mientras siga así, este aviso se repite una vez por semana, no todos los días."\);\n//' "$PURO"; probar "M10"

echo "M11 la llave del dedup vuelve a escribirse ANTES del envío"
perl -0pi -e 's/    const enviado = await enviarSistema\(mensajeCronsSinCorrer\(\[c\]\)\);\n    if \(!enviado\) \{\n      console.error\(`\[crons-que-avisan\] Telegram no confirmó, no marco el dedup: \$\{c.cronName\}`\);\n      continue;\n    \}\n    await logCronError\(tipoDeCron\(c.cronName\), `\$\{c.cronName\}: \$\{c.horas \?\? "nunca"\}h`, null, \{\n      telegram: false,\n    \}\);/    await logCronError(tipoDeCron(c.cronName), `\${c.cronName}: \${c.horas ?? "nunca"}h`, null, {\n      telegram: false,\n    });\n    await enviarSistema(mensajeCronsSinCorrer([c]));/' "$IO"; probar "M11"

echo "M12 el anti-loop deja de consultarse antes de mandar"
perl -0pi -e 's/if \(await yaAvisadoPorCron\(c.cronName, ahoraMs\)\) \{/if (false) {/' "$IO"; probar "M12"

echo "M13 se manda por sendTelegramAlert, saltándose el canal"
perl -0pi -e 's/import \{ enviarSistema \} from "\@\/lib\/alertas\/canal";/import { sendTelegramAlert } from "\@\/lib\/telegram";\nconst enviarSistema = sendTelegramAlert;/' "$IO"; probar "M13"

echo "M14 el vigía se desconecta de la reconciliación"
perl -0pi -e 's/  const cronsSinAvisar = await checkCronsQueAvisan\(\);/  const cronsSinAvisar: string[] = [];/' "src/app/api/cron/switch-reconciliacion/route.ts"; probar "M14"

echo "M15 acs-fidelizacion empieza a mandar mensajes (el motivo escrito deja de ser cierto)"
perl -0pi -e 's/^const CRON_NAME = "acs-fidelizacion";/import { enviarSistema } from "\@\/lib\/alertas\/canal";\nvoid enviarSistema("hola");\nconst CRON_NAME = "acs-fidelizacion";/m' "src/app/api/cron/acs-fidelizacion/route.ts"; probar "M15"

echo
echo "═══ 2) LA REGLA 2 — UN AVISO POR AVERÍA ═══"

echo "M16 el tercer fallo se pide desde 4 corridas/día (pierde el aviso de recibos)"
perl -0pi -e 's/export const CORRIDAS_PARA_TRES_FALLOS = 5;/export const CORRIDAS_PARA_TRES_FALLOS = 4;/' "$POL"; probar "M16"

echo "M17 el umbral alto deja de ser 3"
perl -0pi -e 's/export const FALLOS_PARA_AVISAR_ALTA_FRECUENCIA = 3;/export const FALLOS_PARA_AVISAR_ALTA_FRECUENCIA = 2;/' "$POL"; probar "M17"

echo "M18 el anti-loop de la racha se pone en 24 h"
perl -0pi -e 's/export const HORAS_ENTRE_AVISOS_RACHA = 48;/export const HORAS_ENTRE_AVISOS_RACHA = 24;/' "$POL"; probar "M18"

echo "M19 el anti-loop se pone en 7 días (una semana de silencio)"
perl -0pi -e 's/export const HORAS_ENTRE_AVISOS_RACHA = 48;/export const HORAS_ENTRE_AVISOS_RACHA = 168;/' "$POL"; probar "M19"

echo "M20 la llave del anti-loop deja de llevar el arranque de la racha"
perl -0pi -e 's/return `\$\{TIPO_RACHA\}:\$\{empresaKey\}\|\$\{syncType\}\|\$\{sinceIso \?\? "sin-fecha"\}`;/return `\${TIPO_RACHA}:\${empresaKey}|\${syncType}`;/' "$POL"; probar "M20"

echo "M21 el umbral por par se ignora: vuelve el 2 fijo"
perl -0pi -e 's/    const umbral = fallosParaAvisar\(empresaKey, syncType\);/    const umbral = 2;/' "$POL"; probar "M21"

echo "M22 el anti-loop de la racha desaparece"
perl -0pi -e 's/    if \(await yaAvisadoPorRacha\(e.empresaKey, e.syncType, e.escalacion.sinceIso\)\) repetidos.push\(e\);\n    else aAvisar.push\(e\);/    aAvisar.push(e);/' "$POL"; probar "M22"

echo "M23 la llave de la racha se marca sin esperar la confirmación de Telegram"
perl -0pi -e 's/    if \(enviado\) \{/    if (true) {/' "$POL"; probar "M23"

echo "M24 «racha-corta» se disfraza de primer fallo"
perl -0pi -e 's/motivo: "racha-corta"/motivo: "primer-fallo"/' "$POL"; probar "M24"

echo "M25 el rastro deja de decir que se calló por el anti-loop"
perl -0pi -e 's/`fallo repetido SIN alerta \(anti-loop de \$\{HORAS_ENTRE_AVISOS_RACHA\} h, \$\{e.escalacion.streak \|\| "\?"\} corridas\)`/"fallo repetido"/' "$POL"; probar "M25"

echo "M26 «cuántas veces al día» se escribe a mano en vez de derivarse"
perl -0pi -e 's/(export function corridasPorDiaDelPar\(empresaKey: string, syncType: string\): number \{)/$1\n  return syncType === "recibos" ? 4 : 1;/' "$TEL"; probar "M26"

echo 'M27 el bloque all le cuenta a Boston un estadocuenta que no corre'
perl -0pi -e 's/    if \(entrada.cron === "switch-sync all" && syncType === "estadocuenta" && !conCxc.has\(empresaKey\)\)\n      continue;\n//' "$TEL"; probar "M27"

echo "M28 una entrada SEMANAL cuenta como diaria"
perl -0pi -e 's/    n \+= entrada.diaSemana === undefined \? 1 : 1 \/ 7;/    n += 1;/' "$TEL"; probar "M28"

echo "M29 un cron de sync declara «no escribo en el log» siendo mentira"
perl -0pi -e 's/  "sync-recibos": \["recibos"\],/  "sync-recibos": [],/' "$TEL"; probar "M29"

echo
echo "═══ 3) EL RESUMEN DE CAÍDA DE SWITCH ═══"

echo "M30 el resumen «sin impacto» vuelve a Telegram"
perl -0pi -e 's/    await logCronError\(OUTAGE_RESUMEN_TIPO, mensaje, null, \{ telegram: false \}\);/    await enviarSistema(mensaje);\n    await logCronError(OUTAGE_RESUMEN_TIPO, mensaje, null, { telegram: false });/' "$OUT"
perl -0pi -e 's/import \{ logCronError \} from "\@\/lib\/cron-telemetry";/import { logCronError } from "\@\/lib\/cron-telemetry";\nimport { enviarSistema } from "\@\/lib\/alertas\/canal";/' "$OUT"; probar "M30"

echo "M31 el resumen se manda por sendTelegramAlert"
perl -0pi -e 's/    await logCronError\(OUTAGE_RESUMEN_TIPO, mensaje, null, \{ telegram: false \}\);/    await sendTelegramAlert(mensaje);\n    await logCronError(OUTAGE_RESUMEN_TIPO, mensaje, null, { telegram: false });/' "$OUT"; probar "M31"

echo
echo "═══ 4) LO QUE NO ENTRA A LA ALERTA B ═══"

echo "M32 se agrega switch_recibos a la alerta B (7 de 8 empresas sonarían sanas)"
perl -0pi -e 's/(export const TABLAS_VIGILADAS: readonly TablaVigilada\[\] = \[)/$1\n  { tabla: "switch_recibos", columna: "synced_at", modulo: "Cobros", que: "los pagos", horas: HORAS_SIN_ESCRIBIR },/' "$SIL"; probar "M32"

echo "M33 se agrega switch_ingresos_mercancia (su universo puede estar vacío)"
perl -0pi -e 's/(export const TABLAS_VIGILADAS: readonly TablaVigilada\[\] = \[)/$1\n  { tabla: "switch_ingresos_mercancia", columna: "synced_at", modulo: "Compras", que: "las compras", horas: HORAS_SIN_ESCRIBIR },/' "$SIL"; probar "M33"

echo "M34 se cae una de las tres tablas que B sí vigila"
perl -0pi -e 's/    tabla: "egresos_varios",/    tabla: "egresos_varios_x",/' "$SIL"; probar "M34"

echo "M35 A y B vuelven a marcar el dedup ANTES del envío"
perl -0pi -e 's/    const enviado = await enviarSistema\(mensajeSilencio\(modulo, items\)\);\n    if \(!enviado\) \{\n      console.error\(`\[silencio-de-datos\] Telegram no confirmó, no marco el dedup: \$\{modulo\}`\);\n      continue;\n    \}\n//' "$SILIO"
perl -0pi -e 's/(      \{ telegram: false \},\n    \);\n)/$1    await enviarSistema(mensajeSilencio(modulo, items));\n/' "$SILIO"; probar "M35"

echo
echo "═══ CONTROLES (tienen que quedar VERDES) ═══"

echo "C1 se retoca la redacción de una frase que ningún candado fija"
perl -0pi -e 's/Qué hacer: avísame para revisarlo\./Qué hacer: avísame y lo reviso hoy mismo./' "$PURO"; control "C1"

echo "C2 se renombra una variable local del módulo puro"
perl -0pi -e 's/\bconst out: CronCaido\[\] = \[\];/const encontrados: CronCaido[] = [];/; s/\bout\.push\(\{\n      cronName,/encontrados.push({\n      cronName,/; s/  return out;\n\}\n\n\/\*\* "5 sep 2026/  return encontrados;\n}\n\n\/** "5 sep 2026/' "$PURO"; control "C2"

echo
echo "═══════════════════════════════════════════"
echo "  $CAZADAS de $((CAZADAS + SOBREVIVIERON)) — cazadas/controles verdes"
[ "$SOBREVIVIERON" -eq 0 ] && echo "  ✅ TODAS" || echo "  ❌ $SOBREVIVIERON sin cazar"

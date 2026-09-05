#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del RESPALDO COMPLETO y del DIRECTORIO DE BOSTON cazan de
# verdad? Se rompe el código a propósito, una cosa por vez, y se exige que los
# tests se pongan ROJOS. CONTROL (sin mutar) tiene que quedar verde.
#
# Las dos cosas que este PR arregló y que no se pueden volver a romper:
#   1. Nada que no se pueda volver a conseguir se queda sin copia — y una tabla
#      nueva sin clasificar pone el build rojo.
#   2. El directorio de clientes de Boston se refresca solo, escribe SOLO su
#      rincón, y una corrida a medias no marca a nadie como ausente.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-respaldo-boston.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/backup-nada-sin-copia.test.ts \
src/__tests__/lib/boston-clientes-no-tocan-el-grupo.test.ts \
src/__tests__/lib/clientes-master-solo-del-grupo.test.ts \
src/__tests__/lib/cron-registro.test.ts \
src/__tests__/lib/cron-calendario.test.ts \
src/__tests__/lib/sync-log-tipos-check.test.ts \
src/__tests__/lib/silencio-de-datos.test.ts \
src/__tests__/lib/multifashion-tickets-congelada.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/backup/tablas.ts"
  "src/app/api/cron/backup/route.ts"
  "src/lib/switch-api/clientes-directorio.ts"
  "src/lib/switch-api/sync-clientes-boston.ts"
  "src/lib/switch-api/sync-clientes-master.ts"
  "src/lib/switch-api/sync-log-tipos.ts"
  "src/lib/alertas/silencio-de-datos.ts"
  "src/lib/alertas/silencio-de-datos-io.ts"
  "src/lib/cron-telemetry.ts"
  "src/app/api/cron/sync-clientes-boston/route.ts"
  "supabase/migrations/20260923120000_sync_log_clientes.sql"
  "vercel.json"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

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

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
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
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── CONTROL (sin mutar) ──────────────────────────────────────────────────"
probar "CONTROL — tiene que quedar VERDE (una ✅ acá es un problema)"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. EL RESPALDO ───────────────────────────────────────────────────────"

# 1.1 🔴 Se saca del respaldo lo único irrecuperable de toda la base.
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "asistencia_marcaciones" },' "" \
  "backup: se van las marcaciones del reloj (append-only, irrecuperables)"

# 1.2 Se van los saldos de banco, que escribe contabilidad a mano.
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "bancos_saldos" },' "" \
  "backup: se van los saldos de banco"

# 1.3 Se va el catálogo de Reebok (el que la doc daba por respaldado y no estaba).
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "products" },' "" \
  "backup: se va el catálogo de Reebok"

# 1.4 Se va la configuración de comisiones (soft delete = historial).
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "comision_exclusion" },' "" \
  "backup: se van los clientes que no comisionan"

# 1.5 Se va una tabla congelada: su origen ya no existe.
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "mayor_lineas" },' "" \
  "backup: se va el mayor contable retirado"

# 1.6 🩸 Se respalda una tabla con PK compuesta SIN su ORDER_BY: la paginación
#     deja de ser determinista y el respaldo sale corto pareciendo completo.
mutar "src/app/api/cron/backup/route.ts" \
  '  asistencia_horas_extra_aprobadas: ["empleado_codigo", "fecha"],' "" \
  "backup: se pierde el ORDER_BY de una PK compuesta"

# 1.7 El ORDER_BY existe pero le falta una columna de la PK.
mutar "src/app/api/cron/backup/route.ts" \
  '  cuentas_contables: ["empresa_key", "cuenta"],' \
  '  cuentas_contables: ["empresa_key"],' \
  "backup: el ORDER_BY cubre media PK"

# 1.8 Se respalda una VISTA (al restaurar choca con la que recrea la migración).
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "clientes_master" },' \
  '  { table: "clientes_master" },
  { table: "clientes_agregado_12m_vw" },' \
  "backup: se cuela una vista"

# 1.9 Una tabla que escriben personas se reclasifica como re-derivable de Switch
#     para poder sacarla del respaldo sin que nadie chiste.
mutar "src/lib/backup/tablas.ts" \
  '  "asistencia_reglas",' "" \
  "clasificación: el singleton del cálculo de planilla deja de estar clasificado"

# 1.10 Una tabla nueva nace en una migración y nadie la clasifica.
mutar "supabase/migrations/20260923120000_sync_log_clientes.sql" \
  "NOTIFY pgrst, 'reload schema';" \
  "CREATE TABLE IF NOT EXISTS asistencia_bonos_navidad (id bigserial PRIMARY KEY);
NOTIFY pgrst, 'reload schema';" \
  "migración: nace una tabla nueva y nadie la clasifica"

# 1.11 Las marcaciones dejan de ir primeras dentro de su grupo.
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "asistencia_marcaciones" },
  { table: "asistencia_correcciones" },' \
  '  { table: "asistencia_correcciones" },
  { table: "asistencia_marcaciones" },' \
  "backup: lo irrecuperable deja de subirse primero"

echo "── 2. EL DIRECTORIO DE BOSTON ───────────────────────────────────────────"

# 2.1 🔴 El sync de Boston escribe en clientes_master. ES EL ERROR DE $2,55M.
mutar "src/lib/switch-api/clientes-directorio.ts" \
  '    .from("switch_clientes")
    .upsert(payload, { onConflict: "empresa_key,cliente_switch_id", ignoreDuplicates: false });' \
  '    .from("clientes_master")
    .upsert(payload, { onConflict: "empresa_key,cliente_switch_id", ignoreDuplicates: false });' \
  "boston: el directorio escribe en clientes_master"

# 2.2 El sync del grupo vuelve a excluir en vez de incluir (así entró Boston).
mutar "src/lib/switch-api/sync-clientes-master.ts" \
  '.in("empresa_key"' '.neq("empresa_key"' \
  "grupo: clientes_master vuelve a pedir por EXCLUSIÓN"

# 2.3 🔴 Una corrida a medias marca ausentes: los clientes que no llegaron
#     quedan apagados en silencio.
mutar "src/lib/switch-api/clientes-directorio.ts" \
  "  if (!lista.completa || presentIds.length === 0) {
    return { escritos, marcoAusentes: false };
  }" \
  "  if (presentIds.length === 0) {
    return { escritos, marcoAusentes: false };
  }" \
  "boston: una lista incompleta marca ausentes igual"

# 2.4 Se cae la guarda del piso: una lista que encogió a la mitad marca ausentes.
mutar "src/lib/switch-api/sync-clientes-boston.ts" \
  "    const encogio = conocidos > 0 && lista.clientes.length < piso;" \
  "    const encogio = false;" \
  "boston: la lista puede encoger a la mitad y marca igual"

# 2.5 Una respuesta VACÍA de Switch se trata como «se quedó sin clientes».
mutar "src/lib/switch-api/sync-clientes-boston.ts" \
  "    if (lista.clientes.length === 0) {" \
  "    if (false) {" \
  "boston: Switch contesta vacío y el sync sigue adelante"

# 2.6 El sync escribe la empresa equivocada.
mutar "src/lib/switch-api/sync-clientes-boston.ts" \
  'export const EMPRESA_CLIENTES_APARTE: EmpresaKey = "confecciones_boston";' \
  'export const EMPRESA_CLIENTES_APARTE: EmpresaKey = "vistana";' \
  "boston: el sync apunta a una empresa del grupo"

# 2.7 La paginación vuelve al corte que se llevó puesto el 60% de vistana.
mutar "src/lib/switch-api/clientes-directorio.ts" \
  "    if (totalPagina > 0 && clientes.length >= totalPagina) break;" \
  "    if (totalPagina > 0 && page * CLIENTES_PAGE >= totalPagina) break;" \
  "directorio: vuelve el corte por página × porPagina"

# 2.8 El upsert deja de acotar por empresa en la marca de ausentes.
mutar "src/lib/switch-api/clientes-directorio.ts" \
  '    .update({ activo: false, ausente_desde: runStamp })
    .eq("empresa_key", empresaKey)' \
  '    .update({ activo: false, ausente_desde: runStamp })' \
  "directorio: la marca de ausentes barre las 8 empresas"

echo "── 3. EL CRON Y SU VIGILANCIA ───────────────────────────────────────────"

# 3.1 La entrada sale de vercel.json (el cron deja de correr, en silencio).
mutar "vercel.json" \
  '    {
      "path": "/api/cron/sync-clientes-boston",
      "schedule": "10 7 * * 0"
    },
' "" \
  "cron: se borra la entrada de vercel.json"

# 3.2 El cron se mueve encima de otro que toca Boston (sesión única de Switch).
mutar "vercel.json" \
  '"schedule": "10 7 * * 0"' '"schedule": "35 6 * * 0"' \
  "cron: se mueve a 5 min del bloque all-0630 de Boston"

# 3.3 El cron sale del registro de código: nadie lo vigila.
mutar "src/lib/cron-telemetry.ts" \
  '  "sync-clientes-boston",
];' "];" \
  "cron: sale de SEED_TOLERANT_CRONS (nadie lo vigila)"

# 3.4 Sale del cronograma de sesión única.
mutar "src/lib/cron-telemetry.ts" \
  '  { cron: "sync-clientes-boston", hhmmUtc: "0710", diaSemana: 0, empresas: ["confecciones_boston"] },' \
  "" \
  "cron: sale del cronograma de sesión única"

# 3.5 El umbral semanal se olvida y queda el diario: sonaría todas las semanas.
mutar "src/lib/cron-telemetry.ts" \
  '  "sync-clientes-boston": 8 * 24,' "" \
  "cron: pierde su umbral semanal de staleness"

# 3.6 🔴 El sync_type nuevo se estrena SIN su DDL: las corridas son invisibles.
mutar "supabase/migrations/20260923120000_sync_log_clientes.sql" \
  "    'clientes',
" "" \
  "log: el sync_type nuevo se queda fuera del CHECK"

# 3.7 La vigilancia de la tabla de Boston se apaga.
mutar "src/lib/alertas/silencio-de-datos.ts" \
  '    tabla: "switch_clientes",' '    tabla: "switch_articulo_marca",' \
  "alerta B: deja de mirar el directorio de Boston"

# 3.8 La restricción por empresa se pierde: se vigilan las 8 con umbral semanal.
mutar "src/lib/alertas/silencio-de-datos.ts" \
  '    empresas: ["confecciones_boston"],' "" \
  "alerta B: el umbral semanal se aplica a las 8 empresas"

# 3.9 El IO deja de honrar la restricción por empresa.
mutar "src/lib/alertas/silencio-de-datos-io.ts" \
  "    for (const empresaKey of cfg.empresas ?? ALL_EMPRESA_KEYS) {" \
  "    for (const empresaKey of ALL_EMPRESA_KEYS) {" \
  "alerta B: el IO ignora la lista de empresas de la entrada"

# 3.10 El umbral semanal baja al diario: sonaría todos los días estando sana.
mutar "src/lib/alertas/silencio-de-datos.ts" \
  "export const HORAS_SIN_ESCRIBIR_SEMANAL = 165;" \
  "export const HORAS_SIN_ESCRIBIR_SEMANAL = 40;" \
  "alerta B: el umbral semanal baja al diario"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "CONTROL: $control_fallos fallos (tiene que ser 0)"
echo "CAZADAS: $cazadas   ·   SOBREVIVIERON: $sobrevivientes"

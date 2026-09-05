#!/usr/bin/env bash
# VERIFICACIÓN POR MUTACIÓN de los candados de RECORDATORIOS.
#
# Rompe el producto a propósito, una cosa por vez, y exige que los tests se
# pongan ROJOS. Un candado que sobrevive a su mutación no es un candado.
#
# 🩸 Reescrito el 5-sep-2026 con el rediseño del módulo. Las mutaciones viejas
# que apuntaban a las OCHO PESTAÑAS, al aviso ámbar de «falta el DDL» y al Excel
# se retiraron con lo que medían; lo que sigue vivo (el motor de fechas, el
# soft delete, los roles, la `key`) se conserva tal cual.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó en este
# repo (ver los scripts de guías, selector de cliente y Excel propio).
#
#   bash scripts/_mutar-candados-recordatorios.sh

set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/recordatorios/recordatorio.ts"
  "src/lib/recordatorios/cuando.ts"
  "src/lib/recordatorios/agenda.ts"
  "src/lib/recordatorios/server.ts"
  "src/lib/recordatorios/roles.ts"
  "src/lib/cheques-alert.ts"
  "src/lib/cheques-aviso-ventana.ts"
  "src/lib/cheques-vencidos-aviso.ts"
  "src/lib/cheques-retencion.ts"
  "src/lib/modules.ts"
  "src/app/api/recordatorios/route.ts"
  "src/app/api/recordatorios/[id]/route.ts"
  "src/app/recordatorios/RecordatoriosClient.tsx"
  "src/app/recordatorios/components/LineaNueva.tsx"
  "src/app/recordatorios/components/AgendaLista.tsx"
  "src/app/recordatorios/components/CalendarioMes.tsx"
  "src/app/recordatorios/components/RecordatorioFormModal.tsx"
  "supabase/migrations/20260925130000_recordatorios_rediseno.sql"
  "next.config.js"
  "vercel.json"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/recordatorios-rediseno.test.ts \
src/__tests__/lib/recordatorios-cuando-tocan.test.ts \
src/__tests__/lib/recordatorios-permiso-y-aviso.test.ts \
src/__tests__/lib/cheques-aviso-vencimiento.test.ts \
src/__tests__/components/recordatorios-pantalla.test.tsx \
src/__tests__/lib/cron-registro.test.ts"

CAZADAS=0
SOBREVIVIERON=0
FALLO_MUTAR=0

probar() {
  local nombre="$1"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  # 🩸 El conteo sale de la línea de resumen de vitest. Si la corrida MUERE
  # (opción inválida, error de sintaxis), el resumen no existe y "0 fallos" se
  # leería como "sobrevivió" — un verificador que miente en verde es peor que
  # no tenerlo. Por eso se exige encontrar la línea.
  local resumen
  resumen="$(printf '%s' "$salida" | grep -E '^ *Tests +' | tail -1)"
  if [ -z "$resumen" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — no cuenta"
    printf '%s\n' "$salida" | tail -20
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
    return
  fi
  local fallos
  fallos="$(printf '%s' "$resumen" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)"
  if [ -n "$fallos" ] && [ "$fallos" -gt 0 ]; then
    echo "  ✅ cazada — $fallos test(s) en rojo   [$nombre]"
    CAZADAS=$((CAZADAS + 1))
  else
    echo "  ❌ SOBREVIVIÓ                        [$nombre]"
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
  fi
}

# El CONTROL es al revés: se muta algo que NINGUNA regla protege y se exige que
# los tests sigan VERDES. Sin él, un `TESTS` mal escrito (o un archivo que no
# compila) pondría todo en rojo y el script diría "N de N cazadas" sin haber
# probado nada.
control() {
  local nombre="$1"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  local resumen
  resumen="$(printf '%s' "$salida" | grep -E '^ *Tests +' | tail -1)"
  local fallos
  fallos="$(printf '%s' "$resumen" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)"
  if [ -z "$resumen" ] || { [ -n "$fallos" ] && [ "$fallos" -gt 0 ]; }; then
    echo "  ❌ EL CONTROL SE PUSO ROJO — los candados miden de más [$nombre]"
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
  else
    echo "  ✅ control verde, como tiene que ser  [$nombre]"
    CAZADAS=$((CAZADAS + 1))
  fi
}

mutar() { # mutar <archivo> <texto viejo> <texto nuevo>
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    sys.exit(f"🔴 no se encontró el texto a mutar en {ruta}")
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  # 🔴 Si el texto no estaba, la mutación NO se aplicó y el test verde no
  # significa nada. Se cuenta aparte y se dice: un script que se saltea
  # mutaciones en silencio miente sobre su propia cobertura.
  if [ $? -ne 0 ]; then
    echo "  ⚠️  MUTACIÓN NO APLICADA (el texto cambió de forma)"
    FALLO_MUTAR=$((FALLO_MUTAR + 1))
  fi
}

echo "═══ MUTACIONES ═══"

# ── A · El motor de fechas (lo que ya existía y sigue vivo) ─────────────────
echo "1. el mensual del 31 se saltea los meses que no lo tienen"
mutar src/lib/recordatorios/recordatorio.ts \
  '  const ultimo = diasDelMes(hoy.y, hoy.m);
  return hoy.d === ultimo && base.d > ultimo;' \
  '  return false;'
probar "fin de mes"; restaurar

echo "2. el recordatorio suena ANTES de la fecha en que se puso"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (ymd < rec.fecha) return false;' '  if (false) return false;'
probar "no suena antes"; restaurar

# ── B · `cada_dia` y el «hasta» (rediseño) ──────────────────────────────────
echo '3. se pierde cada_dia de la lista de repeticiones'
mutar src/lib/recordatorios/recordatorio.ts \
  'export const REPETICIONES = ["una_vez", "cada_dia", "semanal", "mensual"] as const;' \
  'export const REPETICIONES = ["una_vez", "semanal", "mensual"] as const;'
probar "cada_dia existe"; restaurar

echo "4. el «hasta» deja de cortar (el recordatorio suena para siempre)"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (rec.hasta && fechaValida(rec.hasta) && ymd > rec.hasta) return false;' \
  '  if (false) return false;'
probar "el hasta corta"; restaurar

echo "5. el «hasta» corta un día ANTES (excluyente en vez de inclusive)"
mutar src/lib/recordatorios/recordatorio.ts \
  'ymd > rec.hasta) return false;' 'ymd >= rec.hasta) return false;'
probar "corta inclusive"; restaurar

echo "6. un «hasta» sobre algo que no se repite se guarda igual"
mutar src/lib/recordatorios/recordatorio.ts \
  '      repeticion !== "una_vez" && typeof b.hasta === "string" && fechaValida(b.hasta)' \
  '      typeof b.hasta === "string" && fechaValida(b.hasta)'
probar "hasta solo con repetición"; restaurar

# ── C · «Hoy» no existe ─────────────────────────────────────────────────────
echo "7. se puede guardar para HOY (y el aviso de las 9:00 ya salió)"
mutar src/lib/recordatorios/recordatorio.ts \
  '  return fecha <= hoy;' '  return fecha < hoy;'
probar "hoy ya pasó"; restaurar

echo "8. «Hoy» vuelve a la lista de pastillas"
mutar src/lib/recordatorios/cuando.ts \
  'export const OPCIONES_CUANDO = [
  "manana",' \
  'export const OPCIONES_CUANDO = [
  "hoy",
  "manana",'
probar "seis pastillas, sin Hoy"; restaurar

echo "9. «Mañana» propone HOY"
mutar src/lib/recordatorios/cuando.ts \
  '  return sumarDias(hoy, 1);' '  return hoy;'
probar "mañana es mañana"; restaurar

echo "10. «Lunes» cae en HOY cuando hoy es lunes"
mutar src/lib/recordatorios/cuando.ts \
  '  const faltan = ((1 - dow + 7) % 7) || 7;' \
  '  const faltan = (1 - dow + 7) % 7;'
probar "el PRÓXIMO lunes"; restaurar

echo "11. las repeticiones arrancan HOY en vez de mañana"
mutar src/lib/recordatorios/cuando.ts \
  '    case "cada_dia":
      return { fecha: manana(hoy), repeticion: "cada_dia" };' \
  '    case "cada_dia":
      return { fecha: hoy, repeticion: "cada_dia" };'
probar "arrancan mañana"; restaurar

echo "12. la ruta deja de validar la fecha al crear"
mutar 'src/app/api/recordatorios/route.ts' \
  '  const falta = faltaParaGuardar(nuevo, fechaPanama());' \
  '  const falta: string[] = [];'
probar "el servidor valida"; restaurar

echo "13. editar EXIGE mover la fecha (un semanal viejo no se podría corregir)"
mutar 'src/app/api/recordatorios/[id]/route.ts' \
  '    (f) => f !== FALTA_FECHA_PASADA || cambioLaFecha,' \
  '    () => true,'
probar "editar sin mover la fecha"; restaurar

# ── D · El destino ──────────────────────────────────────────────────────────
echo "14. cualquier rol puede mandar al chat privado"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (!ROLES_QUE_ELIGEN_DESTINO.includes(rol)) return "equipo";' \
  '  if (false) return "equipo";'
probar "solo admin elige"; restaurar

echo "15. un destino raro cae en PRIVADO (esconde del grupo lo que nadie pidió esconder)"
mutar src/lib/recordatorios/recordatorio.ts \
  '  return esDestino(pedido) ? pedido : "equipo";' \
  '  return esDestino(pedido) ? pedido : "privado";'
probar "la duda va al equipo"; restaurar

echo "16. lo privado se publica en el grupo"
mutar src/lib/recordatorios/recordatorio.ts \
  '    equipo: ocurrencias.filter((o) => o.rec.destino !== "privado"),' \
  '    equipo: ocurrencias,'
probar "dos mensajes, no uno"; restaurar

echo "17. la ruta lee el destino del CUERPO y no del rol"
mutar src/app/api/recordatorios/route.ts \
  '  const nuevo = leerCuerpo(await req.json().catch(() => ({})), s.role);' \
  '  const nuevo = leerCuerpo(await req.json().catch(() => ({})), "admin");'
probar "el rol manda"; restaurar

echo "18. la pantalla le muestra «Solo a mí» a la secretaria"
mutar src/app/recordatorios/components/LineaNueva.tsx \
  '        {puedeElegirDestino && (' '        {true && ('
probar "el control se esconde"; restaurar

# ── E · El aviso único de vencido ───────────────────────────────────────────
echo "19. el cheque vencido avisa TODOS los días"
mutar src/lib/cheques-vencidos-aviso.ts \
  '  if (c.aviso_vencido_en) return false; // ya tuvo su única vez' \
  '  if (false) return false;'
probar "una sola vez"; restaurar

echo "20. un cheque REBOTADO también avisa (Daniel dijo que no)"
mutar src/lib/cheques-vencidos-aviso.ts \
  '  if (c.estado !== "pendiente") return false; // rebotado y depositado NO avisan' \
  '  if (c.estado === "depositado") return false;'
probar "el rebotado no avisa"; restaurar

echo "21. la marca se pone ANTES de que Telegram confirme"
mutar src/lib/cheques-alert.ts \
  '  if (enviadoGrupo && vencidos.length > 0) {' '  if (vencidos.length > 0) {'
probar "marcar después de enviar"; restaurar

# ── F · La retención de 365 días ────────────────────────────────────────────
echo "22. también se retiran los cheques que todavía se deben"
mutar src/lib/cheques-retencion.ts \
  '    .filter((c) => !c.deleted && c.estado === "depositado" && fechaDeCorteDe(c) <= corte)' \
  '    .filter((c) => !c.deleted && fechaDeCorteDe(c) <= corte)'
probar "solo depositados"; restaurar

echo "23. se cuenta desde el VENCIMIENTO y no desde el depósito"
mutar src/lib/cheques-retencion.ts \
  '  return c.fecha_depositado || c.fecha_deposito;' \
  '  return c.fecha_deposito;'
probar "desde el depósito"; restaurar

echo "24. el umbral baja a 30 días"
mutar src/lib/cheques-retencion.ts \
  'export const RETENCION_DEPOSITADOS_DIAS = 365;' \
  'export const RETENCION_DEPOSITADOS_DIAS = 30;'
probar "365 días"; restaurar

echo "25. la retención borra de verdad en vez de marcar"
mutar src/lib/cheques-alert.ts \
  '    .update({ deleted: true, deleted_at: new Date().toISOString() })' \
  '    .delete()'
probar "soft delete"; restaurar

# ── G · El mensaje ──────────────────────────────────────────────────────────
echo "26. vuelven los teléfonos de WhatsApp al pie del aviso"
mutar src/lib/cheques-aviso-ventana.ts \
  '    `${lineas}`
  );' \
  '    `${lineas}\n` +
    `WhatsApp seguimiento: +50766745522, +50766494096`
  );'
probar "sin la línea de WhatsApp"; restaurar

echo "27. los recordatorios se ponen ANTES de los cheques"
mutar src/lib/cheques-alert.ts \
  '  const mensajeGrupo = unirAviso(
    bloqueCheques,
    bloqueVencidos,
    construirAvisoRecordatorios(equipo, hoy),
  );' \
  '  const mensajeGrupo = unirAviso(
    construirAvisoRecordatorios(equipo, hoy),
    bloqueCheques,
    bloqueVencidos,
  );'
probar "los cheques primero"; restaurar

echo "27b. el bloque de VENCIDOS se cuela delante del de «por vencer»"
mutar src/lib/cheques-alert.ts \
  '  const mensajeGrupo = unirAviso(
    bloqueCheques,
    bloqueVencidos,' \
  '  const mensajeGrupo = unirAviso(
    bloqueVencidos,
    bloqueCheques,'
probar "por vencer va primero"; restaurar

echo "28. se cae el candado anti-duplicado del día"
mutar src/lib/cheques-alert.ts \
  '  if (await yaAvisoHoy(hoy)) {' '  if (false) {'
probar "un aviso por día"; restaurar

echo "29. sin nada que decir se manda un mensaje vacío igual"
mutar src/lib/cheques-alert.ts \
  '  if (!mensajeGrupo && !mensajePrivado) {' '  if (false) {'
probar "no se manda nada"; restaurar

# ── H · La agenda ───────────────────────────────────────────────────────────
echo "30. lo DEPOSITADO vuelve a la lista"
mutar src/lib/recordatorios/agenda.ts \
  '  return c.estado !== "depositado";' '  return true;'
probar "solo lo abierto"; restaurar

echo "31. el REBOTADO desaparece de la lista"
mutar src/lib/recordatorios/agenda.ts \
  '    if (!chequeAbierto(c)) continue;' \
  '    if (!chequeAbierto(c) || c.estado === "rebotado") continue;'
probar "el rebotado se queda"; restaurar

echo "32. el buscador respeta el filtro de la lista (no encuentra lo depositado)"
mutar src/lib/recordatorios/agenda.ts \
  '  for (const c of cheques) {
    if (llave(c.cliente).includes(q) || llave(c.numero_cheque).includes(q)) {' \
  '  for (const c of cheques) {
    if (chequeAbierto(c) && (llave(c.cliente).includes(q) || llave(c.numero_cheque).includes(q))) {'
probar "el buscador ve todo"; restaurar

echo "33. el recordatorio que se repite se expande en una fila por fecha"
mutar src/lib/recordatorios/agenda.ts \
  '    if (seRepite(rec)) {' '    if (false) {'
probar "una sola fila"; restaurar

echo "34. lo vencido se mezcla con lo de hoy"
mutar src/lib/recordatorios/agenda.ts \
  '  if (fecha < hoy) return "vencido";' '  if (fecha < hoy) return "hoy";'
probar "vencido va aparte"; restaurar

echo "35. la lista vuelve a mostrar un TOTAL sumado"
mutar src/app/recordatorios/components/AgendaLista.tsx \
  '              <span className="text-xs text-gray-400 tabular-nums">({g.items.length})</span>' \
  '              <span className="text-xs text-gray-400 tabular-nums">${g.items.reduce((s, i) => s + (i.tipo === "cheque" ? Number(i.cheque.monto) : 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>'
probar "ningún total sumado"; restaurar

echo "36. el calendario vuelve a mostrar el total del mes"
mutar src/app/recordatorios/components/CalendarioMes.tsx \
  '          {monthCheques.length} cheque{monthCheques.length === 1 ? "" : "s"}' \
  '          {monthCheques.length} cheques · ${fmt(monthCheques.reduce((s, c) => s + Number(c.monto), 0))}'
probar "el calendario tampoco suma"; restaurar

# ── I · Pantalla ────────────────────────────────────────────────────────────
echo "37. el renglón guarda con el texto vacío"
mutar src/app/recordatorios/components/LineaNueva.tsx \
  '  const puedeGuardar = falta.length === 0 && !guardando && isOnline;' \
  '  const puedeGuardar = !guardando && isOnline;'
probar "el botón se apaga"; restaurar

echo "38. el renglón deja de decir POR QUÉ la fecha no sirve"
mutar src/app/recordatorios/components/LineaNueva.tsx \
  '          {mensajeDeFalta(falta)}' '          Falta algo'
probar "dice por qué"; restaurar

# ⚠️ Las dos vistas del calendario tienen la MISMA línea con la MISMA sangría,
# así que el texto a mutar incluye la etiqueta de abajo: sin eso, las dos
# mutaciones pegarían en la primera y la segunda no probaría nada.
echo "39. el recordatorio no se dibuja en la GRILLA del calendario"
mutar src/app/recordatorios/components/CalendarioMes.tsx \
  '{(recPorDia[day] ?? []).map((rec) => (
                    <RecordatorioCalendarioPill' \
  '{[].map((rec: Recordatorio) => (
                    <RecordatorioCalendarioPill'
probar "grilla del calendario"; restaurar

echo "40. el recordatorio no se dibuja en la LISTA del calendario (celular)"
mutar src/app/recordatorios/components/CalendarioMes.tsx \
  '{(recPorDia[day] ?? []).map((rec) => (
                    <button' \
  '{[].map((rec: Recordatorio) => (
                    <button'
probar "lista del calendario"; restaurar

echo "41. el encabezado vuelve a decir Cheques"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  '<h1 className="sr-only">Recordatorios</h1>' '<h1 className="sr-only">Cheques</h1>'
probar "el h1 dice Recordatorios"; restaurar

echo "42. eliminar un recordatorio borra al primer toque"
mutar src/app/recordatorios/components/RecordatorioFormModal.tsx \
  '                  onClick={() => setConfirmarBorrar(true)}' '                  onClick={onDelete}'
probar "eliminar confirma"; restaurar

# ── J · Permisos, dirección y cron ──────────────────────────────────────────
echo "43. el módulo se abre a cualquier rol"
mutar src/lib/recordatorios/roles.ts \
  'export const RECORDATORIOS_ROLES: readonly string[] = ["admin", "secretaria"];' \
  'export const RECORDATORIOS_ROLES: readonly string[] = ["admin", "secretaria", "bodega", "vendedor"];'
probar "solo admin y secre"; restaurar

echo "44. la key del módulo se renombra (rompe permisos en la base)"
mutar src/lib/modules.ts \
  '{ key: "cheques",        label: "Recordatorios",' \
  '{ key: "recordatorios",  label: "Recordatorios",'
probar "la key no cambia"; restaurar

echo "45. el módulo vuelve a apuntar a /cheques"
mutar src/lib/modules.ts \
  'href: "/recordatorios",' 'href: "/cheques",'
probar "la dirección nueva"; restaurar

echo "46. se cae el redirect de /cheques"
mutar next.config.js \
  '      { source: "/cheques", destination: "/recordatorios", permanent: false },' \
  ''
probar "el enlace viejo llega"; restaurar

echo "47. el cron vuelve a las 9:15 en vez de las 9:00"
mutar vercel.json \
  '      "schedule": "0 14 * * *"' '      "schedule": "15 14 * * *"'
probar "9:00 de la mañana"; restaurar

echo "48. el cron se duplica (dos ocurrencias del mismo día)"
mutar vercel.json \
  '      "path": "/api/cron/cheques-alert",
      "schedule": "0 14 * * *"
    },' \
  '      "path": "/api/cron/cheques-alert",
      "schedule": "0 14 * * *"
    },
    {
      "path": "/api/cron/cheques-alert",
      "schedule": "0 18 * * *"
    },'
probar "una entrada = una vez al día"; restaurar

# ── K · La escritura y la migración ─────────────────────────────────────────
echo "49. borrar un recordatorio deja de ser soft delete"
mutar src/lib/recordatorios/server.ts \
  '    .update({ deleted: true })' '    .delete()'
probar "soft delete del recordatorio"; restaurar

echo "50. un destino ilegible en la base se lee como PRIVADO"
mutar src/lib/recordatorios/server.ts \
  '    destino: esDestino(f.destino) ? f.destino : "equipo",' \
  '    destino: esDestino(f.destino) ? f.destino : "privado",'
probar "la duda va al equipo (lectura)"; restaurar

echo '51. la migración deja el CHECK sin cada_dia'
mutar supabase/migrations/20260925130000_recordatorios_rediseno.sql \
  "CHECK (repeticion IN ('una_vez', 'cada_dia', 'semanal', 'mensual'));" \
  "CHECK (repeticion IN ('una_vez', 'semanal', 'mensual'));"
probar "el CHECK = el código"; restaurar

echo "52. la migración pone PRIVADO por defecto"
mutar supabase/migrations/20260925130000_recordatorios_rediseno.sql \
  "destino text NOT NULL DEFAULT 'equipo'" \
  "destino text NOT NULL DEFAULT 'privado'"
probar "el default es equipo"; restaurar

echo "53. la migración borra filas de cheques"
mutar supabase/migrations/20260925130000_recordatorios_rediseno.sql \
  'ALTER TABLE cheques ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz;' \
  'DELETE FROM cheques WHERE estado = 0;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz;'
probar "la migración es aditiva"; restaurar

# ── CONTROLES · lo que NO debe cazarse ──────────────────────────────────────
echo
echo "═══ CONTROLES (tienen que quedar VERDES) ═══"

echo "C1. se cambia un texto de ayuda que ninguna regla protege"
mutar src/app/recordatorios/components/CalendarioMes.tsx \
  'title="Cheque devuelto por el banco"' \
  'title="El banco devolvió este cheque"'
control "tooltip suelto"; restaurar

echo "C2. se reordena un comentario del módulo puro"
mutar src/lib/recordatorios/agenda.ts \
  '/** Normaliza para comparar: sin mayúsculas, sin espacios de sobra. */' \
  '/** Normaliza: minúsculas y sin espacios de sobra, para poder comparar. */'
control "comentario reescrito"; restaurar

restaurar
echo
echo "═══════════════════════════════════════════════"
echo "  CAZADAS: $CAZADAS   ·   SOBREVIVIERON: $SOBREVIVIERON"
if [ "$FALLO_MUTAR" -gt 0 ]; then
  echo "  ⚠️  $FALLO_MUTAR mutación(es) NO se pudieron aplicar — revísalas"
fi
echo "═══════════════════════════════════════════════"
[ "$SOBREVIVIERON" -eq 0 ] && [ "$FALLO_MUTAR" -eq 0 ]

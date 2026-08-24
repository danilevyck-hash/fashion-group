#!/usr/bin/env bash
# VERIFICACIÓN POR MUTACIÓN de los candados de RECORDATORIOS.
#
# Rompe el producto a propósito, una cosa por vez, y exige que los tests se
# pongan ROJOS. Un candado que sobrevive a su mutación no es un candado.
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
  "src/lib/recordatorios/server.ts"
  "src/lib/recordatorios/roles.ts"
  "src/lib/cheques-alert.ts"
  "src/lib/modules.ts"
  "src/app/api/recordatorios/route.ts"
  "src/app/api/recordatorios/[id]/route.ts"
  "src/app/cheques/ChequesClient.tsx"
  "src/app/cheques/components/RecordatorioFormModal.tsx"
  "supabase/migrations/20260824120000_recordatorios.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/recordatorios-cuando-tocan.test.ts \
src/__tests__/lib/recordatorios-permiso-y-aviso.test.ts \
src/__tests__/components/recordatorios-pantalla.test.tsx \
src/__tests__/lib/cheques-aviso-vencimiento.test.ts \
src/__tests__/lib/poda-textos-cxc-multifashion.test.ts \
src/__tests__/lib/saldos-banco-modulo.test.ts"

CAZADAS=0
SOBREVIVIERON=0

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

mutar() { # mutar <archivo> <texto viejo> <texto nuevo>
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    sys.exit(f"🔴 no se encontró el texto a mutar en {ruta}")
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
}

echo "═══ MUTACIONES ═══"

# ── El motor de fechas ──────────────────────────────────────────────────────
echo "1. el mensual del 31 se saltea los meses que no lo tienen"
mutar src/lib/recordatorios/recordatorio.ts \
  '  const ultimo = diasDelMes(hoy.y, hoy.m);
  return hoy.d === ultimo && base.d > ultimo;' \
  '  return false;'
probar "fin de mes"; restaurar

echo "2. el semanal suena ANTES de la fecha en que se puso"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (ymd < rec.fecha) return false;' '  if (false) return false;'
probar "no suena antes"; restaurar

echo "3. el mensual cae en CUALQUIER día cercano, no en el último"
mutar src/lib/recordatorios/recordatorio.ts \
  '  return hoy.d === ultimo && base.d > ultimo;' \
  '  return base.d > ultimo;'
probar "solo el último"; restaurar

# ── El aviso de Telegram ────────────────────────────────────────────────────
echo "4. los recordatorios se ponen ANTES de los cheques"
mutar src/lib/recordatorios/recordatorio.ts \
  '  return [bloqueCheques, bloqueRecordatorios].filter((b) => b.trim()).join("\n\n");' \
  '  return [bloqueRecordatorios, bloqueCheques].filter((b) => b.trim()).join("\n\n");'
probar "cheques primero"; restaurar

echo "5. sin cheques se corta la corrida (el recordatorio NO suena)"
mutar src/lib/cheques-alert.ts \
  '  // Los recordatorios que tocan en la MISMA ventana.' \
  '  if (!cheques || cheques.length === 0) return { ok: true, detail: "sin cheques por vencer", ...vacio };
  // Los recordatorios que tocan en la MISMA ventana.'
probar "sin cheques igual suena"; restaurar

echo "6. se cae el candado anti-duplicado"
mutar src/lib/cheques-alert.ts \
  '  if (await yaAvisoHoy(hoy)) {' '  if (false) {'
probar "un aviso por día"; restaurar

echo "7. un fallo de recordatorios tumba el aviso de los cheques"
mutar src/lib/cheques-alert.ts \
  '    if (faltaMigracion) notaRecordatorios = " (recordatorios: falta el DDL)";' \
  '    if (faltaMigracion) return { ok: false, detail: "falta el DDL", ...vacio };'
probar "la plata primero"; restaurar

echo "8. sin recordatorios se manda un mensaje vacío igual"
mutar src/lib/cheques-alert.ts \
  '  if (!mensaje) {' '  if (false) {'
probar "no se manda nada"; restaurar

# ── Lo que es obligatorio y lo que no ───────────────────────────────────────
echo "9. el cliente se vuelve obligatorio"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (!v.texto.trim()) falta.push("qué hay que recordar");' \
  '  if (!v.texto.trim()) falta.push("qué hay que recordar");
  if (!(v as { cliente?: string }).cliente) falta.push("el cliente");'
probar "cliente opcional"; restaurar

echo "10. el texto vacío se puede guardar"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (!v.texto.trim()) falta.push("qué hay que recordar");' '  '
probar "texto obligatorio"; restaurar

echo "11. una repetición inventada se guarda tal cual"
mutar src/lib/recordatorios/recordatorio.ts \
  '    repeticion: esRepeticion(b.repeticion) ? b.repeticion : "una_vez",' \
  '    repeticion: (b.repeticion ?? "una_vez") as Repeticion,'
probar "lista cerrada"; restaurar

echo '12. "sin vincular" se guarda como cadena vacía en vez de NULL'
mutar src/lib/recordatorios/recordatorio.ts \
  '    clienteCodigo:
      typeof b.cliente_codigo === "string" && b.cliente_codigo.trim()
        ? b.cliente_codigo.trim()
        : null,' \
  '    clienteCodigo: typeof b.cliente_codigo === "string" ? b.cliente_codigo : "",'
probar "NULL, no vacío"; restaurar

# ── Permisos ────────────────────────────────────────────────────────────────
echo "13. la ruta se abre a cualquier rol"
mutar src/lib/recordatorios/roles.ts \
  'export const RECORDATORIOS_ROLES: readonly string[] = ["admin", "secretaria"];' \
  'export const RECORDATORIOS_ROLES: readonly string[] = ["admin", "secretaria", "bodega", "vendedor", "contabilidad", "gerente_acs"];'
probar "solo admin y secre"; restaurar

echo "14. la key del módulo se renombra (rompe permisos en la base)"
mutar src/lib/modules.ts \
  '{ key: "cheques",        label: "Recordatorios",' \
  '{ key: "recordatorios",  label: "Recordatorios",'
probar "la key no cambia"; restaurar

echo "15. el label vuelve a Cheques"
mutar src/lib/modules.ts \
  'label: "Recordatorios",     href: "/cheques"' \
  'label: "Cheques",           href: "/cheques"'
probar "el label cambió"; restaurar

# ── Escritura ───────────────────────────────────────────────────────────────
echo "16. borrar deja de ser soft delete"
mutar src/lib/recordatorios/server.ts \
  '    .update({ deleted: true })' '    .delete()'
probar "soft delete"; restaurar

echo "17. la firma sale del cuerpo del pedido y no de la sesión"
mutar src/app/api/recordatorios/route.ts \
  '  const r = await crearRecordatorio(nuevo, s.userName || s.role);' \
  '  const r = await crearRecordatorio(nuevo, String(((await req.json().catch(() => ({}))) as { creado_por?: string }).creado_por ?? ""));'
probar "la firma es de la sesión"; restaurar

# ── Degradación sin la migración ────────────────────────────────────────────
echo "18. cualquier error se lee como migración faltante"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (!texto.includes(TABLA_RECORDATORIOS)) return false;' '  return true;'
probar "tiene que nombrar la tabla"; restaurar

echo "19. sin la tabla el GET revienta en 500"
mutar src/lib/recordatorios/server.ts \
  '    if (esTablaRecordatoriosFaltante(errorDeLectura(e))) {' '    if (false) {'
probar "degrada limpio"; restaurar

# ── Pantalla ────────────────────────────────────────────────────────────────
echo "20. el recordatorio no se dibuja en la GRILLA del calendario (escritorio)"
mutar src/app/cheques/ChequesClient.tsx \
  '                        {(recPorDia[day] ?? []).map(rec => (' \
  '                        {[].map((rec: Recordatorio) => ('
probar "grilla del calendario"; restaurar

echo "20b. el recordatorio no se dibuja en la LISTA del calendario (celular)"
mutar src/app/cheques/ChequesClient.tsx \
  '                      {(recPorDia[day] ?? []).map(rec => (' \
  '                      {[].map((rec: Recordatorio) => ('
probar "lista del calendario"; restaurar

echo "21. los recordatorios se mezclan en el contador de Pendientes"
mutar src/app/cheques/ChequesClient.tsx \
  '            ["pendiente", "Pendientes", pendientes.length,' \
  '            ["pendiente", "Pendientes", pendientes.length + recordatorios.length,'
probar "Pendientes cuenta cheques"; restaurar

echo "22. el aviso de la migración se pinta en ROJO"
mutar src/app/cheques/ChequesClient.tsx \
  'bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 sm:px-4 py-3 text-sm">' \
  'bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 sm:px-4 py-3 text-sm">'
probar "ámbar, no rojo"; restaurar

echo "23. el botón de crear queda encendido sin la migración"
mutar src/app/cheques/ChequesClient.tsx \
  '            disabled={!isOnline || faltaMigracionRec}' '            disabled={!isOnline}'
probar "botón apagado"; restaurar

echo "24. el encabezado vuelve a decir Cheques"
mutar src/app/cheques/ChequesClient.tsx \
  '<h1 className="sr-only">Recordatorios</h1>' '<h1 className="sr-only">Cheques</h1>'
probar "el h1 dice Recordatorios"; restaurar

echo "25. la ventana guarda con el texto vacío"
mutar src/app/cheques/components/RecordatorioFormModal.tsx \
  '  const puedeGuardar = falta.length === 0 && !saving && isOnline;' \
  '  const puedeGuardar = !saving && isOnline;'
probar "el botón se apaga"; restaurar

echo "26. eliminar borra al primer toque, sin confirmar"
mutar src/app/cheques/components/RecordatorioFormModal.tsx \
  '                  onClick={() => setConfirmarBorrar(true)}' '                  onClick={onDelete}'
probar "eliminar confirma"; restaurar

# ── La migración ────────────────────────────────────────────────────────────
echo "27. la migración toca la tabla de cheques"
mutar supabase/migrations/20260824120000_recordatorios.sql \
  'ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;' \
  'ALTER TABLE cheques ADD COLUMN IF NOT EXISTS recordatorio_id uuid;
ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;'
probar "no toca cheques"; restaurar

echo "28. el texto vacío se puede guardar en la BASE"
mutar supabase/migrations/20260824120000_recordatorios.sql \
  "texto           text NOT NULL CHECK (btrim(texto) <> '')," \
  'texto           text NOT NULL,'
probar "CHECK del texto"; restaurar

restaurar
echo
echo "═══════════════════════════════════════════════"
echo "  CAZADAS: $CAZADAS   ·   SOBREVIVIERON: $SOBREVIVIERON"
echo "═══════════════════════════════════════════════"
[ "$SOBREVIVIERON" -eq 0 ]

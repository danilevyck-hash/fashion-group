#!/usr/bin/env bash
# Verificador de mutaciones del reparto de aprobación por empresa.
#
# 🩸 Restaura por COPIA y no con `git checkout`: hay archivos NUEVOS en la rama y
# git aborta el comando entero sin restaurar nada, así que las mutaciones se
# apilarían y ninguna se probaría por separado.
# 🩸 El reemplazo es LITERAL con python (no `perl -0pi -e 's|A|B|'`): el código
# real tiene `||` y `/`, y cualquier delimitador se des-escapa y se come el
# archivo, dejando un «SOBREVIVIÓ» falso.
# 🩸 `mutar()` EXIGE que el archivo cambie, y `probar()` exige que vitest haya
# COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/asistencia-aprobador-empresa.test.ts
  src/__tests__/api/aprobaciones-por-empresa-route.test.ts
  src/__tests__/lib/boston-acceso.test.ts
)
ARCHIVOS=(
  src/lib/asistencia/aprobador-empresa.ts
  src/lib/asistencia/aprobador-empresa-server.ts
  src/lib/asistencia/roles.ts
  src/app/api/asistencia/aprobaciones/route.ts
  supabase/migrations/20260903120000_asistencia_aprobador_empresa.sql
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

mutar src/lib/asistencia/aprobador-empresa.ts \
  'if (a.empresas === null) return { ok: true, fuera: [], motivo: null };' \
  'return { ok: true, fuera: [], motivo: null };' \
  'el veredicto siempre deja pasar'

mutar src/lib/asistencia/aprobador-empresa.ts \
  'const fuera = personas.filter((p) => !alcanza(a, p.empresa)).map((p) => p.codigo);' \
  'const fuera = personas.filter((p) => false).map((p) => p.codigo);' \
  'nadie queda nunca fuera del alcance'

mutar src/lib/asistencia/aprobador-empresa.ts \
  'return typeof empresa === "string" && a.empresas.has(empresa);' \
  'return true;' \
  '`alcanza` dice que sí a cualquier empresa'

mutar src/lib/asistencia/aprobador-empresa.ts \
  'if (faltaTabla) return { empresas: null, faltaTabla: true };' \
  'if (false) return { empresas: null, faltaTabla: true };' \
  'sin la tabla se segmenta igual (Julio se traba)'

mutar src/lib/asistencia/aprobador-empresa.ts \
  '  return { empresas: mias, faltaTabla: false };' \
  '  return { empresas: mias.size === 0 ? null : mias, faltaTabla: false };' \
  'sin filas propias se interpreta como «todas»'

mutar src/lib/asistencia/aprobador-empresa.ts \
  'if (clave(f.usuario) === yo && (EMPRESAS_ASISTENCIA as readonly string[]).includes(f.empresa)) {' \
  'if (clave(f.usuario) === yo) {' \
  'una empresa inventada entra al alcance'

mutar src/lib/asistencia/aprobador-empresa.ts \
  'const clave = (s: string) => s.trim().toLowerCase();' \
  'const clave = (s: string) => s;' \
  'el nombre pasa a distinguir mayúsculas'

mutar src/app/api/asistencia/aprobaciones/route.ts \
  '    if (!veredicto.ok) {' \
  '    if (false) {' \
  'la ruta MIDE el alcance y no corta'

mutar src/app/api/asistencia/aprobaciones/route.ts \
  '    const alcance = await leerAlcanceAprobador(auth.role, auth.userName);' \
  '    const alcance = { empresas: null, faltaTabla: false } as Awaited<ReturnType<typeof leerAlcanceAprobador>>;' \
  'la ruta ni siquiera lee el reparto'

mutar src/lib/asistencia/aprobador-empresa-server.ts \
  '      return alcanceDe(rol, usuario, [], true);' \
  '      throw new Error("boom");' \
  'la tabla ausente revienta en vez de degradar'

mutar src/lib/asistencia/aprobador-empresa-server.ts \
  '    if (esTablaFaltante(error, TABLA_APROBADOR_EMPRESA)) {' \
  '    if (true) {' \
  'CUALQUIER error se lee como «falta la tabla»'

mutar src/lib/asistencia/roles.ts \
  'export const APROBACIONES_ROLES = ["admin", "bodega", "contabilidad", ROL_BOSTON] as const;' \
  'export const APROBACIONES_ROLES = ["admin", "bodega", "contabilidad"] as const;' \
  'David pierde la aprobación'

mutar src/lib/asistencia/roles.ts \
  'return aprobacionesRoles().filter((r) => !conAsistencia.has(r) && r !== ROL_BOSTON);' \
  'return aprobacionesRoles().filter((r) => !conAsistencia.has(r));' \
  'David cae en soloAprueba y su planilla pierde la plata'

mutar supabase/migrations/20260903120000_asistencia_aprobador_empresa.sql \
  "  ('Bodega',  'fashion_wear')," \
  "  ('Bodega',  'confecciones_boston')," \
  'la migración le da Boston a Julio'

mutar supabase/migrations/20260903120000_asistencia_aprobador_empresa.sql \
  'ON CONFLICT (usuario, empresa) DO NOTHING;' \
  ';' \
  'la migración deja de ser idempotente'

# 🩸 CONTROL que a propósito NO matchea: si no sale ⛔, el denunciador está roto
# y todos los ✅ valen lo mismo que un barrido vacío.
mutar src/lib/asistencia/aprobador-empresa.ts \
  'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO' 'x' \
  'CONTROL — debe salir ⛔ NO MUTÓ'

echo
echo "cazadas: $CAZ · sobrevivieron: $SOB · no-op/muertas: $NOOP  (1 no-op es el CONTROL)"

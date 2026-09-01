#!/usr/bin/env bash
# Verificador de mutaciones de la quincena CERRADA (planilla congelada).
#
# 🩸 Restaura por COPIA y no con `git checkout`: los cinco archivos son NUEVOS y
# git aborta el comando entero sin restaurar nada, así que las mutaciones se
# apilarían y ninguna se probaría por separado.
# 🩸 El reemplazo es LITERAL con python (no `perl -0pi -e 's|A|B|'`): el código
# real tiene `||` y `/`, y cualquier delimitador se des-escapa y se come el
# archivo, dejando un «SOBREVIVIÓ» falso.
# 🩸 `mutar()` EXIGE que el archivo cambie y `probar()` exige que vitest haya
# COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
# 🩸 La ÚLTIMA mutación es de CONTROL y a propósito no matchea: si no sale ⛔, el
# denunciador está roto y todos los ✅ de arriba valen lo mismo que un barrido.
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/asistencia-planilla-guardada.test.ts
  src/__tests__/api/planilla-guardada-route.test.ts
)
ARCHIVOS=(
  src/lib/asistencia/planilla-guardada.ts
  src/lib/asistencia/planilla-guardada-server.ts
  src/app/api/asistencia/planilla-guardada/route.ts
  supabase/migrations/20260904120000_asistencia_planilla_guardada.sql
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

PURO=src/lib/asistencia/planilla-guardada.ts
IO=src/lib/asistencia/planilla-guardada-server.ts
RUTA=src/app/api/asistencia/planilla-guardada/route.ts
SQL=supabase/migrations/20260904120000_asistencia_planilla_guardada.sql

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

echo "== EL SOLAPAMIENTO =="
mutar "$RUTA" \
  '    if (solapadas.length > 0) {' \
  '    if (false) {' \
  'la ruta guarda igual aunque se pise con otra'

mutar "$PURO" \
  'return a.desde <= b.hasta && b.desde <= a.hasta;' \
  'return a.desde < b.hasta && b.desde < a.hasta;' \
  'el borde: el día compartido deja de pisar'

mutar "$PURO" \
  '    (g) => g.empresa === empresa && esCerrada(g.estado) && seSolapan(rango, g),' \
  '    (g) => esCerrada(g.estado) && seSolapan(rango, g),' \
  'el solapamiento ignora la empresa'

mutar "$PURO" \
  '    (g) => g.empresa === empresa && esCerrada(g.estado) && seSolapan(rango, g),' \
  '    (g) => g.empresa === empresa && seSolapan(rango, g),' \
  'una reabierta sigue bloqueando (reabrir no sirve)'

mutar "$PURO" \
  'export function esCerrada(estado: string): boolean {
  return estado === "cerrada";' \
  'export function esCerrada(estado: string): boolean {
  return estado !== "";' \
  'todo estado cuenta como pagado'

mutar "$PURO" \
  '  const cuales = solapadas' \
  '  const cuales = ([] as CabeceraGuardada[])' \
  'el aviso deja de decir CUÁL cuadro estorba'

echo "== LO QUE SE CONGELA =="
mutar "$RUTA" \
  '    const lineas = Array.isArray(cuadro.lineas) ? cuadro.lineas : [];' \
  '    const lineas = (Array.isArray((body as { lineas?: LineaPlanilla[] })?.lineas) ? (body as { lineas: LineaPlanilla[] }).lineas : cuadro.lineas) as LineaPlanilla[];' \
  '🔴 la ruta se cree los montos del navegador'

mutar "$PURO" \
  '    fila[col] = l.dinero ? l.dinero[campo as keyof DineroLinea] : null;' \
  '    fila[col] = l.dinero ? l.dinero[campo as keyof DineroLinea] : 0;' \
  'sin pago se escribe 0 en vez de null'

mutar "$PURO" \
  '  for (const [campo, col] of Object.entries(COLUMNAS_HORAS)) {
    fila[col] = l.horas[campo as keyof HorasPersona];
  }' \
  '  for (const [campo, col] of Object.entries(COLUMNAS_HORAS)) {
    if (campo === "x") fila[col] = l.horas[campo as keyof HorasPersona];
  }' \
  'las horas no se congelan (solo la plata)'

mutar "$PURO" \
  '    grupo: grupoDeLinea(l),' \
  '    grupo: "pagada",' \
  'se pierde POR QUÉ alguien no tiene número'

mutar "$PURO" \
  '    nombre: l.nombre,' \
  '    nombre: null,' \
  'el nombre no se congela'

mutar "$PURO" \
  '    personas: lineas.length,' \
  '    personas: lineas.filter((l) => l.dinero).length,' \
  'el testigo no cuenta a los que no cobraron'

echo "== EL ORDEN DE ESCRITURA Y LA FIRMA =="
mutar "$IO" \
  '    estado: "cerrando",' \
  '    estado: "cerrada",' \
  '🩸 la cabecera nace VIVA (una planilla de $0 si fallan los renglones)'

mutar "$RUTA" \
  '    const usuario = String(auth.userName ?? "").trim();
    if (!usuario) {' \
  '    const usuario = String((body as { usuario?: string })?.usuario ?? auth.userName ?? "").trim();
    if (!usuario) {' \
  'la firma sale del CUERPO y no de la sesión'

echo "== REABRIR NO BORRA =="
mutar "$IO" \
  '    .eq("estado", "cerrada")
    .select("id");' \
  '    .select("id");' \
  'reabrir dos veces pisa la firma del primero'

mutar "$IO" \
  '      reabierta_por: usuario,' \
  '      reabierta_por: null,' \
  'reabrir no deja rastro de quién'

echo "== LA DEGRADACIÓN SIN LA MIGRACIÓN =="
mutar "$IO" \
  '    if (esTablaFaltante(errCab, TABLA_GUARDADA)) return { ok: false, faltaTabla: true };' \
  '    if (true) return { ok: false, faltaTabla: true };' \
  '🩸 cualquier error se lee como «falta la tabla»'

mutar "$IO" \
  '    if (esTablaFaltante({ message: e instanceof Error ? e.message : String(e) }, TABLA_GUARDADA)) {' \
  '    if (true) {' \
  '🩸 un permiso denegado se lee como «falta la tabla» al leer'

echo "== LOS GUARDS DE LA RUTA =="
mutar "$RUTA" \
  '    if (cuadro.empresa !== empresa || cuadro.periodo?.desde !== desde || cuadro.periodo?.hasta !== hasta) {' \
  '    if (false) {' \
  'se congela un cuadro que NO es de la empresa pedida'

mutar "$RUTA" \
  '  const auth = requireAsistencia(req, cerrarPlanillaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    // El período primero' \
  '  const auth = requireAsistencia(req, [...cerrarPlanillaRoles(), "bodega", "gerente_boston"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    // El período primero' \
  'quien solo aprueba puede cerrar (y ve los sueldos)'

mutar "$PURO" \
  '  const noCierran = new Set<string>(MIRAN_PERO_NO_CIERRAN);
  return asistenciaRoles().filter((r) => !noCierran.has(r));' \
  '  return asistenciaRoles();' \
  '🔴 la SECRETARIA puede cerrar la quincena'

echo "== LOS FRENOS DEL CIERRE =="
mutar "$RUTA" \
  '    if (frenos.length > 0) {' \
  '    if (false) {' \
  '🔴 se cierra con horas extra y préstamos sin aprobar'

mutar "$PURO" \
  '  const extras = extrasNoAprobadas(lineas);' \
  '  const extras = extrasNoAprobadas([]);' \
  'las horas extra sin aprobar dejan de frenar'

mutar "$PURO" \
  '  const pres = prestamosSinAprobar(prestamos);' \
  '  const pres = prestamosSinAprobar([]);' \
  'el préstamo sin aprobar deja de frenar'

mutar "$PURO" \
  '        + "Andá a la pestaña «Aprobaciones», aprobá o dejá sin aprobar esas horas, y volvé a cerrar. "' \
  '        + "Revisá antes de cerrar. "' \
  'el freno deja de decir A DÓNDE ir'

echo "== EL MOTIVO DE LA REAPERTURA (obligatorio) =="
mutar "$RUTA" \
  '    if (!motivo) {' \
  '    if (false) {' \
  '🔴 se reabre sin escribir por qué'

mutar "$PURO" \
  '  return s.length > 0 ? s : null;' \
  '  return s;' \
  'un motivo de puros espacios pasa'

echo "== LAS VERSIONES =="
mutar "$IO" \
  '  const version = versionSiguiente(opts.empresa, { desde: opts.desde, hasta: opts.hasta }, opts.yaGuardadas);' \
  '  const version = 1;' \
  'la v2 se llama v1 (dos cuadros con el mismo nombre)'

mutar "$PURO" \
  '    if (g.version > mayor) mayor = g.version;' \
  '    if (esCerrada(g.estado) && g.version > mayor) mayor = g.version;' \
  'la versión no cuenta las reabiertas'

mutar "$SQL" \
  'motivo_reabrir IS NOT NULL AND btrim' \
  'TRUE AND btrim' \
  'la base acepta una reapertura sin motivo'

echo "== LA MIGRACIÓN =="
mutar "$SQL" \
  'REFERENCES asistencia_planilla_guardada(id) ON DELETE RESTRICT' \
  'REFERENCES asistencia_planilla_guardada(id) ON DELETE CASCADE' \
  'los renglones se borran en cascada'

mutar "$SQL" \
  "      ) WHERE (estado = 'cerrada');" \
  '      );' \
  'el EXCLUDE también bloquea las reabiertas'

mutar "$SQL" \
  '        empresa WITH =,' \
  '' \
  'el EXCLUDE deja de mirar la empresa'

mutar "$SQL" \
  '  tardanza_grave_dias     numeric(10,2) NOT NULL DEFAULT 0,' \
  '' \
  'falta una columna que el código sí escribe'

mutar "$SQL" \
  'ALTER TABLE asistencia_planilla_guardada_linea ENABLE ROW LEVEL SECURITY;' \
  '' \
  'los renglones quedan sin RLS'

mutar "$SQL" \
  'CREATE UNIQUE INDEX IF NOT EXISTS asistencia_planilla_guardada_version
  ON asistencia_planilla_guardada (empresa, desde, hasta, version);' \
  '' \
  'dos filas del mismo período pueden llamarse igual'

echo "== CONTROL (a propósito NO matchea) =="
mutar "$PURO" 'ESTA_LINEA_NO_EXISTE_EN_NINGUN_LADO' 'nada' 'control: el denunciador tiene que gritar ⛔'

echo
echo "cazadas: $CAZ · sobrevivieron: $SOB · patrones muertos/corridas muertas: $NOOP"

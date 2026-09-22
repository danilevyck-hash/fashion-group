#!/usr/bin/env bash
# VERIFICACIÓN POR MUTACIÓN — «UNA SOLA PUERTA, UNA SOLA LISTA» (22-sep-2026).
#
# Daniel: «cheque es un motivo de recordatorio».
#
# Rompe el producto a propósito, una cosa por vez, y exige que los tests se
# pongan ROJOS. Un candado que sobrevive a su mutación no es un candado.
#
# Lo que este script intenta romper, que es exactamente lo que el encargo
# prohíbe:
#
#   · que vuelvan las DOS puertas separadas
#   · que un motivo guarde en la tabla EQUIVOCADA
#   · que las dos tablas se fusionen o se dropeen
#   · que la lista se vuelva a partir en dos
#   · que el cron deje de ver alguna de las dos tablas
#   · que `destino` lo decida el navegador
#   · que aparezca un total sumado en la agenda
#   · que el aviso de vencido suene dos veces
#   · que la caja de escribir vuelva arriba y a todo lo ancho
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado.
#
#   bash scripts/_mutar-candados-recordatorios-una-puerta.sh

set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/recordatorios/motivos.ts"
  "src/lib/recordatorios/agenda.ts"
  "src/lib/recordatorios/recordatorio.ts"
  "src/lib/recordatorios/server.ts"
  "src/lib/cheques-alert.ts"
  "src/lib/cheques-vencidos-aviso.ts"
  "src/app/api/recordatorios/route.ts"
  "src/app/api/recordatorios/[id]/route.ts"
  "src/app/recordatorios/RecordatoriosClient.tsx"
  "src/app/recordatorios/acciones-cheque.ts"
  "src/app/recordatorios/components/PuertaRecordar.tsx"
  "src/app/recordatorios/components/LineaNueva.tsx"
  "src/app/recordatorios/components/AgendaLista.tsx"
  "supabase/migrations/20260925130000_recordatorios_rediseno.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/recordatorios-una-puerta.test.ts \
src/__tests__/components/recordatorios-pantalla.test.tsx \
src/__tests__/lib/recordatorios-rediseno.test.ts \
src/__tests__/lib/recordatorios-permiso-y-aviso.test.ts \
src/__tests__/lib/cheques-aviso-vencimiento.test.ts"

CAZADAS=0
SOBREVIVIERON=0
FALLO_MUTAR=0

probar() {
  local nombre="$1"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  # 🩸 El conteo sale de la línea de resumen de vitest. Si la corrida MUERE
  # (error de sintaxis, opción inválida), el resumen no existe y "0 fallos" se
  # leería como "sobrevivió" — un verificador que miente en verde es peor que no
  # tenerlo. Por eso se exige encontrar la línea.
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
# los tests sigan VERDES. Sin él, un `TESTS` mal escrito pondría todo en rojo y
# el script diría "N de N cazadas" sin haber probado nada.
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
  if [ $? -ne 0 ]; then
    echo "  ⚠️  MUTACIÓN NO APLICADA (el texto cambió de forma)"
    FALLO_MUTAR=$((FALLO_MUTAR + 1))
  fi
}

echo "═══ MUTACIONES ═══"

# ── A · Las dos puertas separadas ───────────────────────────────────────────
echo "1. vuelve el botón «Nuevo Cheque» al lado de «＋ Recordar»"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  '                ＋ Recordar
              </button>' \
  '                ＋ Recordar
              </button>
              <button
                onClick={() => {
                  setFormInitial(chequeFormVacio());
                  setEditingId(null);
                  setShowForm(true);
                }}
                className="text-sm"
              >
                Nuevo Cheque
              </button>'
probar "una sola puerta"; restaurar

echo "2. el botón de alta deja de abrir la puerta y abre el cheque directo"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  'onClick={() => setPuertaAbierta(true)}' \
  'onClick={() => { setFormInitial(chequeFormVacio()); setEditingId(null); setShowForm(true); }}'
probar "la puerta pregunta el motivo"; restaurar

echo "3. la puerta deja de montarse"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  '          <PuertaRecordar
            open={puertaAbierta}' \
  '          <PuertaRecordar
            open={false && puertaAbierta}'
probar "la puerta existe"; restaurar

echo "4. la puerta ofrece UN solo motivo"
mutar src/lib/recordatorios/motivos.ts \
  'export const MOTIVOS = ["cheque", "nota"] as const;' \
  'export const MOTIVOS = ["cheque"] as const;'
probar "los dos motivos"; restaurar

echo "5. se inventa un motivo que Daniel nunca pidió"
mutar src/lib/recordatorios/motivos.ts \
  'export const MOTIVOS = ["cheque", "nota"] as const;' \
  'export const MOTIVOS = ["cheque", "nota", "factura"] as const;'
probar "no se inventan motivos"; restaurar

echo "6. la puerta escribe su lista de motivos a mano"
mutar src/app/recordatorios/components/PuertaRecordar.tsx \
  '{MOTIVOS_EN_ORDEN.map((f) => (' \
  '{[{ motivo: "cheque", label: "Cheque", icono: "x", queHace: "y" }].map((f: any) => ('
probar "la lista sale del registro"; restaurar

echo "7. la puerta guarda sola en vez de abrir el formulario"
mutar src/app/recordatorios/components/PuertaRecordar.tsx \
  '              onClick={() => onElegir(f.motivo)}' \
  '              onClick={() => { fetch("/api/recordatorios", { method: "POST" }); onElegir(f.motivo); }}'
probar "elegir no guarda"; restaurar

echo "8. el motivo «Nota» abre el formulario de CHEQUE"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  '      case "nota":
        setRecInitial(recordatorioVacio(hoy, manana(hoy)));' \
  '      case "nota":
        setFormInitial(chequeFormVacio());
        setEditingId(null);
        setShowForm(true);
        return;
      case "__muerto":
        setRecInitial(recordatorioVacio(hoy, manana(hoy)));'
probar "cada motivo abre SU formulario"; restaurar

echo "9. el switch de motivos deja de ser exhaustivo"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  '        const _exhaustivo: never = m;
        return _exhaustivo;' \
  '        return;'
probar "switch exhaustivo"; restaurar

# ── B · La tabla de cada motivo ─────────────────────────────────────────────
echo "10. la NOTA se guarda en la tabla de cheques"
mutar src/lib/recordatorios/motivos.ts \
  '  nota: "recordatorios",' \
  '  nota: "cheques",'
probar "cada motivo a SU tabla"; restaurar

echo "11. el CHEQUE se guarda en la tabla de recordatorios"
mutar src/lib/recordatorios/motivos.ts \
  '  cheque: "cheques",' \
  '  cheque: "recordatorios",'
probar "cheque a cheques"; restaurar

echo "12. la ruta del motivo se escribe a mano y apunta a la otra tabla"
mutar src/lib/recordatorios/motivos.ts \
  '  recordatorios: "/api/recordatorios",' \
  '  recordatorios: "/api/cheques",'
probar "la ruta sale de la tabla"; restaurar

echo "13. la pantalla escribe el alta de la nota con la ruta a mano"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  '      const res = await fetch(rutaDelMotivo("nota"), {
        method: "POST",' \
  '      const res = await fetch("/api/recordatorios", {
        method: "POST",'
probar "el alta pide la ruta al registro"; restaurar

echo "14. el lector de recordatorios se mete con la tabla de cheques"
mutar src/lib/recordatorios/server.ts \
  '    .from(TABLA_RECORDATORIOS)
    .select(COLS)
    .eq("id", id)' \
  '    .from("cheques")
    .select(COLS)
    .eq("id", id)'
probar "las tablas no se cruzan"; restaurar

echo "15. una migración dropea la tabla de cheques"
mutar supabase/migrations/20260925130000_recordatorios_rediseno.sql \
  'ALTER TABLE cheques ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz;' \
  'DROP TABLE IF EXISTS cheques;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz;'
probar "nada se dropea"; restaurar

echo "16. una migración dropea la tabla de recordatorios"
mutar supabase/migrations/20260925130000_recordatorios_rediseno.sql \
  'ALTER TABLE cheques ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz;' \
  'DROP TABLE recordatorios;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz;'
probar "nada se dropea (2)"; restaurar

# ── C · La lista única ──────────────────────────────────────────────────────
echo "17. la lista se parte: los recordatorios dejan de entrar a la agenda"
mutar src/lib/recordatorios/agenda.ts \
  '  for (const rec of recordatorios) {' \
  '  for (const rec of ([] as Recordatorio[])) {'
probar "una sola lista"; restaurar

echo "18. la fila del cheque pierde su icono de motivo"
mutar src/app/recordatorios/components/AgendaLista.tsx \
  '            <span
              aria-hidden
              className="shrink-0"
              data-motivo-icono={motivoDeItem(item)}
            >
              {iconoDeItem(item)}
            </span>
' \
  ''
probar "cada fila dice su motivo"; restaurar

echo "19. los dos motivos comparten el mismo icono"
mutar src/lib/recordatorios/motivos.ts \
  '    icono: "🔔",' \
  '    icono: "💵",'
probar "los iconos no se repiten"; restaurar

echo "20. el icono se decide a mano y no por el motivo de la fila"
mutar src/lib/recordatorios/motivos.ts \
  '  return item.tipo === "cheque" ? "cheque" : "nota";' \
  '  return "cheque";'
probar "el motivo se deriva de la fila"; restaurar

echo "21. la agenda suma un total"
mutar src/lib/recordatorios/agenda.ts \
  '  const peso = (i: ItemAgenda) => (i.tipo === "cheque" ? 0 : 1);' \
  '  const total = cheques.reduce((a, c) => a + c.monto, 0);
  void total;
  const peso = (i: ItemAgenda) => (i.tipo === "cheque" ? 0 : 1);'
probar "ningún total sumado"; restaurar

# ── D · El orden de la pantalla ─────────────────────────────────────────────
echo "22. la caja de escribir vuelve ARRIBA de la lista"
mutar src/app/recordatorios/RecordatoriosClient.tsx \
  '          {/* Modo (Lista / Calendario) + buscador. NO son pestañas: son dos' \
  '          <LineaNueva
            hoy={hoy}
            puedeElegirDestino={initialData.puedeElegirDestino}
            guardando={guardandoRapido}
            isOnline={isOnline}
            onGuardar={guardarRapido}
          />

          {/* Modo (Lista / Calendario) + buscador. NO son pestañas: son dos'
probar "la lista arriba"; restaurar

echo "23. la caja vuelve a mostrar los nueve botones en reposo"
mutar src/app/recordatorios/components/LineaNueva.tsx \
  '  const abierta = enfocado || texto.trim() !== "";' \
  '  const abierta = true;'
probar "la caja es más chica"; restaurar

echo "24. la caja deja de desplegarse al enfocar (se pierden las opciones)"
mutar src/app/recordatorios/components/LineaNueva.tsx \
  '  const abierta = enfocado || texto.trim() !== "";' \
  '  const abierta = false;'
probar "no se perdió ninguna opción"; restaurar

# ── E · El cron de las 9:00 ─────────────────────────────────────────────────
echo "25. el cron deja de ver los recordatorios"
mutar src/lib/cheques-alert.ts \
  '    const { recordatorios, faltaMigracion } = await leerRecordatorios();' \
  '    const recordatorios: Awaited<ReturnType<typeof leerRecordatorios>>["recordatorios"] = [];
    const faltaMigracion = false;'
probar "el cron ve las dos tablas"; restaurar

echo "26. el cron deja de ver los cheques por vencer"
mutar src/lib/cheques-alert.ts \
  '  const { data: cheques, error } = await supabaseServer
    .from("cheques")' \
  '  const { data: cheques, error } = await supabaseServer
    .from("recordatorios")'
probar "el cron ve los cheques"; restaurar

echo "27. un fallo de recordatorios se lleva puesto el aviso de cheques"
mutar src/lib/cheques-alert.ts \
  '    notaRecordatorios = ` (recordatorios fallaron: ${e instanceof Error ? e.message : String(e)})`;' \
  '    throw e;'
probar "los cheques son la plata"; restaurar

# ── F · `destino` lo decide el servidor ─────────────────────────────────────
echo "28. el destino se lee del CUERPO, o sea del navegador"
mutar src/lib/recordatorios/recordatorio.ts \
  '  if (!ROLES_QUE_ELIGEN_DESTINO.includes(rol)) return "equipo";
  return esDestino(pedido) ? pedido : "equipo";' \
  '  return esDestino(pedido) ? pedido : "equipo";'
probar "el destino lo decide el rol"; restaurar

echo "29. ante la duda, el destino cae en PRIVADO"
mutar src/lib/recordatorios/recordatorio.ts \
  '  return esDestino(pedido) ? pedido : "equipo";' \
  '  return esDestino(pedido) ? pedido : "privado";'
probar "ante la duda, equipo"; restaurar

echo "30. la ruta del alta deja de pasarle el rol al lector del cuerpo"
mutar src/app/api/recordatorios/route.ts \
  'leerCuerpo(await req.json().catch(() => ({})), s.role)' \
  'leerCuerpo(await req.json().catch(() => ({})), "admin")'
probar "la ruta pasa el rol de la sesión"; restaurar

# ── G · El aviso de vencido, UNA sola vez ───────────────────────────────────
echo "31. el vencido ya avisado vuelve a sonar"
mutar src/lib/cheques-vencidos-aviso.ts \
  '  if (c.aviso_vencido_en) return false; // ya tuvo su única vez' \
  '  // ya tuvo su única vez'
probar "suena una sola vez"; restaurar

echo "32. la marca se pone ANTES de que Telegram confirme"
mutar src/lib/cheques-alert.ts \
  '  const enviadoGrupo = mensajeGrupo ? await enviarNegocio(mensajeGrupo) : false;' \
  '  const enviadoGrupo = true;
  if (vencidos.length > 0) {
    await supabaseServer
      .from("cheques")
      .update({ aviso_vencido_en: new Date().toISOString() })
      .in("id", vencidos.map((c) => c.id));
  }
  const _enviado = mensajeGrupo ? await enviarNegocio(mensajeGrupo) : false;
  void _enviado;'
probar "se marca DESPUÉS de enviar"; restaurar

echo "33. un cheque rebotado también avisa"
mutar src/lib/cheques-vencidos-aviso.ts \
  '  if (c.estado !== "pendiente") return false; // rebotado y depositado NO avisan' \
  '  if (c.estado === "depositado") return false;'
probar "el rebotado no avisa"; restaurar

echo "34. las acciones del cheque escriben su ruta a mano"
mutar src/app/recordatorios/acciones-cheque.ts \
  '`${ruta}/${id}`' '`/api/cheques/${id}`'
probar "la ruta del cheque sale del registro"; restaurar

# ── CONTROLES · lo que NO debe cazarse ──────────────────────────────────────
echo
echo "═══ CONTROLES (tienen que quedar VERDES) ═══"

echo "C1. se reescribe un comentario del registro de motivos"
mutar src/lib/recordatorios/motivos.ts \
  '/** Los motivos que existen, en el orden en que se ofrecen. Lista CERRADA. */' \
  '/** Lista CERRADA de motivos, en el orden en que se ofrecen. */'
control "comentario reescrito"; restaurar

echo "C2. se cambia el redondeo de una clase de Tailwind que nadie mide"
mutar src/app/recordatorios/components/PuertaRecordar.tsx \
  'className="w-full text-left border border-gray-200 rounded-lg px-4 py-3' \
  'className="w-full text-left border border-gray-200 rounded-xl px-4 py-3'
control "clase suelta"; restaurar

restaurar
echo
echo "═══════════════════════════════════════════════"
echo "  CAZADAS: $CAZADAS   ·   SOBREVIVIERON: $SOBREVIVIERON"
if [ "$FALLO_MUTAR" -gt 0 ]; then
  echo "  ⚠️  $FALLO_MUTAR mutación(es) NO se pudieron aplicar — revísalas"
fi
echo "═══════════════════════════════════════════════"
[ "$SOBREVIVIERON" -eq 0 ] && [ "$FALLO_MUTAR" -eq 0 ]

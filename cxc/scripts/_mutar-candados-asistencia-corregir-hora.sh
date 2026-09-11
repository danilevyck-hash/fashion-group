#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de «Corregir una hora en Asistencia»
# (11-sep-2026): se rompe cada regla a propósito y se comprueba que el test se
# pone ROJO. Dos CONTROLES que NO deben cazarse.
#
# 🔴 Restaura POR COPIA, jamás con `git checkout` (regla de la casa, 9-sep-2026).
#   bash scripts/_mutar-candados-asistencia-corregir-hora.sh
set -u
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/asistencia-corregir-hora.test.ts src/__tests__/components/asistencia-corregir-hora.test.tsx src/__tests__/components/poda-textos-explicaciones.test.tsx src/__tests__/lib/persona-en-el-centro.test.ts src/__tests__/lib/asistencia-siete-pantallas.test.ts"
ARCHIVOS="src/lib/asistencia/motivos-frecuentes.ts src/lib/asistencia/correcciones.ts src/lib/asistencia/correcciones-server.ts src/app/api/asistencia/correcciones/motivos/route.ts src/app/asistencia/CorregirMarcacionModal.tsx src/app/asistencia/ReporteTab.tsx src/app/asistencia/JustificarForm.tsx src/app/asistencia/JustificarDiaModal.tsx src/app/asistencia/JustificacionesDelPeriodo.tsx src/app/asistencia/PlanillaTab.tsx src/app/asistencia/colaboradores/SeccionJustificaciones.tsx"

RESPALDO="$(mktemp -d)"
for f in $ARCHIVOS; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in $ARCHIVOS; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; total=0; controles_ok=0; controles=0
corre() { npx vitest run $TESTS >/dev/null 2>&1; }

muta() { # nombre archivo desde hacia
  local nombre="$1" archivo="$2" desde="$3" hacia="$4"
  total=$((total+1))
  if ! grep -qF -- "$desde" "$archivo"; then echo "⚠️  no encontrado: $nombre"; restaurar; return; fi
  python3 - "$archivo" "$desde" "$hacia" <<'EOF'
import sys; p,a,b=sys.argv[1:4]; s=open(p).read(); open(p,"w").write(s.replace(a,b,1))
EOF
  if corre; then echo "❌ NO cazada: $nombre"; else echo "✅ cazada: $nombre"; cazadas=$((cazadas+1)); fi
  restaurar
}
control() { # nombre archivo desde hacia — NO debe cazarse
  local nombre="$1" archivo="$2" desde="$3" hacia="$4"
  controles=$((controles+1))
  python3 - "$archivo" "$desde" "$hacia" <<'EOF'
import sys; p,a,b=sys.argv[1:4]; s=open(p).read(); open(p,"w").write(s.replace(a,b,1))
EOF
  if corre; then echo "✅ control (verde, como debe): $nombre"; controles_ok=$((controles_ok+1)); else echo "❌ control se puso rojo: $nombre"; fi
  restaurar
}

echo "── línea base"; if corre; then echo "✅ verde"; else echo "❌ la base está roja: no se mide"; exit 1; fi

# 1. La hora
# ⚠️ Con el salto de línea del JSX: el encabezado del archivo también dice
# `type="time" step="1"` en un comentario, y mutar ESO no mutaría nada.
muta "la hora vuelve a texto libre" src/app/asistencia/CorregirMarcacionModal.tsx \
  '                  type="time"
                  step="1"' '                  type="text"
                  step="1"'
muta "el selector pierde los segundos (sin step)" src/app/asistencia/CorregirMarcacionModal.tsx \
  '                  type="time"
                  step="1"' '                  type="time"
                  step="60"'
muta "sin tocar la hora, los segundos del reloj se pierden (:00)" src/lib/asistencia/correcciones.ts \
  'if (reloj && reloj.slice(0, 5) === normalizarHora(v)?.slice(0, 5)) return reloj;' \
  'if (false) return reloj;'
muta "se manda la hora cruda del selector, no la completada" src/app/asistencia/CorregirMarcacionModal.tsx \
  'hora: horaGuardar,' 'hora,'
muta "la precarga recorta a HH:MM" src/app/asistencia/CorregirMarcacionModal.tsx \
  'normalizarHora(marca.relojHora ?? "") ?? ""' '(marca.relojHora ?? "").slice(0, 5)'
muta "vuelve la frase del formato" src/app/asistencia/CorregirMarcacionModal.tsx \
  'placeholder="Escribe el motivo…"' 'placeholder="Escribe el motivo… Como 8:00 o 17:04"'
muta "la línea de arriba pierde lo que marcó el reloj" src/lib/asistencia/correcciones.ts \
  'const reloj = relojHora ? `el reloj marcó ${relojHora}` : "el reloj no registró nada";' \
  'const reloj = "";'
muta "vuelve el recuadro «Esto no se borra nunca»" src/app/asistencia/CorregirMarcacionModal.tsx \
  '<p className="mt-0.5 text-[13px] text-gray-500">' \
  '<p className="mt-0.5 text-[13px] text-gray-500">Esto no se borra nunca. '
muta "el «?» de la pestaña deja de explicar que cuenta para el pago" src/app/asistencia/ReporteTab.tsx \
  'es la que cuenta para el pago, lleva quién la puso' 'lleva quién la puso'
muta "el botón vuelve a decir «Guardar corrección»" src/app/asistencia/CorregirMarcacionModal.tsx \
  '"Guardando…" : "Guardar"}' '"Guardando…" : "Guardar corrección"}'

# 2. El porqué
muta "el porqué deja de ser obligatorio" src/app/asistencia/CorregirMarcacionModal.tsx \
  'const razonOk = motivoValido(motivo);' 'const razonOk = true;'
muta "máximo 5 en vez de 4" src/lib/asistencia/motivos-frecuentes.ts \
  'export const MAX_MOTIVOS_FRECUENTES = 4;' 'export const MAX_MOTIVOS_FRECUENTES = 5;'
muta "con un solo uso ya es frecuente" src/lib/asistencia/motivos-frecuentes.ts \
  'export const MIN_USOS_MOTIVO = 2;' 'export const MIN_USOS_MOTIVO = 1;'
muta "la ventana pasa a un año" src/lib/asistencia/motivos-frecuentes.ts \
  'export const VENTANA_MOTIVOS_DIAS = 90;' 'export const VENTANA_MOTIVOS_DIAS = 365;'
muta "lo viejo no sale solo (se ignora la ventana)" src/lib/asistencia/motivos-frecuentes.ts \
  'if (!dia || dia < desde) continue;' 'if (!dia) continue;'
muta "la clave deja de quitar acentos" src/lib/asistencia/motivos-frecuentes.ts \
  '.replace(/[̀-ͯ]/g, "")' ''
muta "se muestra la grafía más VIEJA" src/lib/asistencia/motivos-frecuentes.ts \
  'if (f.creadaEn > g.ultimo) {' 'if (f.creadaEn < g.ultimo) {'
muta "el orden ya no es por uso" src/lib/asistencia/motivos-frecuentes.ts \
  '.sort((a, b) => b.usos - a.usos || b.ultimo.localeCompare(a.ultimo))' \
  '.sort((a, b) => b.ultimo.localeCompare(a.ultimo))'
muta "tocar un botón ya no escribe en el campo" src/app/asistencia/CorregirMarcacionModal.tsx \
  'onClick={() => setMotivo(m)}' 'onClick={() => {}}'
muta "una lista de motivos escrita a mano" src/app/asistencia/CorregirMarcacionModal.tsx \
  'const [frecuentes, setFrecuentes] = useState<string[]>([]);' \
  'const [frecuentes, setFrecuentes] = useState<string[]>(["Se le olvidó marcar", "Reloj sin internet"]);'
muta "la ruta deja de ser solo lectura (escribe)" src/lib/asistencia/correcciones-server.ts \
  '.select("motivo, creada_en")' '.upsert({}).select("motivo, creada_en")'
muta "la ruta se abre sin permiso" src/app/api/asistencia/correcciones/motivos/route.ts \
  'if (auth instanceof NextResponse) return auth;' ''

# 3. Justificar
muta "«Justificar» se va de la fila" src/app/asistencia/ReporteTab.tsx \
  '{seJustifica && enlaceJustificar}
            </td>' '</td>'
muta "«Justificar» sale también en el feriado y en el día ya justificado" src/app/asistencia/ReporteTab.tsx \
  'const seJustifica = !d.feriado && !d.vacacion && !d.justificado;' 'const seJustifica = true;'
muta "la ventana abre con HOY en vez de ESE día" src/app/asistencia/JustificarDiaModal.tsx \
  'desdeInicial={dia.fecha}' 'desdeInicial={new Date().toISOString().slice(0, 10)}'
muta "el formulario POSTea a otra ruta" src/app/asistencia/JustificarForm.tsx \
  '"/api/asistencia/justificaciones"' '"/api/asistencia/justificar"'
muta "la sección de la ficha arma su propio formulario (segundo POST)" src/app/asistencia/colaboradores/SeccionJustificaciones.tsx \
  'import JustificarForm from "../JustificarForm";' \
  'import JustificarForm from "../JustificarForm"; const _x = () => fetch("/api/asistencia/justificaciones", { method: "POST" });'
muta "al guardar no se refresca la pestaña" src/app/asistencia/ReporteTab.tsx \
  'onGuardado={() => { setRefrescoJustificaciones((n) => n + 1); void cargar(); }}' \
  'onGuardado={() => {}}'
muta "la lista del período no se vuelve a leer" src/app/asistencia/JustificacionesDelPeriodo.tsx \
  'useEffect(() => { void leer(); }, [leer, refresco]);' 'useEffect(() => { void leer(); }, [leer]);'

# 4. Horarios
muta "el aviso vuelve a mandar a Horarios" src/app/asistencia/ReporteTab.tsx \
  'se confirma {dondeSeCargaLaFicha()}, en <b>{PESTANA_FICHAS}</b>.' 'revísalo en <b>Horarios</b>.'
muta "el aviso de Planilla vuelve a mandar a Horarios" src/app/asistencia/PlanillaTab.tsx \
  'Se confirma {dondeSeCargaLaFicha()}, en <b>{PESTANA_FICHAS}</b>.' 'Revísalo en <b>Horarios</b>.'

# CONTROLES — no deben cazarse
control "el color del botón activo" src/app/asistencia/CorregirMarcacionModal.tsx \
  '"border-black bg-black text-white"' '"border-gray-900 bg-gray-900 text-white"'
control "el límite de lectura de la ruta" src/lib/asistencia/correcciones-server.ts \
  '.limit(1000);' '.limit(2000);'

echo
echo "── $cazadas de $total mutaciones cazadas · $controles_ok de $controles controles en verde"

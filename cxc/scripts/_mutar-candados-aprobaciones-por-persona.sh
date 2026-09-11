#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de «Aprobaciones por persona»
# (10-sep-2026): se rompe cada regla a propósito y se comprueba que el test
# se pone ROJO. Dos CONTROLES que NO deben cazarse.
#
# 🔴 Restaura POR COPIA, jamás con `git checkout` (regla de la casa, 9-sep-2026).
#   bash scripts/_mutar-candados-aprobaciones-por-persona.sh
set -u
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/aprobaciones-por-persona.test.ts src/__tests__/components/aprobaciones-por-persona.test.tsx src/__tests__/components/asistencia-aprobaciones-pantalla.test.tsx src/__tests__/components/aprobaciones-optimista.test.tsx src/__tests__/components/planilla-aviso-lleva-a-aprobaciones.test.tsx src/__tests__/lib/aprobaciones-excel.test.ts src/__tests__/lib/planilla-aviso-extras-sin-aprobar.test.ts"
ARCHIVOS="src/lib/asistencia/aprobaciones.ts src/lib/asistencia/aprobaciones-vistas.ts src/lib/asistencia/planilla.ts src/lib/asistencia/cobra-horas-extra.ts src/lib/asistencia/aprobaciones-server.ts src/lib/asistencia/aprobaciones-excel.ts src/lib/asistencia/ficha-persona.ts src/app/asistencia/AprobacionesTab.tsx src/app/asistencia/aprobaciones/PorColaborador.tsx src/app/asistencia/aprobaciones/BotonesSiNo.tsx src/app/asistencia/aprobaciones/YaDecididas.tsx"

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

muta "un 'no' vuelve a contar como pendiente (aviso y freno)" src/lib/asistencia/planilla.ts \
  'const decididoNo = aprob?.clavesNo?.has(`${aprob.codigo}|${d.fecha}`) === true;' \
  'const decididoNo = false;'
muta "un 'no' se paga" src/lib/asistencia/planilla.ts \
  '!aprob?.exigir || aprob.claves.has(`${aprob.codigo}|${d.fecha}`);' \
  '!aprob?.exigir || aprob.claves.has(`${aprob.codigo}|${d.fecha}`) || aprob?.clavesNo?.has(`${aprob.codigo}|${d.fecha}`) === true;'
muta "cobra_horas_extra=false sigue pagando recargo" src/lib/asistencia/planilla.ts \
  'const noCobraExtra = ficha.cobraHorasExtra === false;' \
  'const noCobraExtra = false;'
muta "cobra_horas_extra=false apaga también la tardanza" src/lib/asistencia/planilla.ts \
  '    : sinRecargos
      ? sinHorasExtra(horas)' \
  '    : sinRecargos
      ? { ...sinHorasExtra(horas), tardanzaMin: 0 }'
muta "quien no cobra extra se sigue ofreciendo en Aprobaciones" src/lib/asistencia/aprobaciones.ts \
  'if (l.cobraHorasExtra === false) continue;' \
  'if (false) continue;'
muta "decisionDe ignora el 'no'" src/lib/asistencia/aprobaciones.ts \
  'if (a.decision === "si" || a.decision === "no") return a.decision;' \
  'if (a.decision === "si") return a.decision;'
muta "el default de la casilla pasa a NO cobrar" src/lib/asistencia/cobra-horas-extra.ts \
  'return !(v === false || v === "false" || v === 0 || v === "0");' \
  'return v === true;'
muta "por colaborador: un 'no' vuelve a ser pendiente" src/lib/asistencia/aprobaciones-vistas.ts \
  'if (dd.decision === null) {' \
  'if (dd.decision !== "si") {'
muta "por día: se dibuja también lo decidido" src/lib/asistencia/aprobaciones-vistas.ts \
  'const gente = d.gente.filter((g) => decisionDe(g) === null);' \
  'const gente = d.gente;'
muta "la persona manda TODOS sus días, no solo los pendientes" src/app/asistencia/aprobaciones/PorColaborador.tsx \
  'onDecidir={(dec) => onDecidir(toquesDePersona(p, true), dec)}' \
  'onDecidir={(dec) => onDecidir(toquesDePersona(p, false), dec)}'
muta "el botón No manda 'si'" src/app/asistencia/aprobaciones/BotonesSiNo.tsx \
  'onClick={() => onDecidir(prendido ? null : valor)}' \
  'onClick={() => onDecidir(prendido ? null : "si")}'
muta "volver a tocar el prendido no lo deja pendiente" src/app/asistencia/aprobaciones/BotonesSiNo.tsx \
  'onClick={() => onDecidir(prendido ? null : valor)}' \
  'onClick={() => onDecidir(valor)}'
muta "la vista por defecto pasa a Día" src/lib/asistencia/aprobaciones-vistas.ts \
  'return v === "dia" ? "dia" : "colaborador";' \
  'return v === "colaborador" ? "colaborador" : "dia";'
muta "el servidor escribe aprobado=true con un 'no'" src/lib/asistencia/aprobaciones-server.ts \
  '    fecha: d.fecha,
    aprobado: decision === "si",' \
  '    fecha: d.fecha,
    aprobado: decision !== null,'
muta "el servidor LEE un 'no' como 'si'" src/lib/asistencia/aprobaciones-server.ts \
  'f.decision === "si" || f.decision === "no" ? f.decision : f.aprobado === true ? "si" : null;' \
  'f.decision === "si" || f.decision === "no" ? "si" : f.aprobado === true ? "si" : null;'
muta "el Excel dice Pendiente donde hay un No" src/lib/asistencia/aprobaciones-excel.ts \
  'textoDecision(decision),' \
  'textoDecision(decision === "no" ? null : decision),'
muta "la ficha no marca la excepción" src/lib/asistencia/ficha-persona.ts \
  'if (p.cobraHorasExtra === false) {' \
  'if (false) {'
muta "el chip domingo no se dibuja" src/app/asistencia/aprobaciones/BotonesSiNo.tsx \
  'if (tipo === "extra") return null;' \
  'return null;'
muta "«Sí a todo» manda un 'no'" src/app/asistencia/AprobacionesTab.tsx \
  'onClick={() => void decidir(pendientes, "si")}' \
  'onClick={() => void decidir(pendientes, "no")}'

echo "── controles (NO deben cazarse)"
control "un comentario cambia" src/lib/asistencia/aprobaciones-vistas.ts \
  '// LA VISTA — el control de dos opciones, en la URL y recordado' \
  '// LA VISTA — el control de dos opciones (comentario mutado)'
control "el ancho mínimo del botón cambia" src/app/asistencia/aprobaciones/BotonesSiNo.tsx \
  'min-w-[52px]' 'min-w-[56px]'

echo
echo "RESULTADO: $cazadas de $total mutaciones cazadas · $controles_ok de $controles controles en verde"

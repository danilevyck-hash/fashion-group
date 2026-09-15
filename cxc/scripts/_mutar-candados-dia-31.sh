#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado del día 31 (15-sep-2026).
# Cada mutación rompe la regla a propósito; el candado tiene que ponerse ROJO.
# Los CONTROLES son al revés: cambios que NO deben romper nada.
#   bash scripts/_mutar-candados-dia-31.sh
set -u
cd "$(dirname "$0")/.."

CANDADOS="src/__tests__/lib/asistencia-dia-31.test.ts src/__tests__/lib/asistencia-planilla.test.ts src/__tests__/lib/asistencia-planilla-rango.test.ts src/__tests__/lib/planilla-unida-corte-y-cableado.test.ts src/__tests__/components/planilla-elegir-quincena.test.tsx src/__tests__/components/asistencia-planilla-cerrar-quincena.test.tsx"
TMP=$(mktemp -d)
cazadas=0; sueltas=0; controles_ok=0; controles_mal=0

restaurar() { for f in "$@"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
respaldar() { for f in "$@"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done; }

mutar() { # nombre | archivo | viejo | nuevo
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4"
  respaldar "$archivo"
  python3 - "$archivo" "$viejo" "$nuevo" <<'PY'
import sys
a, v, n = sys.argv[1], sys.argv[2], sys.argv[3]
v = v.encode().decode("unicode_escape")
n = n.encode().decode("unicode_escape")
s = open(a).read()
assert v in s, f"no se encontró en {a}: {v[:60]}"
open(a, "w").write(s.replace(v, n))
PY
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  ❌ SUELTA: $nombre"; sueltas=$((sueltas+1))
  else
    echo "  ✅ cazada:  $nombre"; cazadas=$((cazadas+1))
  fi
  restaurar "$archivo"
}

control() { # nombre | archivo | viejo | nuevo  (NO debe romper)
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4"
  respaldar "$archivo"
  python3 - "$archivo" "$viejo" "$nuevo" <<'PY'
import sys
a, v, n = sys.argv[1], sys.argv[2], sys.argv[3]
v = v.encode().decode("unicode_escape")
n = n.encode().decode("unicode_escape")
s = open(a).read()
assert v in s, f"no se encontró en {a}: {v[:60]}"
open(a, "w").write(s.replace(v, n))
PY
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  ✅ control: $nombre (sigue verde, como debe)"; controles_ok=$((controles_ok+1))
  else
    echo "  ❌ CONTROL ROJO: $nombre"; controles_mal=$((controles_mal+1))
  fi
  restaurar "$archivo"
}

D=src/lib/asistencia/dia-31.ts
P=src/lib/asistencia/planilla.ts
C=src/lib/asistencia/corte-quincena.ts
E=src/lib/asistencia/elegir-quincena.ts
R=src/app/api/asistencia/planilla/route.ts
T=src/app/asistencia/PlanillaTab.tsx

echo "── MUTACIONES ──────────────────────────────────────────────"
mutar "la quincena vuelve a terminar el 31" "$P" \
  "const fin = n === 1 ? 15 : ultimoDiaQueSePaga(anio, mes);" \
  "const fin = n === 1 ? 15 : new Date(Date.UTC(anio, mes, 0)).getUTCDate();"
mutar "el tope pasa de 30 a 31" "$D" \
  "export const ULTIMO_DIA_QUE_SE_PAGA = 30;" \
  "export const ULTIMO_DIA_QUE_SE_PAGA = 31;"
mutar "el tope pasa de 30 a 29 (se come un día de sueldo)" "$D" \
  "export const ULTIMO_DIA_QUE_SE_PAGA = 30;" \
  "export const ULTIMO_DIA_QUE_SE_PAGA = 29;"
mutar "el recorte alcanza a febrero (min sin mirar el mes)" "$D" \
  "  return Math.min(ultimoDiaDelMes(anio, mes), ULTIMO_DIA_QUE_SE_PAGA);" \
  "  return ULTIMO_DIA_QUE_SE_PAGA;"
mutar "el 31 deja de medirse (finDeLaMedicion devuelve hasta)" "$D" \
  "  if (!mideUnDiaDeMas(hasta)) return String(hasta ?? \"\");" \
  "  return String(hasta ?? \"\");\n  if (!mideUnDiaDeMas(hasta)) return String(hasta ?? \"\");"
mutar "mideUnDiaDeMas dice que sí en los meses de 30" "$D" \
  "  return dia === ULTIMO_DIA_QUE_SE_PAGA && ultimoDiaDelMes(anio, mes) === 31;" \
  "  return dia === ULTIMO_DIA_QUE_SE_PAGA;"
mutar "la ruta vuelve a leer el reloj hasta el fin del período" "$R" \
  "const hastaReloj = corte ?? finMedicion;" \
  "const hastaReloj = corte ?? q.hasta;"
mutar "la ruta estira también los rangos libres" "$R" \
  "const finMedicion = q.esQuincena ? finDeLaMedicion(q.hasta) : q.hasta;" \
  "const finMedicion = finDeLaMedicion(q.hasta);"
mutar "el ajuste deja el 31 afuera" "$C" \
  "  const fin = finDeLaMedicion(hasta);" \
  "  const fin = hasta;"
mutar "cortar el 30 de agosto deja de valer" "$C" \
  "  return corte >= desde && corte < finDeLaMedicion(hasta);" \
  "  return corte >= desde && corte < hasta;"
mutar "el corte propuesto se mueve del 28 al 27" "$C" \
  "export const CORTE_SUGERIDO: Readonly<Record<1 | 2, number>> = { 1: 13, 2: 28 };" \
  "export const CORTE_SUGERIDO: Readonly<Record<1 | 2, number>> = { 1: 13, 2: 27 };"
mutar "la frase del corte vuelve a nombrar el 30" "$E" \
  "  const hastaMedido = finDeLaMedicion(hasta);" \
  "  const hastaMedido = hasta;"
mutar "el aviso del 31 sale en todos los meses" "$D" \
  "  if (!mideUnDiaDeMas(hasta)) return null;" \
  "  if (false) return null;"
mutar "el aviso del 31 desaparece de la pantalla" "$T" \
  "          {elegido && textoDelDia31(hasta) && (" \
  "          {false && textoDelDia31(hasta) && ("
mutar "planilla.ts se arma su propia cuenta del último día" "$P" \
  'export { ultimoDiaDelMes } from "./dia-31";' \
  'export function ultimoDiaDelMes(anio: number, mes: number): number {\n  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();\n}'
mutar "el aviso de período abierto vuelve a mirar el día que se paga" "$R" \
  "periodoAbierto: avisoPeriodoAbierto(q.desde, finMedicion, hoy, q.esQuincena)," \
  "periodoAbierto: avisoPeriodoAbierto(q.desde, q.hasta, hoy, q.esQuincena),"

mutar "el prorrateo de quien entra a mitad vuelve a pagar el 31" "$P" \
  "const fin = n === 1 ? 15 : ultimoDiaQueSePaga(anio, mes);" \
  "const fin = n === 1 ? 15 : Math.min(ultimoDiaQueSePaga(anio, mes) + 1, 31);"

echo "── CONTROLES (no deben romper nada) ────────────────────────"
control "escribir el 31 con otra grafía (mismo resultado) no rompe nada" "$D" \
  "  return \`\${hasta.slice(0, 8)}\${p2(31)}\`;" \
  "  return \`\${hasta.slice(0, 8)}31\`;"
control "un comentario nuevo en dia-31.ts no mueve nada" "$D" \
  "const p2 = (n: number) => String(n).padStart(2, \"0\");" \
  "// nota de control\nconst p2 = (n: number) => String(n).padStart(2, \"0\");"

echo
echo "cazadas: $cazadas · sueltas: $sueltas · controles ok: $controles_ok · controles rojos: $controles_mal"
rm -rf "$TMP"
[ "$sueltas" -eq 0 ] && [ "$controles_mal" -eq 0 ]

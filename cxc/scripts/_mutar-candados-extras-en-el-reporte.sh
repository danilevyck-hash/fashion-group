#!/bin/bash
# Verificación por MUTACIÓN de «decidir las horas extra desde el Reporte»
# (19-sep-2026). Rompe el código a propósito y comprueba que el candado lo caza.
#   bash scripts/_mutar-candados-extras-en-el-reporte.sh
# No escribe nada en ninguna base.
set -u
cd "$(dirname "$0")/.." || exit 1

MODULO="src/lib/asistencia/extras-decididas.ts"
PANTALLA="src/app/asistencia/ReporteTab.tsx"
CANDADOS="src/__tests__/components/asistencia-extras-en-el-reporte.test.tsx"

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0
respaldo() { cp "$1" "$1.bak-mutacion"; }
restaurar() { for f in "$MODULO" "$PANTALLA"; do [ -f "$f.bak-mutacion" ] && mv "$f.bak-mutacion" "$f"; done; }
trap restaurar EXIT

aplicar() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
if viejo not in s:
    sys.exit(3)
open(f, "w").write(s.replace(viejo, nuevo, 1))
PY
}
mutar() {
  local f="$1" desc="$2"; respaldo "$f"
  aplicar "$f" "$3" "$4" || { echo "  ⚠️  NO SE PUDO APLICAR: $desc"; restaurar; return; }
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  ❌ ESCAPADA: $desc"; ESCAPADAS=$((ESCAPADAS+1))
  else
    echo "  ✅ cazada:   $desc"; CAZADAS=$((CAZADAS+1))
  fi
  restaurar
}
control() {
  local f="$1" desc="$2"; respaldo "$f"
  aplicar "$f" "$3" "$4" || { echo "  ⚠️  NO SE PUDO APLICAR: $desc"; restaurar; return; }
  if npx vitest run $CANDADOS >/dev/null 2>&1; then
    echo "  ✅ control en verde: $desc"; CONTROLES_OK=$((CONTROLES_OK+1))
  else
    echo "  ❌ control ROJO: $desc"; CONTROLES_MAL=$((CONTROLES_MAL+1))
  fi
  restaurar
}

echo "── dónde salen los botones ─────────────────────────────────────────────"
mutar "$MODULO" "se ofrecen aunque no haya hora extra" \
  '  return conExtra && Number.isFinite(extraMin) && extraMin > 0;' \
  '  return conExtra;'
mutar "$MODULO" "se ofrecen a quien NO cobra horas extra" \
  '  return conExtra && Number.isFinite(extraMin) && extraMin > 0;' \
  '  return Number.isFinite(extraMin) && extraMin > 0;'
mutar "$PANTALLA" "cualquiera puede decidir desde la pantalla" \
  '              {puedeDecidirExtra && seDecideEnElReporte(d.extraMin, conExtra) && (' \
  '              {seDecideEnElReporte(d.extraMin, conExtra) && ('
mutar "$PANTALLA" "los botones no se dibujan nunca" \
  '              {puedeDecidirExtra && seDecideEnElReporte(d.extraMin, conExtra) && (' \
  '              {false && ('
mutar "$PANTALLA" "lo ya decidido no llega a la fila (todo se ve pendiente)" \
  '                    decisionExtra={decisionesExtra.get(claveDia(p.codigo, d.fecha)) ?? null}' \
  '                    decisionExtra={null}'

echo "── manda el servidor ───────────────────────────────────────────────────"
mutar "$PANTALLA" "la decisión NO viaja al servidor" \
  '        const res = await fetch(
          `/api/asistencia/aprobaciones${emp ? `?empresa=${encodeURIComponent(emp)}` : ""}`,' \
  '        const res = await fetch(
          `/api/asistencia/no-existe${emp ? `?empresa=${encodeURIComponent(emp)}` : ""}`,'
mutar "$PANTALLA" "se deja de mandar el filtro de empresa" \
  '`/api/asistencia/aprobaciones${emp ? `?empresa=${encodeURIComponent(emp)}` : ""}`' \
  '"/api/asistencia/aprobaciones"'
mutar "$PANTALLA" "los minutos se inventan en vez de mandar los del día" \
  'body: JSON.stringify({ decision, dias: [{ codigo, fecha, minutos }] }),' \
  'body: JSON.stringify({ decision, dias: [{ codigo, fecha, minutos: 0 }] }),'
mutar "$PANTALLA" "volver a tocar el prendido no apaga (manda siempre «si»)" \
  '                    onDecidir={(dec) => onDecidirExtra(codigo, d.fecha, d.extraMin, dec)}' \
  '                    onDecidir={() => onDecidirExtra(codigo, d.fecha, d.extraMin, "si")}'
mutar "$PANTALLA" "un POST fallido NO se revierte: queda pintado" \
  '        setDecisionesExtra((m) => {
          const n = new Map(m);
          if (previo === null) n.delete(clave); else n.set(clave, previo);
          return n;
        });
        toast(' \
  '        toast('
mutar "$PANTALLA" "la pantalla no es optimista: espera al servidor" \
  '      setDecisionesExtra((m) => {
        previo = m.get(clave) ?? null;
        const n = new Map(m);
        if (decision === null) n.delete(clave); else n.set(clave, decision);
        return n;
      });' \
  '      previo = decisionesExtra.get(clave) ?? null;'
mutar "$PANTALLA" "el Reporte rehace la clasificación del día" \
  'const casillas = useMemo(() => casillasDelDia(d), [d]);' \
  'const casillas = useMemo(() => casillasDelDia(d), [d]); const noVa = "clasificarDia";'
mutar "$PANTALLA" "los botones no son los de Aprobaciones" \
  'import { BotonesSiNo } from "./aprobaciones/BotonesSiNo";' \
  'const BotonesSiNo = (_p: Record<string, unknown>) => null;'

echo "── CONTROLES ───────────────────────────────────────────────────────────"
control "$MODULO" "cambiar el texto del título no cambia la conducta" \
  'export const TITULO_DECIDIR_EXTRA =' \
  '/* el rótulo */
export const TITULO_DECIDIR_EXTRA ='
control "$PANTALLA" "un comentario más no rompe nada" \
  '  const decidirExtra = useCallback(' \
  '  /* decide una extra */
  const decidirExtra = useCallback('

echo
echo "═══════════════════════════════════════════════════════════════════════"
echo " Mutaciones cazadas: $CAZADAS · escapadas: $ESCAPADAS"
echo " Controles en verde: $CONTROLES_OK · en rojo: $CONTROLES_MAL"
echo "═══════════════════════════════════════════════════════════════════════"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

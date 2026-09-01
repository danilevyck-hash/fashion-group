#!/usr/bin/env bash
# Verificador de mutaciones de la regla de hora extra (1-sep-2026):
#   · el umbral bajó de 15 a 10 minutos, y es una PUERTA, no un descuento;
#   · el atraso del mismo día YA NO se resta de la extra.
#
# Rompe el cambio a mano —vuelve el 10 a 15, vuelve a restar `tardeMin`, y
# también las formas RARAS de romperlo (restar el umbral, redondear a horas)— y
# exige que algún test falle. Un candado que sobrevive a su propia mutación no
# es un candado.
#
# 🩸 Restaura por COPIA y no con `git checkout`: hay archivos nuevos sin commitear
# en la rama y git aborta el comando entero sin restaurar nada.
# 🩸 El reemplazo es LITERAL con python: el código tiene `?`, `:` y `/`, y con
# `perl -0pi -e 's|A|B|'` cualquier delimitador se des-escapa y se come el
# archivo, dejando un «SOBREVIVIÓ» falso.
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/asistencia-reporte.test.ts
  src/__tests__/lib/asistencia-segundos.test.ts
  src/__tests__/lib/asistencia-config.test.ts
  src/__tests__/lib/asistencia-planilla.test.ts
  src/__tests__/lib/asistencia-vacaciones.test.ts
)
ARCHIVOS=(
  src/lib/asistencia/reporte.ts
  src/lib/asistencia/config.ts
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
echo

# ── 1. El umbral vuelve a 15 ─────────────────────────────────────────────────
mutar src/lib/asistencia/config.ts \
  '  extraMinimoMin: 10,' \
  '  extraMinimoMin: 15,' \
  'el umbral vuelve a los 15 minutos de antes'

# ── 2. La tardanza vuelve a restarse ─────────────────────────────────────────
mutar src/lib/asistencia/reporte.ts \
  'const extraMin = brutoSeg < extraMinimoSeg ? 0 : brutoSeg / 60;' \
  'const extraMin = brutoSeg < extraMinimoSeg ? 0 : Math.max(0, brutoSeg / 60 - tardeMin);' \
  'la tardanza vuelve a comerse la hora extra'

# ── 3. El umbral deja de ser una PUERTA y pasa a ser un descuento ────────────
mutar src/lib/asistencia/reporte.ts \
  'const extraMin = brutoSeg < extraMinimoSeg ? 0 : brutoSeg / 60;' \
  'const extraMin = Math.max(0, (brutoSeg - extraMinimoSeg) / 60);' \
  'el umbral se RESTA en vez de abrir la puerta (25 min pagarían 15)'

# ── 4. La puerta desaparece: se paga desde el primer segundo ─────────────────
mutar src/lib/asistencia/reporte.ts \
  'const extraMin = brutoSeg < extraMinimoSeg ? 0 : brutoSeg / 60;' \
  'const extraMin = brutoSeg / 60;' \
  'no hay mínimo: quedarse 1 minuto ya paga'

# ── 5. La regla de los 60 minutos que Daniel dijo que NO existe ──────────────
mutar src/lib/asistencia/reporte.ts \
  'const extraMin = brutoSeg < extraMinimoSeg ? 0 : brutoSeg / 60;' \
  'const extraMin = brutoSeg < extraMinimoSeg ? 0 : Math.floor(brutoSeg / 3600) * 60;' \
  'alguien redondea a horas cumplidas («nada especial: se paga el tiempo exacto»)'

# ── 6. El umbral se escribe en el motor y deja de leerse de las reglas ───────
mutar src/lib/asistencia/reporte.ts \
  '    const extraMinimoSeg = extraMinimoMin * 60;' \
  '    const extraMinimoSeg = 15 * 60;' \
  'el umbral queda cableado en el motor y la Configuración no lo mueve'

# ── 7. El umbral en minutos se compara contra minutos redondeados ────────────
mutar src/lib/asistencia/reporte.ts \
  'const extraMin = brutoSeg < extraMinimoSeg ? 0 : brutoSeg / 60;' \
  'const extraMin = Math.round(brutoSeg / 60) < extraMinimoMin ? 0 : brutoSeg / 60;' \
  'la puerta se mide en minutos redondeados (09:59 se convierte en 10 y pasa)'

# 🩸 CONTROL que a propósito NO matchea: si no sale ⛔, el denunciador está roto
# y todos los ✅ valen lo mismo que un barrido vacío.
mutar src/lib/asistencia/reporte.ts \
  'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO' 'x' \
  'CONTROL — debe salir ⛔ NO MUTÓ'

echo
echo "cazadas: $CAZ · sobrevivieron: $SOB · no-op/muertas: $NOOP  (1 no-op es el CONTROL)"

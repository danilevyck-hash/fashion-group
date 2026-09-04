#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «Aplicar quincena pregunta la FECHA DE PAGO» cazan de
# verdad? Se rompe el código a propósito, una cosa por vez, y se exige que los
# tests se pongan ROJOS.
#
# Las tres mutaciones que el brief exige cazar:
#   · usar la fecha de HOY en vez de la elegida
#   · aplicar a quien YA tiene el descuento de esa quincena
#   · el atajo de fin de mes equivocado en febrero
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
#
#   bash scripts/_mutar-prestamos-quincena-fecha.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/api/prestamos-aplicar-quincena-fecha.test.ts \
src/__tests__/components/prestamos-aplicar-quincena-pantalla.test.tsx"

ARCHIVOS=(
  "src/lib/prestamos-quincena.ts"
  "src/app/api/prestamos/aplicar-quincena/route.ts"
  "src/app/prestamos/components/AplicarQuincenaModal.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

RUTA="src/app/api/prestamos/aplicar-quincena/route.ts"
LIB="src/lib/prestamos-quincena.ts"
MODAL="src/app/prestamos/components/AplicarQuincenaModal.tsx"

echo "── mutando ──────────────────────────────────────────────────────────────"

# 1. 🔴 LA DEL BRIEF: el endpoint vuelve a usar la fecha de HOY.
mutar "$RUTA" \
  'const fecha = esFechaISO(fechaElegida) ? fechaElegida : getQuincenaRangePanama().fecha;' \
  'const fecha = getQuincenaRangePanama().fecha;' \
  "route: la fecha de hoy en vez de la elegida"

# 2. La quincena del dedup vuelve a derivarse de HOY (doble cobro al registrar tarde).
mutar "$RUTA" \
  'const { start, end } = quincenaDeFecha(fecha);' \
  'const { start, end } = getQuincenaRangePanama();' \
  "route: el dedup mira la quincena de hoy, no la de la fecha elegida"

# 3. La validación deja pasar cualquier cosa a la RPC.
mutar "$RUTA" \
  'if (fechaElegida !== undefined && fechaElegida !== null && !esFechaISO(fechaElegida)) {' \
  'if (false) {' \
  "route: una fecha inválida ya no se rechaza"

# 4. 🔴 LA DEL BRIEF: se aplica también a quien YA tiene el descuento.
mutar "$LIB" \
  'if (p.fechasPagos.some((f) => f >= tolStart && f <= tolEnd)) { yaTienen.push(p.nombre); continue; }' \
  'if (false) { yaTienen.push(p.nombre); continue; }' \
  "resumen: aplica a quien ya tiene el descuento de esa quincena"

# 5. El resumen deja de mirar la quincena de la fecha ELEGIDA.
mutar "$LIB" \
  '  const q = quincenaDeFecha(fechaPago);
  const tolStart = q.start;' \
  '  const q = quincenaDeFecha(fechaPago);
  const tolStart = sumarDias(q.start, -QUINCENA_TOLERANCIA_DIAS);' \
  "resumen: la tolerancia al inicio vuelve (el pago del 15 bloquea el lote)"

# 6. La tolerancia al final desaparece (un registro drifteado se cobraría dos veces).
mutar "$LIB" \
  'const tolEnd = sumarDias(q.end, QUINCENA_TOLERANCIA_DIAS);' \
  'const tolEnd = q.end;' \
  "resumen: se pierde la tolerancia de +3 días al final"

# 7. El monto deja de capearse al saldo en la última cuota.
mutar "$LIB" \
  'const monto = Math.min(p.deduccion, p.saldo);' \
  'const monto = p.deduccion;' \
  "resumen: la última cuota ya no se ajusta al saldo"

# 8. El saldo en 0 también entra al lote.
mutar "$LIB" \
  'if (p.saldo <= 0) { sinSaldo.push(p.nombre); continue; }' \
  'if (p.saldo < 0) { sinSaldo.push(p.nombre); continue; }' \
  "resumen: saldo 0 ya no se omite"

# 9. 🔴 LA DEL BRIEF: el atajo de fin de mes se equivoca en febrero (mes fijo de 30).
mutar "$LIB" \
  '    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    candidatos.push(ymd(yy, mm - 1, 15), ymd(yy, mm - 1, lastDay));' \
  '    const lastDay = 30;
    candidatos.push(ymd(yy, mm - 1, 15), ymd(yy, mm - 1, lastDay));' \
  "atajos: fin de mes fijo en 30 (febrero daría 30-feb)"

# 10. Los atajos proponen fechas FUTURAS (el 30 de sep el 1-sep).
mutar "$LIB" \
  '    .filter((f) => f <= hoy)' \
  '    .filter(() => true)' \
  "atajos: propone el pago que TODAVÍA no pasó"

# 11. quincenaDeFecha corta la primera quincena en el 14.
mutar "$LIB" \
  '  return d <= 15
    ? { start: ymd(y, m - 1, 1), end: ymd(y, m - 1, 15) }' \
  '  return d <= 14
    ? { start: ymd(y, m - 1, 1), end: ymd(y, m - 1, 15) }' \
  "quincenaDeFecha: el 15 cae en la quincena equivocada"

# 12. quincenaDeFecha usa 30 fijo como fin de mes.
mutar "$LIB" \
  '  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= 15' \
  '  const lastDay = 30;
  return d <= 15' \
  "quincenaDeFecha: fin de mes fijo en 30"

# 13. esFechaISO acepta el 30 de febrero.
mutar "$LIB" \
  '  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();' \
  '  return d <= 31;' \
  "esFechaISO: acepta fechas que no existen"

# 14. El diálogo manda la fecha de hoy en vez de la elegida.
mutar "$MODAL" \
  'onClick={() => fechaValida && onAplicar(fecha)}' \
  'onClick={() => fechaValida && onAplicar(hoyYmd)}' \
  "modal: aplica con hoy aunque se haya elegido otra fecha"

# 15. El aviso de «ya tienen» desaparece de la pantalla.
mutar "$MODAL" \
  '{resumen && resumen.yaTienen.length > 0 && (' \
  '{resumen && resumen.yaTienen.length > 99 && (' \
  "modal: ya no se dice quién ya tiene el descuento"

# 16. El botón cuenta a TODOS, duplicados incluidos.
mutar "$MODAL" \
  'const n = resumen?.elegibles.length ?? 0;' \
  'const n = personas.length;' \
  "modal: el conteo del botón incluye a quien ya tiene"

# 17. El botón queda vivo aunque no haya a quién aplicar.
mutar "$MODAL" \
  'disabled={aplicando || !fechaValida || n === 0}' \
  'disabled={aplicando || !fechaValida}' \
  "modal: se puede aplicar a 0 personas"

echo "─────────────────────────────────────────────────────────────────────────"
echo "cazadas: $cazadas · sobrevivientes: $sobrevivientes"
[ "$sobrevivientes" -eq 0 ]

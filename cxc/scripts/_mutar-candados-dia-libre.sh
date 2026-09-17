#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «Día libre de la empresa» (17-sep-2026):
#   `src/__tests__/lib/dia-libre-empresa.test.ts`.
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/dia-libre-empresa.ts
MOTIVOS=src/lib/asistencia/motivos.ts
ROLES=src/lib/asistencia/roles.ts

TESTS=(
  src/__tests__/lib/dia-libre-empresa.test.ts
)

ARCHIVOS=("$REGLA" "$MOTIVOS" "$ROLES")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | grep -qE "Test Files" && ! echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. la deuda deja de ser de 8 horas =="
mutar "$REGLA" 'export const HORAS_DEL_DIA_LIBRE = 8;' 'export const HORAS_DEL_DIA_LIBRE = 4;' \
&& probar 'el día libre deja debiendo la mitad'

echo "== 2. sin rata la deuda vale CERO en vez de null =="
mutar "$REGLA" '  if (typeof rataHora !== "number" || !Number.isFinite(rataHora) || rataHora <= 0) return null;' \
  '  if (typeof rataHora !== "number" || !Number.isFinite(rataHora) || rataHora <= 0) return 0;' \
&& probar 'un cero se leería como «no debe nada»'

echo "== 3. 🔴 EL TOPE PASA A SER EL NETO: la deuda sale del sueldo =="
mutar "$REGLA" '  const pagado = centavos(Math.min(debe, extra));' '  const pagado = centavos(Math.min(debe, Math.max(extra, num(d.netoPagar))));' \
&& probar 'sin horas extra igual se le descuenta del sueldo'

echo "== 4. la deuda NO arrastra: lo que no se pagó se perdona =="
mutar "$REGLA" '    diaLibre: { saldoAntes: debe, pagado, queda: centavos(debe - pagado), consumido },' \
  '    diaLibre: { saldoAntes: debe, pagado, queda: 0, consumido },' \
&& probar 'lo que faltaba deja de deberse'

echo "== 5. el bruto no baja: se cobra sin bajar el bruto =="
mutar "$REGLA" '  dinero.totalBruto = centavos(d.totalBruto - pagado);' '  dinero.totalBruto = centavos(d.totalBruto);' \
&& probar 'el seguro se seguiría calculando sobre plata que no cobró'

echo "== 6. el domingo y el feriado dejan de pagar la deuda =="
mutar "$REGLA" '  "extraDiurno", "extraNocturno", "excedente", "domingos", "feriados",' \
  '  "extraDiurno", "extraNocturno", "excedente",' \
&& probar 'dos de las cinco columnas del extra quedan afuera'

echo "== 7. el saldo puede quedar en NEGATIVO =="
mutar "$REGLA" '    s.queda = centavos(Math.max(0, s.debia - s.pagado));' '    s.queda = centavos(s.debia - s.pagado);' \
&& probar 'un pago de más se vuelve una deuda al revés'

echo "== 8. sin deuda la línea ya NO vuelve igual =="
mutar "$REGLA" '  if (!d || debe <= 0) return linea;' '  if (!d) return linea;' \
&& probar 'con saldo 0 la línea se rearma (las 46 se moverían)'

echo "== 9. los días del rango dejan de mirar si son hábiles =="
mutar "$REGLA" '    if (esHabil(iso)) out.push(iso);' '    out.push(iso);' \
&& probar 'un domingo adentro del rango genera deuda'

echo "== 10. el motivo se reconoce POR PARECIDO =="
mutar "$MOTIVOS" '  return motivo.trim() === MOTIVO_DIA_LIBRE_EMPRESA;' \
  '  return motivo.trim().toLowerCase().includes("día libre");' \
&& probar 'un motivo escrito a mano parecido crearía una deuda'

echo "== 11. el día libre se lee como una AUSENCIA =="
mutar "$MOTIVOS" '  if (esDiaLibreDeLaEmpresa(motivo)) return "Día libre de la empresa (queda debiendo 8 horas)";' \
  '  if (esDiaLibreDeLaEmpresa(motivo) && false) return "Día libre de la empresa (queda debiendo 8 horas)";' \
&& probar 'el renglón del día vuelve a decir «Ausencia justificada»'

echo "== 12. su nota es la MISMA que la del compensatorio =="
mutar "$MOTIVOS" '  if (esDiaLibreDeLaEmpresa(motivo)) return TEXTO_DIA_LIBRE_EMPRESA;' \
  '  if (esDiaLibreDeLaEmpresa(motivo)) return TEXTO_DIA_COMPENSATORIO;' \
&& probar 'los dos motivos se leen igual y alguien elige el equivocado'

echo "== 13. la secretaria puede cargar un día libre =="
mutar "$ROLES" '  const noFirmanPagos = new Set<string>(MIRAN_PERO_NO_CIERRAN);
  return asistenciaRoles().filter((r) => !noFirmanPagos.has(r));' \
  '  return asistenciaRoles();' \
&& probar 'quien mira pero no firma pagos crea deudas'

echo "== 14. el error que no nombra la tabla se lee como «falta la migración» =="
mutar "$REGLA" '  if (!TABLAS_DIA_LIBRE.some((t) => texto.includes(t))) return false;' \
  '  if (!TABLAS_DIA_LIBRE.some((t) => texto.includes(t))) return true;' \
&& probar 'un permiso denegado esconde la deuda en silencio'

echo "== 15. la celda deja de decir lo que quedó debiendo =="
mutar "$REGLA" '  const cola = dl.queda > 0
    ? `le quedan debiendo ${plata(dl.queda)}`
    : "queda al día";' \
  '  const cola = "queda al día";' \
&& probar 'la columna del extra baja sin decir cuánto falta'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '// EL COBRO — SOLO CON HORAS EXTRA' '// EL COBRO — SOLO CON HORAS EXTRA.' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. dos redondeos independientes cambian de orden (misma cuenta) =="
mutar "$REGLA" '    s.debia = centavos(s.debia);
    s.pagado = centavos(s.pagado);' '    s.pagado = centavos(s.pagado);
    s.debia = centavos(s.debia);' \
&& controlar 'orden de dos líneas sin dependencia entre sí'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

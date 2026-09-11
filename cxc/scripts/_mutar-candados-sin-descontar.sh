#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de «no descontar el préstamo esta
# quincena» (11-sep-2026, migración 20261115120000).
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

PURO=src/lib/asistencia/casilla-sin-descontar.ts
PP=src/lib/asistencia/prestamos-planilla.ts
CIERRE=src/lib/asistencia/cierre-prestamo.ts
ANTES=src/lib/asistencia/antes-de-cerrar.ts
SERVER=src/lib/asistencia/planilla-server.ts
PLANILLA=src/lib/asistencia/planilla.ts
MIG=supabase/migrations/20261115120000_planilla_manual_prestamo_nullable.sql
PANTALLA=src/app/asistencia/PlanillaTab.tsx

TESTS=(
  src/__tests__/lib/planilla-sin-descontar.test.ts
  src/__tests__/api/planilla-manual-cero-route.test.ts
  src/__tests__/lib/asistencia-prestamo-planilla.test.ts
  src/__tests__/lib/planilla-unida-cierre-prestamo.test.ts
  src/__tests__/lib/asistencia-planilla.test.ts
)

ARCHIVOS=("$PURO" "$PP" "$CIERRE" "$ANTES" "$SERVER" "$PLANILLA" "$MIG" "$PANTALLA")

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

echo "== 1. el 0 vuelve a ser «vacía» =="
mutar "$PURO" '  if (Math.round(x * 100) === 0) return "sin-descontar";' '  if (Math.round(x * 100) === 0) return "vacia";' \
&& probar 'estadoCasilla(0) = vacia'

echo "== 2. un negativo se vuelve «no descontar» =="
mutar "$PURO" '  if (x === null || x < 0) return "vacia";
  if (Math.round(x * 100) === 0) return "sin-descontar";' '  if (x === null) return "vacia";
  if (Math.round(x * 100) <= 0) return "sin-descontar";' \
&& probar 'estadoCasilla(-3) = sin-descontar'

echo "== 3. lo tecleado vacío se guarda como 0 =="
mutar "$PURO" '    if (x === null || x < 0) return null;
    return Math.round(x * 100) === 0 ? 0 : x;' '    if (x === null || x < 0) return 0;
    return Math.round(x * 100) === 0 ? 0 : x;' \
&& probar 'valorTecleado("prestamo", "") = 0'

echo "== 4. el «0» tecleado se guarda como null =="
mutar "$PURO" '    return Math.round(x * 100) === 0 ? 0 : x;' '    return Math.round(x * 100) === 0 ? null : x;' \
&& probar 'valorTecleado("prestamo", "0") = null'

echo "== 5. con 0 escrito entra la cuota igual =="
mutar "$PP" '  if (estadoCasilla(enCasilla) !== "vacia") return 0;' '  if (estadoCasilla(enCasilla) === "escrita") return 0;' \
&& probar 'casillaAutomatica(0, 70) = 70'

echo "== 6. la cuota saltada deja de anotarse =="
mutar "$PP" '    estadoCasilla(escrito) === "sin-descontar" ? centavos(Math.max(0, num(propuesto))) : 0;' '    estadoCasilla(escrito) === "nunca" ? centavos(Math.max(0, num(propuesto))) : 0;' \
&& probar 'sinDescontar siempre en 0'

echo "== 7. la lista cuenta los 0 sin cuota que saltar =="
mutar "$PURO" '      if (!(monto > 0)) continue;
      out.push' '      out.push' \
&& probar 'prestamosSinDescontar lista un 0 sin préstamo'

echo "== 8. el cierre lee el 0 como «casilla-en-cero» =="
mutar "$CIERRE" 'estadoCasilla(l.manuales?.[c.campo]) === "sin-descontar"' 'estadoCasilla(l.manuales?.[c.campo]) === "nunca"' \
&& probar 'el cierre confunde la decisión con un olvido'

echo "== 9. el cierre trata mercancía en 0 como «sin-descontar» =="
mutar "$CIERRE" '        if (c.campo !== "mercancia" && estadoCasilla' '        if (estadoCasilla' \
&& probar 'mercancía en 0 = sin-descontar'

echo "== 10. «Antes de cerrar» lo pone en lo que hay que ARREGLAR =="
mutar "$ANTES" '    info.push({ clave: "sin-descontar"' '    arreglar.push({ clave: "sin-descontar"' \
&& probar 'la decisión frena el cierre'

echo "== 11. «Antes de cerrar» pierde el número =="
mutar "$ANTES" 'numero: e.sinDescontar!.length, texto: sinDescontar' 'numero: null, texto: sinDescontar' \
&& probar 'la línea no dice cuántos'

echo "== 12. el servidor lee NULL como 0 =="
mutar "$SERVER" '      prestamo: f.prestamo === null || f.prestamo === undefined ? null : Number(f.prestamo),' '      prestamo: Number(f.prestamo ?? 0),' \
&& probar 'cada casilla vacía se vuelve «no descontar»'

echo "== 13. normalizarManuales vuelve a num() =="
mutar "$PLANILLA" '    prestamo: valorTecleado("prestamo", m?.prestamo),' '    prestamo: num(m?.prestamo),' \
&& probar 'la ruta guarda el vacío como 0'

echo "== 14. MANUALES_CERO vuelve a 0 =="
mutar "$PLANILLA" '  isr: 0, prestamo: null, terceros: null, mercancia: 0, otrosServicios: 0,' '  isr: 0, prestamo: 0, terceros: null, mercancia: 0, otrosServicios: 0,' \
&& probar 'nada escrito = no descontar'

echo "== 15. la migración hace un UPDATE amplio =="
mutar "$MIG" 'UPDATE asistencia_planilla_manual SET prestamo = NULL WHERE prestamo = 0;' 'UPDATE asistencia_planilla_manual SET prestamo = NULL WHERE prestamo >= 0;' \
&& probar 'el backfill borra montos escritos a mano'

echo "== 16. la migración se olvida de terceros =="
mutar "$MIG" '  ALTER COLUMN terceros DROP NOT NULL,
  ALTER COLUMN terceros DROP DEFAULT;' '  ALTER COLUMN prestamo DROP DEFAULT;' \
&& probar 'terceros sigue NOT NULL'

echo "== 17. la pantalla guarda con «n > 0 ? n : 0» =="
mutar "$PANTALLA" '      const limpio = valorTecleado(campo, valor);' '      const n = Number(String(valor).replace(",", "."));
      const limpio = Number.isFinite(n) && n > 0 ? n : 0;' \
&& probar 'el 0 tecleado no llega al servidor'

echo "== 18. la celda deja de decirlo visible =="
mutar "$PANTALLA" '      {sinDescontar && !bloqueada && (' '      {false && (' \
&& probar 'solo el title lo dice'

echo "== 19. CONTROL: cambiar una palabra del title (tiene que quedar VERDE) =="
mutar "$PURO" '  "Escribiste 0: esta quincena no se le descuenta. Borra el 0 para que vuelva la cuota.";' '  "Pusiste 0: esta quincena no se le descuenta. Borra el 0 para que vuelva la cuota.";' \
&& controlar 'redacción del title'

echo "== 20. CONTROL: un patrón que NO existe (tiene que salir ⛔) =="
mutar "$PURO" 'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO' 'x' \
  || echo "  ⛔ (esperado) el denunciador de patrones muertos funciona"

echo
echo "── $cazadas de $total cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde ──"
[ "$cazadas" -eq "$total" ] && [ "$muertas" -eq 0 ] && [ "$controles_ok" -eq "$controles" ]

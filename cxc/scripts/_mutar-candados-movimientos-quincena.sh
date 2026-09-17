#!/usr/bin/env bash
# Verificación por MUTACIÓN de los DOS candados de «Los movimientos de préstamos
# de una quincena» (17-sep-2026):
#   · src/__tests__/lib/prestamos-movimientos-quincena.test.ts   (la regla)
#   · src/__tests__/components/prestamos-movimientos-pantalla.test.tsx (la pantalla)
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/movimientos-quincena.ts
RUTA=src/app/api/asistencia/prestamos-movimientos/route.ts
EXCEL=src/lib/asistencia/movimientos-excel.ts
PESTANA=src/app/asistencia/PrestamosTab.tsx
PANTALLA=src/app/asistencia/MovimientosQuincenaTab.tsx

TESTS=(
  src/__tests__/lib/prestamos-movimientos-quincena.test.ts
  src/__tests__/components/prestamos-movimientos-pantalla.test.tsx
)

ARCHIVOS=("$REGLA" "$RUTA" "$EXCEL" "$PESTANA" "$PANTALLA")

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

echo "== 1. la ventana se corta donde PAGA la quincena: el 31 se pierde =="
mutar "$REGLA" '  return { desde: q.desde, hasta: finDeLaMedicion(q.hasta) };' '  return { desde: q.desde, hasta: q.hasta };' \
&& probar 'los 2 movimientos del 31-mar-2026 no salen en ninguna quincena'

# ⚠️ El peldaño 2 («un CARGO nunca es del cierre») es un CINTURÓN: borrarlo no
# cambia una sola fila, porque el peldaño 3 ya filtra por concepto. Por eso la
# mutación no lo borra: le cambia el bloque que mira, que es lo que sí decide.
echo "== 2. el peldaño mira el bloque equivocado =="
mutar "$REGLA" '  if (bloqueDeMovimiento(m.concepto) === "deuda") return "mano";' '  if (bloqueDeMovimiento(m.concepto) === "descuento") return "mano";' \
&& probar 'ningún descuento vuelve a ser del cierre'

echo "== 3. el amarre con la planilla cerrada deja de mandar =="
mutar "$REGLA" '  if (amarrados?.has(String(m.id))) return "cierre";' '  if (amarrados?.has(String(m.id)) && false) return "cierre";' \
&& probar 'un pago amarrado a una planilla se lee «a mano»'

echo "== 4. un pago sin origen escrito pasa a ser «a mano» =="
mutar "$REGLA" '  if (esDescuentoDeQuincena(m)) return "cierre";' '  if (esDescuentoDeQuincena(m) && String(m.origen_pago ?? "") !== "") return "cierre";' \
&& probar 'las 440 filas viejas (origen NULL) dejan de ser del cierre'

# 🩸 17-sep-2026: la celda decía «a mano · Liquidación» y Daniel lo mandó sacar
# el mismo día. La mutación vuelve a pegarle el origen escrito.
echo "== 5. la celda vuelve a decir de dónde salió el pago =="
mutar "$REGLA" '    origenEtiqueta: etiquetaDeOrigen(origen),' '    origenEtiqueta: `${etiquetaDeOrigen(origen)}${m.origen_pago ? ` · ${m.origen_pago}` : ""}`,' \
&& probar 'el origen_pago se cuela en la columna «Origen»'

echo "== 6. los bloques dejan de derivarse de las listas del saldo =="
mutar "$REGLA" 'const RESTAN = new Set<string>(CONCEPTOS_RESTAN);' 'const RESTAN = new Set<string>(["Pago"]);' \
&& probar 'una segunda lista de conceptos, escrita a mano'

echo "== 7. un concepto desconocido se cuenta por descarte =="
mutar "$REGLA" '  if (SUMAN.has(c)) return "deuda";
  return null;' '  if (SUMAN.has(c)) return "deuda";
  return "descuento";' \
&& probar 'lo que el sistema no sabe leer entra al total de descuentos'

echo "== 8. los que no se pudieron clasificar dejan de contarse =="
mutar "$REGLA" '    else sinClasificar += 1;' '    else sinClasificar += 0;' \
&& probar 'el aviso «no se pudo leer» nunca sale'

echo "== 9. la variación de la deuda se calcula al revés =="
mutar "$REGLA" '      variacion: cent(totalDeudas - totalDescuentos),' '      variacion: cent(totalDescuentos - totalDeudas),' \
&& probar 'la deuda «bajó» cuando en realidad creció'

echo "== 10. el orden se invierte: lo chico arriba =="
mutar "$REGLA" '    b.monto - a.monto' '    a.monto - b.monto' \
&& probar 'el movimiento más grande deja de ir primero'

echo "== 11. el orden es el del array: dos cargas dan dos hojas distintas =="
mutar "$REGLA" '  return [...filas].sort((a, b) =>
    b.monto - a.monto
    || a.fecha.localeCompare(b.fecha)
    || a.nombre.localeCompare(b.nombre)
    || a.id.localeCompare(b.id));' '  return [...filas];' \
&& probar 'se pierde el orden estable'

echo "== 12. medio centavo pasa a ser un cambio de deuda =="
mutar "$REGLA" '  if (Math.abs(variacion) < 0.005) return "La deuda quedó igual";' '  if (variacion === 0) return "La deuda quedó igual";' \
&& probar 'un redondeo de fracción de centavo dice «la deuda creció»'

echo "== 13. la pestaña abre en Movimientos en vez de «Quiénes deben» =="
mutar "$REGLA" '  return String(clave ?? "").trim() === VISTA_MOVIMIENTOS ? VISTA_MOVIMIENTOS : VISTA_DEUDA;' '  return String(clave ?? "").trim() === VISTA_DEUDA ? VISTA_DEUDA : VISTA_MOVIMIENTOS;' \
&& probar 'una clave rara cae en Movimientos'

echo '== 14. la ruta pierde filas: deleted filtrado con .eq =='
mutar "$RUTA" '          .or("deleted.is.null,deleted.eq.false")' '          .eq("deleted", false)' \
&& probar 'el soft delete NULLABLE deja de contemplarse'

echo "== 15. la ruta deja de verificar el total contra un COUNT =="
mutar "$RUTA" 'pedirCount ? { count: "exact" } : {}' '{}' 3 \
&& probar 'db-max-rows = 1000 vuelve a poder cortar en silencio'

echo "== 16. los amarres revertidos vuelven a contar =="
mutar "$RUTA" '          .is("revertido_en", null)' '          .not("id", "is", null)' \
&& probar 'un pago de una planilla REABIERTA sigue diciendo «del cierre»'

echo "== 17. la ruta se autoriza con una lista escrita a mano =="
mutar "$RUTA" '  const auth = requireAsistencia(req, [...PRESTAMOS_PESTANA_ROLES]);' '  const auth = requireAsistencia(req, ["admin", "contabilidad", "secretaria"]);' \
&& probar 'una cuarta lista de roles que nadie obliga a coincidir'

echo "== 18. la ruta acepta cualquier ventana =="
mutar "$RUTA" '    return NextResponse.json({ error: "Elige la quincena que quieres mirar." }, { status: 400 });' '    return NextResponse.json({ error: "Elige la quincena que quieres mirar." });' \
&& probar 'sin fechas válidas ya no contesta 400'

echo "== 19. la pantalla deja de escuchar el selector de empresa =="
mutar "$PESTANA" '        ? <MovimientosQuincenaTab empresa={props.empresa} />' '        ? <MovimientosQuincenaTab />' \
&& probar 'los movimientos se ven de las cuatro empresas, elija lo que elija'

echo "== 20. el Excel vuelve a sumar por su cuenta =="
mutar "$EXCEL" '      Math.abs(resumen.variacion),' '      rows.reduce((a, r) => a + (typeof r[5] === "number" ? r[5] : 0), 0),' \
&& probar 'una segunda cuenta adentro del Excel'

echo "== 21. la pantalla suma ANTES de filtrar por empresa =="
mutar "$PANTALLA" '    () => agruparMovimientos(filtrarPorEmpresa(filas ?? [], props.empresa)),' '    () => agruparMovimientos(filas ?? []),' \
&& probar 'el pie no corresponde a las filas de arriba'

echo "== 22. la pantalla pide la quincena hasta donde PAGA =="
mutar "$PANTALLA" '    const { desde, hasta } = ventanaDeLaQuincena(quincena);
    try {' '    const { desde, hasta } = { desde: quincena.desde, hasta: quincena.hasta };
    try {' \
&& probar 'la ventana pedida deja el 31 afuera'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '// LOS DOS BLOQUES Y EL PIE' '// LOS DOS BLOQUES Y EL PIE.' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. se renombra una variable local (misma conducta) =="
mutar "$REGLA" 'function ordenar(filas: FilaMovimiento[]): FilaMovimiento[] {
  return [...filas].sort((a, b) =>' 'function ordenar(lista: FilaMovimiento[]): FilaMovimiento[] {
  return [...lista].sort((a, b) =>' \
&& controlar 'el parámetro de `ordenar` cambia de nombre'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

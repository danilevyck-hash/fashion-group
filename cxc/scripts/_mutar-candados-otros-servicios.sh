#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «Otros servicios sale de la ficha»
# (15-sep-2026): `src/__tests__/lib/otros-servicios-desde-la-ficha.test.ts`.
#
# Este punto MUEVE PLATA (le SUMA dinero al neto de alguien), así que se rompe
# cada regla a propósito y se comprueba que el candado se pone ROJO. Dos
# CONTROLES quedan en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/otros-servicios.ts
SERVIDOR=src/lib/asistencia/otros-servicios-server.ts
RUTA=src/app/api/asistencia/otros-servicios/route.ts
PLANILLA=src/app/api/asistencia/planilla/route.ts
EXCEL=src/lib/asistencia/planilla-exportar.ts
PAPEL=src/lib/asistencia/comprobante.ts
SECCION=src/app/asistencia/colaboradores/SeccionOtrosServicios.tsx
BACKUP=src/lib/backup/tablas.ts

TESTS=(
  src/__tests__/lib/otros-servicios-desde-la-ficha.test.ts
)

ARCHIVOS=("$REGLA" "$SERVIDOR" "$RUTA" "$PLANILLA" "$EXCEL" "$PAPEL" "$SECCION" "$BACKUP")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

# 🩸 SIN TUBERÍAS PARA MIRAR LA SALIDA: con `set -o pipefail`, un
# `echo "$salida" | grep -q` sobre una salida grande devuelve 141 (grep corta,
# echo se come un SIGPIPE) y una mutación CAZADA se reportaría como muerta.
tiene() { case "$2" in *"$1"*) return 0;; *) return 1;; esac; }
corrio() { tiene "Test Files" "$1"; }
fallo()  { [[ "$1" =~ Tests[[:space:]]+[^$'\n']*failed ]]; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! corrio "$salida"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if fallo "$salida"; then
    echo "  ✅ CAZADA — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if corrio "$salida" && ! fallo "$salida"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. el concepto deja de ser obligatorio =="
mutar "$REGLA" '  if (!concepto) {
    return { ok: false, error: "Escribe el concepto: es lo que explica de dónde salió el monto." };
  }' '' \
&& probar 'se guarda plata sin decir de dónde salió'

echo "== 2. un monto en 0 pasa =="
mutar "$REGLA" '  if (!(monto > 0)) {' '  if (monto < 0) {' \
&& probar 'un renglón de $0 se guarda'

echo "== 3. el botón deja de decir qué falta =="
mutar "$REGLA" '  if (!(monto > 0) && !concepto) return "Falta: el monto y el concepto";' '  if (!(monto > 0) && !concepto) return null;' \
&& probar 'el botón se enciende sin nada escrito'

echo "== 4. la quincena se parte en el día equivocado =="
mutar "$REGLA" '  return `${m[1]}-${m[2]}-${dia <= 15 ? 1 : 2}`;' '  return `${m[1]}-${m[2]}-${dia < 15 ? 1 : 2}`;' \
&& probar 'el 15 cae en la segunda quincena'

echo "== 5. la fecha la elige el cuerpo del pedido =="
mutar "$RUTA" '  const fecha = hoyPanama();' '  const fecha = String((body as { fecha?: unknown }).fecha ?? hoyPanama());' \
&& probar 'se puede anotar en una quincena ya pagada'

echo "== 6. el total NO entra a la casilla =="
mutar "$PLANILLA" '      aplicarOtrosServiciosEnLinea(l, otrosPorCodigo.get(l.codigo) ?? 0));' '      aplicarOtrosServiciosEnLinea(l, 0));' \
&& probar 'la ficha no le suma nada a nadie'

echo "== 7. el total pisa lo escrito a mano =="
mutar "$REGLA" '  if (centavos(num(linea.manuales.otrosServicios)) > 0) return linea;' '' \
&& probar 'lo escrito a mano deja de mandar'

echo "== 8. se suma DOS veces con el sueldo repartido =="
mutar "$REGLA" '  if (linea.parte && !linea.parte.llevaElReloj) return linea;' '' \
&& probar 'Julio Garay cobraría sus $151 en las dos empresas'

echo "== 9. se suma al BRUTO, y entonces paga seguros =="
mutar "$REGLA" '  const dinero: DineroLinea = {
    ...d,
    otrosServicios: centavos(d.otrosServicios + total),
    netoPagar: centavos(d.netoPagar + total),
  };' '  const dinero: DineroLinea = {
    ...d,
    otrosServicios: centavos(d.otrosServicios + total),
    totalBruto: centavos(d.totalBruto + total),
    netoPagar: centavos(d.netoPagar + total),
  };' \
&& probar 'deja de ser un pago que no paga seguros'

echo "== 10. se resta en vez de sumarse =="
mutar "$REGLA" '    netoPagar: centavos(d.netoPagar + total),' '    netoPagar: centavos(d.netoPagar - total),' \
&& probar 'un pago extra se vuelve un descuento'

echo "== 11. la nota del comprobante se pierde =="
mutar "$PAPEL" '      notaOtrosServicios(datos.otrosServicios ?? [])),' '      null),' \
&& probar 'el papel dice $151 y no de dónde salieron'

echo "== 12. el renglón del comprobante cambia de lugar =="
mutar "$PAPEL" '    R("otrosServicios", "OTROS SERVICIOS", v(d?.otrosServicios), "dato", false,
      notaOtrosServicios(datos.otrosServicios ?? [])),
    R("salarioAPagar", "SALARIO A PAGAR", salarioAPagar, "total", false),' '    R("salarioAPagar", "SALARIO A PAGAR", salarioAPagar, "total", false),
    R("otrosServicios", "OTROS SERVICIOS", v(d?.otrosServicios), "dato", false,
      notaOtrosServicios(datos.otrosServicios ?? [])),' \
&& probar 'el papel deja de leerse en el orden de siempre'

echo "== 13. la hoja del Excel nace vacía =="
mutar "$EXCEL" '  if (!renglones.length) return null;' '  if (false) return null;' \
&& probar 'una hoja sin filas, que es una pregunta sin respuesta'

echo "== 14. la línea de «Cómo se calcula» vuelve a mentir =="
mutar "$EXCEL" '      ["ISR, préstamo, terceros y mercancía", "No salen de ningún sistema: los escribe la contable a mano."],' '      ["ISR, préstamo, terceros, mercancía y otros servicios", "No salen de ningún sistema: los escribe la contable a mano."],' \
&& probar 'el Excel dice que otros servicios se escribe a mano'

echo "== 15. el soft delete se vuelve un DELETE =="
mutar "$SERVIDOR" '    .update(
      { deleted: true, deleted_por: opts.usuario, deleted_en: new Date().toISOString() },
      { count: "exact" },
    )' '    .delete()' \
&& probar 'lo que se pagó deja de poder leerse después'

echo "== 16. la quincena cerrada deja de frenar =="
mutar "$RUTA" '    if (await quincenaYaPagada(fila.quincena)) {' '    if (false) {' \
&& probar 'se borra un renglón de una quincena ya pagada'

echo "== 17. el freno mira cualquier cabecera, no solo la cerrada =="
mutar "$RUTA" '    if (cabeceras.some((c) => esCerrada(c.estado) && c.desde === q.desde && c.hasta === q.hasta)) {' '    if (cabeceras.some((c) => c.desde === q.desde && c.hasta === q.hasta)) {' \
&& probar 'un borrador o una reabierta frenan un arreglo legítimo'

echo "== 18. la firma sale del cuerpo =="
mutar "$RUTA" '  const usuario = String(auth.userName ?? "").trim();
  if (!usuario) {
    return NextResponse.json({ error: "La sesión no dice quién eres." }, { status: 400 });
  }

  let body: { codigo?: unknown; monto?: unknown; concepto?: unknown };' '  let body: { codigo?: unknown; monto?: unknown; concepto?: unknown; anotadoPor?: string };
  const usuario = "x";' \
&& probar 'cualquiera puede firmar por otro'

echo "== 19. sin la migración se cae en vez de degradar =="
mutar "$SERVIDOR" '      return { renglones: [], faltaTabla: true };' '      throw e;' \
&& probar 'un DDL sin correr apaga la planilla entera'

echo "== 20. la tabla se queda sin respaldo =="
mutar "$BACKUP" '  "asistencia_otros_servicios",' '' \
&& probar 'plata escrita a mano que no se puede volver a conseguir'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '/** El total de una lista, a centavos. */' '/** La suma de una lista, a centavos. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. el concepto se normaliza en dos pasos (misma conducta) =="
mutar "$REGLA" '  const concepto = String(conceptoRaw ?? "").trim().replace(/\s+/g, " ");' '  const crudo = String(conceptoRaw ?? "").trim();
  const concepto = crudo.replace(/\s+/g, " ");' \
&& controlar 'la misma normalización escrita con una variable'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="

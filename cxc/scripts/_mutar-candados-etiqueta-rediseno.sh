#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del REDISEÑO DE LA ETIQUETA y de la
# BARRA DE ETIQUETAS (18-sep-2026): el rótulo arriba del dato · el destino tan
# grande como el cliente · «CAJA» y su número separados por una raya · la fecha
# en el formato de la casa · las dos pestañas con el mismo acomodo.
#
# Se rompe el producto a propósito, de a una mutación, y se exige que los
# candados se pongan ROJOS. Dos CONTROLES cambian cosas que NO son la regla
# (un comentario y el texto de un placeholder) y tienen que quedarse en VERDE:
# si un control se pone rojo, el candado está atado a la letra y no a la
# conducta.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

PDF=src/lib/guias/pdf-etiquetas.ts
PURO=src/lib/guias/etiquetas.ts
VISTA=src/app/guias/components/EtiquetasView.tsx
PAGINA=src/app/guias/page.tsx

TESTS=(
  src/__tests__/components/guias-etiqueta-rediseno.test.tsx
  src/__tests__/lib/guias-etiquetas.test.ts
  src/__tests__/components/guias-etiquetas-pantalla.test.tsx
)

ARCHIVOS=("$PDF" "$PURO" "$VISTA" "$PAGINA")

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

echo "== 1. el rótulo vuelve a PEGARSE al dato: «Factura 11-000002558» en una línea =="
mutar "$PDF" '  y = bloqueDeCampo(doc, "Factura", String(d.secuencial ?? ""), {' '  y = bloqueDeCampo(doc, "", `Factura ${String(d.secuencial ?? "")}`, {' \
&& probar 'la factura con el rótulo pegado'

echo "== 2. el destino vuelve a «Destino: Paso Canoas» en una sola línea =="
mutar "$PDF" '  bloqueDeCampo(doc, "Destino", String(d.destino ?? "").toUpperCase(), {' '  bloqueDeCampo(doc, "", `Destino: ${String(d.destino ?? "").toUpperCase()}`, {' \
&& probar 'el destino con el rótulo pegado'

echo "== 3. el rótulo se dibuja DEBAJO del dato, no arriba =="
mutar "$PDF" '  doc.text(rotulo, izq, y);

  // El dato: negrita, grande, debajo.' '  doc.text(rotulo, izq, y + salto + salto);

  // El dato: negrita, grande, debajo.' \
&& probar 'el rótulo debajo del dato'

echo "== 4. el destino vuelve a ser más chico que el cliente =="
mutar "$PDF" 'const F_DESTINO = F_CLIENTE;' 'const F_DESTINO = PT(0.022 * HOJA_W);' \
&& probar 'el destino achicado'

echo "== 5. «CAJA» y el número vuelven a ser UNA sola línea =="
mutar "$PURO" 'export function numeroDeCaja(n: number, total: number): string {
  return `${n} de ${total}`;
}' 'export function numeroDeCaja(n: number, total: number): string {
  return `CAJA ${n} de ${total}`;
}' \
&& probar 'el número con el «CAJA» adentro'

echo "== 6. la raya que separa el bloque de la caja desaparece =="
mutar "$PDF" '  doc.line(izq, yRaya, der, yRaya);' '  // (mutación) sin la raya' \
&& probar 'sin la raya del bloque de caja'

echo "== 7. el número de caja deja de ir centrado =="
mutar "$PDF" '  doc.text(numeroDeCaja(caja, d.cajas), centro, yNumero, { align: "center" });' '  doc.text(numeroDeCaja(caja, d.cajas), izq, yNumero);' \
&& probar 'el número pegado a la izquierda'

echo "== 8. el número deja de anclarse al borde de abajo (lo empuja el nombre largo) =="
mutar "$PDF" '  const yNumero = y0 + CUARTO_H - PAD_Y;' '  const yNumero = y + 30;' \
&& probar 'el número siguiendo al destino'

echo "== 9. «CAJA» pasa a dibujarse DEBAJO de su número =="
mutar "$PDF" '  const yRotulo = yNumero - CAJA_ROTULO_SOBRE_NUMERO;' '  const yRotulo = yNumero + CAJA_ROTULO_SOBRE_NUMERO;' \
&& probar 'el rótulo CAJA debajo del número'

echo "== 10. la fecha vuelve al DD-MM-AAAA de máquina =="
mutar "$PURO" '  if (!esFechaCalendario(v)) return "";
  return fmtDate(v);' '  if (!esFechaCalendario(v)) return "";
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;' \
&& probar 'la fecha en formato de máquina'

echo "== 11. la fecha deja de validarse (un «Invalid Date» encima de la caja) =="
mutar "$PURO" '  if (!esFechaCalendario(v)) return "";
  return fmtDate(v);' '  return fmtDate(v);' \
&& probar 'la fecha sin validación'

echo "== 12. el número de caja deja de ser lo más grande del papel =="
mutar "$PDF" 'const F_CAJA = PT(0.056 * HOJA_W);' 'const F_CAJA = PT(0.020 * HOJA_W);' \
&& probar 'el número de caja achicado'

echo "== 13. el cliente y el destino dejan de ir en MAYÚSCULAS =="
mutar "$PDF" '  y = bloqueDeCampo(doc, "Cliente", String(d.cliente_nombre ?? "").toUpperCase(), {' '  y = bloqueDeCampo(doc, "Cliente", String(d.cliente_nombre ?? ""), {' \
&& probar 'el cliente sin mayúsculas'

echo "== 14. 🔴 LA BARRA: el botón negro vuelve a la fila del buscador =="
mutar "$VISTA" '          <div className="flex items-center justify-end mb-4 flex-wrap gap-4">
            <button type="button" onClick={() => setPanel(true)} className={BOTON_NEGRO} disabled={sinTabla}>
              ＋ Etiquetar una factura
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4">' '          <div className="mb-4 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setPanel(true)} className={BOTON_NEGRO} disabled={sinTabla}>
              ＋ Etiquetar una factura
            </button>' \
&& probar 'las cinco cosas otra vez en una fila'

echo "== 15. la fila de acciones deja de ir a la DERECHA (se corre a la izquierda) =="
mutar "$VISTA" '          <div className="flex items-center justify-end mb-4 flex-wrap gap-4">' '          <div className="flex items-center mb-4 flex-wrap gap-4">' \
&& probar 'la fila de acciones sin justify-end'

echo "== 16. el buscador deja de estirarse y de tener el tope de Guías =="
mutar "$VISTA" '              className="flex-1 min-w-[150px] max-w-sm border border-gray-200 rounded-lg px-3 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"' '              className="min-w-[150px] border border-gray-200 rounded-lg px-3 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"' \
&& probar 'el buscador sin flex-1 ni max-w-sm'

echo "== 17. el buscador se encierra en su propia caja y deja de compartir fila con los filtros =="
mutar "$VISTA" '            <input
              type="text"
              value={buscar}
              onChange={(ev) => setBuscar(ev.target.value)}
              placeholder="Buscar factura o cliente"
              aria-label="Buscar factura o cliente"
              className="flex-1 min-w-[150px] max-w-sm border border-gray-200 rounded-lg px-3 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"
            />' '            <div className="flex-1">
              <input
                type="text"
                value={buscar}
                onChange={(ev) => setBuscar(ev.target.value)}
                placeholder="Buscar factura o cliente"
                aria-label="Buscar factura o cliente"
                className="flex-1 min-w-[150px] max-w-sm border border-gray-200 rounded-lg px-3 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"
              />
            </div>' \
&& probar 'el buscador encerrado, lejos de los filtros'

echo "== 18. ⚠️ el ORDEN de las pestañas cambia: Etiquetas de primero =="
mutar "$PAGINA" '    ["guias", "Guías"],
    ...(hayEtiquetas ? ([["etiquetas", "Etiquetas"]] as Array<[Vista, string]>) : []),' '    ...(hayEtiquetas ? ([["etiquetas", "Etiquetas"]] as Array<[Vista, string]>) : []),
    ["guias", "Guías"],' \
&& probar 'Etiquetas de primero'

echo "== 19. los tres datos dejan de compartir el margen izquierdo =="
mutar "$PDF" '  visibles.forEach((l, i) => {
    if (i > 0) y += SALTO_DE_LINEA;
    doc.text(l, izq, y);
  });' '  visibles.forEach((l, i) => {
    if (i > 0) y += SALTO_DE_LINEA;
    doc.text(l, izq + 6, y);
  });' \
&& probar 'el dato corrido del margen del rótulo'

echo "== 20. el contador de pendientes deja de contar =="
mutar "$VISTA" '              Pendientes de guía · {pendientes}' '              Pendientes de guía' \
&& probar 'el chip sin su número'

echo "== CONTROL A. solo cambia un comentario del dibujo =="
mutar "$PDF" '  // La línea debajo del encabezado.' '  // La raya que va bajo el nombre de la empresa.' \
&& controlar 'comentario de la raya del encabezado'

echo "== CONTROL B. el placeholder del buscador cambia de palabras =="
mutar "$VISTA" '              placeholder="Buscar factura o cliente"' '              placeholder="Busca una factura o un cliente"' \
&& controlar 'placeholder del buscador'

echo
echo "RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde"

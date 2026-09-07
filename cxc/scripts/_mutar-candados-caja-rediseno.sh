#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del REDISEÑO DE CAJA MENUDA (7-sep-2026) CAZAN de verdad?
#
# Los 16 cambios que Daniel aprobó uno por uno, sobre un módulo de 3 períodos,
# 77 recibos vivos por $563.28 y una sola persona cargándolos (Angela).
#
#   1  el mismo recibo cargado dos veces — avisa, nunca bloquea
#   2  🩸 el saldo en rojo por una billonésima («−$0.00» con la caja cuadrada)
#   3  «Editar» hace algo en pantalla angosta
#   4  la foto del recibo: opcional, un cuadro, se arrastra o se toca
#   5  cinco caminos retirados (y las columnas que NO se dropean)
#   6/14 la identidad es el CÓDIGO — el gasto no lleva responsable
#   7  el papel dice «A reponer» y el N° de factura por línea
#   8  la fecha fuera del período avisa
#   9  cerrar no abre otro período a ciegas
#   10 un período con gastos no se elimina
#   11 «Alimentación» viene puesta (61% de los recibos)
#   13 abrir un período deja rastro
#   15 la ficha angosta muestra el N° de factura
#   16 textos: «período» con tilde, «reposición», fuera «N días abierto»
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 La restauración va por COPIA, no con `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE encontrar el resumen de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-caja-rediseno.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/caja-dinero-y-repetido.test.ts \
src/__tests__/api/caja-periodo-y-gasto.test.ts \
src/__tests__/lib/caja-columnas-retiradas.test.ts \
src/__tests__/components/caja-pantalla-rediseno.test.tsx \
src/__tests__/components/caja-lista-y-papel.test.tsx \
src/__tests__/components/caja-formulario.test.tsx \
src/__tests__/api/caja-cierre-con-saldo.test.ts \
src/__tests__/ipad-caja-prestamos-cheques.test.ts \
src/__tests__/excel-exports-finanzas.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/caja/dinero.ts"
  "src/lib/caja/gasto-repetido.ts"
  "src/lib/caja/fecha-en-periodo.ts"
  "src/lib/caja/responsable.ts"
  "src/lib/caja/fotos.ts"
  "src/lib/caja/columnas-retiradas.ts"
  "src/lib/caja/abrir-periodo.ts"
  "src/lib/exports/caja-excel.ts"
  "src/app/api/caja/periodos/route.ts"
  "src/app/api/caja/periodos/[id]/route.ts"
  "src/app/api/caja/gastos/route.ts"
  "src/app/api/caja/gastos/[id]/route.ts"
  "src/app/caja/components/NuevoGastoDrawer.tsx"
  "src/app/caja/components/GastoForm.tsx"
  "src/app/caja/components/GastoTable.tsx"
  "src/app/caja/components/FichaGasto.tsx"
  "src/app/caja/components/ZonaFotos.tsx"
  "src/app/caja/components/PeriodoList.tsx"
  "src/app/caja/components/CerrarPeriodoModal.tsx"
  "src/app/caja/components/PrintView.tsx"
  "src/app/caja/components/AvisoSaldoNegativo.tsx"
  "src/app/caja/components/AvisoAntesDeGuardar.tsx"
  "src/app/caja/hooks/useCajaState.ts"
  "supabase/migrations/20261013120000_caja_menuda_rediseno.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ✅ CAZADA (la corrida ni compila) — $1"
    cazadas=$((cazadas + 1)); return
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

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if grep -qE "^ *Tests " <<<"$salida" && [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
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
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

borrar_archivo() { # $1 archivo, $2 nombre
  restaurar
  rm -f "$1"
  probar "$2"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ═══ 2 · La plata se redondea a centavos ANTES de compararse ════════════════

mutar "src/lib/caja/dinero.ts" \
  "  return Math.round(n * 100) / 100 + 0;" \
  "  return n;" \
  "2 · centavos() deja de redondear (vuelve el «−\$0.00» del período Nº2)"

mutar "src/lib/caja/dinero.ts" \
  "  return Math.round(n * 100) / 100 + 0;" \
  "  return Math.round(n * 100) / 100;" \
  "2 · vuelve el «-0», que se imprime «−\$0.00»"

mutar "src/lib/caja/dinero.ts" \
  "  let total = 0;
  for (const v of valores) total += centavos(v);
  return centavos(total);" \
  "  let total = 0;
  for (const v of valores) total += Number(v) || 0;
  return total;" \
  "2 · la suma deja de redondear en cada paso"

mutar "src/lib/caja/dinero.ts" \
  "  return centavos(saldo) < 0;" \
  "  return Number(saldo) < 0;" \
  "2 · saldoEsNegativo compara sin redondear"

mutar "src/lib/caja/dinero.ts" \
  "  return n < 0 ? \`\\u2212\$\${abs}\` : \`\$\${abs}\`;" \
  "  return \`\$\${n.toFixed(2)}\`;" \
  "16 · la plata negativa vuelve a escribirse \$-36.50 en vez de −\$36.50"

mutar "src/lib/caja/dinero.ts" \
  "  return centavos(centavos(fondo) - saldoDelPeriodo(fondo, gastos));" \
  "  return centavos(fondo);" \
  "7 · «a reponer» devuelve el fondo entero en vez de lo gastado"

mutar "src/app/api/caja/periodos/[id]/route.ts" \
  "  const saldo = saldoDelPeriodo(fondo, (gastos || []) as Array<{ total: number | null }>);" \
  "  const saldo = fondo - (gastos || []).reduce((s: number, g: { total: number | null }) => s + (Number(g.total) || 0), 0);" \
  "2 · el cierre guarda el saldo SIN redondear"

# ═══ 1 · El mismo recibo cargado dos veces ══════════════════════════════════

mutar "src/lib/caja/gasto-repetido.ts" \
  "  if (tieneFacturaUtil(a) && tieneFacturaUtil(b)) {
    return facturaNormalizada(a.nro_factura) === facturaNormalizada(b.nro_factura);
  }" \
  "  if (tieneFacturaUtil(a) && tieneFacturaUtil(b)) {
    return true;
  }" \
  "1 · con factura, cualquier par del mismo día se acusa (los 4 de Market Fresh)"

mutar "src/lib/caja/gasto-repetido.ts" \
  "  const mismoDia = String(a.fecha ?? \"\") === String(b.fecha ?? \"\") && !!a.fecha;
  if (!mismoDia) return false;" \
  "  const mismoDia = true;
  if (!mismoDia) return false;" \
  "1 · deja de mirar el día"

mutar "src/lib/caja/gasto-repetido.ts" \
  "  return mismoProveedor && centavos(a.total) === centavos(b.total);" \
  "  return mismoProveedor;" \
  "1 · sin factura, deja de mirar el monto"

mutar "src/lib/caja/gasto-repetido.ts" \
  "  const sinCeros = limpio.replace(/^0+/, \"\");
  return sinCeros;" \
  "  return limpio;" \
  "1 · la factura deja de ignorar los ceros de adelante (y «0» pasa a identificar)"

mutar "src/lib/caja/gasto-repetido.ts" \
  "    if (nuevo.id && g.id && nuevo.id === g.id) continue;" \
  "    if (false) continue;" \
  "1 · un gasto se acusa a sí mismo al editarlo"

mutar "src/lib/caja/gasto-repetido.ts" \
  "    .replace(/\\s+/g, \" \");" \
  "    .replace(/[^a-z]/g, \"\").slice(0, 6);" \
  "1 · el proveedor se parea por PARECIDO («Market Fresh» = «Market Fresch»)"

mutar "src/app/caja/components/NuevoGastoDrawer.tsx" \
  "    if (!opts.skipAvisos) {
      const mensajes = avisosDeEsteGasto();
      if (mensajes.length > 0) {
        setPendingAviso({ mensajes, andNew: opts.andNew });
        return;
      }
    }" \
  "    if (false) { /* sin avisos */ }" \
  "1/8 · la pantalla deja de avisar antes de guardar"

mutar "src/app/caja/components/AvisoAntesDeGuardar.tsx" \
  "            Guardar igual" \
  "            Entendido" \
  "1/8 · el aviso deja de ofrecer «Guardar igual» (pasa a BLOQUEAR)"

# ═══ 8 · La fecha fuera del período ═════════════════════════════════════════

mutar "src/lib/caja/fecha-en-periodo.ts" \
  "  if (ES_FECHA.test(apertura) && f < apertura) return \"antes\";" \
  "  if (false) return \"antes\";" \
  "8 · deja de avisar del recibo anterior a la apertura"

mutar "src/lib/caja/fecha-en-periodo.ts" \
  "  if (ES_FECHA.test(cierre) && f > cierre) return \"despues\";" \
  "  if (ES_FECHA.test(cierre) && f >= cierre) return \"despues\";" \
  "8 · el día del cierre pasa a contar como fuera"

mutar "src/lib/caja/fecha-en-periodo.ts" \
  "  if (!ES_FECHA.test(f)) return null;" \
  "  if (!ES_FECHA.test(f)) return \"antes\";" \
  "8 · opina sin fecha (ante la duda tiene que callar)"

# ═══ 6/14 · La identidad es el CÓDIGO ══════════════════════════════════════

mutar "src/app/api/caja/gastos/route.ts" \
  "      categoria,
      subtotal, itbms: roundedItbms, total: roundedTotal," \
  "      categoria,
      responsable: body.responsable, responsable_id: body.responsable_id,
      subtotal, itbms: roundedItbms, total: roundedTotal," \
  "6 · el gasto vuelve a guardar el responsable"

mutar "src/app/api/caja/gastos/[id]/route.ts" \
  'const ALLOWED_FIELDS = ["fecha", "descripcion", "proveedor", "categoria", "subtotal", "itbms", "total", "nro_factura"];' \
  'const ALLOWED_FIELDS = ["fecha", "descripcion", "proveedor", "categoria", "subtotal", "itbms", "total", "nro_factura", "responsable", "responsable_id"];' \
  "6 · la edición vuelve a escribir el responsable"

mutar "src/lib/caja/responsable.ts" \
  "  const persona = personas.find((p) => codigoNormalizado(p.empleado_codigo) === codigo);
  return { codigo, nombre: persona ? nombreEnPantalla(persona.nombre) : \"\" };" \
  "  const persona = personas.find((p) => codigoNormalizado(p.empleado_codigo) === codigo);
  return { codigo, nombre: persona ? persona.nombre : \"Angela Garcia\" };" \
  "6 · un código desconocido inventa un nombre"

mutar "src/lib/caja/responsable.ts" \
  "  const codigo = codigoNormalizado(periodo?.responsable_empleado_codigo);
  if (!codigo) return null;" \
  "  const codigo = codigoNormalizado(periodo?.responsable_empleado_codigo) || \"7\";" \
  "6 · sin código puesto, se supone que es Angela"

mutar "src/lib/caja/responsable.ts" \
  "  return limpio
    .toLowerCase()
    .split(\" \")" \
  "  return limpio
    .split(\" \")" \
  "6 · el nombre sigue saliendo EN MAYÚSCULAS"

mutar "src/app/api/caja/periodos/route.ts" \
  "    responsableEmpleadoCodigo: responsable," \
  "    responsableEmpleadoCodigo: \"\"," \
  "6 · el período se abre sin guardar a su responsable"

mutar "src/app/caja/components/GastoForm.tsx" \
  "          <Field label=\"Categoría\" required>" \
  "          <Field label=\"Responsable\" required>" \
  "6 · vuelve el campo Responsable al formulario del gasto"

# ═══ 9 · Cerrar no abre otro a ciegas ══════════════════════════════════════

mutar "src/lib/caja/abrir-periodo.ts" \
  "  if (!errorAbierto && abierto?.id) {" \
  "  if (false) {" \
  "9 · el cierre vuelve a encadenar la apertura sin mirar nada"

mutar "src/lib/caja/abrir-periodo.ts" \
  "      motivo: \`Ya hay un período abierto (Nº \${abierto.numero}). La caja lleva un solo ciclo a la vez: ciérralo antes de abrir otro.\`," \
  "      motivo: null," \
  "9 · no se abre otro y NO se dice por qué"

# ═══ 10 · Un período con gastos no se elimina ══════════════════════════════

mutar "src/app/api/caja/periodos/[id]/route.ts" \
  "  if (gastos > 0) {" \
  "  if (false) {" \
  "10 · vuelve a poder borrarse un período con 26 gastos adentro"

mutar "src/app/caja/components/PeriodoList.tsx" \
  'if (p.estado === "cerrado" && role === "admin" && recibosDe(p) === 0) {
                items.push({ label: "Eliminar", onClick: () => onDeletePeriodo(p.id), destructive: true });' \
  'if (p.estado === "cerrado" && role === "admin") {
                items.push({ label: "Eliminar", onClick: () => onDeletePeriodo(p.id), destructive: true });' \
  "10 · la lista vuelve a ofrecer «Eliminar» en un período con gastos"

# ═══ 11 · «Alimentación» viene puesta ══════════════════════════════════════

mutar "src/app/caja/components/NuevoGastoDrawer.tsx" \
  'const CATEGORIA_POR_DEFECTO = "Alimentación";' \
  'const CATEGORIA_POR_DEFECTO = "Transporte";' \
  "11 · vuelve «Transporte» como categoría puesta (13% de los recibos)"

mutar "src/app/caja/components/GastoForm.tsx" \
  "      const match = categorias.find((c) => sinAcentos(c) === sinAcentos(cat));" \
  "      const match = categorias.find((c) => c.toLowerCase() === cat.toLowerCase());" \
  "11 · la regla de «comida» vuelve a compararse CON acentos (no dispara nunca)"

# ═══ 13 · Abrir un período deja rastro ═════════════════════════════════════

mutar "src/lib/caja/abrir-periodo.ts" \
  "  await logActivity(
    opciones?.rol || \"unknown\",
    \"caja_periodo_open\"," \
  "  if (false) await logActivity(
    opciones?.rol || \"unknown\",
    \"caja_periodo_open\"," \
  "13 · abrir un período vuelve a no anotarse en ningún lado"

# ═══ 4 · La foto del recibo ════════════════════════════════════════════════

mutar "src/lib/caja/fotos.ts" \
  "  const vistos = new Set(actuales.map(clave));
  const suma = [...actuales];" \
  "  const vistos = new Set<string>();
  const suma: T[] = [];" \
  "4 · la lista de fotos REEMPLAZA en vez de sumar"

mutar "src/lib/caja/fotos.ts" \
  "    const k = clave(n);
    if (vistos.has(k)) continue;" \
  "    const k = clave(n);
    if (false) continue;" \
  "4 · el mismo archivo entra dos veces"

mutar "src/lib/caja/fotos.ts" \
  "  return actuales.filter((_, i) => i !== indice);" \
  "  return [];" \
  "4 · quitar una foto se lleva todas"

mutar "src/lib/caja/fotos.ts" \
  "  if (!aceptado) {" \
  "  if (false) {" \
  "4 · se acepta cualquier archivo (una planilla como «foto» del recibo)"

mutar "src/app/caja/components/ZonaFotos.tsx" \
  '            {subiendo
              ? "Guardando…"
              : "Arrastra la foto del recibo aquí, o tócalo para elegirla o sacarla. Es opcional."}' \
  '            {subiendo ? "Guardando…" : "Foto del recibo"}' \
  "4 · el cuadro deja de decir que se arrastra y que es opcional"

# ═══ 5 · Lo retirado no vuelve, y no se borra ══════════════════════════════

mutar "supabase/migrations/20261013120000_caja_menuda_rediseno.sql" \
  "comment on column caja_gastos.empresa is" \
  "alter table caja_gastos drop column if exists empresa;
comment on column caja_gastos.factura is" \
  "5 · una migración DROPEA una columna retirada"

mutar "supabase/migrations/20261013120000_caja_menuda_rediseno.sql" \
  "   and r.nombre in ('andrea', 'Jennifer', 'Julio', 'Otro', 'Rey', 'Rodrigo')" \
  "   and r.nombre ilike '%a%'" \
  "5 · los responsables se apagan con un LIKE suelto en vez de por nombre exacto"

mutar "supabase/migrations/20261013120000_caja_menuda_rediseno.sql" \
  "   and not exists (select 1 from caja_gastos g where g.responsable_id = r.id)" \
  "   and true" \
  "5 · se apaga un responsable sin comprobar que no tenga gastos"

mutar "supabase/migrations/20261013120000_caja_menuda_rediseno.sql" \
  " set activo = false" \
  " set nombre = nombre" \
  "5 · los responsables ya no se apagan"

mutar "src/lib/caja/columnas-retiradas.ts" \
  '  caja_gastos: ["empresa", "factura", "ruc", "dv", "responsable", "responsable_id"],' \
  '  caja_gastos: ["factura", "ruc", "dv", "responsable"],' \
  "5 · se saca una columna de la lista de las que no se dropean"

# ═══ 3 y 15 · La ficha angosta ═════════════════════════════════════════════

mutar "src/app/caja/components/FichaGasto.tsx" \
  "  if (editando) {" \
  "  if (false) {" \
  "3 · «Editar» vuelve a no hacer nada en pantalla angosta"

mutar "src/app/caja/components/FichaGasto.tsx" \
  "      {g.nro_factura?.trim() && (" \
  "      {false && (" \
  "15 · la ficha vuelve a esconder el N° de factura"

mutar "src/app/caja/components/FichaGasto.tsx" \
  '          aria-label="Nº de factura"' \
  '          aria-label="Factura"' \
  "15 · el campo de factura de la ficha pierde su rótulo"

# ═══ 7 · El papel ══════════════════════════════════════════════════════════

mutar "src/app/caja/components/PrintView.tsx" \
  "            A reponer: <span>\${fmt(aReponer)}</span>" \
  "            <span>\${fmt(aReponer)}</span>" \
  "7 · el papel deja de rotular «A reponer»"

mutar "src/lib/exports/caja-excel.ts" \
  '  ws[addr(r, lastCol - 2)] = lbl("A reponer:", true);' \
  '  ws[addr(r, lastCol - 2)] = lbl("Reabastecimiento:", true);' \
  "7 · el Excel dice «reabastecimiento» en vez de «reposición»"

# ═══ 16 · Textos ═══════════════════════════════════════════════════════════

mutar "src/app/caja/components/AvisoSaldoNegativo.tsx" \
  "Considera pedir la reposición antes de seguir gastando." \
  "Considera pedir la reposición antes de seguir gastando. Fijate bien." \
  "16 · voseo en el aviso de saldo negativo"

mutar "src/app/caja/hooks/useCajaState.ts" \
  '        setError(backendMsg || "Error al cerrar período");' \
  '        setError(backendMsg || "Elegí de nuevo el período");' \
  "16 · voseo en el error del cierre"

# ═══ Archivos enteros ══════════════════════════════════════════════════════

borrar_archivo "src/lib/caja/dinero.ts" \
  "se borra el módulo de la plata (la cuenta del saldo vuelve a estar suelta)"

echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/lib/caja/dinero.ts" \
  "  return Math.round(n * 100) / 100 + 0;" \
  "  return Math.round(n * 100.0) / 100.0 + 0;" \
  "CONTROL: se reescribe el redondeo con la misma aritmética"

control "src/app/caja/components/ZonaFotos.tsx" \
  '  if (bytes < 1024) return `${bytes} B`;' \
  '  if (bytes < 1024) return `${bytes} bytes`;' \
  "CONTROL: se alarga la unidad del peso del archivo"

# ⚠️ NO es una mutación, es un CONTROL: en la lista el saldo ya llega redondeado
# por `saldoDelPeriodo`, así que preguntar `saldo < 0` ahí da exactamente lo
# mismo. El candado del residuo vive donde tiene que vivir — en el módulo puro,
# sobre `saldoEsNegativo` — y esa mutación SÍ se caza (arriba). Dejarla acá como
# «mutación» sería fingir cobertura de una segunda cerradura de la misma puerta.
control "src/app/caja/components/PeriodoList.tsx" \
  "  const neg = saldoEsNegativo(saldo);" \
  "  const neg = saldo < 0;" \
  "CONTROL: el saldo de la lista ya viene redondeado — preguntar \`< 0\` da igual"

control "src/lib/caja/gasto-repetido.ts" \
  "  for (const g of existentes) {" \
  "  for (const g of existentes.slice()) {" \
  "CONTROL: se recorre una copia de la lista, con el mismo resultado"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

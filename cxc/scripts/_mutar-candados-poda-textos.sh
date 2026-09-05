#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de la PODA DE EXPLICACIONES
# (23-ago-2026).
#
# Se rompe el arreglo, a propósito y de a UNO, y se exige que algún test se
# ponga ROJO. Un candado que no caza su propia mutación no es un candado.
#
# Se mutan las DOS mitades, porque el riesgo es de dos caras:
#   · devolver el texto podado  → tiene que cazarlo el "la explicación NO está";
#   · borrar lo que estaba AL LADO (el campo, el botón, el aviso, el gancho de
#     medición) → tiene que cazarlo el "…SIGUE".
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado.
#
# 🩸 EL REEMPLAZO ES LITERAL (`scripts/_mutar.py`), NO `perl -0pi -e 's|…|…|'`:
# con perl una mutación puede no aplicarse por un escape o por un `|` adentro
# del patrón, y el script reportaría "SOBREVIVIÓ" — acusando al candado de un
# bug propio. Acá un PATRÓN MUERTO se DENUNCIA y la mutación se saltea.
#
#   bash scripts/_mutar-candados-poda-textos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/reclamos/components/ComprobanteModal.tsx"
  "src/app/caja/components/PeriodoList.tsx"
  "src/app/asistencia/CorregirMarcacionModal.tsx"
  "src/app/recordatorios/components/RecordatorioFormModal.tsx"
  "src/app/marketing/components/RegistrarGastoModal.tsx"
  "src/app/marketing/components/PorClienteModal.tsx"
  "src/app/marketing/components/CerrarPeriodoModal.tsx"
  "src/app/marketing/components/FacturasSection.tsx"
  "src/components/marketing/FacturaForm.tsx"
  "src/app/clientes/[codigo]/ClienteDetail.tsx"
  "src/app/gastos-contabilidad/GastosContabilidadClient.tsx"
  "src/app/gastos-contabilidad/components/saldos/SaldosBancoTab.tsx"
  "src/app/productos/cargar/MiExcelFotosClient.tsx"
  "src/app/productos/cargar/FacturasTiendaClient.tsx"
  "src/app/productos/cargar/ReglasView.tsx"
  "src/app/productos/cargar/ReebokClient.tsx"
  "src/app/productos/cargar/DepuradorClient.tsx"
  "src/app/productos/cargar/DepuradorDispatcher.tsx"
  "src/app/admin/usuarios/DataHealthTab.tsx"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/components/poda-textos-explicaciones.test.tsx"

cazadas=0; sueltas=0; muertas=0; n=0; ROTA=0

# Reemplazo LITERAL. Revienta si el texto no estaba: una mutación que no se
# aplica reportaría "SOBREVIVIÓ" y estaría acusando al candado de un bug del
# script.
mutar() {
  if ! python3 scripts/_mutar.py "$1" "$2" "$3"; then
    echo "  ⚠️  PATRÓN MUERTO: la mutación no se aplicó en $1"
    ROTA=1
  fi
}

probar() {
  n=$((n+1))
  local nombre="$1"
  if [ "$ROTA" = "1" ]; then
    echo "  ⚠️  SALTEADA (patrón muerto) — $nombre"
    muertas=$((muertas+1)); ROTA=0; restaurar; return
  fi
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE, el resumen no existe y "0 fallos" se leería como
  # "sobrevivió". Se exige encontrar el renglón de vitest.
  if [[ ! "$salida" =~ Tests[[:space:]]+[0-9]+ ]]; then
    echo "  ⚠️  LA CORRIDA MURIÓ — $nombre"
    sueltas=$((sueltas+1)); restaurar; return
  fi
  local fallos
  fallos=$(printf '%s' "$salida" | grep -oE "Tests +[0-9]+ failed" | grep -oE "[0-9]+" | head -1)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos tests rojos) — $nombre"
    cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"
    sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ A. EL TEXTO PODADO VUELVE ═══"

# ── Reclamos #185 ───────────────────────────────────────────────────────────
mutar "src/app/reclamos/components/ComprobanteModal.tsx" \
  '<h2 className="text-base font-semibold">{title}</h2>' \
  '<h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-500">Adjunta el comprobante (foto o PDF) si ya lo tienes — en este paso es opcional.</p>'
probar "vuelve la bajada del comprobante de Reclamos"

# ── Caja #197 ───────────────────────────────────────────────────────────────
mutar "src/app/caja/components/PeriodoList.tsx" \
  '<h1 className="sr-only">Caja Menuda</h1>' \
  '<h1 className="sr-only">Caja Menuda</h1>
      <p className="text-sm">Cada período representa un ciclo del fondo fijo de gastos. Crea uno nuevo cuando se reponga el fondo.</p>'
probar "vuelve la bajada del fondo fijo de Caja Menuda"

# ── Asistencia #272 ─────────────────────────────────────────────────────────
mutar "src/app/asistencia/CorregirMarcacionModal.tsx" \
  '                />
              </label>' \
  '                />
                <span className="mt-1 block text-[12px] text-gray-500">Obligatorio. En tres meses nadie va a acordarse de por qué esta hora es distinta.</span>
              </label>'
probar "vuelve el 'nadie va a acordarse' del motivo de corrección"

# ── Cheques #221 ────────────────────────────────────────────────────────────
mutar "src/app/recordatorios/components/RecordatorioFormModal.tsx" \
  '<Campo label="¿Se repite?">' \
  '<Campo label="¿Se repite?" hint="— casi siempre, una sola vez">'
probar "vuelve el '— casi siempre, una sola vez' del recordatorio"

# ── Marketing #163/#164/#165 ────────────────────────────────────────────────
mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                  <div className="font-semibold text-gray-900">{c.titulo}</div>' \
  '                  <div className="font-semibold text-gray-900">{c.titulo}</div>
                  <div className="text-xs text-gray-500 mt-1">Una factura de un proveedor para una tienda: letreros, material, remodelación.</div>'
probar "vuelve la ayuda del camino Factura"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                  <div className="font-semibold text-gray-900">{c.titulo}</div>' \
  '                  <div className="font-semibold text-gray-900">{c.titulo}</div>
                  <div className="text-xs text-gray-500 mt-1">Una entrega de mobiliario a una tienda. Descuenta el inventario en piezas.</div>'
probar "vuelve la ayuda del camino Mueble"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                  <div className="font-semibold text-gray-900">{c.titulo}</div>' \
  '                  <div className="font-semibold text-gray-900">{c.titulo}</div>
                  <div className="text-xs text-gray-500 mt-1">Impulsadoras, vallas, eventos, catálogos — para la marca en general, sin tienda.</div>'
probar "vuelve la ayuda del camino Gasto de la marca"

# ── Marketing #144 ──────────────────────────────────────────────────────────
mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                    Subir foto' \
  '                    Subir foto — La del letrero puesto, el mueble armado, el evento.'
probar "vuelve el 'La del letrero puesto' de la foto del gasto"

# ── Marketing #138 ──────────────────────────────────────────────────────────
mutar "src/app/marketing/components/PorClienteModal.tsx" \
  '            Esto es solo para verlo tú' \
  '            Cuánto te costó cada tienda en total, sumando todas las marcas.
            Esto es solo para verlo tú'
probar "vuelve el 'Cuánto te costó cada tienda en total'"

# ── Marketing #160 ──────────────────────────────────────────────────────────
mutar "src/app/marketing/components/CerrarPeriodoModal.tsx" \
  '            />
          </div>

          <p className="text-xs text-red-700' \
  '            />
            <p className="text-xs text-gray-500 mt-1">Los gastos nuevos de {bloque.nombre} van a entrar en ese período.</p>
          </div>

          <p className="text-xs text-red-700'
probar "vuelve el 'van a entrar en ese período' de cerrar período"

# ── Marketing #154 ──────────────────────────────────────────────────────────
mutar "src/app/marketing/components/FacturasSection.tsx" \
  '              📤 Subir facturas (varias a la vez)
            </div>' \
  '              📤 Subir facturas (varias a la vez)
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Arrastra PDFs aquí o haz clic para seleccionarlos. La IA leerá cada uno automáticamente.</div>'
probar "vuelve el 'Arrastra PDFs aquí' de la subida masiva"

# ── Marketing #171 / #176 ───────────────────────────────────────────────────
mutar "src/components/marketing/FacturaForm.tsx" \
  'descripcion={leyendoIA ? "Leyendo factura con IA..." : undefined}' \
  'descripcion={leyendoIA ? "Leyendo factura con IA..." : "Aceptamos solo PDF, máximo 10MB. La IA pre-llenará los campos."}'
probar "vuelve el 'Aceptamos solo PDF' del paso 1"

mutar "src/components/marketing/FacturaForm.tsx" \
  '        titulo="Revisa o llena los datos de la factura"' \
  '        titulo="Revisa o llena los datos de la factura"
        descripcion="Edita lo que la IA no haya leído bien."'
probar "vuelve el 'Edita lo que la IA no haya leído bien' del paso 2"

# ── Clientes #131 ───────────────────────────────────────────────────────────
mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  '>Contacto</h2>' '>Contacto · editable en fashiongr</h2>'
probar "vuelve el '· editable en fashiongr' de la ficha del cliente"

# ── Gastos #302 ─────────────────────────────────────────────────────────────
mutar "src/app/gastos-contabilidad/GastosContabilidadClient.tsx" \
  '              <SelectorMes' \
  '              <p className="text-sm text-gray-600">Cada pago que salió de caja o del banco, mes por mes.</p>
              <SelectorMes'
probar "vuelve el 'Cada pago que salió de caja o del banco, mes por mes'"

# ── Saldos de banco #303 ────────────────────────────────────────────────────
mutar "src/app/gastos-contabilidad/components/saldos/SaldosBancoTab.tsx" \
  '    <div className="max-w-xl">' \
  '    <div className="max-w-xl">
      <p className="text-sm text-gray-600">Es lo que la Vista General muestra como Disponibilidad.</p>'
probar "vuelve el 'lo que la Vista General muestra como Disponibilidad'"

# ── Mi Excel con fotos #347 / #349 / #325 / #316 / #322 / #331 ──────────────
mutar "src/app/productos/cargar/MiExcelFotosClient.tsx" \
  '            <li>Cada foto tiene que llamarse igual' \
  '            <li>El código va en la columna B. La fila 1 es el encabezado.</li>
            <li>Cada foto tiene que llamarse igual'
probar "vuelve 'La fila 1 es el encabezado'"

mutar "src/app/productos/cargar/MiExcelFotosClient.tsx" \
  '            <li>Cada foto tiene que llamarse igual' \
  '            <li>La columna A va vacía: ahí se pegan las fotos.</li>
            <li>Cada foto tiene que llamarse igual'
probar "vuelve 'ahí se pegan las fotos'"

mutar "src/app/productos/cargar/MiExcelFotosClient.tsx" \
  '            <li>Cada foto tiene que llamarse igual' \
  '            <li>Las demás columnas traen tu información y salen tal cual.</li>
            <li>Cada foto tiene que llamarse igual'
probar "vuelve 'salen tal cual'"

mutar "src/app/productos/cargar/MiExcelFotosClient.tsx" \
  '        <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">' \
  '        <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
          <li>Solo cambia la columna A: donde hay foto queda la foto.</li>'
probar "vuelve 'donde hay foto queda la foto'"

mutar "src/app/productos/cargar/MiExcelFotosClient.tsx" \
  '        <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">' \
  '        <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
          <li>Cada foto queda pegada a su fila: si filtras, se esconde junto con la fila.</li>'
probar "vuelve 'pegada a su fila'"

mutar "src/app/productos/cargar/MiExcelFotosClient.tsx" \
  '        <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">' \
  '        <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
          <li>Las fotos no se suben a ningún lado: se leen de tu computadora.</li>'
probar "vuelve 'no se suben a ningún lado'"

# ── Facturas de tienda #344 ─────────────────────────────────────────────────
mutar "src/app/productos/cargar/FacturasTiendaClient.tsx" \
  '            <div className="overflow-x-auto">' \
  '            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Fórmulas de TIENDA (separadas del Depurador) · precio = TECHO(Costo ÷ divisor) + extra</div>
            <div className="overflow-x-auto">'
probar "vuelve el encabezado 'Fórmulas de TIENDA (separadas del Depurador)'"

# ── Reglas #345 / #346 ──────────────────────────────────────────────────────
mutar "src/app/productos/cargar/ReglasView.tsx" \
  '      {/* Sección B — Principios */}' \
  '      <p className="text-sm text-stone-500">Si el proveedor cambia algo, manda captura a Daniel para actualizar estas reglas.</p>
      {/* Sección B — Principios */}'
probar "vuelve el 'manda captura a Daniel'"

mutar "src/app/productos/cargar/ReglasView.tsx" \
  '        <ol className="space-y-1.5">' \
  '        <p className="mb-3 text-[13px] text-stone-500">Se aplican en orden a cada descripción antes de buscar en el catálogo.</p>
        <ol className="space-y-1.5">'
probar "vuelve el 'antes de buscar en el catálogo'"

# ── Reebok #350 / #357 ──────────────────────────────────────────────────────
mutar "src/app/productos/cargar/ReebokClient.tsx" \
  '<Field label="¿Qué quieres generar?">' \
  '<Field label="¿Qué quieres generar?" note="Pedido = catálogo · Switch = plantilla por artículo.">'
probar "vuelve el 'Switch = plantilla por artículo'"

mutar "src/app/productos/cargar/ReebokClient.tsx" \
  '<Field label="Columna de piezas (mes)">' \
  '<Field label="Columna de piezas (mes)" note="Autodetectada; corrige si hace falta.">'
probar "vuelve el 'Autodetectada; corrige si hace falta'"

# ── Depurador #353 / #356 ───────────────────────────────────────────────────
mutar "src/app/productos/cargar/DepuradorClient.tsx" \
  '                title="Una fórmula para todo"' \
  '                title="Una fórmula para todo · Un divisor + extra para todas las filas."'
probar "vuelve el 'Un divisor + extra para todas las filas'"

mutar "src/app/productos/cargar/DepuradorClient.tsx" \
  '                title="Fórmula guardada por marca"' \
  '                title="Fórmula guardada por marca · Cada marca usa su fórmula guardada."'
probar "vuelve el 'Cada marca usa su fórmula guardada'"

# ── Depurador #358 ──────────────────────────────────────────────────────────
mutar "src/app/productos/cargar/DepuradorDispatcher.tsx" \
  '      {error && (' \
  '      <p className="text-center text-[12px] text-stone-500">La marca se detecta sola.</p>
      {error && ('
probar "vuelve el 'La marca se detecta sola'"

# ── Data Health #370 ────────────────────────────────────────────────────────
mutar "src/app/admin/usuarios/DataHealthTab.tsx" \
  '<h2 className="text-sm font-semibold text-gray-700">Historial 30 días</h2>' \
  '<h2 className="text-sm font-semibold text-gray-700">Historial 30 días</h2>
              <p className="text-xs text-gray-400 mt-0.5">Cada celda = peor severity del día. Gris = sin corrida.</p>'
probar "vuelve el 'peor severity del día' del mapa de 30 días"

echo
echo "═══ B. LA PODA SE LLEVA POR DELANTE LO DE AL LADO ═══"

mutar "src/app/reclamos/components/ComprobanteModal.tsx" \
  '          type="file"
          accept="image/*,application/pdf"' \
  '          type="text"
          accept="image/*,application/pdf"'
probar "🔴 el adjunto de Reclamos se va con la bajada"

mutar "src/app/caja/components/PeriodoList.tsx" \
  '      <h1 className="sr-only">Caja Menuda</h1>' \
  '      <div className="max-w-xl"><h1 className="sr-only">Caja Menuda</h1></div>'
probar "🔴 queda la CÁSCARA vacía donde vivía la bajada de Caja"

mutar "src/app/asistencia/CorregirMarcacionModal.tsx" \
  'Por qué se corrige <span className="text-red-600">*</span>' \
  'Por qué se corrige'
probar "🔴 el asterisco del motivo se va con la frase"

mutar "src/app/asistencia/CorregirMarcacionModal.tsx" \
  'const puedeGuardar = horaOk && razonOk && !guardando;' \
  'const puedeGuardar = horaOk && !guardando;'
probar "🔴 el motivo deja de ser obligatorio de verdad"

mutar "src/app/recordatorios/components/RecordatorioFormModal.tsx" \
  'aria-label="Se repite"' 'aria-label="Otra cosa"'
probar "🔴 el grupo de repetición pierde su nombre"

mutar "src/app/marketing/components/RegistrarGastoModal.tsx" \
  '                  data-camino={c.key}' '' 
probar "🔴 los caminos pierden el gancho de medición"

mutar "src/app/marketing/components/PorClienteModal.tsx" \
  '            Esto es solo para verlo tú — no se le reporta a ninguna marca.' ''
probar "🔴 se va TAMBIÉN el aviso de que no se le reporta a ninguna marca"

mutar "src/app/marketing/components/CerrarPeriodoModal.tsx" \
  'Después de cerrarlo no se puede deshacer' 'Se cierra el período'
probar "🔴 se va el aviso de que cerrar no se deshace"

mutar "src/app/productos/cargar/MiExcelFotosClient.tsx" \
  '            <li>Cada foto tiene que llamarse igual que el código: <b>100262385.jpg</b>.</li>' ''
probar "🔴 la caja 'Cómo tiene que estar tu archivo' se queda VACÍA"

mutar "src/app/productos/cargar/FacturasTiendaClient.tsx" \
  '"Marca en esta factura"' '"Marca"'
probar "🔴 la tabla de fórmulas de tienda pierde su columna nombrada"

mutar "src/app/productos/cargar/ReglasView.tsx" \
  '>Principios de limpieza</h3>' '></h3>'
probar "🔴 la sección de principios se queda sin título"

mutar "src/app/admin/usuarios/DataHealthTab.tsx" \
  '>Historial 30 días</h2>' '></h2>'
probar "🔴 el mapa de 30 días se queda sin encabezado"

mutar "src/app/clientes/[codigo]/ClienteDetail.tsx" \
  'Última sincronización: {fmtDate(' 'Sync: {fmtDate('
probar "🔴 la ficha del cliente pierde la frescura del dato"

echo
echo "═══ RESUMEN ═══"
echo "  mutaciones: $n · cazadas: $cazadas · sueltas: $sueltas · patrones muertos: $muertas"
[ "$sueltas" -eq 0 ] && [ "$muertas" -eq 0 ] || exit 1

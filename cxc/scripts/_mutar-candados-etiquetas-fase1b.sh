#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de LOS CINCO ARREGLOS de las
# ETIQUETAS (18-sep-2026): anti-doble captura · corregir → reimprimir · el PDF
# en pestaña nueva · el selector sin lo ya etiquetado · el copy de Switch.
#
# Se rompe el producto a propósito, de a una mutación, y se exige que los
# candados se pongan ROJOS. Dos CONTROLES cambian cosas que NO son la regla
# (un comentario, un texto de toast) y tienen que quedarse en VERDE: si un
# control se pone rojo, el candado está atado a la letra y no a la conducta.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

ANTI=src/lib/guias/anti-doble-captura.ts
PESTANA=src/lib/guias/pdf-en-pestana.ts
PURO=src/lib/guias/etiquetas.ts
VISTA=src/app/guias/components/EtiquetasView.tsx
SELECTOR=src/app/guias/components/FacturasDelCliente.tsx
PENDIENTES=src/app/guias/components/EtiquetasPendientes.tsx
FORM=src/app/guias/components/GuiaForm.tsx

TESTS=(
  src/__tests__/lib/guias-etiquetas-una-sola-vez.test.ts
  src/__tests__/components/guias-etiquetas-fase1b.test.tsx
  src/__tests__/lib/guias-etiquetas.test.ts
  src/__tests__/components/guias-etiquetas-pantalla.test.tsx
)

ARCHIVOS=("$ANTI" "$PESTANA" "$PURO" "$VISTA" "$SELECTOR" "$PENDIENTES" "$FORM")

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

echo "== 1. el selector de siempre deja de bloquear la factura que ya tiene etiqueta =="
mutar "$ANTI" '  const etiqueta = etiquetaPendienteDeLaFactura(etiquetas, f);
  if (!etiqueta) return { modo: "libre" };' '  const etiqueta = etiquetaPendienteDeLaFactura(etiquetas, f);
  if (true) return { modo: "libre" };' \
&& probar 'capturaEnElSelector siempre libre'

echo "== 2. la etiqueta YA IMPORTADA también bloquea (el aviso «ya salió» pasaría a frenar) =="
mutar "$ANTI" '  if (!e || estaImportada(e)) return null;' '  if (!e) return null;' \
&& probar 'etiquetaPendienteDeLaFactura sin el filtro de importadas'

echo "== 3. el pareo deja de mirar la empresa (bloquearía una factura ajena) =="
mutar "$PURO" '    etiquetas.find((e) => e.empresa_key === k && e.switch_factura_id === switchFacturaId) ?? null' '    etiquetas.find((e) => e.switch_factura_id === switchFacturaId) ?? null' \
&& probar 'etiquetaDeLaFactura sin la empresa en la clave'

echo "== 4. el panel de etiquetas deja de distinguir QUIÉN marcó (vuelta 2 apagada) =="
mutar "$ANTI" '  return mias.has(e.id) ? "marcada" : "tomada-por-el-selector";' '  return "marcada";' \
&& probar 'capturaEnEtiquetas sin mirar quién marcó'

echo "== 5. lo marcado deja de derivarse de los renglones (borrar la fila no desmarca) =="
mutar "$ANTI" '  const enLaGuia = etiquetaMarcada(items, e);
  if (!enLaGuia) return "libre";' '  const enLaGuia = mias.has(e.id);
  if (!enLaGuia) return "libre";' \
&& probar 'capturaEnEtiquetas mira solo el conjunto'

echo "== 6. se ata todo lo que esté en un renglón, venga de donde venga =="
mutar "$ANTI" '  return etiquetas.filter((e) => etiquetaEstaMarcada(items, e, mias)).map((e) => e.id);' '  return etiquetas.filter((e) => etiquetaMarcada(items, e)).map((e) => e.id);' \
&& probar 'idsParaAtar sin mirar quién marcó'

echo "== 7. la casilla del selector deja de salir APAGADA =="
mutar "$SELECTOR" '                                disabled={deEtiquetas}' '                                disabled={false}' \
&& probar 'la casilla bloqueada se puede tocar'

echo "== 8. el freno del selector se queda SOLO en el disabled visual =="
mutar "$SELECTOR" '    if (capturaEnElSelector(items, cliente, f, etiquetasVivas).modo === "de-etiquetas") return;' '    // (mutación) sin el freno de verdad' \
&& probar 'toggle sin el freno'

echo "== 9. el panel de etiquetas deja de frenar lo que tomó el selector =="
mutar "$PENDIENTES" '    if (estado === "tomada-por-el-selector") return; // bloqueada: no se toca' '    // (mutación) sin el freno de verdad' \
&& probar 'alternar sin el freno'

echo "== 10. corregir los bultos guarda y cierra, sin llevar a reimprimir =="
mutar "$VISTA" '            setReimprimiendo({ etiqueta: actualizada, aviso: avisoDeReimpresion(antes, actualizada.cajas) });' '            // (mutación) se guarda y se cierra, como antes' \
&& probar 'corregir sin abrir la reimpresión'

echo "== 11. la reimpresión abre con «una sola caja» en vez del juego completo =="
mutar "$VISTA" '  const [modo, setModo] = useState<"juego" | "una">("juego");' '  const [modo, setModo] = useState<"juego" | "una">("una");' \
&& probar 'ModalReimprimir abre en «una»'

echo "== 12. el aviso de que el papel viejo quedó mal se calla =="
mutar "$PURO" '  if (antes === despues) return null;' '  return null;
  if (antes === despues) return null;' \
&& probar 'avisoDeReimpresion siempre null'

echo "== 13. 🔴 LA TRAMPA DE iOS: la pestaña se abre DESPUÉS del await =="
mutar "$PESTANA" '  const ventana = abrir("");

  let pdf: PdfListo | null;
  try {
    pdf = await armar();' '  let ventana: VentanaAbierta | null = null;

  let pdf: PdfListo | null;
  try {
    pdf = await armar();
    ventana = abrir("");' \
&& probar 'la pestaña nace después del await'

echo "== 14. sin pestaña ya no se baja el archivo (alguien se queda sin etiquetas) =="
mutar "$PESTANA" '  pdf.descargar();
  return "descarga";' '  return "descarga";' \
&& probar 'sin la red de la descarga'

echo "== 15. en el alta la pestaña se abre DESPUÉS del POST =="
mutar "$VISTA" '      await abrirPdfEnPestana(async () => {
        const r = await fetch("/api/guias/etiquetas", {' '      await (async () => {
        const r = await fetch("/api/guias/etiquetas", {' \
&& probar 'etiquetar sin abrir la pestaña en el gesto'

echo "== 16. el selector para etiquetar vuelve a ofrecer lo ya etiquetado =="
mutar "$PURO" '  const visibles = facturas.filter(
    (f) =>
      f.switch_factura_id == null ||
      etiquetaDeLaFactura(etiquetas, f.empresa_key, f.switch_factura_id) === null,
  );' '  const visibles = [...facturas];' \
&& probar 'facturasParaEtiquetar no esconde nada'

echo "== 17. lo escondido deja de contarse (parecería que una factura se perdió) =="
mutar "$PURO" '  if (n <= 0) return null;' '  return null;
  if (n <= 0) return null;' \
&& probar 'textoEscondidasPorEtiqueta callado'

echo "== 18. el copy de Switch vuelve a explicar el mecanismo en vez de decir qué hacer =="
mutar "$PURO" 'export const TEXTO_TRAER_DE_SWITCH = "¿No aparece la factura de hoy? Tráela de Switch";' 'export const TEXTO_TRAER_DE_SWITCH = "¿No está la factura de hoy? El detalle de Switch entra una vez al día.";' \
&& probar 'el copy de Switch cambiado'

echo "== 19. cada panel vuelve a leer la lista por su cuenta (dos verdades) =="
mutar "$FORM" '          etiquetasVivas={etiquetasVivas}' '' \
&& probar 'el selector sin la lista de etiquetas'

echo "== CONTROL A. solo cambia un comentario del módulo puro =="
mutar "$ANTI" '/** «14 cajas» / «1 caja» — una sola forma de decirlo en las dos pantallas. */' '/** Cómo se dicen las cajas: una sola forma para las dos pantallas. */' \
&& controlar 'comentario de textoCajas'

echo "== CONTROL B. el toast de la corrección cambia de palabras =="
mutar "$VISTA" '            setToast("Bultos corregidos");' '            setToast("Listo, los bultos quedaron corregidos");' \
&& controlar 'texto del toast'

echo
echo "RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde"

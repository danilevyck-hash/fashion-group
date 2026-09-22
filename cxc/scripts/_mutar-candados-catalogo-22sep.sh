#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — los dos cambios de Catálogos del 22-sep-2026:
#   A. «Sin mandar» dice DESDE CUÁNDO, y a partir de la semana se ve de lejos.
#   B. La tarjeta del producto, podada: se fue el color; el badge y «Consultar»
#      se QUEDAN, y este script también protege eso.
#
# Rompe UNA cosa por vez y exige que los candados se pongan ROJOS. Un candado
# que pasa con la mutación puesta no es un candado: es un archivo que se lee
# bien. Deja los archivos como estaban pase lo que pase.
#
#   bash scripts/_mutar-candados-catalogo-22sep.sh
#
# 🩸 Tres defectos ya pagados en este repo, y cómo se evitan acá:
#   1. La restauración va por COPIA, NUNCA por `git checkout`: hay archivos
#      NUEVOS (sin versionar) en la rama y git aborta el comando ENTERO sin
#      restaurar nada.
#   2. Una mutación cuyo patrón NO matchea se DENUNCIA («patrón muerto») en vez
#      de darse por cazada.
#   3. NO HAY DELIMITADOR: los textos viajan como ARGUMENTOS a python (argv).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

SINMANDAR=src/lib/catalogo/sin-mandar.ts
FILA=src/components/catalogo/comprobantes/FilaComprobante.tsx
PANEL=src/components/catalogo/ComprobantesPanel.tsx
TARJETA=src/components/catalogo/CatalogoProductCard.tsx
MARCAS=src/lib/catalogo/marcas.ts
PDF=src/lib/catalogo/catalog-pdf.ts
DESCARGA=src/components/catalogo/useDescargarCatalogoPdf.ts
PUBLICA=src/components/catalogo/CatalogoPublicoPage.tsx
RUTA='src/app/api/catalogo/[marca]/products/route.ts'

CANDADOS=(
  src/__tests__/lib/comprobantes-antiguedad.test.ts
  src/__tests__/components/comprobantes-antiguedad-pantalla.test.tsx
  src/__tests__/components/catalogo-tarjeta-podada.test.tsx
  src/__tests__/lib/comprobantes-rediseno.test.ts
  src/__tests__/components/comprobantes-rediseno-pantalla.test.tsx
)

ARCHIVOS=("$SINMANDAR" "$FILA" "$PANEL" "$TARJETA" "$MARCAS" "$PDF" "$DESCARGA" "$PUBLICA" "$RUTA")
RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
limpiar() { restaurar; rm -rf "$RESPALDO"; }
trap limpiar EXIT

if ! npx vitest run "${CANDADOS[@]}" >/dev/null 2>&1; then
  echo "🔴 Los candados YA están rojos sin mutar nada — no hay nada que verificar."
  exit 1
fi

ok=0
fallo=0

# $1 = nombre  $2 = archivo  $3 = texto original  $4 = reemplazo
mutar() {
  local nombre="$1" archivo="$2" de="$3" a="$4"
  restaurar
  python3 - "$archivo" "$de" "$a" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
de, a = sys.argv[2], sys.argv[3]
if de not in s:
    print(f"::NO-APLICA:: no encontré el texto en {sys.argv[1]}"); sys.exit(3)
nuevo = s.replace(de, a, 1)
if nuevo == s:
    print(f"::NO-APLICA:: el reemplazo no cambió nada en {sys.argv[1]}"); sys.exit(3)
p.write_text(nuevo)
PY
  local aplicado=$?
  if [ $aplicado -ne 0 ]; then
    printf '  ⚠️  %-72s NO SE PUDO APLICAR (patrón muerto)\n' "$nombre"; fallo=$((fallo+1)); return
  fi
  if cmp -s "$archivo" "$RESPALDO/$archivo"; then
    printf '  ⚠️  %-72s EL ARCHIVO NO CAMBIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    printf '  ⚠️  %-72s LA CORRIDA MURIÓ\n' "$nombre"; fallo=$((fallo+1)); restaurar; return
  fi
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  ✅ %-72s cazada\n' "$nombre"; ok=$((ok+1))
  else
    printf '  🔴 %-72s SOBREVIVIÓ (candado inútil)\n' "$nombre"; fallo=$((fallo+1))
  fi
  restaurar
}

# $1 = nombre  $2 = archivo  $3 = de  $4 = a — un cambio que NO debe romper nada.
control() {
  local nombre="$1" archivo="$2" de="$3" a="$4"
  restaurar
  python3 - "$archivo" "$de" "$a" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
de, a = sys.argv[2], sys.argv[3]
if de not in s:
    print(f"::NO-APLICA:: no encontré el texto en {sys.argv[1]}"); sys.exit(3)
p.write_text(s.replace(de, a, 1))
PY
  if [ $? -ne 0 ]; then
    printf '  ⚠️  %-72s NO SE PUDO APLICAR (patrón muerto)\n' "CONTROL · $nombre"; fallo=$((fallo+1)); return
  fi
  local salida
  salida="$(npx vitest run "${CANDADOS[@]}" 2>&1)"
  if grep -qE "Tests +[0-9]+ failed" <<<"$salida"; then
    printf '  🔴 %-72s EL CONTROL SE PUSO ROJO (candado frágil)\n' "CONTROL · $nombre"; fallo=$((fallo+1))
  else
    printf '  ✅ %-72s control en verde\n' "CONTROL · $nombre"; ok=$((ok+1))
  fi
  restaurar
}

echo "═══ A · «SIN MANDAR» DICE DESDE CUÁNDO ═══"

# ── El chip/la frase pierde la antigüedad ───────────────────────────────────
mutar "🔴 la frase del borrador vuelve a no decir hace cuánto" "$SINMANDAR" \
  '  return conAntiguedad(TEXTO_NO_ENVIADO, diasSinLlegarASwitch(createdAt, hoyPanamaYmd), true);' \
  '  return TEXTO_NO_ENVIADO;'

mutar "🔴 la antigüedad desaparece de TODAS las frases" "$SINMANDAR" \
  '  if (dias === null) return base;' \
  '  return base;
  if (dias === null) return base;'

mutar "la fila deja de dibujar la marca del borrador quedado" "$FILA" \
  '  const borradorQuedado = !trabado && !enSwitch && esOrders;' \
  '  const borradorQuedado = false;'

mutar "🩸 la marca se le pone también al pedido del LINK sin convertir" "$FILA" \
  '  const borradorQuedado = !trabado && !enSwitch && esOrders;' \
  '  const borradorQuedado = !trabado && !enSwitch;'

# ── El «hoy» del navegador en vez del de Panamá ─────────────────────────────
mutar "🔴 los días se cuentan con el reloj del NAVEGADOR, no con el de Panamá" "$FILA" \
  '  const dias = diasSinLlegarASwitch(pedido.created_at, hoy);' \
  '  const dias = diasSinLlegarASwitch(pedido.created_at, new Date().toISOString().slice(0, 10));'

mutar "🔴 el panel deja de pedirle el día a Panamá" "$PANEL" \
  '  const hoy = hoyPanama();' \
  '  const hoy = new Date().toISOString().slice(0, 10);'

mutar "🩸 el módulo puro empieza a leer el reloj por su cuenta" "$SINMANDAR" \
  '  if (!createdAt) return null;' \
  '  if (!createdAt) return new Date().getDate();'

mutar "la fecha se parte en UTC y CKP-007 pasa a decir 40 días" "$SINMANDAR" \
  '  const dia = fechaPanamaDe(createdAt);' \
  '  const dia = new Date(createdAt).toISOString().slice(0, 10);'

# ── El umbral, desactivado ──────────────────────────────────────────────────
mutar "🔴 el umbral se apaga poniéndolo en 0 (todo es alarma)" "$SINMANDAR" \
  'export const DIAS_SIN_MANDAR_VIEJO = 7;' \
  'export const DIAS_SIN_MANDAR_VIEJO = 0;'

mutar "🔴 el umbral se apaga subiéndolo tanto que nada lo toca" "$SINMANDAR" \
  'export const DIAS_SIN_MANDAR_VIEJO = 7;' \
  'export const DIAS_SIN_MANDAR_VIEJO = 3650;'

mutar "🔴 el umbral sube por encima de los 33 días del más nuevo de los cinco" "$SINMANDAR" \
  'export const DIAS_SIN_MANDAR_VIEJO = 7;' \
  'export const DIAS_SIN_MANDAR_VIEJO = 45;'

mutar "el tono deja de escalar: todo se queda en calma" "$SINMANDAR" \
  '  return dias !== null && dias >= DIAS_SIN_MANDAR_VIEJO ? "alerta" : "calma";' \
  '  return "calma";'

mutar "🔴 el TERMINADO sin envío deja de ser alarma desde el día uno" "$SINMANDAR" \
  '  if (trabado) return "alerta";' \
  '  '

mutar "sin fecha se inventa una alarma" "$SINMANDAR" \
  '  return dias !== null && dias >= DIAS_SIN_MANDAR_VIEJO ? "alerta" : "calma";' \
  '  return dias === null || dias >= DIAS_SIN_MANDAR_VIEJO ? "alerta" : "calma";'

# ── Los dos tonos dejan de distinguirse ─────────────────────────────────────
mutar "🔴 la alerta deja de pintarse en ROJO" "$SINMANDAR" \
  '  alerta: "font-medium text-red-600",' \
  '  alerta: "text-gray-400",'

mutar "la fila elige su propio color en vez de leer la tabla" "$FILA" \
  '        <span data-medir="sin-llegar" data-tono={tono} className={CLASES_TONO[tono]}>' \
  '        <span data-medir="sin-llegar" data-tono={tono} className="text-gray-400">'

# ── Quién es «trabado» (la regla del envío activo) ──────────────────────────
mutar "🔴 «trabado» se vuelve a deducir del NÚMERO y no del envío activo" "$SINMANDAR" \
  '  return !(typeof p.enSwitch === "boolean"' \
  '  return !(false && typeof p.enSwitch === "boolean"'

mutar "🔴 el pedido del LINK sin convertir entra a «Sin mandar»" "$SINMANDAR" \
  '  if (p.fuente === "publicos") return false;' '  '

echo
echo "═══ B · LA TARJETA PODADA ═══"

# ── El color vuelve a la tarjeta ────────────────────────────────────────────
mutar "🔴 vuelve el nombre del color a la tarjeta" "$TARJETA" \
  '          {product.sku && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className={t.skuPill}>{product.sku}</span>
            </div>
          )}' \
  '          {product.sku && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className={t.skuPill}>{product.sku}</span>
              <span className={t.priceMeta}>{(product as { color?: string }).color}</span>
            </div>
          )}'

mutar "🔴 vuelve el PUNTITO de color adivinado por el texto" "$TARJETA" \
  '          {product.sku && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className={t.skuPill}>{product.sku}</span>
            </div>
          )}' \
  '          {product.sku && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className={t.skuPill}>{product.sku}</span>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#94a3b8" }} />
            </div>
          )}'

# ── El color vuelve a VIAJAR ────────────────────────────────────────────────
mutar "🔴 el color vuelve al paquete PÚBLICO de Reebok" "$MARCAS" \
  'cols: "id,name,sku,category,gender,price,image_url,badge,active,existencia,disponibilidad"' \
  'cols: "id,name,sku,category,gender,color,price,image_url,badge,active,existencia,disponibilidad"'

mutar "el color vuelve a la lectura de ADMINISTRAR de Reebok" "$MARCAS" \
  'cols: "id,name,sku,description,category,sub_category,gender,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at"' \
  'cols: "id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at"'

mutar "el buscador del catálogo público vuelve a filtrar por color" "$PUBLICA" \
  '.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()))' \
  '.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || ((p as { color?: string }).color || "").toLowerCase().includes(search.toLowerCase()))'

mutar "🔴 el PDF vuelve a imprimir el color al lado del código" "$PDF" \
  '        doc.text(p.sku || "", x + 1, ty);' \
  '        doc.text((p.sku || "") + ((p as { color?: string }).color ? "  ·  " + (p as { color?: string }).color : ""), x + 1, ty);'

mutar "el armador del PDF vuelve a mandarle el color" "$DESCARGA" \
  '            name: p.name, sku: p.sku || "", price: p.price,' \
  '            name: p.name, sku: p.sku || "", color: (p as { color?: string }).color, price: p.price,'

# ── Lo que NO se podó: el badge y «Consultar» ───────────────────────────────
mutar "🔴 se van los TRES adornos, que el badge SÍ puede llenar" "$TARJETA" \
  '          {product.badge === "oferta" && (' \
  '          {false && product.badge === "oferta" && ('

mutar "🔴 se va «Nuevo»" "$TARJETA" \
  '          {product.badge === "nuevo" && (' \
  '          {false && product.badge === "nuevo" && ('

mutar "🔴 se va «Próximamente» (y con él la pre-orden se queda sin cartel)" "$TARJETA" \
  '          {product.badge === "proximamente" && (' \
  '          {false && product.badge === "proximamente" && ('

mutar "🔴 el badge deja de VIAJAR en el paquete público de Reebok" "$MARCAS" \
  'cols: "id,name,sku,category,gender,price,image_url,badge,active,existencia,disponibilidad"' \
  'cols: "id,name,sku,category,gender,price,image_url,active,existencia,disponibilidad"'

mutar "🔴 el badge sale de los campos editables (se cierra su única puerta)" "$RUTA" \
  'const EDITABLE_FIELDS = ["image_url", "badge"] as const;' \
  'const EDITABLE_FIELDS = ["image_url"] as const;'

mutar "🔴 se va «Consultar» y el producto sin precio queda en blanco" "$TARJETA" \
  '{product.price ? fmtPrecio(product.price) : "Consultar"}' \
  '{product.price ? fmtPrecio(product.price) : ""}'

echo
echo "═══ CONTROLES (cambios que NO deben romper nada) ═══"

control "un comentario más en el módulo de «sin mandar»" "$SINMANDAR" \
  'export const DIAS_SIN_MANDAR_VIEJO = 7;' \
  '// Comentario de control: no cambia ninguna regla.
export const DIAS_SIN_MANDAR_VIEJO = 7;'

control "la tarjeta cambia el aire entre el nombre y el código" "$TARJETA" \
  '            <div className="flex flex-wrap items-center gap-1 mt-1">' \
  '            <div className="flex flex-wrap items-center gap-1 mt-1.5">'

echo
echo "═══ RESUMEN ═══"
echo "  cazadas / controles OK : $ok"
echo "  problemas              : $fallo"
[ "$fallo" -eq 0 ] || exit 1

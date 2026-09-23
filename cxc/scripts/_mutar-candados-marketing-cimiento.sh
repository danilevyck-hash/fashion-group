#!/usr/bin/env bash
# VERIFICACIÓN POR MUTACIÓN — MARKETING, EL CIMIENTO DEL REDISEÑO (22-sep-2026).
#
# Rompe el producto a propósito, una cosa por vez, y exige que los tests se
# pongan ROJOS. Un candado que sobrevive a su mutación no es un candado.
#
# Lo que este script intenta romper, que es exactamente lo que Daniel definió:
#
#   · un gasto con DOS marcas que se guarda
#   · `se_reporta` apagado sumando en el período
#   · el proveedor comparado por `includes`
#   · el duplicado que se cuela por un cero de más o por «S a»
#   · la migración que borra o modifica un valor existente
#   · la migración que no falla abierta (el código que no tolera la columna ausente)
#   · el proyecto volviendo a decidir la tienda
#   · «Eliminar definitivamente» volviendo (botón, función, ruta)
#   · `mk_proyecto_marcas` con un lector nuevo
#   · la nota de crédito convertida en número
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado.
#
#   bash scripts/_mutar-candados-marketing-cimiento.sh

set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/marketing/gasto.ts"
  "src/lib/marketing/proveedor.ts"
  "src/lib/marketing/duplicado.ts"
  "src/lib/marketing/periodo-estado.ts"
  "src/lib/marketing/agrupar-por-tienda.ts"
  "src/lib/marketing/columnas-opcionales.ts"
  "src/lib/marketing/factura-marcas.ts"
  "src/lib/marketing/inventario.ts"
  "src/lib/marketing/impulsadoras.ts"
  "src/lib/marketing/queries.ts"
  "src/lib/marketing/reportes.ts"
  "src/lib/marketing/types.ts"
  "src/lib/backup/tablas.ts"
  "src/app/marketing/components/FacturasSection.tsx"
  "src/app/marketing/components/ProyectoOverlay.tsx"
  "src/app/api/marketing/facturas/[id]/route.ts"
  "src/app/api/marketing/proyectos/[id]/route.ts"
  "src/app/api/marketing/proyectos/[id]/marcas/route.ts"
  "supabase/migrations/20261216120000_marketing_gasto_tienda_se_reporta.sql"
  "supabase/migrations/20261216120100_marketing_periodo_cierre_y_zips.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/marketing-cimiento.test.ts \
src/__tests__/components/marketing-reclamos-toques.test.tsx"

CAZADAS=0
SOBREVIVIERON=0
FALLO_MUTAR=0

probar() {
  local nombre="$1"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  local resumen
  resumen="$(printf '%s' "$salida" | grep -E '^ *Tests +' | tail -1)"
  if [ -z "$resumen" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — no cuenta"
    printf '%s\n' "$salida" | tail -20
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
    return
  fi
  local fallos
  fallos="$(printf '%s' "$resumen" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)"
  if [ -n "$fallos" ] && [ "$fallos" -gt 0 ]; then
    echo "  ✅ cazada — $fallos test(s) en rojo   [$nombre]"
    CAZADAS=$((CAZADAS + 1))
  else
    echo "  ❌ SOBREVIVIÓ                        [$nombre]"
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
  fi
}

# El CONTROL es al revés: se muta algo que NINGUNA regla protege y se exige que
# los tests sigan VERDES.
control() {
  local nombre="$1"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  local resumen
  resumen="$(printf '%s' "$salida" | grep -E '^ *Tests +' | tail -1)"
  local fallos
  fallos="$(printf '%s' "$resumen" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)"
  if [ -z "$resumen" ] || { [ -n "$fallos" ] && [ "$fallos" -gt 0 ]; }; then
    echo "  ❌ EL CONTROL SE PUSO ROJO — los candados miden de más [$nombre]"
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
  else
    echo "  ✅ control verde, como tiene que ser  [$nombre]"
    CAZADAS=$((CAZADAS + 1))
  fi
}

mutar() { # mutar <archivo> <texto viejo> <texto nuevo>
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    sys.exit(f"🔴 no se encontró el texto a mutar en {ruta}")
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  if [ $? -ne 0 ]; then
    echo "  ⚠️  MUTACIÓN NO APLICADA (el texto cambió de forma)"
    FALLO_MUTAR=$((FALLO_MUTAR + 1))
  fi
}

echo "═══ MUTACIONES ═══"

# ── A · UNA marca por gasto ─────────────────────────────────────────────────
echo "1. exigirUnaMarca acepta dos marcas"
mutar src/lib/marketing/gasto.ts \
  '  if (distintas.size !== 1) throw new ErrorMarcaRepartida(distintas.size);' \
  '  if (distintas.size === 0) throw new ErrorMarcaRepartida(distintas.size);'
probar "una marca"; restaurar

echo "2. la factura deja de pasar por la puerta"
mutar src/lib/marketing/factura-marcas.ts \
  '  exigirUnaMarca(marcas);' \
  '  void marcas;'
probar "factura pregunta"; restaurar

echo "3. la entrega deja de pasar por la puerta (las dos)"
mutar src/lib/marketing/inventario.ts \
  '  if (marcasPct.length > 1) exigirUnaMarca(marcasPct);' \
  '  void marcasPct;'
probar "entrega pregunta"; restaurar

echo "4. la impulsadora deja de pasar por la puerta"
mutar src/lib/marketing/impulsadoras.ts \
  '  exigirUnaMarca(marcas);' \
  '  void marcas;'
probar "impulsadora pregunta"; restaurar

echo "5. se inventa un cuarto tipo de gasto"
mutar src/lib/marketing/gasto.ts \
  'export const TIPOS_DE_GASTO = ["factura", "mueble", "impulsadora"] as const;' \
  'export const TIPOS_DE_GASTO = ["factura", "mueble", "impulsadora", "proyecto"] as const;'
probar "tres tipos"; restaurar

echo "6. la impulsadora se manda a una tabla que no existe"
mutar src/lib/marketing/gasto.ts \
  '  impulsadora: "mk_facturas",' \
  '  impulsadora: "mk_entregas_muebles",'
probar "cada tipo a su tabla"; restaurar

# ── B · se_reporta ──────────────────────────────────────────────────────────
echo "7. lo apagado suma en el período"
mutar src/lib/marketing/periodo-estado.ts \
  '  return g.seReporta !== false;' \
  '  return true;'
probar "apagado no suma"; restaurar

echo "8. el default pasa a apagado"
mutar src/lib/marketing/gasto.ts \
  'export const SE_REPORTA_POR_DEFECTO = true;' \
  'export const SE_REPORTA_POR_DEFECTO = false;'
probar "nace prendido"; restaurar

echo "9. null se lee como apagado"
mutar src/lib/marketing/gasto.ts \
  '  return v !== false;' \
  '  return v === true;'
probar "solo false apaga"; restaurar

echo "10. el total del período mezcla lo apagado"
mutar src/lib/marketing/periodo-estado.ts \
  '    if (sumaEnElPeriodo(g)) {
      reportado += monto;' \
  '    noReportado += 0;
    if (true) {
      reportado += monto;'
probar "dos totales aparte"; restaurar

# ── C · el proveedor ────────────────────────────────────────────────────────
echo "11. el proveedor se compara por includes"
mutar src/lib/marketing/proveedor.ts \
  '  return na.length > 0 && na === normalizarProveedor(b);' \
  '  return na.length > 0 && normalizarProveedor(b).includes(na);'
probar "igualdad, no includes"; restaurar

echo "12. la normalización deja los acentos"
mutar src/lib/marketing/proveedor.ts \
  '    .replace(/[̀-ͯ]/g, "")' \
  ''
probar "sin acentos"; restaurar

echo "13. la normalización deja la cola «S a»"
mutar src/lib/marketing/proveedor.ts \
  '  while (tokens.length > 1 && SUFIJOS_DE_SOCIEDAD.has(tokens[tokens.length - 1])) {' \
  '  while (false) {'
probar "sin S.A."; restaurar

echo "14. sugerir pasa a substring"
mutar src/lib/marketing/proveedor.ts \
  '    if (prefijo.length > 0 && !clave.startsWith(prefijo)) continue;' \
  '    if (prefijo.length > 0 && clave.indexOf(prefijo) < 0) continue;'
probar "sugerir por prefijo"; restaurar

# ── D · el duplicado ────────────────────────────────────────────────────────
echo "15. el duplicado deja de mirar el monto"
mutar src/lib/marketing/duplicado.ts \
  '  return `${p}|${m}|${f}`;' \
  '  return `${p}|${f}`;'
probar "clave completa"; restaurar

echo "16. el monto ya no se redondea a dos decimales (55.640 ≠ 55.64)"
mutar src/lib/marketing/duplicado.ts \
  '  return (Math.round(n * 100) / 100).toFixed(2);' \
  '  return String(monto);'
probar "dos decimales"; restaurar

echo "17. el duplicado compara el proveedor crudo"
mutar src/lib/marketing/duplicado.ts \
  '    if (!mismoProveedor(nuevo.proveedor, e.proveedor)) continue;' \
  '    if (String(nuevo.proveedor) !== String(e.proveedor)) continue;'
probar "proveedor normalizado"; restaurar

echo "18. esDuplicado siempre dice que no"
mutar src/lib/marketing/duplicado.ts \
  '  return buscarDuplicado(nuevo, existentes) !== null;' \
  '  return false;'
probar "esDuplicado"; restaurar

# ── E · las migraciones ─────────────────────────────────────────────────────
echo "19. la migración dropea mk_proyecto_marcas"
mutar supabase/migrations/20261216120000_marketing_gasto_tienda_se_reporta.sql \
  'COMMENT ON TABLE mk_proyecto_marcas IS' \
  'DROP TABLE mk_proyecto_marcas;
COMMENT ON TABLE mk_proyecto_marcas IS'
probar "nada se dropea"; restaurar

echo "20. la migración MUEVE la tienda (pone proyecto_id en NULL)"
mutar supabase/migrations/20261216120000_marketing_gasto_tienda_se_reporta.sql \
  'UPDATE mk_facturas f
   SET tienda_codigo = p.tienda_codigo' \
  'UPDATE mk_facturas f
   SET tienda_codigo = p.tienda_codigo, proyecto_id = NULL'
probar "copiar, no mover"; restaurar

echo "21. la migración pisa una tienda ya escrita"
mutar supabase/migrations/20261216120000_marketing_gasto_tienda_se_reporta.sql \
  '   AND f.tienda_codigo IS NULL
   AND p.tienda_codigo IS NOT NULL;' \
  '   AND p.tienda_codigo IS NOT NULL;'
probar "solo donde está en NULL"; restaurar

echo "22. se_reporta nace apagado en la base"
mutar supabase/migrations/20261216120000_marketing_gasto_tienda_se_reporta.sql \
  '  ADD COLUMN IF NOT EXISTS se_reporta    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tienda_codigo text,
  ADD COLUMN IF NOT EXISTS nota          text;

ALTER TABLE mk_entregas_muebles' \
  '  ADD COLUMN IF NOT EXISTS se_reporta    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tienda_codigo text,
  ADD COLUMN IF NOT EXISTS nota          text;

ALTER TABLE mk_entregas_muebles'
probar "DEFAULT true"; restaurar

echo "23. la migración borra los 14 anulados"
mutar supabase/migrations/20261216120000_marketing_gasto_tienda_se_reporta.sql \
  'CREATE INDEX IF NOT EXISTS mk_facturas_tienda_idx' \
  'DELETE FROM mk_facturas WHERE anulado_en IS NOT NULL;
CREATE INDEX IF NOT EXISTS mk_facturas_tienda_idx'
probar "ningún DELETE"; restaurar

echo "24. la nota de crédito nace numérica"
mutar supabase/migrations/20261216120100_marketing_periodo_cierre_y_zips.sql \
  '  ADD COLUMN IF NOT EXISTS nota_credito     text,' \
  '  ADD COLUMN IF NOT EXISTS nota_credito     numeric(12,2),'
probar "nota de crédito es texto"; restaurar

echo "25. una columna nueva sin IF NOT EXISTS"
mutar supabase/migrations/20261216120100_marketing_periodo_cierre_y_zips.sql \
  '  ADD COLUMN IF NOT EXISTS nombre_al_cerrar text,' \
  '  ADD COLUMN nombre_al_cerrar text,'
probar "IF NOT EXISTS"; restaurar

# ── F · falla abierto ───────────────────────────────────────────────────────
echo "26. la columna ausente deja de reconocerse (todo error es fatal)"
mutar src/lib/marketing/columnas-opcionales.ts \
  '  if (code === "PGRST204" || code === "42703") return true;' \
  '  if (code === "PGRST204") return true;'
probar "reconoce 42703"; restaurar

echo "27. un timeout se trata como «falta la migración»"
mutar src/lib/marketing/columnas-opcionales.ts \
  '  if (!primero.error || !esColumnaAusente(primero.error)) {' \
  '  if (!primero.error) {'
probar "solo la columna ausente cae al respaldo"; restaurar

echo "28. completarGasto pisa un se_reporta=false guardado"
mutar src/lib/marketing/columnas-opcionales.ts \
  '    se_reporta: fila.se_reporta === false ? false : COLUMNAS_DEL_GASTO.se_reporta,' \
  '    se_reporta: COLUMNAS_DEL_GASTO.se_reporta,'
probar "no pisa lo guardado"; restaurar

echo "29. los tipos del rediseño pasan a obligatorios"
mutar src/lib/marketing/types.ts \
  '  se_reporta?: boolean;
  // Código del directorio (D-25).' \
  '  se_reporta: boolean;
  // Código del directorio (D-25).'
probar "tipos opcionales"; restaurar

# ── G · el proyecto no decide la tienda ─────────────────────────────────────
echo "30. agrupar vuelve a mirar el proyecto"
mutar src/lib/marketing/agrupar-por-tienda.ts \
  '    const codigo = String(g.tiendaCodigo ?? "").trim().toUpperCase();' \
  '    const codigo = String((g as { proyectoId?: string }).proyectoId ?? g.tiendaCodigo ?? "").trim().toUpperCase();'
probar "sin proyecto"; restaurar

echo "31. «General» deja de ir al final"
mutar src/lib/marketing/agrupar-por-tienda.ts \
  '    if (a.tiendaCodigo === null) return 1;
    if (b.tiendaCodigo === null) return -1;' \
  ''
probar "General al final"; restaurar

echo "32. lo apagado suma en el total de la tienda"
mutar src/lib/marketing/agrupar-por-tienda.ts \
  '    if (sumaEnElPeriodo(g)) {
      grupo.totalReportado += monto;' \
  '    if (true) {
      grupo.totalReportado += monto;'
probar "reportado aparte por tienda"; restaurar

# ── H · Eliminar definitivamente no vuelve ──────────────────────────────────
echo "33. vuelve el botón a la factura"
mutar src/app/marketing/components/FacturasSection.tsx \
  '                    >
                      Anular
                    </button>' \
  '                    >
                      Anular
                    </button>
                    <button type="button" className="ml-auto min-h-[44px]">Eliminar definitivamente</button>'
probar "sin botón en la factura"; restaurar

echo "34. vuelve el botón al proyecto"
mutar src/app/marketing/components/ProyectoOverlay.tsx \
  '                    Editar
                  </button>' \
  '                    Editar
                  </button>
                  <button type="button" className="min-h-[44px]">Eliminar definitivamente</button>'
probar "sin botón en el proyecto"; restaurar

echo "35. la ruta de la factura vuelve a borrar (200)"
mutar "src/app/api/marketing/facturas/[id]/route.ts" \
  '  return NextResponse.json({ error: MSG_BORRADO_RETIRADO }, { status: 403 });' \
  '  return NextResponse.json({ ok: true, aviso: MSG_BORRADO_RETIRADO }, { status: 200 });'
probar "403 en la factura"; restaurar

echo "36. la ruta del proyecto vuelve a borrar (200)"
mutar "src/app/api/marketing/proyectos/[id]/route.ts" \
  '  return NextResponse.json({ error: MSG_BORRADO_RETIRADO }, { status: 403 });' \
  '  return NextResponse.json({ ok: true, aviso: MSG_BORRADO_RETIRADO }, { status: 200 });'
probar "403 en el proyecto"; restaurar

echo "37. vuelve un lector de mk_proyecto_marcas"
mutar src/lib/marketing/queries.ts \
  '  const marcas: MarcaConPorcentaje[] = [];' \
  '  const marcas: MarcaConPorcentaje[] = [];
  await supabaseServer.from("mk_proyecto_marcas").select("*").eq("proyecto_id", id);'
probar "sin lectores"; restaurar

echo "38. la tabla vuelve a personas (sale de congelada)"
mutar src/lib/backup/tablas.ts \
  '  "mk_proyecto_marcas",
  // El CSV viejo de ventas y de CXC. No re-derivables de Switch.' \
  '  // El CSV viejo de ventas y de CXC. No re-derivables de Switch.'
probar "congelada"; restaurar

echo "39. el reporte por proyecto vuelve a leer la tabla vieja"
mutar src/lib/marketing/reportes.ts \
  '    cargarGastoCompletoPorMarca(proyectoIds),
    cargarFacturas(proyectoIds),' \
  '    cargarProyMarcas(proyectoIds),
    cargarFacturas(proyectoIds),'
probar "marcas desde los documentos"; restaurar

# ── I · el período ──────────────────────────────────────────────────────────
echo "40. la nota de crédito se convierte en número"
mutar src/lib/marketing/periodo-estado.ts \
  '  const nota = String(input.notaCredito ?? "").replace(/\s+/g, " ").trim();' \
  '  const nota = String(input.notaCredito ?? "").replace(/\s+/g, " ").trim();
  const _pct = Number(input.notaCredito) / 100;
  void _pct;'
probar "nota de crédito sin cálculo"; restaurar

echo "41. cerrar deja de exigir el nombre"
mutar src/lib/marketing/periodo-estado.ts \
  '  if (nombre.length === 0) throw new Error(MSG_FALTA_NOMBRE);' \
  ''
probar "el nombre lo pone él"; restaurar

echo "42. aparece un tercer estado"
mutar src/lib/marketing/periodo-estado.ts \
  'export const ESTADOS_PERIODO = ["abierto", "cerrado"] as const;' \
  'export const ESTADOS_PERIODO = ["abierto", "enviado", "cerrado"] as const;'
probar "dos estados"; restaurar

echo "43. anotarZip reemplaza en vez de agregar"
mutar src/lib/marketing/periodo-estado.ts \
  '  return [...previos, { ...registro, monto: round2(Number(registro.monto) || 0) }];' \
  '  void previos;
  return [{ ...registro, monto: round2(Number(registro.monto) || 0) }];'
probar "cada ZIP se guarda"; restaurar

echo "44. el siguiente se abre para OTRA marca"
mutar src/lib/marketing/periodo-estado.ts \
  '    proveedor_key: marca,' \
  '    proveedor_key: "TH",'
probar "misma marca"; restaurar

# ── CONTROLES · lo que NO debe cazarse ──────────────────────────────────────
echo
echo "═══ CONTROLES (tienen que quedar VERDES) ═══"

echo "C1. se reescribe un comentario de gasto.ts"
mutar src/lib/marketing/gasto.ts \
  '/** Los tres tipos, en el orden en que se ofrecen. Lista CERRADA. */' \
  '/** Lista CERRADA de tipos, en el orden en que se ofrecen. */'
control "comentario reescrito"; restaurar

echo "C2. cambia el tope de sugerencias de 8 a 8 (misma cosa, otra forma)"
mutar src/lib/marketing/proveedor.ts \
  'export const MAX_SUGERENCIAS = 8;' \
  'export const MAX_SUGERENCIAS = 4 * 2;'
control "constante equivalente"; restaurar

restaurar
echo
echo "═══════════════════════════════════════════════"
echo "  CAZADAS: $CAZADAS   ·   SOBREVIVIERON: $SOBREVIVIERON"
if [ "$FALLO_MUTAR" -gt 0 ]; then
  echo "  ⚠️  $FALLO_MUTAR mutación(es) NO se pudieron aplicar — revísalas"
fi
echo "═══════════════════════════════════════════════"
[ "$SOBREVIVIERON" -eq 0 ] && [ "$FALLO_MUTAR" -eq 0 ]

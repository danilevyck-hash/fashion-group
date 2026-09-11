#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — el ajuste de los días después del corte entra en
# las columnas de siempre, cada cosa en la suya (11-sep-2026).
#
# Rompe cada regla A PROPÓSITO, una por vez, y comprueba que algún candado se
# pone ROJO. Un candado que no caza su propia mutación no es un candado.
#
# 🩸 SE RESTAURA POR COPIA A /tmp, JAMÁS CON `git checkout` (otro agente
# trabaja en el mismo árbol).
#
#   bash scripts/_mutar-candados-ajuste-por-concepto.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

RESPALDO="$(mktemp -d /tmp/mutar-ajuste-concepto.XXXXXX)"
ARCHIVOS=(
  "src/lib/asistencia/corte-quincena.ts"
  "src/app/api/asistencia/planilla/route.ts"
  "src/lib/asistencia/planilla-guardada.ts"
  "src/lib/asistencia/comprobante.ts"
  "src/lib/asistencia/comprobante-pdf.ts"
  "src/lib/asistencia/planilla-exportar.ts"
  "src/app/asistencia/PlanillaTab.tsx"
)
TESTS="src/__tests__/lib/planilla-ajuste-por-concepto.test.ts src/__tests__/lib/planilla-unida-corte-y-cableado.test.ts src/__tests__/lib/planilla-unida-comprobante.test.ts src/__tests__/lib/asistencia-planilla-guardada.test.ts"

for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TOTAL=0; CAZADAS=0; CONTROLES_OK=0; ESCAPADAS=()

aplicar() {
  local archivo="$1" py="$2"
  python3 - "$archivo" <<PY
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
o = s
$py
if s == o:
    sys.exit("LA MUTACIÓN NO APLICÓ")
io.open(p, "w", encoding="utf-8").write(s)
PY
}

mutar() {
  local nombre="$1" archivo="$2" py="$3"
  if [ ! -f "$RESPALDO/$archivo" ]; then echo "  ⛔ $nombre — «$archivo» NO está en ARCHIVOS"; exit 1; fi
  TOTAL=$((TOTAL + 1)); restaurar
  if ! aplicar "$archivo" "$py"; then echo "  ⚠️  $nombre — la mutación no aplicó (el ancla cambió); REVISAR"; ESCAPADAS+=("$nombre (ancla)"); return; fi
  if npx vitest run $TESTS >/dev/null 2>&1; then echo "  ❌ ESCAPÓ: $nombre"; ESCAPADAS+=("$nombre"); else echo "  ✅ cazada: $nombre"; CAZADAS=$((CAZADAS + 1)); fi
}
control() {
  local nombre="$1" archivo="$2" py="$3"
  restaurar
  if ! aplicar "$archivo" "$py"; then echo "  ⚠️  control $nombre — no aplicó; REVISAR"; return; fi
  if npx vitest run $TESTS >/dev/null 2>&1; then echo "  ✅ control OK (no se cazó): $nombre"; CONTROLES_OK=$((CONTROLES_OK + 1)); else echo "  ❌ CONTROL CAZADO (el candado aprieta de más): $nombre"; fi
}

echo "── EL MÓDULO PURO ──────────────────────────────────────────────────────"
mutar "vuelve a netear: todo el reparto cae en Tardanzas" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  for (const { campo } of CONCEPTOS_DEL_RELOJ) {\n    const v = centavos(Number(d[campo] ?? 0));\n    if (Number.isFinite(v) && v !== 0) out[campo] = v;", "  for (const { campo, signo } of CONCEPTOS_DEL_RELOJ) {\n    const v = centavos(Number(d[campo] ?? 0));\n    if (Number.isFinite(v) && v !== 0) out.tardanzas = centavos((out.tardanzas ?? 0) + signo * v);")'
mutar "el neto de la línea no se mueve al repartir" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  dinero.netoPagar = netoConAjuste(d.netoPagar, ajuste);\n", "")'
mutar "el bruto no se mueve al repartir" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  dinero.totalBruto = centavos(d.totalBruto - ajuste);\n", "")'
mutar "recalcula el seguro social sobre lo repartido" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  dinero.netoPagar = netoConAjuste(d.netoPagar, ajuste);", "  dinero.netoPagar = netoConAjuste(d.netoPagar, ajuste);\n  dinero.seguroSocial = centavos(dinero.totalBruto * 0.0975);")'
mutar "los desgloses de la ausencia dejan de ser subconjuntos" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  dinero.ausenciaPorTardanza = centavos(d.ausenciaPorTardanza + Number(s.ausenciaPorTardanza ?? 0));\n", "")'
mutar "ajusteDeDiasSinMedir invierte el signo" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  return efectoEnElNeto(repartirAjuste(dineroDeLosDiasSinMedir));", "  return -efectoEnElNeto(repartirAjuste(dineroDeLosDiasSinMedir));")'
mutar "la nota de la celda calla" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  if (!detalle || !v) return null;\n  return `Incluye", "  return null;\n  return `Incluye")'
mutar "la nota del pie no dice de qué días" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("los días ${etiquetaDiasSinMedir(desde, hasta)}, que la quincena anterior pagó sin medir${quienes}.", "la quincena anterior${quienes}.")'
mutar "sin nada que repartir, devuelve una copia (rompe la identidad)" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  if (!d || Object.keys(reparto).length === 0) return linea;", "  if (!d || Object.keys(reparto).length === 0) return { ...linea };")'

echo "── LA RUTA Y EL CIERRE ─────────────────────────────────────────────────"
mutar "la ruta deja de aplicar el ajuste a las líneas" src/app/api/asistencia/planilla/route.ts \
  's = s.replace("        lineasFinal = lineas.map((l) => aplicarAjusteEnLinea(l, medido.dinero.get(l.codigo), medido.dias));", "        lineasFinal = lineas;")'
mutar "los totales salen de las líneas SIN ajuste" src/app/api/asistencia/planilla/route.ts \
  's = s.replace("      totales: totalizar(lineasFinal),", "      totales: totalizar(lineas),")'
mutar "el testigo del cierre vuelve a restar el ajuste" src/lib/asistencia/planilla-guardada.ts \
  's = s.replace("    totalNeto += l.dinero.netoPagar;", "    totalNeto += l.dinero.netoPagar - (l.ajusteAnterior ?? 0);")'

echo "── EL COMPROBANTE ──────────────────────────────────────────────────────"
mutar "vuelve el renglón AJUSTE QUINCENA ANTERIOR" src/lib/asistencia/comprobante.ts \
  's = s.replace("  \"mercancia\",\n  \"totalDescuentos\",", "  \"mercancia\",\n  \"ajusteAnterior\",\n  \"totalDescuentos\",")
s = s.replace("    R(\"totalDescuentos\", \"TOTAL DE DESCUENTOS\", totalDescuentos, \"total\", true),", "    R(\"ajusteAnterior\", \"AJUSTE QUINCENA ANTERIOR\", n2(linea.ajusteAnterior), \"dato\", true),\n    R(\"totalDescuentos\", \"TOTAL DE DESCUENTOS\", totalDescuentos, \"total\", true),")'
mutar "el papel resta el ajuste otra vez del salario a pagar" src/lib/asistencia/comprobante.ts \
  's = s.replace("  const salarioAPagar = v(d?.netoPagar);", "  const salarioAPagar = centavos(v(d?.netoPagar) - n2(linea.ajusteAnterior));")'
mutar "el papel no lleva la nota" src/lib/asistencia/comprobante.ts \
  's = s.replace("    nota: notaAjuste([linea]),", "    nota: null,")'
mutar "el PDF del comprobante no dibuja la nota" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace("  if (c.nota) {", "  if (false && c.nota) {")'

echo "── EL EXCEL Y EL PDF DE LA PLANILLA ────────────────────────────────────"
mutar "la hoja «Ajuste anterior» no nace" src/lib/asistencia/planilla-exportar.ts \
  's = s.replace("    ...(hojaAjuste ? [{ name: \"Ajuste anterior\", ws: hojaAjuste }] : []),\n", "")'
mutar "la nota no va al pie de la hoja Planilla" src/lib/asistencia/planilla-exportar.ts \
  's = s.replace("  const notaPlanilla = [avisoRangoLibre(d), notaAjuste(d.lineas)]", "  const notaPlanilla = [avisoRangoLibre(d)]")'
mutar "la nota no va al pie del PDF" src/lib/asistencia/planilla-exportar.ts \
  's = s.replace("    notaAjuste(d.lineas),\n    FORMULA_NETO,", "    FORMULA_NETO,")'

echo "── LA PANTALLA ─────────────────────────────────────────────────────────"
mutar "el pie de la tabla vuelve a restar el ajuste" src/app/asistencia/PlanillaTab.tsx \
  's = s.replace("                      data.totales.netoPagar,\n                    ].map((v, i) => (", "                      data.totales.netoPagar - (data.ajusteQuincenaAnterior?.total ?? 0),\n                    ].map((v, i) => (")'
mutar "la celda pierde su nota" src/app/asistencia/PlanillaTab.tsx \
  's = s.replace("notaCeldaAjuste(campo, l.ajusteDetalle);", "(null as string | null);")'
mutar "el pie del cuadro calla" src/app/asistencia/PlanillaTab.tsx \
  's = s.replace("notaAjuste(buenas)", "null")'
mutar "vuelve el texto «Ajuste quincena anterior» a la pantalla" src/app/asistencia/PlanillaTab.tsx \
  's = s.replace("            <span>Neto a pagar</span>", "            <span>Neto a pagar</span>{!!l.ajusteAnterior && <span>Ajuste quincena anterior</span>}")'

echo "── CONTROLES (no deben cazarse) ────────────────────────────────────────"
control "cambia la redacción de un comentario del módulo puro" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("// Así que el ajuste se REPARTE (`repartirAjuste`)", "// Por eso el ajuste se REPARTE (`repartirAjuste`)")'
control "cambia el ancho de la columna «Días» de la hoja de ajuste" src/lib/asistencia/planilla-exportar.ts \
  's = s.replace("    { header: \"Días\", wch: 14, align: \"center\" },", "    { header: \"Días\", wch: 16, align: \"center\" },")'

restaurar
echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "  $CAZADAS de $TOTAL mutaciones cazadas · $CONTROLES_OK de 2 controles OK"
if [ ${#ESCAPADAS[@]} -gt 0 ]; then echo "  ESCAPARON:"; for e in "${ESCAPADAS[@]}"; do echo "    · $e"; done; fi
echo "═══════════════════════════════════════════════════════════════════════"

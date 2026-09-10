#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de la Planilla Unida.
#
# Rompe cada regla A PROPÓSITO, una por vez, y comprueba que algún candado se
# pone ROJO. Un candado que no caza su propia mutación no es un candado: es un
# test que acompaña.
#
# 🩸 SE RESTAURA POR COPIA A /tmp, JAMÁS CON `git checkout`. Un
# `trap 'git checkout …' EXIT` ya borró el trabajo sin commitear de un agente
# que se trabó a mitad de la verificación. Acá el respaldo se hace ANTES de la
# primera mutación y se devuelve con `cp`, así que lo que no está commiteado
# sigue estando.
#
#   bash scripts/_mutar-candados-planilla-unida.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

RESPALDO="$(mktemp -d /tmp/mutar-planilla-unida.XXXXXX)"
ARCHIVOS=(
  "src/lib/asistencia/comprobante.ts"
  "src/lib/asistencia/comprobante-pdf.ts"
  "src/lib/asistencia/cierre-prestamo.ts"
  "src/lib/asistencia/cierre-prestamo-server.ts"
  "src/lib/asistencia/corte-quincena.ts"
  "src/lib/asistencia/abono-extra.ts"
  "src/lib/asistencia/datos-del-papel.ts"
  "src/lib/asistencia/planilla-unida.ts"
  "src/lib/asistencia/config-server.ts"
  "src/app/api/asistencia/planilla-guardada/route.ts"
  "src/app/api/asistencia/prestamos-deuda/route.ts"
  "src/app/asistencia/AsistenciaClient.tsx"
  "src/app/asistencia/PlanillaTab.tsx"
  "src/app/asistencia/PrestamosTab.tsx"
  "supabase/migrations/20261028120000_planilla_unida.sql"
  "src/lib/backup/tablas.ts"
  "src/lib/asistencia/planilla.ts"
  "src/lib/asistencia/planilla-guardada.ts"
  "src/lib/asistencia/planilla-guardada-server.ts"
  "src/app/api/asistencia/planilla/route.ts"
)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; echo "→ archivos restaurados desde $RESPALDO"' EXIT

TESTS="src/__tests__/lib/planilla-unida-comprobante.test.ts \
src/__tests__/lib/planilla-unida-cierre-prestamo.test.ts \
src/__tests__/lib/planilla-unida-corte-y-cableado.test.ts \
src/__tests__/lib/asistencia-pestanas.test.ts \
src/__tests__/lib/backup-nada-sin-copia.test.ts"

CAZADAS=0; TOTAL=0; ESCAPADAS=()

# $1 = qué se rompe · $2 = archivo · $3 = python de la mutación
mutar() {
  local nombre="$1" archivo="$2" py="$3"
  TOTAL=$((TOTAL + 1))
  restaurar
  if ! python3 - "$archivo" <<PY
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
o = s
$py
if s == o:
    sys.exit("LA MUTACIÓN NO APLICÓ")
io.open(p, "w", encoding="utf-8").write(s)
PY
  then
    echo "  ⚠️  $nombre — la mutación no aplicó (el ancla cambió); REVISAR"
    ESCAPADAS+=("$nombre (ancla)")
    return
  fi
  if npx vitest run $TESTS >/dev/null 2>&1; then
    echo "  ❌ ESCAPÓ: $nombre"
    ESCAPADAS+=("$nombre")
  else
    echo "  ✅ cazada: $nombre"
    CAZADAS=$((CAZADAS + 1))
  fi
}

echo "── EL COMPROBANTE ──────────────────────────────────────────────────────"
mutar "esconde el renglón de ISR cuando vale 0" src/lib/asistencia/comprobante.ts \
  's = s.replace('"'"'    R("isr", "IMPUESTO SOBRE LA RENTA", v(d?.isr), "dato", true),'"'"', "")
s = s.replace('"'"'  "isr",\n'"'"', "")'
mutar "esconde todos los renglones en cero" src/lib/asistencia/comprobante.ts \
  's = s.replace("    renglones,", "    renglones: renglones.filter((r) => r.tipo === \"seccion\" || r.monto !== 0),")'
mutar "mete los minutos DENTRO del rótulo de TARDANZAS" src/lib/asistencia/comprobante.ts \
  's = s.replace('"'"'R("tardanzas", "TARDANZAS", v(d?.tardanzas), "dato", false,'"'"',
              '"'"'R("tardanzas", `TARDANZAS (${notaTardanza(linea.horas) ?? ""})`, v(d?.tardanzas), "dato", false,'"'"')'
mutar "los minutos salen de tardanzaMin (el total), no de los valuados" src/lib/asistencia/comprobante.ts \
  's = s.replace("  const m = minutosTardanzaMostrados(horas);", "  const m = horas.tardanzaMin;")'
mutar "el ajuste se suma a AUSENCIA en vez de ir en su renglón" src/lib/asistencia/comprobante.ts \
  's = s.replace('"'"'R("ausencia", "AUSENCIA", v(d?.ausencias), "dato", false),'"'"',
              '"'"'R("ausencia", "AUSENCIA", centavos(v(d?.ausencias) + ajuste), "dato", false),'"'"')
s = s.replace("    v(d?.prestamo) + v(d?.terceros) + compras + v(d?.mercancia) + ajuste,", "    v(d?.prestamo) + v(d?.terceros) + compras + v(d?.mercancia),")'
mutar "el total de descuentos deja de incluir la mercancía" src/lib/asistencia/comprobante.ts \
  's = s.replace("v(d?.prestamo) + v(d?.terceros) + compras + v(d?.mercancia) + ajuste,", "v(d?.prestamo) + v(d?.terceros) + compras + ajuste,")'
mutar "«otros servicios» se resta en vez de sumar" src/lib/asistencia/comprobante.ts \
  's = s.replace("  const salarioAPagar = centavos(v(d?.netoPagar) - ajuste);", "  const salarioAPagar = centavos(v(d?.netoPagar) - ajuste - 2 * v(d?.otrosServicios));")'
mutar "una empresa desconocida sale con el nombre de Fashion Wear" src/lib/asistencia/comprobante.ts \
  's = s.replace("  const alterno = String(etiqueta ?? \"\").trim();", "  return EMPRESAS.fashion_wear;\n  const alterno = String(etiqueta ?? \"\").trim();")'
mutar "un rango libre se disfraza de I QUINCENA" src/lib/asistencia/comprobante.ts \
  's = s.replace("  if (opts.esQuincena && opts.anio && opts.mes && opts.n) {", "  if (opts.anio && opts.mes) {\n    opts = { ...opts, n: opts.n ?? 1 };")'
mutar "sin cargo cargado se inventa un cargo" src/lib/asistencia/comprobante.ts \
  's = s.replace('"'"'String(datos.posicion ?? "").trim() || "—",'"'"', '"'"'String(datos.posicion ?? "").trim() || "Colaborador",'"'"')'
mutar "se le hace comprobante a quien no produjo dinero" src/lib/asistencia/comprobante.ts \
  's = s.replace("  return lineas.filter((l) => !!l.dinero);", "  return lineas;")'
mutar "el PDF junta a todos en una sola hoja" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace("    if (i > 0) doc.addPage();", "")'
mutar "el PDF se salta los renglones en cero" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace("    const esTotal = r.tipo === \"total\";", "    if (r.monto === 0) continue;\n    const esTotal = r.tipo === \"total\";")'
mutar "el PDF deja de imprimir el pie que se firma" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace('"'"'    ["RECIBI CONFORME", ""],'"'"', "")'

echo "── EL PAGO DEL PRÉSTAMO ────────────────────────────────────────────────"
mutar "escribe el pago aunque el módulo ya lo tenía (cobra dos veces)" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("    if (n(deuda.yaDescontado) > 0) {", "    if (false) {")'
mutar "escribe la SUGERENCIA en vez de lo que dice la casilla" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("    const monto = n(l.dinero.prestamo);", "    const monto = n(opts.deudas.get(l.codigo)?.cuotaPrestamo);")'
mutar "no capea cada cuenta a su propio saldo" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("  const aPrimero = Math.min(monto, Math.max(0, topePrimero));", "  const aPrimero = monto;")'
mutar "reparte todo al préstamo e ignora la cuota del daño" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("  if (centavos(propuestaP + propuestaD) === monto) {", "  if (false) {")'
mutar "se calla cuando alguien que debe no tuvo descuento" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace('"'"'        omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto: 0, motivo: "casilla-en-cero" });'"'"', "")'
mutar "se calla cuando el descuento no está atado a ninguna ficha" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace('"'"'      omisiones.push({ codigo: l.codigo, etiqueta: l.etiqueta, monto, motivo: "sin-ficha" });'"'"', "")'
mutar "renombra el concepto del daño de mercancía" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace('"'"'  dano: "Pago de responsabilidad",'"'"', '"'"'  dano: "Abono extra",'"'"')'
mutar "escribe el amarre ANTES del movimiento" src/lib/asistencia/cierre-prestamo-server.ts \
  's = s.replace("""  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .insert({""", """  const { error: errAmarre0 } = await supabaseServer.from(TABLA_AMARRE).insert({
    planilla_id: planillaId, empleado_codigo: p.codigo, cuenta: p.cuenta,
    movimiento_id: "00000000-0000-0000-0000-000000000000",
  });
  if (errAmarre0) throw new Error("amarre");
  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .insert({""")'
mutar "reabrir BORRA el movimiento en vez de marcarlo" src/lib/asistencia/cierre-prestamo-server.ts \
  's = s.replace('"'"'      .update({ deleted: true })'"'"', '"'"'      .delete()'"'"')'
mutar "reabrir deja de revertir los pagos" src/app/api/asistencia/planilla-guardada/route.ts \
  's = s.replace("      const rev = await revertirPagosDelCierre({ planillaId: id, usuario });", "      const rev = { revertidos: 0 };")'
mutar "el cierre escribe el pago sin await (fire-and-forget)" src/app/api/asistencia/planilla-guardada/route.ts \
  's = s.replace("      const escrito = await escribirPagosDelCierre({ planillaId: r.id, plan });",
                "      const escrito = { escritos: 0, total: 0 };\n      void escribirPagosDelCierre({ planillaId: r.id, plan }).then(() => {});")'
mutar "lee los préstamos con .eq(deleted,false) y pierde filas" src/lib/asistencia/cierre-prestamo-server.ts \
  's = s.replace('"'"'        .or("deleted.is.null,deleted.eq.false")'"'"', '"'"'        .eq("deleted", false)'"'"')'
mutar "recalcula el saldo en vez de usar prestamos-saldo" src/lib/asistencia/cierre-prestamo-server.ts \
  's = s.replace("""import {
  calcularSaldoPrestamo,
  cuentaMasVieja,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";""", """import {
  cuentaMasVieja,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";
const calcularSaldoPrestamo = (ms: readonly MovimientoParaSaldo[]) => ({
  cuentas: { prestamo: { saldo: 0, desde: null }, dano: { saldo: 0, desde: null } },
} as never);""")'
mutar "el amarre pierde su índice único (cerrar dos veces cobra dos veces)" supabase/migrations/20261028120000_planilla_unida.sql \
  's = s.replace("CREATE UNIQUE INDEX IF NOT EXISTS asistencia_planilla_prestamo_una_vez", "CREATE INDEX IF NOT EXISTS asistencia_planilla_prestamo_una_vez")'
mutar "el amarre se cae del respaldo" src/lib/backup/tablas.ts \
  's = s.replace(chr(34) + "asistencia_planilla_prestamo" + chr(34) + ",", "")'

echo "── EL ABONO EXTRAORDINARIO ─────────────────────────────────────────────"
mutar "deja anotar un abono con origen «Quincena»" src/lib/asistencia/abono-extra.ts \
  's = s.replace('"'"'export const ORIGENES_ABONO = ["Efectivo", "Décimo", "Vacaciones", "Liquidación"] as const;'"'"',
              '"'"'export const ORIGENES_ABONO = ["Efectivo", "Décimo", "Vacaciones", "Liquidación", "Quincena"] as const;'"'"')
s = s.replace("  if (origenRaw === ORIGEN_DE_LA_QUINCENA) {", "  if (false) {")'
mutar "acepta un abono de cero" src/lib/asistencia/abono-extra.ts \
  's = s.replace("  if (!Number.isFinite(monto) || monto <= 0) {", "  if (false) {")'
mutar "la secretaria puede ANOTAR abonos" src/app/api/asistencia/prestamos-deuda/route.ts \
  's = s.replace("  const auth = requireAsistencia(req, cerrarPlanillaRoles());", "  const auth = requireAsistencia(req, asistenciaRoles());")'

echo "── EL CORTE Y EL AJUSTE ────────────────────────────────────────────────"
mutar "el ajuste se lleva también el sueldo quincenal" src/lib/asistencia/corte-quincena.ts \
  's = s.replace('"'"'  { campo: "ausencias", signo: +1 },'"'"', '"'"'  { campo: "ausencias", signo: +1 },\n  { campo: "salarioQuincenal", signo: -1 },'"'"')'
mutar "las horas extra se descuentan en vez de devolverse" src/lib/asistencia/corte-quincena.ts \
  's = s.replace('"'"'  { campo: "extraDiurno", signo: -1 },'"'"', '"'"'  { campo: "extraDiurno", signo: +1 },'"'"')'
mutar "el corte propuesto pasa del 13 al 15 (o sea, no corta)" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("export const CORTE_SUGERIDO: Readonly<Record<1 | 2, number>> = { 1: 13, 2: 28 };", "export const CORTE_SUGERIDO: Readonly<Record<1 | 2, number>> = { 1: 15, 2: 31 };")'
mutar "un corte fuera del rango se acepta" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("  return corte >= desde && corte < hasta;", "  return true;")'

echo "── EL INTERRUPTOR Y LA FICHA ───────────────────────────────────────────"
mutar "el interruptor arranca PRENDIDO" src/lib/asistencia/planilla-unida.ts \
  's = s.replace('"'"'  return v === "1" || v === "true" || v === "si" || v === "sí";'"'"', "  return v !== \"0\";")'
mutar "la pestaña Préstamos deja de colgar del interruptor" src/app/asistencia/AsistenciaClient.tsx \
  's = s.replace('"'"'  const visibles = TABS.filter(([k]) => (k === "prestamos" ? PLANILLA_UNIDA : true))\n    .filter(([k]) => vePestana(rol, k));'"'"',
              "  const visibles = TABS.filter(([k]) => vePestana(rol, k));")'
mutar "el botón de comprobantes deja de colgar del interruptor" src/app/asistencia/PlanillaTab.tsx \
  's = s.replace("          {PLANILLA_UNIDA && (\n            <button\n              type=\"button\" onClick={bajarComprobantes}", "          {true && (\n            <button\n              type=\"button\" onClick={bajarComprobantes}")
s = s.replace("import { PLANILLA_UNIDA } from \"@/lib/asistencia/planilla-unida\";", "")'
mutar "la pestaña Préstamos se va al primer lugar" src/app/asistencia/AsistenciaClient.tsx \
  's = s.replace('"'"'  ["prestamos", "Préstamos"],\n'"'"', "")
s = s.replace('"'"'  ["reporte", "Reporte"],'"'"', '"'"'  ["prestamos", "Préstamos"],\n  ["reporte", "Reporte"],'"'"')'
mutar "el cargo vacío se guarda como cadena vacía" src/lib/asistencia/datos-del-papel.ts \
  's = s.replace("  if (!t) return null;", "  if (!t) return \"\" as unknown as null;")'
mutar "el select deja de pedir las columnas del papel" src/lib/asistencia/config-server.ts \
  's = s.replace("const COLS_CON_PAPEL = `${COLS_CON_BASE_SEGUROS}, ${COLUMNAS_DEL_PAPEL.join(\", \")}`;", "const COLS_CON_PAPEL = COLS_CON_BASE_SEGUROS;")'

echo "── EL CORTE Y EL AJUSTE ────────────────────────────────────────────────"
mutar "el reloj se mide hasta el fin, ignorando el corte" src/app/api/asistencia/planilla/route.ts \
  's = s.replace("const hastaReloj = corte ?? q.hasta;", "const hastaReloj = q.hasta;")'
mutar "el corte prorratea el sueldo (mide el período corto)" src/app/api/asistencia/planilla/route.ts \
  's = s.replace("hasta: hastaReloj,\n      reglas,\n      nombres,\n      incluirNoHabiles: true,", "hasta: hastaReloj,\n      reglas,\n      nombres,\n      incluirNoHabiles: true,")
s = s.replace("factorBase: q.factorBase", "factorBase: 0.5")'
mutar "el neto guardado NO resta el ajuste" src/lib/asistencia/planilla-guardada.ts \
  's = s.replace("totalNeto += l.dinero.netoPagar - (l.ajusteAnterior ?? 0);", "totalNeto += l.dinero.netoPagar;")'
mutar "el ajuste NO se congela en la línea guardada" src/lib/asistencia/planilla-guardada.ts \
  's = s.replace("ajuste_anterior: l.ajusteAnterior ?? 0,", "ajuste_anterior: 0,")'
mutar "el cierre NO guarda el corte en la cabecera" src/lib/asistencia/planilla-guardada-server.ts \
  's = s.replace("corte: opts.corte ?? null,", "corte: null,")'
mutar "el rango que mide los días sin medir SÍ lleva corte (recursión)" src/app/api/asistencia/planilla/route.ts \
  's = s.replace("url.searchParams.set(\"hasta\", restante.hasta);", "url.searchParams.set(\"hasta\", restante.hasta);\n  url.searchParams.set(\"corte\", restante.desde);")'
mutar "netoConAjuste ignora el ajuste" src/lib/asistencia/corte-quincena.ts \
  's = s.replace("return centavos(Number(netoPagar || 0) - Number(ajuste || 0));", "return centavos(Number(netoPagar || 0));")'
mutar "quincenaAnterior no cruza el año en enero" src/lib/asistencia/planilla.ts \
  's = s.replace("const anio = q.mes === 1 ? q.anio - 1 : q.anio;", "const anio = q.anio;")'

echo
echo "── CONTROLES: NO se tienen que cazar ───────────────────────────────────"
CONTROLES_OK=0
control() {
  local nombre="$1" archivo="$2" py="$3"
  restaurar
  python3 - "$archivo" <<PY >/dev/null
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
o = s
$py
if s == o:
    sys.exit("LA MUTACIÓN NO APLICÓ")
io.open(p, "w", encoding="utf-8").write(s)
PY
  if npx vitest run $TESTS >/dev/null 2>&1; then
    echo "  ✅ control OK (no se cazó): $nombre"
    CONTROLES_OK=$((CONTROLES_OK + 1))
  else
    echo "  ❌ CONTROL CAZADO (el candado aprieta de más): $nombre"
  fi
}

# Un cambio de REDACCIÓN no puede poner el build rojo: los candados miran la
# regla, no la prosa.
control "cambia la redacción del aviso de omisión" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace('"'"'  "sin-saldo": "se le descontó, pero ya no debe nada",'"'"', '"'"'  "sin-saldo": "se le descontó y ya no debía nada",'"'"')'
# Mover el logo del papel tampoco: no cambia ningún renglón ni ningún monto.
control "mueve el logo del comprobante unos milímetros" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace("doc.addImage(FG_LOGO_BASE64, \"JPEG\", MARGEN, y - 4, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);", "doc.addImage(FG_LOGO_BASE64, \"JPEG\", MARGEN + 1, y - 3, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);")'

echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "  $CAZADAS de $TOTAL mutaciones cazadas · $CONTROLES_OK de 2 controles OK"
if [ ${#ESCAPADAS[@]} -gt 0 ]; then
  echo "  ESCAPARON:"; for e in "${ESCAPADAS[@]}"; do echo "    · $e"; done
fi
echo "═══════════════════════════════════════════════════════════════════════"

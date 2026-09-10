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
  "src/lib/asistencia/persona-en-el-centro.ts"
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
  "src/lib/prestamos-saldo.ts"
  "src/lib/prestamos-conceptos.ts"
  "src/lib/asistencia/prestamos-planilla.ts"
  "src/lib/asistencia/prestamos-planilla-server.ts"
  "src/lib/asistencia/motivos.ts"
  "src/lib/asistencia/roles.ts"
  "src/lib/asistencia/aprobador-empresa.ts"
  "src/lib/asistencia/directorio.ts"
  "src/lib/asistencia/planilla-exportar.ts"
  "src/lib/nombre-en-pantalla.ts"
  "src/lib/comisiones/alias.ts"
  "src/app/api/asistencia/configuracion/route.ts"
  "src/app/api/prestamos/movimientos/route.ts"
  "src/app/prestamos/components/EditEmpleadoModal.tsx"
  "supabase/migrations/20261029120000_terceros_tercera_cuenta.sql"
  "supabase/migrations/20261030120000_codigos_ignorados.sql"
  "supabase/migrations/20261031120000_acs_cuarta_empresa.sql"
  "src/lib/asistencia/codigos-ignorados.ts"
  "src/lib/asistencia/codigos-ignorados-server.ts"
  "src/app/api/asistencia/codigos-ignorados/route.ts"
  "src/app/asistencia/ConfiguracionTab.tsx"
  "src/app/asistencia/EstadoReloj.tsx"
  "src/lib/asistencia/config.ts"
  "src/lib/asistencia/extra-automatico.ts"
  "src/lib/cxc/empresa-fiscal.ts"
  "supabase/migrations/20261101120000_acs_aprueba_daniel.sql"
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
src/__tests__/lib/backup-nada-sin-copia.test.ts \
src/__tests__/lib/planilla-tres-descuentos.test.ts \
src/__tests__/lib/asistencia-prestamo-planilla.test.ts \
src/__tests__/lib/prestamos-dos-cuentas.test.ts \
src/__tests__/lib/asistencia-config.test.ts"

CAZADAS=0; TOTAL=0; ESCAPADAS=()

# $1 = qué se rompe · $2 = archivo · $3 = python de la mutación
mutar() {
  local nombre="$1" archivo="$2" py="$3"
  # 🩸 SIN ESTE FRENO, UN ARCHIVO QUE NO ESTÁ EN `ARCHIVOS` SE MUTA Y NO SE
  # RESTAURA NUNCA: `restaurar` solo devuelve lo que respaldó. Ya pasó — doce
  # archivos quedaron mutados y 75 candados en rojo, y el script decía que todo
  # había sido restaurado.
  if [ ! -f "$RESPALDO/$archivo" ]; then
    echo "  ⛔ $nombre — «${archivo}» NO está en ARCHIVOS: se aborta para no dejarlo mutado."
    exit 1
  fi
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
  's = s.replace("v(d?.prestamo) + v(d?.terceros) + v(d?.mercancia) + ajuste,", "v(d?.prestamo) + v(d?.terceros) + ajuste,")'
mutar "«otros servicios» se resta en vez de sumar" src/lib/asistencia/comprobante.ts \
  's = s.replace("  const salarioAPagar = centavos(v(d?.netoPagar) - ajuste);", "  const salarioAPagar = centavos(v(d?.netoPagar) - ajuste - 2 * v(d?.otrosServicios));")'
mutar "una empresa desconocida sale con el nombre de Fashion Wear" src/lib/asistencia/comprobante.ts \
  's = s.replace("  const alterno = String(etiqueta ?? \"\").trim();", "  return EMPRESAS.fashion_wear;\n  const alterno = String(etiqueta ?? \"\").trim();")'
mutar "un rango libre se disfraza de I QUINCENA" src/lib/asistencia/comprobante.ts \
  's = s.replace("  if (opts.esQuincena && opts.anio && opts.mes && opts.n) {", "  if (opts.anio && opts.mes) {\n    opts = { ...opts, n: opts.n ?? 1 };")'
mutar "sin cargo cargado se inventa un cargo" src/lib/asistencia/comprobante.ts \
  's = s.replace('"'"'String(datos.posicion ?? "").trim() || "—",'"'"', '"'"'String(datos.posicion ?? "").trim() || "Colaborador",'"'"')'
mutar "se le hace comprobante a quien no produjo dinero" src/lib/asistencia/comprobante.ts \
  's = s.replace("    .filter((l) => !!l.dinero)", "    .filter(() => true)")'
mutar "el PDF junta a todos en una sola hoja" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace("    if (i > 0) doc.addPage();", "")'
mutar "el PDF se salta los renglones en cero" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace("    const esTotal = r.tipo === \"total\";", "    if (r.monto === 0) continue;\n    const esTotal = r.tipo === \"total\";")'
mutar "el PDF deja de imprimir el pie que se firma" src/lib/asistencia/comprobante-pdf.ts \
  's = s.replace('"'"'    ["RECIBI CONFORME", ""],'"'"', "")'

echo "── EL PAGO DEL PRÉSTAMO ────────────────────────────────────────────────"
mutar "escribe el pago aunque el módulo ya lo tenía (cobra dos veces)" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("      if (n(deuda[c.yaDescontado] as number) > 0) {", "      if (false) {")'
mutar "escribe la SUGERENCIA en vez de lo que dice la casilla" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("      const monto = n(l.dinero[c.campo]);", "      const monto = n(opts.deudas.get(l.codigo)?.cuotaPrestamo);")'
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
mutar "el cierre deja de leer el saldo de terceros" src/lib/asistencia/cierre-prestamo-server.ts \
  's = s.replace("      saldoTerceros: s.cuentas.terceros.saldo,", "      saldoTerceros: 0,")'
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
# ⚠️ ANCLA ACTUALIZADA EL 10-sep-2026: «la persona en el centro» mudó el armado
# de las pestañas de AsistenciaClient.tsx a `pestanasDeAsistencia`. La regla que
# se muta es la MISMA: Préstamos solo existe con el interruptor prendido.
mutar "la pestaña Préstamos deja de colgar del interruptor" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace('"'"'  return base.filter(([k]) => (k === "prestamos" ? opts.planillaUnida : true));'"'"',
              "  return base;")'
mutar "el botón de comprobantes deja de colgar del interruptor" src/app/asistencia/PlanillaTab.tsx \
  's = s.replace("          {PLANILLA_UNIDA && (\n            <button\n              type=\"button\" onClick={bajarComprobantes}", "          {true && (\n            <button\n              type=\"button\" onClick={bajarComprobantes}")
s = s.replace("import { PLANILLA_UNIDA } from \"@/lib/asistencia/planilla-unida\";", "")'
# ⚠️ ANCLA ACTUALIZADA EL 10-sep-2026: misma mudanza. Se mueve Préstamos al
# primer lugar del acomodo de HOY, que es donde el candado exige que Reporte
# siga abriendo el módulo con el interruptor apagado.
mutar "la pestaña Préstamos se va al primer lugar" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace('"'"'  ["reporte", "Reporte"],\n  ["planilla", "Planilla"],\n  ["prestamos", "Préstamos"],'"'"',
              '"'"'  ["prestamos", "Préstamos"],\n  ["reporte", "Reporte"],\n  ["planilla", "Planilla"],'"'"')'
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

echo "── LOS TRES DESCUENTOS ─────────────────────────────────────────────────"
mutar "el préstamo vuelve a sumarle la cuota del daño" src/lib/asistencia/prestamos-planilla.ts \
  's = s.replace("""  const monto = saldoP > 0 && cuotaP > 0 ? Math.min(cuotaP, saldoP) : 0;
  return { monto: centavos(monto), origen: "cuota" };""", """  const monto = (saldoP > 0 && cuotaP > 0 ? Math.min(cuotaP, saldoP) : 0) + centavos(num(f.cuotaDano));
  return { monto: centavos(monto), origen: "cuota" };""")'
mutar "terceros deja de capearse a su saldo (cobra de más)" src/lib/asistencia/prestamos-planilla.ts \
  's = s.replace("""  const monto = saldo > 0 && cuota > 0 ? Math.min(cuota, saldo) : 0;""", """  const monto = cuota;""")'
mutar "la casilla de terceros va a la cuenta del préstamo" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("""  { cuenta: CUENTA_TERCEROS, campo: "terceros", yaDescontado: "yaDescontadoTerceros", saldo: "saldoTerceros" },""", """  { cuenta: CUENTA_PRESTAMO, campo: "terceros", yaDescontado: "yaDescontadoTerceros", saldo: "saldoTerceros" },""")'
mutar "la casilla de mercancía deja de anotarse en la cuenta de daño" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("""  { cuenta: CUENTA_DANO, campo: "mercancia", yaDescontado: "yaDescontadoDano", saldo: "saldoDano" },\n""", "")'
mutar "el «ya descontado» vuelve a ser uno solo para las tres cuentas" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("      if (n(deuda[c.yaDescontado] as number) > 0) {", "      if (n(deuda.yaDescontado) > 0) {")'
mutar "el cierre anota más de lo que se debe" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("      const aAnotar = centavos(Math.min(monto, saldo));", "      const aAnotar = centavos(monto);")'
mutar "terceros se anota con el concepto del préstamo" src/lib/asistencia/cierre-prestamo.ts \
  's = s.replace("""  terceros: "Pago de terceros",""", """  terceros: "Pago",""")'
mutar "el saldo deja de contar la cuenta de terceros" src/lib/prestamos-saldo.ts \
  's = s.replace("export const CUENTAS: readonly CuentaPrestamo[] = [CUENTA_PRESTAMO, CUENTA_DANO, CUENTA_TERCEROS];", "export const CUENTAS: readonly CuentaPrestamo[] = [CUENTA_PRESTAMO, CUENTA_DANO];")'
mutar "un movimiento de terceros sin cuenta cae en préstamo" src/lib/prestamos-saldo.ts \
  's = s.replace("  if (DE_TERCEROS.has(m.concepto)) return CUENTA_TERCEROS;\n", "")'
mutar "el cargo de terceros deja de ofrecerse" src/lib/prestamos-conceptos.ts \
  's = s.replace("  CONCEPTO_PRESTAMO, CONCEPTO_DANO, CONCEPTO_TERCEROS, CONCEPTO_PAGO,", "  CONCEPTO_PRESTAMO, CONCEPTO_DANO, CONCEPTO_PAGO,")'
mutar "«descuento por compras» vuelve al papel" src/lib/asistencia/comprobante.ts \
  's = s.replace("""  "terceros",
  "mercancia",""", """  "terceros",
  "compras",
  "mercancia",""")
s = s.replace("""    R("mercancia", "DAÑO DE MERCANCIA", v(d?.mercancia), "dato", true),""", """    R("compras" as never, "DESCUENTO POR COMPRAS", 0, "dato", true),
    R("mercancia", "DAÑO DE MERCANCIA", v(d?.mercancia), "dato", true),""")'
mutar "el terceros pasa a esperar la aprobación de Daniel" src/app/api/prestamos/movimientos/route.ts \
  's = s.replace("  if (concepto === CONCEPTO_PRESTAMO) {", "  if (concepto === CONCEPTO_PRESTAMO || concepto === \"Descuento a terceros\") {")'
mutar "la ficha vuelve a ofrecer la cuota de daño" src/app/prestamos/components/EditEmpleadoModal.tsx \
  's = s.replace("<label className=\"text-xs text-gray-400 uppercase\">Cuota de terceros ($ por quincena)</label>", "<label className=\"text-xs text-gray-400 uppercase\">Cuota de daño ($ por quincena)</label>")'

echo "── ROLES, NOMBRES Y MOTIVOS ────────────────────────────────────────────"
mutar "la contadora deja de alcanzar a Boston" src/lib/asistencia/aprobador-empresa.ts \
  's = s.replace("  if (puedeCerrar(rol)) return { empresas: null, faltaTabla: false };\n", "")'
mutar "la secretaria pasa a cerrar la quincena" src/lib/asistencia/roles.ts \
  's = s.replace("""export const MIRAN_PERO_NO_CIERRAN = ["secretaria"] as const;""", "export const MIRAN_PERO_NO_CIERRAN = [] as const;")'
mutar "cualquiera de Asistencia escribe el cargo y la cédula" src/app/api/asistencia/configuracion/route.ts \
  's = s.replace("""  const puedeTocarLaFicha = puedeCerrar(String(auth.role ?? ""));""", "  const puedeTocarLaFicha = true;")'
mutar "los nombres vuelven a gritarse en la planilla" src/app/asistencia/PlanillaTab.tsx \
  's = s.replace("capitalizarNombre(l.etiqueta)", "l.etiqueta")'
mutar "el comprobante vuelve a gritar el nombre" src/lib/asistencia/comprobante.ts \
  's = s.replace("capitalizarNombre(linea.nombre) || linea.etiqueta", "linea.nombre?.trim() || linea.etiqueta")'
mutar "el capitalizador inventa un acento" src/lib/nombre-en-pantalla.ts \
  's = s.replace("  const palabras = v.toLocaleLowerCase(\"es\").split(\" \");", "  const palabras = v.toLocaleLowerCase(\"es\").replace(/on\\b/g, \"ón\").split(\" \");")'
mutar "las partículas se capitalizan («Luz De La Cruz»)" src/lib/nombre-en-pantalla.ts \
  's = s.replace("      if (i > 0 && PARTICULAS.has(p)) return p;\n", "")'
mutar "Comisiones vuelve a tener su propio capitalizador" src/lib/comisiones/alias.ts \
  's = s.replace("  return capitalizarNombre(v);", "  return v.toLocaleLowerCase(\"es\");")'
mutar "el orden del PDF deja de ser estable" src/lib/asistencia/comprobante.ts \
  's = s.replace("""  return lineas
    .filter((l) => !!l.dinero)
    .slice()
    .sort((a, b) => {""", """  return lineas
    .filter((l) => !!l.dinero)
    .slice()
    .sort(() => 0).sort((a, b) => {
      if (true) return 0;""")'
mutar "«Constancia» deja de ofrecerse" src/lib/asistencia/motivos.ts \
  's = s.replace("  MOTIVO_CONSTANCIA,\n] as const;", "] as const;")'

echo "── IGNORAR UN CÓDIGO Y LA CUARTA EMPRESA ───────────────────────────────"
mutar "ignorar deja de esconder (el filtro no filtra)" src/lib/asistencia/codigos-ignorados.ts \
  's = s.replace("  return filas.filter((f) => !ignorados.has(String(f.codigo).trim()));", "  return [...filas];")'
mutar "volver a mostrar BORRA la fila" src/lib/asistencia/codigos-ignorados-server.ts \
  's = s.replace("""    .update({
      activo: false,
      mostrado_por: opts.usuario,
      mostrado_en: new Date().toISOString(),
    })""", "    .delete()")'
mutar "el resumen sigue contando a los escondidos" src/app/api/asistencia/configuracion/route.ts \
  's = s.replace("    const activos = personasVisibles.filter((p) => p.activo);", "    const activos = personas.filter((p) => p.activo);")'
mutar "la planilla sigue mostrando a los escondidos" src/app/api/asistencia/planilla/route.ts \
  's = s.replace("    for (const c of ignorados) fuera.add(c);", "")'
mutar "cualquiera puede esconder un código" src/app/api/asistencia/codigos-ignorados/route.ts \
  's = s.replace("""export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, cerrarPlanillaRoles());""", """export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());""")'
mutar "ignorar solo se ofrece a quien NO tiene ficha" src/lib/asistencia/codigos-ignorados.ts \
  's = s.replace("export const TABLA_CODIGOS_IGNORADOS", "export const SOLO_SIN_FICHA = true;\nexport const TABLA_CODIGOS_IGNORADOS")
s = s.replace("export function estaIgnorado(codigo: string, ignorados: ReadonlySet<string>): boolean {", "export function estaIgnorado(codigo: string, ignorados: ReadonlySet<string>): boolean {\n  if (SOLO_SIN_FICHA) return false;")'
mutar "ACS se cae de la lista de empresas" src/lib/asistencia/config.ts \
  'q = chr(34)
s = s.replace("  " + q + "confecciones_boston" + q + ", " + q + "vistana" + q + ", " + q + "fashion_wear" + q + ", " + q + "american_classic" + q + ",",
              "  " + q + "confecciones_boston" + q + ", " + q + "vistana" + q + ", " + q + "fashion_wear" + q + ",")'
# ⚠️ ANCLA ACTUALIZADA EL 10-sep-2026: producción arregló este mismo defecto por
# su cuenta y lo escribió distinto (`(reloj)` en vez de `(r)`). Se muta la
# CONDUCTA: volver a dibujar uno solo.
mutar "la pantalla del reloj vuelve a mostrar solo el primero" src/app/asistencia/EstadoReloj.tsx \
  's = s.replace("      {relojes.map((reloj) => (", "      {relojes.slice(0, 1).map((reloj) => (")'
mutar "la migración de ACS se olvida de una tabla" supabase/migrations/20261031120000_acs_cuarta_empresa.sql \
  'i = s.index("ALTER TABLE asistencia_reparto_empresa")
j = s.index("ALTER TABLE asistencia_aprobador_empresa")
s = s[:i] + s[j:]'

echo "── ACS: NOMBRE LEGAL Y LOS 30 MINUTOS ──────────────────────────────────"
mutar "ACS hereda el correo del grupo" src/lib/cxc/empresa-fiscal.ts \
  's = s.replace("""    identificacion: "155638923-2-2016",
    correo: "",""", """    identificacion: "155638923-2-2016",""")'
mutar "el comprobante deja de decir el nombre legal de ACS" src/lib/asistencia/comprobante.ts \
  's = s.replace("""  const legal = fichaFiscal(k, "").legal.trim();
  if (legal) return legal;
""", "")'
mutar "el comprobante deja de imprimir la identificación" src/lib/asistencia/comprobante.ts \
  's = s.replace("""    identificacion: identificacionEmpresa(linea.empresa),""", """    identificacion: "",""")'
mutar "ACS deja de tener sus 30 minutos" src/lib/asistencia/extra-automatico.ts \
  's = s.replace("  american_classic: 30,", "  american_classic: 0,")'
mutar "los 30 minutos se le dan a TODAS las empresas" src/lib/asistencia/extra-automatico.ts \
  's = s.replace("  confecciones_boston: 0,", "  confecciones_boston: 30,")'
mutar "el motor deja de mirar los minutos automáticos" src/lib/asistencia/planilla.ts \
  's = s.replace("      const auto = Math.max(0, aprob?.autoMin ?? 0);", "      const auto = 0;")'
mutar "los minutos automáticos no salen de la empresa de la ficha" src/lib/asistencia/planilla.ts \
  's = s.replace("          autoMin: minutosExtraAutomaticos(ficha.empresa ?? null),", "          autoMin: 30,")'
mutar "los 30 minutos se comen el domingo y el feriado" src/lib/asistencia/planilla.ts \
  's = s.replace("      h.extraAutoMin += pagaDiurno + pagaNocturno;", "      h.extraAutoMin += pagaDiurno + pagaNocturno;\n      h.domingoMin += c.domingoMin;\n      h.feriadoMin += c.feriadoMin;")'
mutar "lo automático deja de congelarse en el cierre" src/lib/asistencia/planilla-guardada.ts \
  's = s.replace(chr(34)+"extra_auto_min"+chr(34), chr(34)+"jornada_diaria_min"+chr(34))'
mutar "en ACS vuelve a aprobar la contadora" supabase/migrations/20261101120000_acs_aprueba_daniel.sql \
  's = s.replace("VALUES (" + chr(39) + "daniel" + chr(39) + ", " + chr(39) + "american_classic" + chr(39) + ")", "VALUES (" + chr(39) + "Contabilidad" + chr(39) + ", " + chr(39) + "american_classic" + chr(39) + ")")'

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

/**
 * Corre el parser REAL (`src/lib/switch-api/ingresos-mercancia.ts`) contra los
 * CSV que bajó Daniel A MANO del reporte de Switch, y exige el cuadre conocido.
 *
 * NO toca la red ni la base. Es lo que se corre ANTES de entrar a la web: si el
 * parser no reproduce el cuadre de la muestra, no tiene sentido bajar nada.
 *
 * Uso:
 *   DETALLE=<ruta.csv> RESUMEN=<ruta.csv> npx tsx scripts/_verif-ingresos-parser.ts
 *
 * Cuadre esperado de la muestra de vistana (11-feb-2026 → 07-ago-2026):
 *   1.477 líneas de detalle · 61.371 unidades · 124 documentos · 0 negativas
 */
import { readFileSync } from "node:fs";
import { parseDetalleCsv, parseResumenCsv, cuadrar, hallazgos } from "../src/lib/switch-api/ingresos-mercancia";

const DETALLE = process.env.DETALLE;
const RESUMEN = process.env.RESUMEN;
if (!DETALLE || !RESUMEN) {
  console.error("Faltan DETALLE=<ruta.csv> y RESUMEN=<ruta.csv>");
  process.exit(1);
}

const d = parseDetalleCsv(process.env.EMPRESA ?? "vistana", readFileSync(DETALLE, "utf8"));
const r = parseResumenCsv(readFileSync(RESUMEN, "utf8"));
const c = cuadrar(d.filas, r.documentos);
const h = hallazgos(d.filas);

const fechas = d.filas.map((f) => f.fecha).sort();

console.log("═══ DETALLE ═══");
console.log("  VARIANTE .................", d.variante, d.variante === "costo_unico" ? "🔴 una sola columna COSTO — no se sabe si es FOB o CIF" : "(FOB y CIF separados)");
console.log("  líneas leídas ............", d.filas.length);
console.log("  líneas salteadas .........", d.skips.length);
for (const s of d.skips.slice(0, 10)) console.log(`    línea ${s.linea}: ${s.motivo} — ${s.crudo}`);
console.log("  unidades .................", d.unidades);
console.log("  documentos ...............", d.documentos);
console.log("  rango de fechas ..........", fechas[0], "→", fechas[fechas.length - 1]);

console.log("\n═══ RESUMEN ═══");
console.log("  documentos ...............", r.documentos.length);
console.log("  unidades .................", r.unidades);
console.log("  total $ ..................", r.total.toFixed(2));

console.log("\n═══ CUADRE detalle vs resumen ═══");
console.log("  unidades detalle .........", c.unidadesDetalle);
console.log("  unidades resumen .........", c.unidadesResumen);
console.log("  DIFERENCIA ...............", c.diferencia);
console.log("  docs solo en detalle .....", c.soloEnDetalle.length, c.soloEnDetalle.slice(0, 5));
console.log("  docs solo en resumen .....", c.soloEnResumen.length, c.soloEnResumen.slice(0, 5));
console.log("  docs descuadrados ........", c.documentosDescuadrados.length);
for (const x of c.documentosDescuadrados.slice(0, 10)) console.log("   ", x);
console.log("  VEREDICTO ................", c.ok ? "🟢 CUADRA" : "🔴 NO CUADRA");

console.log("\n═══ HALLAZGOS (se miden, no se corrigen) ═══");
console.log("  cantidades negativas .....", h.negativas.length);
for (const f of h.negativas.slice(0, 10)) console.log(`    ${f.n_interno} ${f.codigo_articulo} → ${f.cantidad}`);
console.log("  cantidades en cero .......", h.enCero.length);
console.log("  FOB ≠ CIF ................", h.fobDistintoDeCif);
console.log("  FOB = CIF (sospechoso) ...", h.fobIgualACif);
console.log("  sin FOB o sin CIF ........", h.sinFobOCif);
console.log("  costo SIN DESGLOSAR ......", h.sinDesglosar);
console.log("  código repetido en doc ...", h.codigosRepetidosEnDocumento.length);
for (const x of h.codigosRepetidosEnDocumento.slice(0, 10)) console.log("   ", x);
console.log("  montos absurdos ..........", h.montosAbsurdos.length);
for (const x of h.montosAbsurdos.slice(0, 10))
  console.log(`    ${x.fila.n_interno} ${x.fila.codigo_articulo} ${x.campo}=${x.valor}`);

if (!c.ok || d.skips.length > 0) {
  console.log("\n🔴 El parser NO reproduce el cuadre. NO se debe bajar ni cargar nada.");
  process.exit(1);
}
console.log("\n🟢 Parser verificado contra los archivos reales.");

/* SOLO LECTURA. El lector de los Excel de la contadora, compartido.
 * Las columnas se localizan POR SU ENCABEZADO, nunca por posición.
 * Sale de `scratchpad/columnas.cjs` (15-sep-2026), sin cambiarle una regla.
 */
const XLSX = require("xlsx-js-style");

const r2 = (n) => Math.round(n * 100) / 100;
const N = (v) => (v === null || v === undefined || v === "" || typeof v === "string" ? 0 : Number(v));
const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const ENCABEZADOS = [
  ["salMensual", (h) => h === "salario mensual"],
  ["salQnal", (h) => h === "salario qnal" || h === "al"],
  ["extra125", (h) => h.includes("horas extras 1.25")],
  ["ausencias", (h) => h === "ausencias"],
  ["tardanzas", (h) => h === "tardanzas"],
  ["extra150", (h) => h.includes("horas extras 1.50") || h.includes("horas extras 1.5")],
  ["excedente", (h) => h.startsWith("exedente") || h.startsWith("excedente")],
  ["domingos", (h) => h.startsWith("domingos")],
  ["feriado", (h) => h === "feriado"],
  ["compensatorio", (h) => h.includes("tomados") || h.includes("compensatorio")],
  ["bruto", (h) => h === "total bruto"],
  ["ss", (h) => h.startsWith("seg. soc") || h.startsWith("seg soc")],
  ["se", (h) => h.startsWith("seg. educ") || h.startsWith("seg educ")],
  ["isr", (h) => h.startsWith("impto")],
  ["prestamo", (h) => h.startsWith("prestamo por cobrar")],
  ["terceros", (h) => h.includes("terceros")],
  ["mercancia", (h) => h.startsWith("mercancia")],
  ["totalDed", (h) => h === "total deducciones"],
  ["otros", (h) => h === "otros servicios"],
  ["desctos", (h) => h === "desctos"],
  ["neto", (h) => h === "total neto a pagar"],
];

function leerHoja(file, hojaLike) {
  const wb = XLSX.readFile(file, { cellStyles: false });
  const hoja = wb.SheetNames.find((n) => norm(n).includes(norm(hojaLike)));
  if (!hoja) throw new Error(`no hay hoja parecida a «${hojaLike}» en ${file}`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
  const filas = [];
  const faltantesPorBloque = [];
  let cols = null;
  let bloque = "planilla";
  for (const r of rows) {
    if (!r) continue;
    const c0 = String(r[0] ?? "").trim();
    const c1 = String(r[1] ?? "").trim();
    if (/servicios profesionales/i.test(c0) || /servicios profesionales/i.test(c1)) { bloque = "servicios"; continue; }
    if (norm(c0) === "nombre") {
      const heads = r.map((x) => norm(x));
      const idx = {}; const faltan = [];
      for (const [concepto, test] of ENCABEZADOS) {
        const k = heads.findIndex((h) => h !== "" && test(h));
        if (k >= 0) idx[concepto] = k; else faltan.push(concepto);
      }
      cols = idx;
      faltantesPorBloque.push({ bloque, faltan, conGente: false });
      continue;
    }
    if (!cols) continue;
    if (!c0) continue;
    if (/^totales$/i.test(c1) || /^totales$/i.test(c0)) continue;
    if (/^(matriz|[iv]+ quincena|pendiente|multi fashion|fashion wear|vistana|confecciones)/i.test(c0)) continue;
    const g = (concepto) => (cols[concepto] === undefined ? null : N(r[cols[concepto]]));
    const f = { nombre: c0, cargo: c1, bloque };
    for (const [concepto] of ENCABEZADOS) f[concepto] = g(concepto);
    f.nota = [r[21], r[22]].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
    filas.push(f);
    if (faltantesPorBloque.length && (N(f.salQnal) > 0 || N(f.bruto) > 0 || N(f.neto) > 0))
      faltantesPorBloque[faltantesPorBloque.length - 1].conGente = true;
  }
  return { hoja, filas, faltantesPorBloque };
}

module.exports = { leerHoja, r2, N, norm, ENCABEZADOS };

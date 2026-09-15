/* Solo lectura. Lee los Excel de la contadora y saca, por colaborador, el
 * renglón de la hoja consolidada. Uso: node scripts/_medir-excel-yulissa.cjs <archivo> [hoja]  */
const XLSX = require("xlsx-js-style");
const N = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));
function leer(file, hojaLike) {
  const wb = XLSX.readFile(file, { cellStyles: false });
  const nombre = wb.SheetNames.find((n) => n.trim().toUpperCase().includes(hojaLike.toUpperCase()));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null });
  const out = []; let bloque = "planilla"; let cols = null;
  for (const r of rows) {
    const c0 = String(r[0] ?? "").trim();
    if (/servicios profesionales/i.test(c0) || /servicios profesionales/i.test(String(r[1] ?? ""))) { bloque = "servicios"; continue; }
    if (c0.toLowerCase() === "nombre") { cols = r.map((x) => String(x ?? "").trim()); continue; }
    if (!cols) continue;
    if (!c0 || /^totales$/i.test(String(r[1] ?? ""))) continue;
    const i = (frag) => cols.findIndex((h) => h.toLowerCase().includes(frag));
    const g = (frag) => { const k = i(frag); return k < 0 ? 0 : N(r[k]); };
    out.push({
      nombre: c0, cargo: String(r[1] ?? "").trim(), bloque,
      salMensual: g("salario mensual"),
      salQnal: N(r[3]),
      extra125: g("horas extras 1.25"), ausencias: g("ausencias"), tardanzas: g("tardanza"),
      extra150: g("horas extras 1.50"), excedente: g("exedente"), domingos: g("domingos"), feriado: g("feriado"),
      bruto: g("total bruto"), ss: g("seg. soc"), se: g("seg. educ"), isr: g("impto"),
      prestamo: g("préstamo"), terceros: g("terceros"), mercancia: g("mercan"),
      totalDed: g("total deducciones"), otros: g("otros servicios"), compensatorio: g("compren"), desctos: g("desctos"),
      neto: g("total neto"),
      nota: String(r[21] ?? r[22] ?? "").trim(),
    });
  }
  return { hoja: nombre, filas: out };
}
module.exports = { leer };
if (require.main === module) {
  const r = leer(process.argv[2], process.argv[3] ?? "");
  console.log(r.hoja); for (const f of r.filas) console.log(JSON.stringify(f));
}

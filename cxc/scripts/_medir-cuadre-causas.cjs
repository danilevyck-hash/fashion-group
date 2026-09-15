/* Solo lectura. Parte la diferencia de neto de cada persona en sus causas
 * (sueldo, extras, ausencias, tardanzas, salida temprana, seguros, descuentos,
 * otros, ISR) y suma por causa. Uso igual que _medir-cuadre-planilla.cjs */
const { leer } = require("./_medir-excel-yulissa.cjs");
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const MAPA = require("./_medir-cuadre-mapa.json");
const sis = require(process.argv[2]); const dir = process.argv[3]; const per = process.argv[4];
const idx = new Map(sis.personas.map((p) => [`${p.codigo}|${p.linea}`, p]));
const CAUSAS = ["sueldo", "extra 1.25", "extra 1.50", "excedente", "domingo/feriado", "ausencias de día completo", "tardanza / llegó tarde", "salida temprana", "seguros", "ISR", "descuentos", "otros servicios"];
const acum = {}; for (const c of CAUSAS) acum[c] = { n: 0, monto: 0, quien: [] };
const filasSalida = [];
for (const [empresa, a] of Object.entries(MAPA.archivos[per])) {
  const { filas } = leer(`${dir}/${a.archivo}`, a.hoja);
  const mapa = MAPA.personas[per][empresa];
  for (const f of filas.filter((x) => x.salQnal > 0 || x.bruto > 0)) {
    const cod = mapa[f.nombre]; if (cod === undefined) continue;
    const p = idx.get(`${cod}|${empresa}`); if (!p || !p.dinero) { filasSalida.push({ empresa, nombre: f.nombre, sinNumero: true, y: f.neto }); continue; }
    const d = p.dinero;
    const c = {
      "sueldo": d.salarioQuincenal - f.salQnal,
      "extra 1.25": d.extraDiurno - f.extra125,
      "extra 1.50": d.extraNocturno - f.extra150,
      "excedente": d.excedente - f.excedente,
      "domingo/feriado": d.domingos + d.feriados - f.domingos - f.feriado,
      "ausencias de día completo": -(d.ausenciaDeDiaCompleto - f.ausencias),
      "tardanza / llegó tarde": -((d.tardanzas + d.ausenciaPorTardanza) - f.tardanzas),
      "salida temprana": -d.salidaTemprana,
      "seguros": -((d.seguroSocial + d.seguroEducativo) - (f.ss + f.se)),
      "ISR": -(d.isr - f.isr),
      "descuentos": -((d.prestamo + d.terceros + d.mercancia) - (f.prestamo + f.terceros + f.mercancia + (f.desctos || 0))),
      "otros servicios": d.otrosServicios - f.otros - (f.compensatorio || 0),
    };
    const suma = Object.values(c).reduce((x, y) => x + y, 0);
    const dif = d.netoPagar - f.neto;
    for (const k of CAUSAS) if (Math.abs(c[k]) > 0.005) { acum[k].n++; acum[k].monto += c[k]; acum[k].quien.push(`${f.nombre.trim()} ${f2(c[k])}`); }
    filasSalida.push({ empresa, nombre: f.nombre.trim(), cod, y: f.neto, s: d.netoPagar, dif, comp: c, resid: dif - suma });
  }
}
console.log("PERSONA POR PERSONA — de qué está hecha la diferencia\n");
for (const r of filasSalida) {
  if (r.sinNumero) { console.log(`${r.empresa.padEnd(20)} ${r.nombre.padEnd(26)} Yulissa ${f2(r.y).padStart(9)}  EL SISTEMA NO PRODUCE NÚMERO`); continue; }
  const partes = CAUSAS.filter((k) => Math.abs(r.comp[k]) > 0.005).map((k) => `${k} ${r.comp[k] > 0 ? "+" : ""}${f2(r.comp[k])}`);
  console.log(`${r.empresa.padEnd(20)} ${r.nombre.padEnd(26)} Y ${f2(r.y).padStart(9)}  S ${f2(r.s).padStart(9)}  dif ${(r.dif > 0 ? "+" : "") + f2(r.dif)}  ${Math.abs(r.resid) > 0.02 ? `[NO CUADRA ${f2(r.resid)}] ` : ""}${partes.join(" · ") || "(idénticos)"}`);
}
console.log("\nCAUSAS SUMADAS (positivo = el sistema paga MÁS que Yulissa)");
for (const k of CAUSAS) if (acum[k].n) console.log(`  ${k.padEnd(18)} ${f2(acum[k].monto).padStart(10)}   en ${String(acum[k].n).padStart(2)} personas`);

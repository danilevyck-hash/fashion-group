/* SOLO LECTURA. ¿Qué corte del reloj usó la contadora?
 *
 * Su Excel no lo dice en ninguna parte. Se DEDUCE: se corre el cuadro del
 * sistema con cada corte posible y se mira con cuál se parecen más las
 * columnas que salen del RELOJ (ausencias, tardanzas, horas extra, excedente,
 * domingo y feriado). El corte que hace cuadrar más celdas es el que usó.
 *
 *   node scripts/_medir-corte-deducido.cjs <carpeta-xls> <carpeta-cortes> <sep|ago>
 */
const { leerHoja, r2, N } = require("./_medir-lector-yulissa.cjs");
const MAPA = require("./_medir-cuadre-mapa.json");
const { readdirSync } = require("node:fs");
const { resolve } = require("node:path");

const NOMBRE = { vistana: "Vistana", fashion_wear: "Fashion Wear", confecciones_boston: "Confecciones Boston", american_classic: "Multifashion" };

/* Solo lo que sale del RELOJ: es lo único que el corte puede mover. */
const DEL_RELOJ = [
  { id: "extra125", rotulo: "Horas extra 1.25", sis: (d) => d.extraDiurno, ex: (f) => N(f.extra125) },
  { id: "extra150", rotulo: "Horas extra 1.5", sis: (d) => d.extraNocturno, ex: (f) => N(f.extra150) },
  { id: "excedente", rotulo: "Excedente de 9 h", sis: (d) => d.excedente, ex: (f) => N(f.excedente) },
  { id: "domferi", rotulo: "Domingo / feriado", sis: (d) => d.domingos + d.feriados, ex: (f) => N(f.domingos) + N(f.feriado) },
  { id: "ausencias", rotulo: "Ausencias", sis: (d) => d.ausencias, ex: (f) => N(f.ausencias) },
  { id: "tardanzas", rotulo: "Tardanzas", sis: (d) => d.tardanzas, ex: (f) => N(f.tardanzas) },
];

const dirXls = process.argv[2];
const dirCortes = process.argv[3];
const per = process.argv[4] ?? "sep";
const empresas = Object.keys(MAPA.archivos[per]);

/* Lee los Excel una sola vez. */
const excel = [];
for (const empresa of empresas) {
  const a = MAPA.archivos[per][empresa];
  const { filas } = leerHoja(`${dirXls}/${a.archivo}`, a.hoja);
  const mapa = MAPA.personas[per][empresa];
  for (const f of filas) {
    if (!(N(f.salQnal) > 0 || N(f.bruto) > 0 || N(f.neto) > 0)) continue;
    const cod = mapa[f.nombre] ?? mapa[f.nombre.replace(/\s+/g, " ")];
    if (cod === undefined) continue;
    excel.push({ empresa, codigo: cod, nombre: f.nombre.replace(/\s+/g, " "), f });
  }
}

const archivos = readdirSync(dirCortes).filter((n) => n.endsWith(".json")).sort();
const filas = [];
for (const arch of archivos) {
  const sis = require(resolve(dirCortes, arch));
  const porClave = new Map();
  for (const p of sis.personas) porClave.set(`${p.linea}|${p.codigo}`, p);
  let cuadran = 0, total = 0, brecha = 0;
  const porConcepto = {};
  for (const c of DEL_RELOJ) porConcepto[c.id] = { cuadran: 0, total: 0, brecha: 0 };
  for (const e of excel) {
    const p = porClave.get(`${e.empresa}|${e.codigo}`);
    if (!p || !p.dinero) continue;
    for (const c of DEL_RELOJ) {
      const ex = r2(c.ex(e.f)), sisV = r2(c.sis(p.dinero));
      total += 1; porConcepto[c.id].total += 1;
      const dif = Math.abs(ex - sisV);
      brecha = r2(brecha + dif); porConcepto[c.id].brecha = r2(porConcepto[c.id].brecha + dif);
      if (dif < 0.005) { cuadran += 1; porConcepto[c.id].cuadran += 1; }
    }
  }
  filas.push({ archivo: arch, hastaReloj: sis.hastaReloj, corte: sis.corte, cuadran, total, brecha, porConcepto });
}

filas.sort((a, b) => b.cuadran - a.cuadran || a.brecha - b.brecha);
console.log(`\n═══ ${per.toUpperCase()} · ${empresas.map((e) => NOMBRE[e]).join(" · ")} · ${excel.length} personas del Excel\n`);
console.log(`  ${"reloj hasta".padEnd(13)}${"cuadran".padStart(9)}${"de".padStart(5)}${"brecha $".padStart(11)}   ${DEL_RELOJ.map((c) => c.id.slice(0, 6)).join(" ")}`);
for (const f of filas)
  console.log(`  ${String(f.hastaReloj).padEnd(13)}${String(f.cuadran).padStart(9)}${String(f.total).padStart(5)}${f.brecha.toFixed(2).padStart(11)}   ${DEL_RELOJ.map((c) => `${f.porConcepto[c.id].cuadran}/${f.porConcepto[c.id].total}`.padEnd(7)).join("")}`);
console.log("");
module.exports = { DEL_RELOJ };

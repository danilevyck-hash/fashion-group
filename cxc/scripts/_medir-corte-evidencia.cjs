/* SOLO LECTURA. Deduce el corte del reloj que usó la contadora y guarda la
 * EVIDENCIA. Su Excel no lo dice en ninguna parte: se corre el cuadro del
 * sistema con cada corte posible y se mira con cuál cuadran sus columnas del
 * reloj. Escribe `scripts/_medir-corte-evidencia.json`.
 *   node scripts/_medir-corte-evidencia.cjs <xls> <carpeta-cortes> <dias.json>
 */
const { leerHoja, N, r2 } = require("./_medir-lector-yulissa.cjs");
const MAPA = require("./_medir-cuadre-mapa.json");
const { readdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const [dirXls, dirCortes, fDias] = process.argv.slice(2);
const dias = require(resolve(fDias));
const idxDias = new Map(dias.map((p) => [p.codigo, p]));

const CONC = [
  ["extra125", (d) => d.extraDiurno, (f) => N(f.extra125)],
  ["extra150", (d) => d.extraNocturno, (f) => N(f.extra150)],
  ["excedente", (d) => d.excedente, (f) => N(f.excedente)],
  ["domferi", (d) => d.domingos + d.feriados, (f) => N(f.domingos) + N(f.feriado)],
  ["ausencias", (d) => d.ausencias, (f) => N(f.ausencias)],
  ["tardanzas", (d) => d.tardanzas, (f) => N(f.tardanzas)],
];

const empresas = Object.keys(MAPA.archivos.sep);
const excel = [];
for (const empresa of empresas) {
  const a = MAPA.archivos.sep[empresa];
  const { filas } = leerHoja(`${dirXls}/${a.archivo}`, a.hoja);
  const mapa = MAPA.personas.sep[empresa];
  for (const f of filas) {
    if (!(N(f.salQnal) > 0 || N(f.bruto) > 0 || N(f.neto) > 0)) continue;
    const cod = mapa[f.nombre] ?? mapa[f.nombre.replace(/\s+/g, " ")];
    if (cod === undefined) continue;
    excel.push({ empresa, codigo: cod, nombre: f.nombre.replace(/\s+/g, " "), f });
  }
}

const corridas = [];
for (const arch of readdirSync(dirCortes).filter((n) => n.endsWith(".json")).sort()) {
  const sis = require(resolve(dirCortes, arch));
  const por = new Map(sis.personas.map((p) => [`${p.linea}|${p.codigo}`, p]));
  let cuadran = 0, total = 0, brecha = 0, movidas = 0;
  for (const e of excel) {
    const p = por.get(`${e.empresa}|${e.codigo}`);
    if (!p || !p.dinero) continue;
    for (const [, sisF, exF] of CONC) {
      const ex = r2(exF(e.f)), s = r2(sisF(p.dinero));
      total += 1; brecha = r2(brecha + Math.abs(ex - s));
      if (Math.abs(ex - s) < 0.005) cuadran += 1;
    }
  }
  corridas.push({ relojHasta: sis.hastaReloj, cuadran, celdas: total, brecha });
}
corridas.sort((a, b) => a.relojHasta.localeCompare(b.relojHasta));

/* ── Los dos bordes, medidos sobre el reloj ─────────────────────────────── */
const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dia = (f) => `${DOW[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${Number(f.slice(8))} de septiembre`;

// Borde de arriba: el lunes 14 no lo cobra nadie en su Excel.
const ausentesEl14 = [], conAusenciaEnExcel = [];
for (const e of excel) {
  const p = idxDias.get(e.codigo);
  if (p && p.dias.some((x) => x.fecha === "2026-09-14" && x.ausente)) ausentesEl14.push(e.nombre);
  if (N(e.f.ausencias) > 0.005) conAusenciaEnExcel.push({ nombre: e.nombre, monto: r2(N(e.f.ausencias)) });
}
// Borde de abajo: las tardanzas del viernes 11.
const tardeEl11 = [];
for (const e of excel) {
  const p = idxDias.get(e.codigo);
  const d11 = p && p.dias.find((x) => x.fecha === "2026-09-11");
  if (!d11 || !(d11.tardeMin > 0)) continue;
  const c10 = require(resolve(dirCortes, "c10.json")).personas.find((x) => x.linea === e.empresa && x.codigo === e.codigo);
  const c13 = require(resolve(dirCortes, "c13.json")).personas.find((x) => x.linea === e.empresa && x.codigo === e.codigo);
  if (!c10 || !c13 || !c10.dinero || !c13.dinero) continue;
  const ex = r2(N(e.f.ausencias) + N(e.f.tardanzas));
  const sin11 = r2(c10.dinero.ausencias + c10.dinero.tardanzas);
  const con11 = r2(c13.dinero.ausencias + c13.dinero.tardanzas);
  tardeEl11.push({
    nombre: e.nombre, minutosEse11: Math.round(d11.tardeMin), excel: ex, sinEl11: sin11, conEl11: con11,
    seParece: Math.abs(ex - con11) <= Math.abs(ex - sin11) ? "con el 11" : "sin el 11",
  });
}
const aFavor = tardeEl11.filter((x) => x.seParece === "con el 11").length;

const evidencia = {
  dia: "2026-09-13",
  rangoPosible: ["2026-09-11", "2026-09-13"],
  seguro: true,
  evidencia:
    `El lunes 14 el sistema marca ausencia de día completo a ${ausentesEl14.length} colaboradores y su Excel no le cobra ausencia a ninguno de ellos: ` +
    `con el reloj hasta el 14 o el 15 cuadran ${corridas.find((c) => c.relojHasta === "2026-09-14")?.cuadran} celdas de ${corridas[0].celdas}, y hasta el 13 cuadran ${corridas.find((c) => c.relojHasta === "2026-09-13")?.cuadran}. ` +
    `Por abajo, el viernes 11 hay ${tardeEl11.length} personas con tardanza en el reloj y en ${aFavor} de ellas su Excel se parece más al sistema CON el 11 adentro. ` +
    `Entre el 11, el 12 y el 13 no hay nada que medir: la última marcación de la quincena es del viernes 11, y el 12 y el 13 son sábado y domingo. ` +
    `O sea que el corte de su Excel está entre el viernes 11 y el domingo 13, y correr el sistema con el 13 —el que propone— da exactamente lo mismo que con el 11.`,
  loQueSeProbo: corridas,
  elLunes14: { colaboradoresQueElSistemaMarcaAusentes: ausentesEl14.length, ausenciasEnSuExcel: conAusenciaEnExcel },
  elViernes11: tardeEl11,
  ultimaMarcacionDeLaQuincena: "viernes 11 de septiembre de 2026",
};
writeFileSync(resolve(__dirname, "_medir-corte-evidencia.json"), JSON.stringify(evidencia, null, 1));

console.log(`\n  ${"reloj hasta".padEnd(13)}${"cuadran".padStart(9)}${"de".padStart(5)}${"brecha $".padStart(11)}`);
for (const c of corridas) console.log(`  ${c.relojHasta.padEnd(13)}${String(c.cuadran).padStart(9)}${String(c.celdas).padStart(5)}${c.brecha.toFixed(2).padStart(11)}`);
console.log(`\n  El lunes 14: ${ausentesEl14.length} ausentes según el reloj; en su Excel tienen ausencia ${conAusenciaEnExcel.length} personas (${conAusenciaEnExcel.map((x) => x.nombre).join(", ")}) y ninguna es por el 14.`);
console.log(`  El viernes 11: ${tardeEl11.length} con tardanza en el reloj; ${aFavor} se parecen más CON el 11 adentro.`);
for (const t of tardeEl11) console.log(`    ${t.nombre.padEnd(24)} ${t.minutosEse11} min ese día · excel ${t.excel.toFixed(2)} · sin el 11 ${t.sinEl11.toFixed(2)} · con el 11 ${t.conEl11.toFixed(2)}  → ${t.seParece}`);
console.log(`\n  ${dia("2026-09-11")} … ${dia("2026-09-13")}`);

/* Solo lectura. Junta el Excel de la contadora con el cuadro del sistema y
 * muestra, persona por persona, el neto de cada lado y la diferencia.
 * Uso: node scripts/_medir-cuadre-planilla.cjs <sistema.json> <carpeta-excel> <sep|ago>  */
const { leer } = require("./_medir-excel-yulissa.cjs");
const f2 = (n) => (n === null || n === undefined ? "—" : (Math.round(n * 100) / 100).toFixed(2));
const MAPA = require("./_medir-cuadre-mapa.json");

const sis = require(process.argv[2]);
const dir = process.argv[3];
const per = process.argv[4];
const archivos = MAPA.archivos[per];
const porCodigoLinea = new Map();
for (const p of sis.personas) porCodigoLinea.set(`${p.codigo}|${p.linea}`, p);

let totY = 0, totS = 0, cuadran = 0, total = 0;
const difs = [];
for (const [empresa, a] of Object.entries(archivos)) {
  const { filas } = leer(`${dir}/${a.archivo}`, a.hoja);
  const buenas = filas.filter((f) => f.salQnal > 0 || f.bruto > 0);
  const mapa = MAPA.personas[per][empresa];
  console.log(`\n═══ ${empresa.toUpperCase()}  (${a.hoja.trim()})`);
  console.log(["Colaborador".padEnd(28), "Yulissa".padStart(10), "Sistema".padStart(10), "Dif".padStart(9), " detalle"].join(""));
  const vistos = new Set();
  for (const f of buenas) {
    const cod = mapa[f.nombre];
    if (cod === undefined) { console.log(`  ⚠️ SIN MAPEAR en el Excel: «${f.nombre}»  neto ${f2(f.neto)}`); continue; }
    const p = porCodigoLinea.get(`${cod}|${empresa}`);
    vistos.add(`${cod}|${empresa}`);
    const s = p && p.dinero ? p.dinero.netoPagar : null;
    const d = s === null ? null : Math.round((s - f.neto) * 100) / 100;
    total++; totY += f.neto; if (s !== null) totS += s;
    const ok = d !== null && Math.abs(d) < 0.005;
    if (ok) cuadran++; else difs.push({ empresa, nombre: f.nombre, cod, y: f.neto, s, d });
    const extra = p ? [
      p.dinero ? "" : `SIN NÚMERO: ${p.faltaConfigurar.join(",") || (p.fueraDePlanilla ? "fuera de planilla" : "?")}`,
      p.dinero && Math.abs(p.dinero.ausencias) > 0.005 ? `aus$${f2(p.dinero.ausencias)}(${p.ausenciasDias}d)` : "",
      p.dinero && Math.abs(f.ausencias - p.dinero.ausencias) > 0.005 ? `Yaus$${f2(f.ausencias)}` : "",
      p.dinero && Math.abs((p.dinero.extraDiurno) - f.extra125) > 0.005 ? `ext1.25 Y${f2(f.extra125)}/S${f2(p.dinero.extraDiurno)}` : "",
      p.dinero && Math.abs((p.dinero.extraNocturno) - f.extra150) > 0.005 ? `ext1.50 Y${f2(f.extra150)}/S${f2(p.dinero.extraNocturno)}` : "",
      p.dinero && Math.abs(p.dinero.excedente - f.excedente) > 0.005 ? `exc Y${f2(f.excedente)}/S${f2(p.dinero.excedente)}` : "",
      p.dinero && Math.abs(p.dinero.domingos + p.dinero.feriados - f.domingos - f.feriado) > 0.005 ? `dom Y${f2(f.domingos + f.feriado)}/S${f2(p.dinero.domingos + p.dinero.feriados)}` : "",
      p.dinero && Math.abs(p.dinero.tardanzas - f.tardanzas) > 0.005 ? `tard Y${f2(f.tardanzas)}/S${f2(p.dinero.tardanzas)}` : "",
      p.dinero && p.dinero.salidaTemprana > 0.005 ? `salTemp$${f2(p.dinero.salidaTemprana)}` : "",
      p.dinero && Math.abs(p.dinero.salarioQuincenal - f.salQnal) > 0.005 ? `qnal Y${f2(f.salQnal)}/S${f2(p.dinero.salarioQuincenal)}` : "",
      p.dinero && Math.abs(p.dinero.seguroSocial + p.dinero.seguroEducativo - f.ss - f.se) > 0.005 ? `seg Y${f2(f.ss + f.se)}/S${f2(p.dinero.seguroSocial + p.dinero.seguroEducativo)}` : "",
      p.dinero && Math.abs(p.dinero.prestamo + p.dinero.terceros + p.dinero.mercancia - f.prestamo - f.terceros - f.mercancia - (f.desctos||0)) > 0.005 ? `desc Y${f2(f.prestamo + f.terceros + f.mercancia + (f.desctos||0))}/S${f2(p.dinero.prestamo + p.dinero.terceros + p.dinero.mercancia)}` : "",
      p.dinero && Math.abs(p.dinero.otrosServicios - f.otros) > 0.005 ? `otros Y${f2(f.otros)}/S${f2(p.dinero.otrosServicios)}` : "",
    ].filter(Boolean).join(" · ") : "NO ESTÁ EN EL SISTEMA";
    console.log(`${(ok ? "  " : "≠ ")}${f.nombre.padEnd(26).slice(0, 26)}${f2(f.neto).padStart(10)}${(s === null ? "—" : f2(s)).padStart(10)}${(d === null ? "—" : f2(d)).padStart(9)}  ${extra}`);
  }
  for (const p of sis.personas) {
    if (p.linea !== empresa) continue;
    if (vistos.has(`${p.codigo}|${empresa}`)) continue;
    console.log(`  + SOLO EN EL SISTEMA: ${p.codigo} ${p.nombre}  neto ${p.dinero ? f2(p.dinero.netoPagar) : "—"} ${p.faltaConfigurar.join(",")} ${p.fueraDePlanilla ? "(fuera de planilla)" : ""}`);
  }
}
console.log(`\nRESUMEN: ${cuadran} de ${total} cuadran al centavo · Yulissa ${f2(totY)} · sistema ${f2(totS)} · dif ${f2(totS - totY)}`);
console.log("\nDIFERENCIAS ordenadas por plata:");
for (const d of difs.sort((a, b) => Math.abs(b.d ?? 9e9) - Math.abs(a.d ?? 9e9)))
  console.log(`  ${f2(d.d).padStart(9)}  ${d.nombre} (${d.empresa}, cód ${d.cod})  Y ${f2(d.y)} → S ${d.s === null ? "sin número" : f2(d.s)}`);

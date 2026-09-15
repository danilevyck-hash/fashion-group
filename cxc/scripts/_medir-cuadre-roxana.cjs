/* Solo lectura. Junta el Excel de la contadora con el cuadro del sistema y
 * escribe, por empresa y por persona, el neto de cada lado, la diferencia, la
 * causa (con su prefijo: configurar · sistema · a propósito · incompleto · no sé)
 * y lo que le falta a esa persona en su ficha.
 *
 *   node scripts/_medir-cuadre-roxana.cjs <carpeta-scratch> <salida.json>
 *
 * Espera en la carpeta: xls/ (los Excel), sis-sep-c13.json, sis-sep-c13-apr.json,
 * sis-ago2-c28.json, sis-ago2-c28-apr.json, fichas.json, extras-sep.json,
 * extras-ago.json. No escribe nada en ningún lado más que el JSON de salida.
 */
const { writeFileSync } = require("node:fs");
const { leer } = require("./_medir-excel-yulissa.cjs");
const MAPA = require("./_medir-cuadre-mapa.json");

const DIR = process.argv[2];
const SALIDA = process.argv[3];
const r2 = (n) => Math.round(n * 100) / 100;
const d2 = (n) => `$${Math.abs(n).toFixed(2)}`;

const EMPRESAS = [
  { key: "vistana", nombre: "Vistana", per: "sep", quincena: "1 – 15 de septiembre de 2026",
    corte: "2026-09-13", sis: "sis-sep-c13.json", apr: "sis-sep-c13-apr.json", extras: "extras-sep.json" },
  { key: "fashion_wear", nombre: "Fashion Wear", per: "sep", quincena: "1 – 15 de septiembre de 2026",
    corte: "2026-09-13", sis: "sis-sep-c13.json", apr: "sis-sep-c13-apr.json", extras: "extras-sep.json" },
  { key: "confecciones_boston", nombre: "Confecciones Boston", per: "sep", quincena: "1 – 15 de septiembre de 2026",
    corte: "2026-09-13", sis: "sis-sep-c13.json", apr: "sis-sep-c13-apr.json", extras: "extras-sep.json" },
  { key: "american_classic", nombre: "Multifashion", per: "ago", quincena: "16 – 30 de agosto de 2026",
    corte: "2026-08-28", sis: "sis-ago2-c28.json", apr: "sis-ago2-c28-apr.json", extras: "extras-ago.json" },
];

const FICHAS = require(`${DIR}/fichas.json`);
const fichaDe = new Map(FICHAS.personas.map((p) => [String(p.empleado_codigo), p]));
const conHorario = new Set(FICHAS.horarios.map((h) => String(h.empleado_codigo)));
const prestamoDe = new Map();
for (const p of FICHAS.prestamos) {
  if (p.empleadoCodigo) prestamoDe.set(String(p.empleadoCodigo), p);
}

// ── Lo que le falta a la ficha, con las palabras de Daniel ────────────────────
function faltaDe(codigo, ctx) {
  const f = fichaDe.get(String(codigo));
  const out = [];
  if (!f) return ["ficha"];
  if (!f.empresa) out.push("empresa");
  if (f.servicio_profesional !== true && (f.salario_mensual === null || f.salario_mensual === undefined)) out.push("salario");
  if (f.no_marca_reloj !== true && !conHorario.has(String(codigo))) out.push("horario");
  if (!f.posicion || !String(f.posicion).trim()) out.push("cargo");
  if (!f.cedula || !String(f.cedula).trim()) out.push("cédula");
  if (f.saldo_vacaciones_dias === null || f.saldo_vacaciones_dias === undefined
      || !f.saldo_vacaciones_corte) out.push("saldo de vacaciones");
  if (!f.fecha_ingreso) out.push("fecha de entrada");
  if (ctx.seFue && !f.fecha_salida) out.push("fecha de salida");
  if (ctx.trabajaFuera && f.trabaja_afuera !== true) out.push("casilla Trabaja afuera");
  const pr = prestamoDe.get(String(codigo));
  if (ctx.faltaTerceros) out.push("cuota de terceros");
  if (ctx.faltaMercancia) out.push("cuota de mercancía");
  if (ctx.debeYNoTieneFicha && !pr) out.push("ficha de préstamo sin amarrar");
  return out;
}

// ── El reparto de la diferencia en sus causas ────────────────────────────────
function componentes(d, f) {
  const extrasS = d.extraDiurno + d.extraNocturno + d.excedente + d.domingos + d.feriados;
  const extrasY = f.extra125 + f.extra150 + f.excedente + f.domingos + f.feriado;
  return {
    sueldo: d.salarioQuincenal - f.salQnal,
    extras: extrasS - extrasY,
    ausencias: -(d.ausenciaDeDiaCompleto - f.ausencias),
    tardanza: -((d.tardanzas + d.ausenciaPorTardanza) - f.tardanzas),
    salidaTemprana: -d.salidaTemprana,
    seguros: -((d.seguroSocial + d.seguroEducativo) - (f.ss + f.se)),
    isr: -(d.isr - f.isr),
    descuentos: -((d.prestamo + d.terceros + d.mercancia) - (f.prestamo + f.terceros + f.mercancia + (f.desctos || 0))),
    otros: d.otrosServicios - f.otros - (f.compensatorio || 0),
  };
}

// ── Cada componente, dicho en una frase con su prefijo ───────────────────────
function frase(k, v, ctx) {
  const mas = v > 0; // el sistema paga MÁS que la contadora
  switch (k) {
    case "sueldo":
      return ["configurar",
        `el sistema le tiene otro salario ($${Number(ctx.salarioSistema).toFixed(2)} al mes) y tu planilla usa $${(f2mes(ctx.salQnal))}`];
    case "otros":
      return mas
        ? ["no sé", `el sistema le suma ${d2(v)} de «Otros servicios» que tu planilla no tiene`]
        : ["configurar", `falta anotarle ${d2(v)} de «Otros servicios» en la casilla de la planilla`];
    case "descuentos":
      return mas
        ? ["configurar", `tu planilla le descuenta ${d2(v)} ${ctx.queDescuento} más de lo que el sistema tiene cargado`]
        : ["configurar", `el sistema le descuenta ${d2(v)} ${ctx.queDescuento} y tu planilla no se lo descuenta`];
    case "ausencias":
      if (ctx.relojIncompleto) return ["incompleto", `el reloj no tiene los primeros días de la quincena, así que le cuenta ${d2(v)} de ausencias que no son reales`];
      if (ctx.seFue) return ["configurar", `ya no aparece en tu planilla: sin fecha de salida el sistema le cuenta ${d2(v)} de ausencias`];
      if (ctx.trabajaFuera) return ["configurar", `trabaja fuera de la oficina y el día que no marcó le contó ${d2(v)} de ausencia`];
      return mas
        ? ["no sé", `tu planilla le descuenta ${d2(v)} de ausencias que el sistema no ve`]
        : ["configurar", `el sistema le cuenta ${d2(v)} de ausencias que tu planilla no descuenta`];
    case "extras":
      if (ctx.relojIncompleto) return ["incompleto", `sin esos días en el reloj, el sistema no le paga ${d2(v)} de horas extra que tú sí le pagaste`];
      if (ctx.trabajaFuera) return ["configurar", `trabaja fuera de la oficina casi toda la quincena, así que el reloj no puede medir las ${d2(v)} de horas extra que tú le pagaste: hay que anotárselas a mano`];
      if (ctx.sinReloj) return ["configurar", `el reloj no tiene sus horas, así que el sistema no le paga las ${d2(v)} de horas extra que tú le pagaste`];
      if (ctx.frenado > 0.5 && !mas) return ["configurar", `el sistema le pagó ${d2(v)} menos de horas extra, y tiene ${d2(ctx.frenado)} más esperando el «Sí» en Aprobaciones`];
      if (ctx.horarioCorrido) return ["configurar", `sale casi media hora después de su hora todos los días: revisa su horario, porque el sistema le cuenta ${d2(v)} de horas extra que tú no pagas`];
      return mas
        ? ["configurar", `el reloj le mide ${d2(v)} de horas extra que tu planilla no paga`]
        : ["a propósito", `tú redondeas las horas extra de cada día al cuarto de hora y el sistema paga los minutos exactos (${d2(v)})`];
    case "salidaTemprana":
      return ["a propósito", `el sistema le descuenta ${d2(v)} por salir antes de la hora; tu planilla no tiene esa columna`];
    case "tiempoNoTrabajado":
      return ["a propósito", `tú lo anotas como ausencia y el sistema como tardanza: la plata es casi la misma`];
    case "tardanza":
      if (ctx.relojIncompleto) return ["incompleto", `sin esos días en el reloj no se puede comparar la tardanza (${d2(v)})`];
      return mas
        ? ["a propósito", `el sistema le perdona los primeros 10 minutos de tardanza de cada día (${d2(v)})`]
        : ["a propósito", `el sistema le cobra ${d2(v)} de tardanza que tu planilla no cobra`];
    case "seguros":
      if (ctx.brutoDifiere) return ["derivado", ""];
      return Math.abs(v) <= 0.25
        ? ["a propósito", `centavos de redondeo en los seguros`]
        : ["no sé", `con el mismo total bruto, los seguros dan ${d2(v)} distinto`];
    case "isr":
      return ["configurar", `el impuesto sobre la renta va a mano y da ${d2(v)} distinto`];
    default:
      return ["no sé", `${k} ${d2(v)}`];
  }
}
const f2mes = (q) => (Number(q) * 2).toFixed(2);

// ── Construcción ─────────────────────────────────────────────────────────────
const UMBRAL = 0.5;      // por debajo de esto no se nombra la causa
const EXACTO = 0.005;    // cuadra al centavo

const empresasOut = [];
const acumCat = { configurar: 0, sistema: 0, "a propósito": 0, incompleto: 0, "no sé": 0 };
const tareas = new Map();
const anotarTarea = (que, quien) => {
  if (!tareas.has(que)) tareas.set(que, []);
  if (!tareas.get(que).includes(quien)) tareas.get(que).push(quien);
};

let totalPersonas = 0, totalCuadran = 0;

for (const E of EMPRESAS) {
  const sis = require(`${DIR}/${E.sis}`);
  const apr = require(`${DIR}/${E.apr}`);
  const ext = require(`${DIR}/${E.extras}`);
  const S = new Map(sis.personas.map((p) => [`${p.codigo}|${p.linea}`, p]));
  const A = new Map(apr.personas.map((p) => [`${p.codigo}|${p.linea}`, p]));
  const X = new Map(ext.personas.map((p) => [p.codigo, p]));
  const a = MAPA.archivos[E.per][E.key];
  const { filas } = leer(`${DIR}/xls/${a.archivo}`, a.hoja);
  const buenas = filas.filter((x) => x.salQnal > 0 || x.bruto > 0);
  const mapa = MAPA.personas[E.per][E.key];
  const vistos = new Set();
  const out = [];
  let totalExcel = 0, totalSistema = 0, cuadran = 0;

  for (const f of buenas) {
    const cod = mapa[f.nombre];
    const p = cod === undefined ? null : S.get(`${cod}|${E.key}`);
    const q = cod === undefined ? null : A.get(`${cod}|${E.key}`);
    const x = cod === undefined ? null : X.get(String(cod));
    if (cod !== undefined) vistos.add(`${cod}|${E.key}`);
    totalExcel += f.neto;

    const nombre = (p && p.nombre) ? p.nombre : f.nombre;
    if (!p || !p.dinero) {
      const ctx = { relojIncompleto: E.key === "american_classic", sinReloj: true };
      const causa = cod === undefined
        ? "[configurar] está en tu planilla y no tiene ficha en el sistema"
        : (E.key === "american_classic"
          ? "[incompleto] el reloj de la tienda no tiene esta quincena, así que el sistema no le arma el pago"
          : "[configurar] no marcó ni un día en la quincena, así que el sistema no le arma el pago");
      acumCat[cod === undefined ? "configurar" : (E.key === "american_classic" ? "incompleto" : "configurar")] += f.neto;
      out.push({
        codigo: cod ?? null, nombre: f.nombre, nombreSistema: (p && p.nombre) ? p.nombre : null,
        excel: r2(f.neto), sistema: null, diferencia: null,
        causa, categoria: cod === undefined ? "configurar" : (E.key === "american_classic" ? "incompleto" : "configurar"),
        falta: cod === undefined ? ["ficha"] : faltaDe(cod, ctx), detalle: {},
      });
      for (const t of (cod === undefined ? ["ficha"] : faltaDe(cod, ctx))) anotarTarea(t, nombre);
      totalPersonas++;
      continue;
    }

    const d = p.dinero;
    totalSistema += d.netoPagar;
    const dif = r2(d.netoPagar - f.neto);
    const comp = componentes(d, f);
    const frenado = (q && q.dinero) ? r2(q.dinero.netoPagar - d.netoPagar) : 0;

    // 🔑 Ausencia y tardanza son el MISMO hecho (tiempo no trabajado) contado en
    // dos columnas: si se compensan entre sí, es una sola causa y no dos.
    if (Math.abs(comp.ausencias) > UMBRAL && Math.abs(comp.tardanza) > UMBRAL
        && Math.abs(comp.ausencias + comp.tardanza) < UMBRAL) {
      comp.tiempoNoTrabajado = comp.ausencias + comp.tardanza;
      if (Math.abs(comp.tiempoNoTrabajado) < 0.005) comp.tiempoNoTrabajado = 0.6 * Math.sign(comp.ausencias || 1);
      comp.ausencias = 0; comp.tardanza = 0;
    }

    // Contexto que decide de quién es el problema
    const diasConExtra = x ? x.diasConExtra : 0;
    const relojIncompleto = E.key === "american_classic";
    const seFue = false;
    const trabajaFuera = (p.diasConMarca ?? 0) <= 2 && (p.ausenciasDias ?? 0) < 3 && (p.diasConMarca ?? 0) > 0;
    const sinReloj = (p.diasConMarca ?? 0) <= 2;
    const horarioCorrido = comp.extras > UMBRAL && diasConExtra >= 8
      && x && x.exactoMin / Math.max(1, diasConExtra) >= 25 && x.exactoMin / Math.max(1, diasConExtra) <= 50;
    // El bruto de los dos lados: si no coinciden, la diferencia de seguros es
    // CONSECUENCIA y no una causa aparte.
    const brutoDifiere = Math.abs(d.totalBruto - f.bruto) > 1;
    const dsc = [];
    if (Math.abs(d.prestamo - f.prestamo) > 0.005) dsc.push("de préstamo");
    if (Math.abs(d.terceros - f.terceros) > 0.005) dsc.push("de terceros");
    if (Math.abs(d.mercancia - f.mercancia) > 0.005) dsc.push("de mercancía");
    if (Math.abs(f.desctos || 0) > 0.005) dsc.push("en la columna «Desctos»");
    const queDescuento = dsc.length ? dsc.join(" y ") : "";
    const ctxBase = {
      salarioSistema: p.salarioMensual, salQnal: f.salQnal, frenado,
      relojIncompleto, seFue, trabajaFuera, sinReloj, horarioCorrido,
      brutoDifiere, queDescuento,
    };

    const partes = Object.entries(comp)
      .filter(([, v]) => Math.abs(v) > UMBRAL)
      .sort((m, n) => Math.abs(n[1]) - Math.abs(m[1]));

    let causa = null, categoria = null;
    if (Math.abs(dif) < EXACTO && partes.length === 0) {
      causa = null;
    } else {
      const dichas = [];
      for (const [k, v] of partes) {
        const [cat, txt] = frase(k, v, ctxBase);
        if (cat === "derivado") continue; // consecuencia de otra causa, no una causa
        acumCat[cat] += Math.abs(v);
        dichas.push({ cat, txt });
      }
      const sumaComp = Object.values(comp).reduce((m, n) => m + n, 0);
      const resid = dif - sumaComp;
      if (Math.abs(resid) > UMBRAL) {
        acumCat["no sé"] += Math.abs(resid);
        dichas.push({ cat: "no sé", txt: `quedan ${d2(resid)} que no se pueden explicar con ninguna columna` });
      }
      if (dichas.length === 0) {
        acumCat["a propósito"] += Math.abs(dif);
        causa = "[a propósito] centavos de redondeo";
        categoria = "a propósito";
      } else {
        categoria = dichas[0].cat;
        causa = dichas.map((z) => `[${z.cat}] ${z.txt}`).join(" · ");
      }
    }

    // Cuotas que la contadora descuenta y el sistema no tiene cargadas
    const pr = prestamoDe.get(String(p.codigo));
    const faltaTerceros = f.terceros > 0.005 && d.terceros < 0.005;
    const faltaMercancia = f.mercancia > 0.005 && d.mercancia < 0.005;
    const debeYNoTieneFicha = (f.prestamo > 0.005) && !pr;
    const falta = faltaDe(p.codigo, {
      ...ctxBase, faltaTerceros, faltaMercancia, debeYNoTieneFicha,
    });

    const ok = Math.abs(dif) < EXACTO;
    if (ok) { cuadran++; totalCuadran++; }
    totalPersonas++;
    for (const t of falta) anotarTarea(t, nombre);

    out.push({
      codigo: p.codigo, nombre: f.nombre, nombreSistema: p.nombre ?? null,
      excel: r2(f.neto), sistema: r2(d.netoPagar), diferencia: dif,
      causa: ok && !causa ? null : causa, categoria: ok && !causa ? null : categoria,
      falta,
      detalle: Object.fromEntries(Object.entries(comp).filter(([, v]) => Math.abs(v) > EXACTO).map(([k, v]) => [k, r2(v)])),
    });
  }

  // Los que el sistema tiene y la contadora no
  for (const p of sis.personas) {
    if (p.linea !== E.key) continue;
    if (vistos.has(`${p.codigo}|${E.key}`)) continue;
    const f = fichaDe.get(String(p.codigo));
    const fuera = p.fueraDePlanilla === true;
    const neto = p.dinero ? r2(p.dinero.netoPagar) : null;
    if (neto !== null) totalSistema += neto;
    let causa, categoria;
    if (fuera) {
      causa = "[a propósito] es servicio profesional: el sistema no le arma quincena y por eso no está en tu planilla";
      categoria = "a propósito";
      acumCat["a propósito"] += 0;
    } else {
      causa = "[configurar] ya no está en tu planilla: si se fue, ponle la fecha de salida para que el sistema deje de contarlo";
      categoria = "configurar";
      acumCat.configurar += neto ?? 0;
    }
    const falta = faltaDe(p.codigo, { seFue: !fuera });
    if (!fuera) for (const t of falta) anotarTarea(t, p.nombre ?? p.codigo);
    totalPersonas++;
    out.push({
      codigo: p.codigo, nombre: p.nombre ?? `(código ${p.codigo})`, nombreSistema: p.nombre ?? null,
      excel: null, sistema: neto, diferencia: null, causa, categoria, falta, detalle: {},
    });
  }

  out.sort((m, n) => Math.abs(n.diferencia ?? 0) - Math.abs(m.diferencia ?? 0));
  empresasOut.push({
    nombre: E.nombre, quincena: E.quincena,
    corteDelReloj: E.corte,
    totalExcel: r2(totalExcel), totalSistema: r2(totalSistema),
    cuadran, personas: out.length, filas: out,
  });
}

// ── Códigos del reloj sin ficha ──────────────────────────────────────────────
const sinFicha = [];
for (const E of ["sis-sep-c13.json", "sis-ago2-c28.json"]) {
  for (const c of require(`${DIR}/${E}`).sinFicha ?? []) if (!sinFicha.includes(c)) sinFicha.push(c);
}
for (const c of sinFicha) anotarTarea("ficha", `(código ${c} del reloj)`);

// Nombres que no se escriben igual en los dos lados: Roxana busca por el de su
// planilla y el sistema muestra el otro.
const nombresDistintos = [];
const pelar = (t) => String(t ?? "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ")
  .split(/\s+/).filter((w) => w.length > 2);
for (const e of empresasOut) {
  for (const f of e.filas) {
    if (!f.nombreSistema || !f.excel) continue;
    const a = new Set(pelar(f.nombre));
    const b = pelar(f.nombreSistema);
    // 🔑 Un typo (Kener/Kenner) no es lo mismo que OTRO APELLIDO (Guzmán/Garay).
    // Esto es solo para ordenar el informe: nada se ata por parecido.
    const cerca = (x, y) => {
      if (x === y) return true;
      if (Math.abs(x.length - y.length) > 1) return false;
      let i = 0, j = 0, fallas = 0;
      while (i < x.length && j < y.length) {
        if (x[i] === y[j]) { i++; j++; continue; }
        if (++fallas > 1) return false;
        if (x.length > y.length) i++; else if (y.length > x.length) j++; else { i++; j++; }
      }
      return fallas + (x.length - i) + (y.length - j) <= 1;
    };
    const sueltos = [...a].filter((w) => !b.some((z) => cerca(w, z)));
    if (sueltos.length > 0) {
      nombresDistintos.push({
        empresa: e.nombre, enTuPlanilla: f.nombre, enElSistema: f.nombreSistema, codigo: f.codigo,
        // El apellido es la ÚLTIMA palabra: que falte un segundo nombre no es
        // la misma persona escrita distinto, es la misma persona escrita corta.
        esOtroApellido: sueltos.includes(pelar(f.nombre)[pelar(f.nombre).length - 1]),
        palabrasQueNoAparecen: sueltos,
      });
    }
  }
}

// Horarios que no coinciden con lo que la gente marca: extra todos los días,
// y siempre parecida. Eso casi nunca es horas extra: es la hora de salida mal
// cargada.
const horariosSospechosos = [];
for (const E of EMPRESAS) {
  const ext = require(`${DIR}/${E.extras}`);
  const sis = require(`${DIR}/${E.sis}`);
  const cods = new Set(sis.personas.filter((p) => p.linea === E.key).map((p) => String(p.codigo)));
  for (const x of ext.personas) {
    if (!cods.has(String(x.codigo))) continue;
    if (x.diasConExtra < 8) continue;
    const prom = x.exactoMin / x.diasConExtra;
    if (prom < 25 || prom > 50) continue;
    const fi = fichaDe.get(String(x.codigo));
    const h = FICHAS.horarios.find((z) => String(z.empleado_codigo) === String(x.codigo));
    horariosSospechosos.push({
      empresa: E.nombre, codigo: x.codigo, nombre: fi ? fi.nombre : null,
      horarioCargado: h ? `${String(h.entrada).slice(0, 5)} a ${String(h.salida).slice(0, 5)}` : null,
      minutosDeExtraPorDia: Math.round(prom), diasConExtra: x.diasConExtra,
    });
  }
}

const resumen = {
  personas: totalPersonas,
  cuadranExactas: totalCuadran,
  plataPorCausa: Object.fromEntries(Object.entries(acumCat).map(([k, v]) => [k, r2(v)])),
  codigosDelRelojSinFicha: sinFicha,
  nombresQueNoCoinciden: nombresDistintos,
  horariosQueNoCoincidenConElReloj: horariosSospechosos,
  tareas: [...tareas.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([que, quienes]) => ({ que, cuantos: quienes.length, quienes })),
};

writeFileSync(SALIDA, JSON.stringify({
  generado: "2026-09-15",
  empresas: empresasOut,
  resumen,
}, null, 1));
console.log(`${SALIDA}: ${totalPersonas} personas · ${totalCuadran} cuadran`);

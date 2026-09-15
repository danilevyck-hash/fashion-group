/* ═══════════════════════════════════════════════════════════════════════════
 * SOLO LECTURA. LAS DIFERENCIAS, UNA POR UNA, Y DE QUIÉN SON.
 *
 * Daniel, textual: *«con el reporte quiero medir dos cosas: qué está mal
 * configurado del sistema y qué calcula mal la contable»* · *«solo dime cuando
 * hay diferencia»*.
 *
 * Pone el cuadro del sistema (mismo rango, mismo corte) al lado del Excel de la
 * contadora y escribe UNA LÍNEA por cada casilla que no coincide, con su
 * categoría:
 *
 *   falta-cargar     El sistema calcula bien; nadie le cargó ese dato.
 *   error-de-ella    El sistema tiene razón y su planilla está mal.
 *   reloj-incompleto Al reloj le faltan días; no es error de nadie.
 *   a-proposito      Difieren porque Daniel lo decidió.
 *   no-se            No se puede explicar con lo que hay.
 *
 * 🔴 `error-de-ella` es una ACUSACIÓN y solo se usa con evidencia del reloj.
 * Ante la duda, `no-se`.
 *
 *   node scripts/_medir-diferencias-yulissa.cjs <xls> <sisSep> <sisSepApr> \
 *        <sisAgo> <sisAgoApr> <diasSep> <diasAgo> <salida.json>
 * ═══════════════════════════════════════════════════════════════════════════ */
const { leerHoja, N, r2 } = require("./_medir-lector-yulissa.cjs");
const MAPA = require("./_medir-cuadre-mapa.json");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const [dirXls, fSisSep, fSisSepApr, fSisAgo, fSisAgoApr, fDiasSep, fDiasAgo, salida] = process.argv.slice(2);
const req = (p) => require(resolve(p));
const sis = { sep: req(fSisSep), ago: req(fSisAgo) };
const apr = { sep: req(fSisSepApr), ago: req(fSisAgoApr) };
const dias = { sep: req(fDiasSep), ago: req(fDiasAgo) };

const NOMBRE = { vistana: "Vistana", fashion_wear: "Fashion Wear", confecciones_boston: "Confecciones Boston", american_classic: "Multifashion" };
const d1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
const $ = (n) => `$${Math.abs(n).toFixed(2).replace(".", ",")}`;
const hhmm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")} h`;

const CORRIDAS = [
  { per: "sep", quincena: "1 – 15 de septiembre de 2026", empresas: ["vistana", "fashion_wear", "confecciones_boston"] },
  { per: "ago", quincena: "16 – 30 de agosto de 2026", empresas: ["american_classic"] },
];

/* ── Índices ──────────────────────────────────────────────────────────────── */
const idx = {}, idxApr = {}, idxDias = {};
for (const per of ["sep", "ago"]) {
  idx[per] = new Map(); idxApr[per] = new Map(); idxDias[per] = new Map();
  for (const p of sis[per].personas) idx[per].set(`${p.linea}|${p.codigo}`, p);
  for (const p of apr[per].personas) idxApr[per].set(`${p.linea}|${p.codigo}`, p);
  for (const p of dias[per]) idxDias[per].set(p.codigo, p);
}
const prestamoDe = {};
for (const per of ["sep", "ago"]) {
  prestamoDe[per] = new Map();
  for (const x of sis[per].prestamos) prestamoDe[per].set(x.codigo, x);
}

const seg = (h) => { const [a, b, c] = String(h ?? "0:0:0").split(":").map(Number); return (a || 0) * 3600 + (b || 0) * 60 + (c || 0); };

/* Los días del reloj que de verdad se miraron (hasta el corte).
 *
 * 🔑 `tardeMaxMin` es la LECTURA MÁS DURA que las marcas admiten, y existe para
 * no acusar a nadie de más. Cuando un día trae una marca de entrada y otra muy
 * pegada (menos de 20 min), el sistema lee la segunda como el arranque del
 * almuerzo y la contadora puede estar leyendo la TERCERA como la entrada de
 * verdad. Caso medido: Samir el 1-sep marcó 08:02, 08:10, 08:49 y 16:35 — el
 * sistema lo lee como 2 min tarde y 8 de almuerzo de más; leyendo el 08:49 como
 * la entrada son 49 minutos tarde, y con eso su planilla cuadra al centavo.
 * Mientras la diferencia quepa dentro de esta lectura, NO es un error de ella.
 */
function relojDe(per, codigo, hastaReloj) {
  const p = idxDias[per].get(codigo);
  if (!p) return null;
  const ds = p.dias.filter((x) => x.fecha <= hastaReloj);
  const r = { dias: ds, tardeMin: 0, almMin: 0, stMin: 0, extraMin: 0, tardeMaxMin: 0, diasAusentes: [], conMarca: 0, primerDiaConMarca: null, diasDeMarcaDudosa: [], diasDeUnaSolaMarca: [] };
  const entradaSeg = p.horarioEntrada ? seg(p.horarioEntrada) : null;
  for (const x of ds) {
    if (x.ausente) { r.diasAusentes.push(x.fecha); continue; }
    if (!x.marcas) continue;
    r.conMarca += 1;
    if (!r.primerDiaConMarca) r.primerDiaConMarca = x.fecha;
    r.tardeMin += x.tardeMin || 0; r.almMin += x.excesoAlmuerzoMin || 0;
    r.stMin += x.salidaTempranaMin || 0; r.extraMin += x.extraMin || 0;
    // La lectura más dura: sin tolerancia, y con la marca dudosa leída como entrada.
    const h = x.horas || [];
    let tardeDura = entradaSeg === null || !h.length ? (x.tardeMin || 0) : Math.max(0, (seg(h[0]) - entradaSeg) / 60);
    if (h.length >= 3 && (seg(h[1]) - seg(h[0])) / 60 < 20 && entradaSeg !== null) {
      const alt = Math.max(0, (seg(h[2]) - entradaSeg) / 60);
      if (alt > tardeDura) { tardeDura = alt; r.diasDeMarcaDudosa.push(x.fecha); }
    }
    r.tardeMaxMin += tardeDura;
    if (h.length === 1 && (x.tardeMin || 0) > 120) r.diasDeUnaSolaMarca.push(x.fecha);
  }
  return r;
}

/* El primer día en que el reloj de esa empresa registró ALGO en la ventana. Si
 * es posterior al inicio de la quincena, al reloj le faltan días y las
 * ausencias de antes no son de nadie. */
function primerDiaDelReloj(per, empresa, hastaReloj) {
  let min = null;
  for (const p of dias[per]) {
    if (p.empresa !== empresa) continue;
    for (const x of p.dias) {
      if (x.fecha > hastaReloj || !x.marcas) continue;
      if (!min || x.fecha < min) min = x.fecha;
    }
  }
  return min;
}

/* ── El clasificador ──────────────────────────────────────────────────────── */
function lineasDe(ctx) {
  const { f, p, pa, per, hastaReloj, desglosa, prest, relojDesde, quincenaDesde } = ctx;
  const relojLlegaTarde = !!(relojDesde && quincenaDesde && relojDesde > quincenaDesde);
  const d = p.dinero, da = pa ? pa.dinero : null;
  const rel = relojDe(per, p.codigo, hastaReloj);
  const vm = d.valorMinuto || 1;
  const out = [];
  const add = (texto, categoria, donde, monto) => out.push({ texto, categoria, donde: donde ?? null, monto: r2(monto) });
  const dif = (a, b) => Math.abs(r2(a) - r2(b)) >= 0.005;

  /* 1 ── Salario quincenal ─────────────────────────────────────────────── */
  if (dif(N(f.salQnal), d.salarioQuincenal)) {
    const exM = N(f.salMensual), siM = p.salarioMensual;
    if (exM && siM && dif(exM, siM))
      add(`el salario mensual no es el mismo: tu planilla usa ${$(exM)} y la ficha del sistema ${$(siM)} — por eso el quincenal sale ${$(N(f.salQnal))} contra ${$(d.salarioQuincenal)}`,
        "falta-cargar", "Asistencia › Colaboradores › su ficha › Salario mensual", d.salarioQuincenal - N(f.salQnal));
    else
      add(`el salario quincenal no coincide: tu planilla ${$(N(f.salQnal))} y el sistema ${$(d.salarioQuincenal)}, con el mismo salario mensual`,
        "no-se", null, d.salarioQuincenal - N(f.salQnal));
  }

  /* 2 ── Horas extra (las cuatro columnas del recargo) ─────────────────── */
  const EX = [
    { id: "extra125", rot: "hora extra 1.25", ex: N(f.extra125), si: d.extraDiurno, ap: da ? da.extraDiurno : 0, rec: 1.25 },
    { id: "extra150", rot: "hora extra 1.50", ex: N(f.extra150), si: d.extraNocturno, ap: da ? da.extraNocturno : 0, rec: 1.5 },
    { id: "excedente", rot: "excedente", ex: N(f.excedente), si: d.excedente, ap: da ? da.excedente : 0, rec: 2.625 },
    { id: "domferi", rot: "domingo y feriado", ex: N(f.domingos) + N(f.feriado), si: d.domingos + d.feriados, ap: da ? da.domingos + da.feriados : 0, rec: 1.5 },
  ];
  const exTot = EX.reduce((a, c) => a + c.ex, 0), siTot = EX.reduce((a, c) => a + c.si, 0);
  const apTot = EX.reduce((a, c) => a + c.ap, 0);
  const sinAprobar = r2(apTot - siTot);
  const vendedorFuera = rel && rel.dias.some((x) => /vendedor/i.test(String(x.justificado ?? "")));
  for (const c of EX) {
    if (!dif(c.ex, c.si)) continue;
    const hEx = d.rataHora ? c.ex / (c.rec * d.rataHora) : 0;
    const hSi = d.rataHora ? c.si / (c.rec * d.rataHora) : 0;
    const brecha = r2(c.si - c.ex);
    const pend = r2(c.ap - c.si);
    const reloj = hhmm(rel ? rel.extraMin : 0);
    if (Math.abs(brecha) < 0.105) {
      add(`${$(c.ex)} de ${c.rot} en tu planilla y ${$(c.si)} en el sistema: ${$(brecha)} de diferencia, tú redondeas las horas y el sistema paga los minutos exactos`,
        "a-proposito", null, brecha);
    } else if (c.ex > c.si && (vendedorFuera || p.trabajaAfuera) && rel && rel.extraMin === 0) {
      add(`${d1(hEx)} horas de ${c.rot} (${$(c.ex)}) que tu planilla paga y el reloj no puede medir: trabaja fuera de la oficina`,
        "falta-cargar", "Asistencia › el día de esa persona › anotarle las horas a mano", brecha);
    } else if (relojLlegaTarde) {
      add(`${d1(hEx)} horas de ${c.rot} (${$(c.ex)}) en tu planilla contra ${d1(hSi)} en el sistema: el reloj de esa tienda empezó a registrar el ${relojDesde}, así que no vio los primeros días`,
        "reloj-incompleto", null, brecha);
    } else if (c.ex > c.si && pend > 0.005) {
      add(`${d1(hEx)} horas de ${c.rot} (${$(c.ex)}) en tu planilla contra ${d1(hSi)} en el sistema; el reloj tiene ${reloj} en total y ${$(pend)} de esta columna están sin aprobar`,
        "falta-cargar", "Asistencia › Aprobaciones", brecha);
    } else if (c.ex > c.si && rel && rel.extraMin === 0) {
      add(`${d1(hEx)} horas de ${c.rot} (${$(c.ex)}) en tu planilla que el reloj no registró: ningún día pasó de los 10 minutos de más`,
        "no-se", null, brecha);
    } else if (c.ex > c.si) {
      add(`${d1(hEx)} horas de ${c.rot} (${$(c.ex)}) en tu planilla contra ${d1(hSi)} en el sistema; el reloj midió ${reloj} de más en toda la quincena y ya está todo aprobado`,
        "no-se", null, brecha);
    } else {
      add(`el sistema le paga ${$(c.si)} de ${c.rot} y tu planilla ${$(c.ex)}; el reloj tiene esas horas y ya están aprobadas`,
        "no-se", null, brecha);
    }
  }

  /* 3 ── Ausencias y tardanzas: el reloj las reparte distinto ──────────── */
  const exAT = r2(N(f.ausencias) + N(f.tardanzas)), siAT = r2(d.ausencias + d.tardanzas);
  if (dif(exAT, siAT) || dif(N(f.ausencias), d.ausencias) || dif(N(f.tardanzas), d.tardanzas)) {
    if (!dif(exAT, siAT)) {
      add(`los minutos de más de 30 tarde el sistema los muestra en «Ausencias» y tú en «Tardanzas» — la plata es la misma (${$(siAT)})`,
        "a-proposito", null, 0);
    } else {
      /* (a) Los días SIN NINGUNA marca que uno cobra y el otro no. */
      const ausentes = rel ? rel.diasAusentes : [];
      const faltaDiaCompleto = r2(d.ausenciaDeDiaCompleto - Math.min(N(f.ausencias), d.ausenciaDeDiaCompleto));
      if (ausentes.length && faltaDiaCompleto > 0.005) {
        const antes = ausentes.filter((x) => relojDesde && x < relojDesde);
        const despues = ausentes.filter((x) => !relojDesde || x >= relojDesde);
        if (rel.conMarca === 0)
          add(`${ausentes.length} día(s) de ausencia que el sistema cobra (${$(d.ausenciaDeDiaCompleto)}) y tú no: el reloj no tiene ni una marcación suya en toda la quincena`,
            "reloj-incompleto", null, faltaDiaCompleto);
        else if (antes.length)
          add(`${ausentes.length} día(s) de ausencia que el sistema cobra (${$(d.ausenciaDeDiaCompleto)}) y tú no: ${antes.length} de ellos son anteriores al ${relojDesde}, el día en que el reloj de esa tienda empezó a registrar`,
            "reloj-incompleto", null, faltaDiaCompleto);
        else
          add(`${ausentes.length} día(s) de ausencia que el sistema cobra (${$(d.ausenciaDeDiaCompleto)}) y tú no — ${despues.join(", ")}: no hay ni una marcación ni justificación cargada`,
            "falta-cargar", "Asistencia › su día › Justificar", faltaDiaCompleto);
      }
      /* (b) El resto son minutos de llegar tarde: se comparan sin el día completo. */
      const base = Math.min(N(f.ausencias), d.ausenciaDeDiaCompleto);
      const exTarde = r2(exAT - base), siTarde = r2(siAT - d.ausenciaDeDiaCompleto);
      if (dif(exTarde, siTarde)) {
        const exMin = Math.round(exTarde / vm), siMin = Math.round(siTarde / vm);
        const crudo = rel ? Math.round(rel.tardeMin + rel.almMin) : 0;
        const crudoMax = rel ? Math.round(rel.tardeMaxMin + rel.almMin) : 0;
        const brecha = r2(siTarde - exTarde);
        const deMas = exMin - crudoMax;
        if (brecha > 0.005 && rel && rel.diasDeUnaSolaMarca.length)
          add(`el sistema le descuenta ${$(siTarde)} por llegar tarde y tu planilla nada: el ${rel.diasDeUnaSolaMarca.join(", ")} solo hay UNA marcación en todo el día, así que el sistema la lee como la hora de entrada`,
            "falta-cargar", "Asistencia › ese día › Corregir la hora", brecha);
        else if (brecha > 0.005)
          add(`el sistema le descuenta ${$(siTarde)} por llegar tarde (${siMin} minutos) y tu planilla ${$(exTarde)} (${exMin} minutos); el reloj registra ${crudo} minutos entre tardanzas y almuerzos largos`,
            Math.abs(brecha) < 1 ? "a-proposito" : "no-se", null, brecha);
        else if (exMin <= crudo)
          add(`cobras ${$(exTarde)} por llegar tarde y el sistema ${$(siTarde)}: el sistema no cobra los días en que la tardanza no pasó de 10 minutos (el reloj registra ${crudo} minutos en total y tú cobras ${exMin})`,
            "a-proposito", null, brecha);
        else if (deMas > 30 && Math.abs(brecha) > 10)
          add(`cobras ${exMin} minutos por llegar tarde (${$(exTarde)}) y las marcas del reloj no dan más de ${crudoMax} minutos ni leyéndolas de la forma más dura — ${deMas} minutos de más`,
            "error-de-ella", null, brecha);
        else if (rel && rel.diasDeMarcaDudosa.length && exMin <= crudoMax)
          add(`cobras ${exMin} minutos por llegar tarde (${$(exTarde)}) y el sistema ${siMin}: el ${rel.diasDeMarcaDudosa.join(", ")} hay dos marcas muy pegadas al entrar y cada uno lee una como la entrada de verdad`,
            "no-se", null, brecha);
        else if (rel && rel.almMin > 10)
          add(`cobras ${exMin} minutos por llegar tarde (${$(exTarde)}) y el sistema ${siMin}: el reloj mide ${Math.round(rel.almMin)} minutos de almuerzo de más que el sistema NO descuenta en ninguna columna`,
            "no-se", null, brecha);
        else
          add(`cobras ${exMin} minutos por llegar tarde (${$(exTarde)}) y el sistema ${siMin} (${$(siTarde)}); el reloj registra ${crudo} minutos entre tardanzas y almuerzos largos`,
            Math.abs(brecha) < 0.15 ? "a-proposito" : "no-se", null, brecha);
      }
    }
  }

  /* 4 ── Salida temprana: columna que su Excel no tiene ────────────────── */
  if (d.salidaTemprana > 0.005)
    add(`el sistema le descuenta ${$(d.salidaTemprana)} por salir antes de la hora; tu planilla no tiene esa columna`,
      "a-proposito", null, d.salidaTemprana);

  /* 5 ── Deducciones ───────────────────────────────────────────────────── */
  if (desglosa) {
    if (dif(N(f.terceros), d.terceros)) {
      if (N(f.terceros) > d.terceros)
        add(`${$(N(f.terceros))} de descuento a terceros que tú aplicas y el sistema no tiene cargados`,
          "falta-cargar", "Asistencia › Préstamos › su ficha › Descuento a terceros", N(f.terceros) - d.terceros);
      else
        add(`el sistema le descuenta ${$(d.terceros)} de terceros y tu planilla ${$(N(f.terceros))}`, "no-se", null, d.terceros - N(f.terceros));
    }
    if (dif(N(f.mercancia), d.mercancia)) {
      if (N(f.mercancia) > d.mercancia)
        add(`${$(N(f.mercancia))} de daño de mercancía que tú descuentas y el sistema no tiene cargados`,
          "falta-cargar", "Asistencia › Préstamos › su ficha › Daño de mercancía", N(f.mercancia) - d.mercancia);
      else
        add(`el sistema le descuenta ${$(d.mercancia)} de mercancía y tu planilla ${$(N(f.mercancia))}`, "no-se", null, d.mercancia - N(f.mercancia));
    }
    if (dif(N(f.prestamo), d.prestamo)) {
      const s = prest ? ` (el sistema le conoce un saldo de ${$(prest.saldo)} con cuota de ${$(prest.cuota)})` : " (el sistema no le conoce ningún préstamo)";
      if (N(f.prestamo) > d.prestamo)
        add(`le descuentas ${$(N(f.prestamo))} de préstamo y el sistema ${$(d.prestamo)}${s}${f.nota ? ` — tu nota dice: ${f.nota}` : ""}`,
          "falta-cargar", "Asistencia › Préstamos › su ficha › cuota", N(f.prestamo) - d.prestamo);
      else
        add(`el sistema le descuenta ${$(d.prestamo)} de préstamo${s} y tu planilla no le descuenta nada`,
          "no-se", null, d.prestamo - N(f.prestamo));
    }
    if (dif(N(f.otros), d.otrosServicios))
      add(`${$(N(f.otros))} de «Otros servicios» que tu planilla le SUMA y el sistema no tiene cargados${f.nota ? ` — tu nota dice: ${f.nota}` : ""}`,
        "falta-cargar", "Planilla › la casilla «Otros servicios» de su fila", N(f.otros) - d.otrosServicios);
    if (dif(N(f.isr), d.isr))
      add(`${$(N(f.isr))} de ISR que tú descuentas y el sistema no tiene cargados (el ISR va a mano)`,
        "falta-cargar", "Planilla › la casilla ISR de su fila", N(f.isr) - d.isr);
  } else {
    const exD = N(f.desctos), siD = r2(d.prestamo + d.terceros + d.mercancia);
    if (dif(exD, siD))
      add(`${$(exD)} de descuentos en tu planilla contra ${$(siD)} en el sistema — tu Excel de Multifashion no los desglosa, así que no se puede decir de qué son`,
        "falta-cargar", "Asistencia › Préstamos › su ficha", exD - siD);
  }

  /* 6 ── Seguros: solo cuando NO salen del bruto ───────────────────────── */
  const pctOk = (excel, bruto, pct) => Math.abs(excel - Math.round(bruto * pct) / 100) < 0.02;
  if (dif(N(f.ss), d.seguroSocial) && !(pctOk(N(f.ss), N(f.bruto), 9.75) && d.seguroSocial > 0))
    add(`el seguro social no cuadra: tu planilla ${$(N(f.ss))} y el sistema ${$(d.seguroSocial)}${d.seguroSocial === 0 ? " — la ficha del sistema dice que no paga seguros" : ""}`,
      d.seguroSocial === 0 ? "falta-cargar" : "no-se",
      d.seguroSocial === 0 ? "Asistencia › Colaboradores › su ficha › Paga seguros" : null, d.seguroSocial - N(f.ss));
  if (dif(N(f.se), d.seguroEducativo) && !(pctOk(N(f.se), N(f.bruto), 1.25) && d.seguroEducativo > 0))
    add(`el seguro educativo no cuadra: tu planilla ${$(N(f.se))} y el sistema ${$(d.seguroEducativo)}${d.seguroEducativo === 0 ? " — la ficha del sistema dice que no paga seguros" : ""}`,
      d.seguroEducativo === 0 ? "falta-cargar" : "no-se",
      d.seguroEducativo === 0 ? "Asistencia › Colaboradores › su ficha › Paga seguros" : null, d.seguroEducativo - N(f.se));

  return out;
}

/* ── La corrida ───────────────────────────────────────────────────────────── */
const empresasOut = [];
const avisos = [];
for (const c of CORRIDAS) {
  const hastaReloj = sis[c.per].hastaReloj;
  for (const empresa of c.empresas) {
    const a = MAPA.archivos[c.per][empresa];
    const { hoja, filas } = leerHoja(`${dirXls}/${a.archivo}`, a.hoja);
    const mapa = MAPA.personas[c.per][empresa];
    const desglosa = empresa !== "american_classic";
    const relojDesde = primerDiaDelReloj(c.per, empresa, hastaReloj);
    if (relojDesde && relojDesde > sis[c.per].desde)
      avisos.push(`${NOMBRE[empresa]}: el reloj no tiene ni una marcación antes del ${relojDesde}, y la quincena arranca el ${sis[c.per].desde}.`);
    const personas = [], cuadran = [], vistos = new Set();
    for (const f of filas) {
      if (!(N(f.salQnal) > 0 || N(f.bruto) > 0 || N(f.neto) > 0)) continue;
      const cod = mapa[f.nombre] ?? mapa[f.nombre.replace(/\s+/g, " ")];
      const nombre = f.nombre.replace(/\s+/g, " ");
      if (cod === undefined) { avisos.push(`${NOMBRE[empresa]}: «${nombre}» está en tu Excel y no se pudo amarrar a ninguna ficha del sistema.`); continue; }
      vistos.add(cod);
      const p = idx[c.per].get(`${empresa}|${cod}`);
      if (!p || !p.dinero) {
        const por = p && p.faltaConfigurar.length ? p.faltaConfigurar.join(", ") : "no aparece en el cuadro";
        personas.push({ nombre, codigo: cod, lineas: [{
          texto: `el sistema no le da ningún número esta quincena (${por}); tu planilla le paga ${$(N(f.neto))} de neto`,
          categoria: /no marcó/i.test(por) ? "reloj-incompleto" : "falta-cargar",
          donde: /no marcó/i.test(por) ? null : "Asistencia › Colaboradores › su ficha", monto: r2(-N(f.neto)),
        }] });
        continue;
      }
      const lineas = lineasDe({
        f, p, pa: idxApr[c.per].get(`${empresa}|${cod}`), per: c.per, hastaReloj, desglosa,
        prest: prestamoDe[c.per].get(cod),
        relojDesde, quincenaDesde: sis[c.per].desde,
      });
      if (!lineas.length) cuadran.push(nombre);
      else personas.push({ nombre, codigo: cod, lineas });
    }
    for (const [k, p] of idx[c.per]) {
      if (!k.startsWith(`${empresa}|`)) continue;
      if (vistos.has(p.codigo)) continue;
      avisos.push(`${NOMBRE[empresa]}: ${p.nombre ?? p.codigo} (código ${p.codigo}) está en el sistema y no en tu Excel${p.dinero ? ` — neto ${$(p.dinero.netoPagar)}` : ""}.`);
    }
    empresasOut.push({
      nombre: NOMBRE[empresa], empresaKey: empresa, quincena: c.quincena, hoja: hoja.trim(),
      corteDelReloj: hastaReloj, relojRegistraDesde: relojDesde, desglosaDescuentos: desglosa,
      personas: personas.sort((x, y) => y.lineas.length - x.lineas.length), cuadran,
    });
  }
}

/* ── Resumen ──────────────────────────────────────────────────────────────── */
const porCat = new Map();
for (const e of empresasOut) for (const p of e.personas) for (const l of p.lineas) {
  if (!porCat.has(l.categoria)) porCat.set(l.categoria, { categoria: l.categoria, lineas: 0, plata: 0, personas: new Set() });
  const x = porCat.get(l.categoria); x.lineas += 1; x.plata = r2(x.plata + Math.abs(l.monto)); x.personas.add(`${e.empresaKey}|${p.codigo}`);
}

/* ── Qué corte usó ella: lo deduce `_medir-corte-deducido.cjs`; acá se guarda
 *    la evidencia que lo sostiene, medida en esta misma corrida. ──────────── */
const CORTE_DEDUCIDO = require("./_medir-corte-evidencia.json");

/* Las cinco categorías SIEMPRE salen, aunque una venga en cero: un cero es una
 * respuesta, y esconderla haría pensar que no se miró. */
for (const k of ["falta-cargar", "error-de-ella", "reloj-incompleto", "a-proposito", "no-se"])
  if (!porCat.has(k)) porCat.set(k, { categoria: k, lineas: 0, plata: 0, personas: new Set() });

const resumen = {
  porCategoria: [...porCat.values()]
    .map((x) => ({ categoria: x.categoria, lineas: x.lineas, personas: x.personas.size, plata: x.plata }))
    .sort((a, b) => b.lineas - a.lineas),
  lineas: [...porCat.values()].reduce((a, x) => a + x.lineas, 0),
  personasConDiferencia: empresasOut.reduce((a, e) => a + e.personas.length, 0),
  personasQueCuadran: empresasOut.reduce((a, e) => a + e.cuadran.length, 0),
  avisos,
  hallazgosDelSistema: [
    {
      titulo: "El exceso de almuerzo se MIDE y no se cobra en ninguna columna",
      detalle: "`tardanzaMin` del motor es solo `tardeMin`: los minutos de almuerzo de más viajan en el reporte (`excesoAlmuerzoMin`, y suman en `tiempoNoTrabajadoMin`) pero no entran a ninguna columna de plata. La contadora sí los cobra. Es de donde sale buena parte de las diferencias chicas de «Tardanzas».",
      ejemplos: "Yeritza Solís: 41 minutos de almuerzo de más en la quincena, $0,00 en el sistema. Marta Chavarría: 189 minutos en un solo día (8-sep).",
    },
    {
      titulo: "La tolerancia de 10 minutos es un UMBRAL, no un descuento",
      detalle: "Un día con 11 minutos tarde se cobra COMPLETO (11 minutos), y uno con 10 no se cobra nada. No se le restan 10 minutos a cada día. Está bien que sea así, pero la frase «se le perdonan los primeros 10 minutos» que se lee en varios lados describe otra cosa.",
      ejemplos: "Samir Polo: 19 + 15 + 14 + 11 = 59 minutos, y el sistema cobra los 59.",
    },
    {
      titulo: "Las horas extra de la contadora son más que las del reloj, y no es redondeo al cuarto de hora",
      detalle: "Se probó: redondear cada día al cuarto de hora (hacia arriba, hacia abajo y al más cercano) no da su número en ningún caso. Tampoco da contando los minutos de entrada anticipada, ni midiendo de la primera a la última marca menos 8 h 30. Sus horas son casi siempre múltiplos de 0,25 h, así que sí redondea, pero el punto de partida no sale del reloj.",
      ejemplos: "Jhony Flores: el reloj mide 1:48 h y su planilla paga 3,00 h. Kevin Lubo: 5:28 h contra 7,00 h. Luis Parajón: 2:25 h contra 3,00 h.",
    },
    {
      titulo: "Hay horas extra medidas y sin aprobar que nadie está pagando",
      detalle: "El sistema solo paga la hora extra aprobada. En esta quincena hay minutos medidos por el reloj que no están aprobados, así que ni el sistema ni la contadora los pagan.",
      ejemplos: "Carlos Ruíz: $18,56 de hora extra sin aprobar. Alejandra Camaño: $10,54. Yeritza Solís: $18,15 (y su planilla no le paga ninguna).",
    },
  ],
};

writeFileSync(salida, JSON.stringify({
  medidoEl: new Date().toISOString().slice(0, 10),
  queEs: "Casilla por casilla: solo lo que NO coincide entre el Excel de la contadora y el cuadro del sistema, con el MISMO rango y el MISMO corte del reloj. Cada línea dice de quién es la diferencia.",
  categorias: {
    "falta-cargar": "El sistema calcula bien; nadie le cargó ese dato.",
    "error-de-ella": "El sistema tiene razón y su planilla está mal. Solo se usa con evidencia del reloj.",
    "reloj-incompleto": "Al reloj le faltan días; no es error de nadie.",
    "a-proposito": "Difieren porque Daniel lo decidió.",
    "no-se": "No se puede explicar con lo que hay.",
  },
  corteDeducido: CORTE_DEDUCIDO,
  empresas: empresasOut,
  resumen,
}, null, 1));

/* ── En pantalla ─────────────────────────────────────────────────────────── */
for (const e of empresasOut) {
  console.log(`\n═══ ${e.nombre}  ·  ${e.quincena}  ·  reloj hasta ${e.corteDelReloj}`);
  if (!e.desglosaDescuentos) console.log("   ⚠️ Tu Excel de Multifashion no desglosa los descuentos: trae una sola columna «Desctos».");
  for (const p of e.personas) {
    console.log(`\n  ${p.nombre} (cód ${p.codigo})`);
    for (const l of p.lineas) console.log(`    · [${l.categoria}] ${l.texto}${l.donde ? `  → ${l.donde}` : ""}`);
  }
  if (e.cuadran.length) console.log(`\n  ✅ Cuadran en todo: ${e.cuadran.join(", ")}`);
}
console.log("\n═══ POR CATEGORÍA");
for (const c of resumen.porCategoria)
  console.log(`  ${c.categoria.padEnd(18)}${String(c.lineas).padStart(4)} líneas  ${String(c.personas).padStart(3)} personas  $${c.plata.toFixed(2)}`);
console.log(`\n  ${resumen.personasConDiferencia} personas con alguna diferencia · ${resumen.personasQueCuadran} cuadran en todo`);
if (avisos.length) { console.log("\n═══ AVISOS"); for (const a of avisos) console.log("  ⚠️ " + a); }
console.log(`\n${salida}`);

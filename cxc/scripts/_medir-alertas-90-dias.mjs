#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ¿SIRVE EL CANAL DE ALERTAS? — backtest de 90 días contra producción.
// SOLO LECTURA: no escribe ni un byte.
//
// Contesta tres preguntas, con números y no con opiniones:
//   1) Cada regla: ¿cuántas veces habría sonado, y cuántas de verdad?
//   2) 🔴 ¿Qué averías pasaron CALLADAS? (huecos de sync que ninguna regla mira)
//   3) ¿Se puede saber qué salió de verdad a Telegram?
//
// Uso:  node scripts/_medir-alertas-90-dias.mjs
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const DIAS = 90;
const H = 3600000;

const token = (readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN=")) ?? "").split("=")[1]?.trim();
if (!token) { console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local"); process.exit(1); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.message) throw new Error(j.message + "\n" + query.slice(0, 200));
  return j;
}

// ── Espejos del código (si el código cambia, esto hay que actualizarlo) ───────
const SYNCS_UNIVERSO = {
  estadocuenta: "Cuentas por Cobrar", costo: "Ventas", articulo_info: "Ventas › Referencia",
  articulo_marca: "Multifashion", cuentas_contables: "Gastos", egresos_varios: "Gastos",
  proveedores: "Proveedores", catalogo_reebok: "Catálogos", catalogo_joybees: "Catálogos",
  catalogo_tommy: "Catálogos", catalogo_calvin: "Catálogos",
};
const A_VENTANA = 20, A_MIN_HISTORIA = 10, A_PISO_MEDIANA = 10, A_DIAS_DE_LOG = 30;
const HORAS_DATO_VIEJO = 24, HORAS_ENTRE_AVISOS = 20;
const HORAS_SIN_ESCRIBIR = 40, HORAS_SIN_ESCRIBIR_SEMANAL = 165, DIAS_ENTRE_AVISOS = 7;
const PASADAS_UTC = [10, 14, 18];
const EMPRESAS_FACTURAS = ["american_classic","vistana","fashion_wear","fashion_shoes","active_shoes","active_wear","joystep","confecciones_boston"];
const EMPRESAS_ESTADOCUENTA = ["vistana","fashion_wear","fashion_shoes","active_shoes","active_wear","joystep","confecciones_boston"];

const RUN_ATASCADO = /atascad|stale|colgad|nunca termin/i;
const esAtascado = (m) => !!m && RUN_ATASCADO.test(m);
const esLicencia = (m) => !!m && /LICENCIA/i.test(m);
const mediana = (a) => { if (!a.length) return 0; const s=[...a].sort((x,y)=>x-y); const m=s.length>>1;
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const n = (v,w=6) => String(v).padStart(w);
const fecha = (iso) => new Date(iso).toISOString().slice(0,16).replace("T"," ");

// ── Carga del log ────────────────────────────────────────────────────────────
console.log(`\nLeyendo switch_sync_log de los últimos ${DIAS} días…`);
let filas = [];
for (let off = 0; ; off += 2000) {
  const p = await sql(`
    select id, empresa_key, sync_type, started_at, finished_at, status,
           coalesce(records_inserted,0) ins, coalesce(records_updated,0) upd,
           coalesce(records_skipped,0) skp, error_message
    from switch_sync_log
    where started_at >= now() - interval '${DIAS} days'
    order by started_at asc, id asc
    limit 2000 offset ${off}`);
  filas = filas.concat(p);
  if (p.length < 2000) break;
}
const ahora = Date.now();
const desde90 = ahora - DIAS * 24 * H;
console.log(`  ${filas.length} corridas · ${new Set(filas.map(f=>f.empresa_key+"|"+f.sync_type)).size} pares distintos`);

const ms = (iso) => new Date(iso).getTime();
const pares = new Map();
for (const f of filas) {
  const k = `${f.empresa_key}|${f.sync_type}`;
  if (!pares.has(k)) pares.set(k, []);
  pares.get(k).push(f);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 1) REGLA 2 — «dos fallos seguidos del mismo par» ═══\n`);
// Replay: para cada fila con status='error', recalcular la racha con lo anterior.
const eventos = [];
for (const [k, lista] of pares) {
  const [empresa, tipo] = k.split("|");
  const noRunning = lista.filter((f) => f.status !== "running");
  for (let i = 0; i < noRunning.length; i++) {
    const f = noRunning[i];
    if (f.status !== "error") continue;
    if (esAtascado(f.error_message)) continue; // el propio código las saltea
    // racha hacia atrás
    let streak = 0, desdeIso = null;
    for (let j = i; j >= 0; j--) {
      const g = noRunning[j];
      if (esAtascado(g.error_message)) continue;
      if (g.status !== "error") break;
      streak++; desdeIso = g.started_at;
    }
    const hayHistoriaPrevia = noRunning.slice(0, i).some((g) => !esAtascado(g.error_message));
    let motivo;
    if (esLicencia(f.error_message)) motivo = "licencia";
    else if (!hayHistoriaPrevia && streak <= 1) motivo = streak >= 2 ? "racha" : "sin-historia";
    else if (streak >= 2) motivo = "racha";
    else motivo = "primer-fallo";
    const avisa = motivo === "racha" || motivo === "licencia" || motivo === "sin-historia";
    // ¿se recuperó solo? primer success posterior del mismo par
    const post = noRunning.slice(i + 1).find((g) => g.status === "success");
    const horasHastaExito = post ? (ms(post.started_at) - ms(f.started_at)) / H : null;
    eventos.push({ empresa, tipo, cuando: f.started_at, motivo, avisa, streak,
      desdeIso, horasHastaExito, err: (f.error_message || "").slice(0, 90) });
  }
}
const avisan = eventos.filter((e) => e.avisa);
// Agrupación real del mensaje: un mensaje por CORRIDA de cron (misma hora ±5min)
const grupos = [];
for (const e of avisan.sort((a,b)=>ms(a.cuando)-ms(b.cuando))) {
  const g = grupos[grupos.length-1];
  if (g && Math.abs(ms(e.cuando) - ms(g.t)) < 10*60000) g.items.push(e);
  else grupos.push({ t: e.cuando, items: [e] });
}
console.log(`Fallos evaluados (sin los atascos nuestros): ${eventos.length}`);
console.log(`  → habrían AVISADO: ${avisan.length} fallos, agrupados en ${grupos.length} mensajes de Telegram`);
console.log(`  → callados      : ${eventos.length - avisan.length}`);
const porMotivo = {};
for (const e of eventos) porMotivo[e.motivo] = (porMotivo[e.motivo]||0)+1;
console.log(`  motivos: ${Object.entries(porMotivo).map(([m,c])=>`${m}=${c}`).join(" · ")}`);

const RECUP = 12; // "se arregla solo en horas"
const avisosRuido = avisan.filter((e) => e.horasHastaExito !== null && e.horasHastaExito <= RECUP);
const avisosReales = avisan.filter((e) => !(e.horasHastaExito !== null && e.horasHastaExito <= RECUP));
console.log(`\n  De los ${avisan.length} avisos:`);
console.log(`    · ${avisosRuido.length} el par volvió a funcionar solo en ≤${RECUP} h  → RUIDO`);
console.log(`    · ${avisosReales.length} NO se recuperó en ≤${RECUP} h                → de verdad`);
console.log(`\n  Los ${avisosReales.length} de verdad:`);
for (const e of avisosReales) {
  const h = e.horasHastaExito === null ? "nunca volvió a correr bien" : `volvió bien ${e.horasHastaExito.toFixed(0)} h después`;
  console.log(`    ${fecha(e.cuando)}  ${e.empresa}/${e.tipo}  (${e.motivo}, van ${e.streak}) — ${h}`);
  console.log(`        ${e.err}`);
}
console.log(`\n  Los callados que NO se recuperaron en ≤${RECUP} h (falsos negativos de la regla 2):`);
const calladosMalos = eventos.filter((e) => !e.avisa && !(e.horasHastaExito !== null && e.horasHastaExito <= RECUP));
if (!calladosMalos.length) console.log("    ninguno.");
for (const e of calladosMalos) {
  const h = e.horasHastaExito === null ? "NUNCA volvió a correr bien" : `volvió bien ${e.horasHastaExito.toFixed(0)} h después`;
  console.log(`    ${fecha(e.cuando)}  ${e.empresa}/${e.tipo}  (${e.motivo}) — ${h}`);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 2) REGLA 1 — «un dato que miras está viejo» (+24 h) ═══\n`);
// Simulación en cada pasada de reconciliación, 90 días.
const exitosPorPar = new Map();
for (const [k, l] of pares) exitosPorPar.set(k, l.filter((f) => f.status === "success").map((f) => ms(f.finished_at || f.started_at)).sort((a,b)=>a-b));
function ultimoExitoAntes(k, t) {
  const l = exitosPorPar.get(k) || [];
  let r = null;
  for (const x of l) { if (x <= t) r = x; else break; }
  return r;
}
const disparosR1 = [];
const d0 = new Date(desde90); d0.setUTCHours(0,0,0,0);
for (let t = d0.getTime(); t <= ahora; t += 24*H) {
  for (const hora of PASADAS_UTC) {
    const T = t + hora*H;
    if (T < desde90 + 7*24*H || T > ahora) continue; // 7 días de calentamiento
    const viejos = [];
    for (const e of EMPRESAS_FACTURAS) {
      const u = ultimoExitoAntes(`${e}|facturas`, T);
      if (u === null || (T-u)/H > HORAS_DATO_VIEJO) viejos.push({dato:"ventas", e, horas: u===null?null:(T-u)/H});
    }
    for (const e of EMPRESAS_ESTADOCUENTA) {
      const u = ultimoExitoAntes(`${e}|estadocuenta`, T);
      if (u === null || (T-u)/H > HORAS_DATO_VIEJO) viejos.push({dato:"cartera", e, horas: u===null?null:(T-u)/H});
    }
    if (viejos.length) disparosR1.push({ T, viejos });
  }
}
// dedup de 20 h
let ultimoAvisoR1 = -Infinity; const avisosR1 = [];
for (const d of disparosR1) { if (d.T - ultimoAvisoR1 >= HORAS_ENTRE_AVISOS*H) { avisosR1.push(d); ultimoAvisoR1 = d.T; } }
console.log(`Pasadas simuladas: ${Math.round((ahora-(desde90+7*24*H))/(24*H))*3} aprox · detecciones: ${disparosR1.length} · mensajes tras el dedup de 20 h: ${avisosR1.length}`);
for (const a of avisosR1) {
  console.log(`  ${fecha(new Date(a.T).toISOString())}  → ${a.viejos.map(v=>`${v.dato}/${v.e} ${v.horas===null?"nunca":v.horas.toFixed(0)+"h"}`).join(" · ")}`);
}
if (!avisosR1.length) console.log("  NINGUNO. La regla 1 no habría sonado una sola vez en 90 días.");

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 3) ALERTA A — «trajo CERO donde siempre trae cientos» ═══\n`);
const disparosA = [];
for (const [k, lista] of pares) {
  const [empresa, tipo] = k.split("|");
  if (!SYNCS_UNIVERSO[tipo]) continue;
  const exitos = lista.filter((f) => f.status === "success");
  for (let i = 0; i < exitos.length; i++) {
    const f = exitos[i];
    const T = ms(f.started_at);
    // ventana como la lee el código: éxitos de los últimos A_DIAS_DE_LOG, de la más nueva a la más vieja
    const win = exitos.filter((g) => ms(g.started_at) <= T && ms(g.started_at) >= T - A_DIAS_DE_LOG*24*H)
      .sort((a,b)=>ms(b.started_at)-ms(a.started_at)).slice(0, A_VENTANA+1)
      .map((g)=>({cuando:g.started_at, volumen:g.ins+g.upd}));
    if (!win.length || win[0].volumen !== 0) continue;
    let fin = 0; while (fin+1 < win.length && win[fin+1].volumen === 0) fin++;
    const historia = win.slice(fin+1).map(c=>c.volumen);
    if (historia.length < A_MIN_HISTORIA) continue;
    if (historia.some(v=>v===0)) continue;
    const med = mediana(historia);
    if (med < A_PISO_MEDIANA) continue;
    disparosA.push({ empresa, tipo, modulo: SYNCS_UNIVERSO[tipo], cuando: f.started_at, desde: win[fin].cuando, mediana: med });
  }
}
// un mensaje por MÓDULO con anti-loop de 7 días
const avisosA = [];
const ultimoPorModulo = {};
for (const d of disparosA.sort((a,b)=>ms(a.cuando)-ms(b.cuando))) {
  const prev = ultimoPorModulo[d.modulo] ?? -Infinity;
  if (ms(d.cuando) - prev >= DIAS_ENTRE_AVISOS*24*H) { avisosA.push(d); ultimoPorModulo[d.modulo] = ms(d.cuando); }
}
console.log(`Corridas que cumplen los 3 candados: ${disparosA.length} · mensajes tras el anti-loop de 7 d por módulo: ${avisosA.length}`);
for (const a of avisosA) console.log(`  ${fecha(a.cuando)}  ${a.empresa}/${a.tipo} (${a.modulo}) — normal ${a.mediana} filas, trajo 0 desde ${fecha(a.desde)}`);
if (!disparosA.length) console.log("  NINGUNA. La alerta A no habría sonado una sola vez en 90 días.");

// Control: cuántos ceros hubo en total en syncs de universo completo y por qué se callaron
console.log(`\n  CONTROL — ceros en syncs de «universo completo» y por qué NO alertaron:`);
const cerosPorPar = {};
for (const [k, lista] of pares) {
  const [, tipo] = k.split("|");
  if (!SYNCS_UNIVERSO[tipo]) continue;
  const ex = lista.filter(f=>f.status==="success");
  const ceros = ex.filter(f=>f.ins+f.upd===0).length;
  if (ceros) cerosPorPar[k] = { ceros, total: ex.length };
}
for (const [k,v] of Object.entries(cerosPorPar).sort((a,b)=>b[1].ceros-a[1].ceros))
  console.log(`    ${k.padEnd(38)} ${n(v.ceros,4)} ceros de ${v.total} corridas`);

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 4) 🔴 AVERÍAS QUE PASARON CALLADAS ═══\n`);
console.log(`Huecos entre dos corridas EXITOSAS del mismo par, más largos que su ritmo normal.`);
console.log(`(«ritmo normal» = mediana del hueco de ese par; se marca lo que pase de 3× la mediana y de 26 h)\n`);
const huecos = [];
for (const [k, lista] of pares) {
  const ex = lista.filter(f=>f.status==="success").map(f=>ms(f.finished_at||f.started_at)).sort((a,b)=>a-b);
  if (ex.length < 5) continue;
  const gaps = []; for (let i=1;i<ex.length;i++) gaps.push((ex[i]-ex[i-1])/H);
  const medg = mediana(gaps);
  for (let i=1;i<ex.length;i++) {
    const g = (ex[i]-ex[i-1])/H;
    if (g > Math.max(26, 3*medg)) huecos.push({ par:k, desde: new Date(ex[i-1]).toISOString(), hasta: new Date(ex[i]).toISOString(), horas: g, ritmo: medg });
  }
  // hueco abierto hasta HOY
  const gFin = (ahora - ex[ex.length-1])/H;
  if (gFin > Math.max(26, 3*medg)) huecos.push({ par:k, desde: new Date(ex[ex.length-1]).toISOString(), hasta: "HOY", horas: gFin, ritmo: medg, abierto:true });
}
huecos.sort((a,b)=>b.horas-a.horas);
console.log(`  ${huecos.length} huecos anómalos. Los que pasan de 40 h:\n`);
const errPorPar = new Map();
for (const [k,l] of pares) errPorPar.set(k, l.filter(f=>f.status==="error"));
for (const h of huecos.filter(x=>x.horas>40)) {
  const [emp,tipo] = h.par.split("|");
  const errs = (errPorPar.get(h.par)||[]).filter(e => ms(e.started_at) > ms(h.desde) && (h.hasta==="HOY" || ms(e.started_at) < ms(h.hasta)));
  // ¿alguna regla lo cubre?
  const cubre = [];
  if (tipo==="facturas" && EMPRESAS_FACTURAS.includes(emp) && h.horas>HORAS_DATO_VIEJO) cubre.push("regla 1 (ventas)");
  if (tipo==="estadocuenta" && EMPRESAS_ESTADOCUENTA.includes(emp) && h.horas>HORAS_DATO_VIEJO) cubre.push("regla 1 (cartera)");
  if (errs.length>=2) cubre.push(`regla 2 (${errs.length} fallos registrados)`);
  if (tipo==="egresos_varios"||tipo==="articulo_info") cubre.push("alerta B (tabla quieta)");
  console.log(`  ${h.par.padEnd(38)} ${n(h.horas.toFixed(0),5)} h  (ritmo ${h.ritmo.toFixed(1)} h)  ${fecha(h.desde)} → ${h.hasta==="HOY"?"HOY":fecha(h.hasta)}`);
  console.log(`      fallos registrados en el hueco: ${errs.length}   ${cubre.length?"CUBIERTO por "+cubre.join(" + "):"🔴 NADIE LO MIRA"}`);
}

writeFileSync("/tmp/alertas-backtest.json",
  JSON.stringify({ eventos, avisosR1, disparosA, huecos }, null, 1));
console.log(`\n(detalle crudo en /tmp/alertas-backtest.json)`);

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 5) DÍAS EN QUE UN SYNC SENCILLAMENTE NO CORRIÓ ═══\n`);
console.log(`(cero filas de CUALQUIER estado en switch_sync_log ese día → no dejó ni un error que`);
console.log(` la regla 2 pudiera contar. Solo pares que corren todos los días.)\n`);
const dia = (t) => new Date(t).toISOString().slice(0,10);
const faltantes = [];
for (const [k, lista] of pares) {
  const dias = new Set(lista.map((f) => dia(ms(f.started_at))));
  const t0 = ms(lista[0].started_at), t1 = ms(lista[lista.length-1].started_at);
  const abarca = (t1 - t0) / (24*H);
  if (abarca < 20) continue;                 // par joven o retirado: no se opina
  const esperadosPorDia = lista.length / (abarca || 1);
  if (esperadosPorDia < 0.8) continue;       // no es diario
  const sinCorrer = [];
  for (let t = t0; t <= t1; t += 24*H) { const d = dia(t); if (!dias.has(d)) sinCorrer.push(d); }
  if (sinCorrer.length) faltantes.push({ par:k, dias: sinCorrer, hasta: dia(t1) });
}
faltantes.sort((a,b)=>b.dias.length-a.dias.length);
let totalDiasPerdidos = 0;
for (const f of faltantes) {
  totalDiasPerdidos += f.dias.length;
  console.log(`  ${f.par.padEnd(38)} ${n(f.dias.length,3)} días sin correr: ${f.dias.slice(0,8).join(", ")}${f.dias.length>8?" …":""}`);
}
console.log(`\n  TOTAL: ${totalDiasPerdidos} días-par en que el cron no dejó rastro. Ninguno pudo despertar a la regla 2.`);

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 6) MAPA DE COBERTURA — ¿quién mira cada sync? ═══\n`);
const TABLAS_B = { egresos_varios: "egresos_varios", articulo_info: "switch_articulo_info", clientes: "switch_clientes (solo Boston)" };
const filasCob = [];
for (const [k, lista] of pares) {
  const [emp, tipo] = k.split("|");
  const ex = lista.filter(f=>f.status==="success");
  if (ex.length < 3) continue;
  const quien = [];
  if (tipo === "facturas") quien.push("R1 ventas");
  if (tipo === "estadocuenta") quien.push("R1 cartera");
  if (SYNCS_UNIVERSO[tipo]) quien.push("A");
  if (TABLAS_B[tipo]) quien.push("B");
  quien.push("R2 (solo si deja un error)");
  filasCob.push({ tipo, emp, corridas: lista.length, quien: quien.join(" + ") });
}
const porTipo = {};
for (const f of filasCob) { (porTipo[f.tipo] ??= { empresas:0, corridas:0, quien:f.quien }); porTipo[f.tipo].empresas++; porTipo[f.tipo].corridas += f.corridas; }
for (const [t,v] of Object.entries(porTipo).sort())
  console.log(`  ${t.padEnd(22)} ${n(v.empresas,2)} empresas ${n(v.corridas,5)} corridas   ${v.quien}`);

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 7) ALERTA B — «una tabla dejó de recibir escrituras» ═══\n`);
// La última escritura de esas tablas = la última corrida EXITOSA de su sync.
const B_CFG = [
  { tabla:"egresos_varios",       tipo:"egresos_varios", modulo:"Gastos",              horas:HORAS_SIN_ESCRIBIR },
  { tabla:"switch_articulo_info", tipo:"articulo_info",  modulo:"Ventas › Referencia", horas:HORAS_SIN_ESCRIBIR },
  { tabla:"switch_clientes",      tipo:"clientes",       modulo:"Confecciones Boston", horas:HORAS_SIN_ESCRIBIR_SEMANAL, soloEmpresas:["confecciones_boston"] },
];
const disparosB = [];
for (const cfg of B_CFG) {
  for (const [k] of pares) {
    const [emp, tipo] = k.split("|");
    if (tipo !== cfg.tipo) continue;
    if (cfg.soloEmpresas && !cfg.soloEmpresas.includes(emp)) continue;
    const ex = exitosPorPar.get(k) || [];
    if (!ex.length) continue;
    for (let t = Math.max(desde90 + 7*24*H, ex[0]); t <= ahora; t += 24*H) {
      for (const hora of PASADAS_UTC) {
        const T = new Date(t); T.setUTCHours(hora,0,0,0);
        const tt = T.getTime(); if (tt > ahora) continue;
        const u = ultimoExitoAntes(k, tt); if (u === null) continue;
        const h = (tt - u)/H;
        if (h > cfg.horas) disparosB.push({ modulo: cfg.modulo, emp, tabla: cfg.tabla, cuando: tt, horas: h });
      }
    }
  }
}
const avisosB = []; const ultB = {};
for (const d of disparosB.sort((a,b)=>a.cuando-b.cuando)) {
  const prev = ultB[d.modulo] ?? -Infinity;
  if (d.cuando - prev >= DIAS_ENTRE_AVISOS*24*H) { avisosB.push(d); ultB[d.modulo] = d.cuando; }
}
console.log(`Detecciones: ${disparosB.length} · mensajes tras el anti-loop de 7 d por módulo: ${avisosB.length}`);
for (const a of avisosB) console.log(`  ${fecha(new Date(a.cuando).toISOString())}  ${a.modulo} — ${a.tabla}/${a.emp} lleva ${a.horas.toFixed(0)} h sin escribirse`);
if (!avisosB.length) console.log("  NINGUNO en la ventana simulada.");

// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 8) «SUCCESS» QUE ESCONDE UN RESULTADO VACÍO ═══\n`);
const zeroTipo = {};
for (const [k, lista] of pares) {
  const [, tipo] = k.split("|");
  const ex = lista.filter(f=>f.status==="success");
  (zeroTipo[tipo] ??= { ex:0, cero:0, mirado: !!SYNCS_UNIVERSO[tipo] });
  zeroTipo[tipo].ex += ex.length;
  zeroTipo[tipo].cero += ex.filter(f=>f.ins+f.upd===0).length;
}
console.log(`  ${"sync".padEnd(20)} ${"éxitos".padStart(7)} ${"en cero".padStart(8)}  ¿lo mira la alerta A?`);
for (const [t,v] of Object.entries(zeroTipo).sort((a,b)=>b[1].cero-a[1].cero)) {
  if (!v.cero) continue;
  console.log(`  ${t.padEnd(20)} ${n(v.ex,7)} ${n(v.cero,8)}  ${v.mirado ? "sí" : "🔴 NO — nadie mira su cero"}`);
}

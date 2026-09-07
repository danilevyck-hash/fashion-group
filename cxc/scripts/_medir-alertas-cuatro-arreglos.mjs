#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST de los cuatro arreglos al canal de alertas (7-sep-2026).
// SOLO LECTURA: no escribe ni un byte.
//
// Contesta, con números y contra producción:
//   1) Regla 2 — cuántos mensajes salían antes y cuántos después, y si alguna
//      avería REAL deja de avisar (si la pierde, el cambio no se hace).
//   2) Por qué `switch_recibos` y `switch_ingresos_mercancia` NO entran a la
//      alerta B.
//
// Uso:  node scripts/_medir-alertas-cuatro-arreglos.mjs
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

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
  if (j.message) throw new Error(j.message);
  return j;
}

// ── ESPEJO del cronograma (SWITCH_CRON_ENTRADAS + SYNC_TYPES_POR_CRON) ───────
// Si el cronograma cambia, esto hay que actualizarlo. El código lo DERIVA:
// `corridasPorDiaDelPar` en src/lib/cron-telemetry.ts.
const SEIS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const VENTAS = ["american_classic", ...SEIS, "confecciones_boston"];
const F = {};
const add = (e, t, n = 1) => { const k = `${e}|${t}`; F[k] = (F[k] || 0) + n; };
for (const e of VENTAS) { add(e, "facturas"); add(e, "costo"); }          // switch-sync all
for (const e of SEIS) add(e, "estadocuenta", 3);                          // all + 16xx + 211x
add("confecciones_boston", "estadocuenta");                              // boston-cartera
for (const e of VENTAS) add(e, "facturas", 4);                           // 1150/1500/1900/2300
add("american_classic", "facturas", 4);                                  // 1300/1700/2100/0015
for (const e of VENTAS) add(e, "recibos", 4);
for (const e of SEIS) { add(e, "utilidad"); add(e, "articulo_info"); add(e, "ingresos_mercancia"); }
for (const e of VENTAS) { add(e, "articulos"); add(e, "proveedores"); add(e, "egresos_varios"); add(e, "cuentas_contables"); }
add("american_classic", "articulo_marca");
add("fashion_shoes", "catalogo_tommy", 4); add("vistana", "catalogo_calvin", 4);
add("active_shoes", "catalogo_reebok", 4); add("joystep", "catalogo_joybees", 4);
add("confecciones_boston", "clientes", 1 / 7);
const frec = (par) => F[par] ?? 0;

// Los números que se están probando (espejo de alert-policy.ts).
const CORRIDAS_PARA_TRES_FALLOS = 5;
const HORAS_ENTRE_AVISOS_RACHA = 48;
/** "Se arregló solo": el par volvió a funcionar en ≤12 h. */
const RECUPERA_EN = 12;

console.log(`\nLeyendo switch_sync_log de los últimos ${DIAS} días…`);
let filas = [];
for (let off = 0; ; off += 2000) {
  const p = await sql(`select id, empresa_key, sync_type, started_at, status, error_message
    from switch_sync_log where started_at >= now() - interval '${DIAS} days'
    order by started_at asc, id asc limit 2000 offset ${off}`);
  filas = filas.concat(p);
  if (p.length < 2000) break;
}
console.log(`  ${filas.length} corridas`);

const ms = (i) => new Date(i).getTime();
const ATASCADO = /atascad|stale|colgad|nunca termin/i;
const esAtascado = (m) => !!m && ATASCADO.test(m);
const esLicencia = (m) => !!m && /LICENCIA/i.test(m);

const porPar = new Map();
for (const f of filas) {
  const k = `${f.empresa_key}|${f.sync_type}`;
  if (!porPar.has(k)) porPar.set(k, []);
  porPar.get(k).push(f);
}

// Replay de cada fallo con la racha que tenía en ese momento.
const eventos = [];
for (const [par, lista] of porPar) {
  const nr = lista.filter((f) => f.status !== "running");
  for (let i = 0; i < nr.length; i++) {
    const f = nr[i];
    if (f.status !== "error" || esAtascado(f.error_message)) continue;
    let streak = 0, desdeIso = null;
    for (let j = i; j >= 0; j--) {
      const g = nr[j];
      if (esAtascado(g.error_message)) continue;
      if (g.status !== "error") break;
      streak++; desdeIso = g.started_at;
    }
    const hayHistoria = nr.slice(0, i).some((g) => !esAtascado(g.error_message));
    const motivo = esLicencia(f.error_message) ? "licencia"
      : !hayHistoria && streak <= 1 ? "sin-historia"
        : streak >= 2 ? "racha" : "primer-fallo";
    const post = nr.slice(i + 1).find((g) => g.status === "success");
    eventos.push({
      par, cuando: f.started_at, motivo, streak, desdeIso,
      horasHastaExito: post ? (ms(post.started_at) - ms(f.started_at)) / H : null,
    });
  }
}

/** Un mensaje agrupa los fallos de la misma corrida de cron (±10 min). */
const agrupar = (evs) => {
  const g = [];
  for (const e of [...evs].sort((a, b) => ms(a.cuando) - ms(b.cuando))) {
    const u = g[g.length - 1];
    if (u && Math.abs(ms(e.cuando) - ms(u.t)) < 600000) u.items.push(e);
    else g.push({ t: e.cuando, items: [e] });
  }
  return g;
};
const esReal = (e) => !(e.horasHastaExito !== null && e.horasHastaExito <= RECUPERA_EN);

function correr({ umbralPorRitmo, antiloopH }) {
  const cand = eventos.filter((e) => {
    if (e.motivo === "licencia" || e.motivo === "sin-historia") return true;
    const u = umbralPorRitmo && frec(e.par) >= CORRIDAS_PARA_TRES_FALLOS ? 3 : 2;
    return e.streak >= u;
  });
  if (!antiloopH) return { evs: cand, msgs: agrupar(cand) };
  const ultimo = new Map(), out = [];
  for (const e of [...cand].sort((a, b) => ms(a.cuando) - ms(b.cuando))) {
    const clave = `${e.par}|${e.desdeIso ?? "sin-fecha"}`;
    if (ms(e.cuando) - (ultimo.get(clave) ?? -Infinity) >= antiloopH * H) {
      out.push(e); ultimo.set(clave, ms(e.cuando));
    }
  }
  return { evs: out, msgs: agrupar(out) };
}

console.log(`\n\n═══ 1) REGLA 2 — antes y después ═══\n`);
const antes = correr({ umbralPorRitmo: false, antiloopH: 0 });
const despues = correr({ umbralPorRitmo: true, antiloopH: HORAS_ENTRE_AVISOS_RACHA });
const clave = (e) => `${e.par}|${e.desdeIso}`;
const realesAntes = new Set(antes.evs.filter(esReal).map(clave));
const realesDespues = new Set(despues.evs.filter(esReal).map(clave));
const perdidas = [...realesAntes].filter((k) => !realesDespues.has(k));

console.log(`  ANTES  : ${antes.evs.length} fallos avisados → ${antes.msgs.length} mensajes`);
console.log(`  DESPUÉS: ${despues.evs.length} fallos avisados → ${despues.msgs.length} mensajes`);
console.log(`\n  Averías REALES (el par NO volvió a funcionar en ≤${RECUPERA_EN} h):`);
console.log(`    antes ${realesAntes.size} · después ${realesDespues.size}`);
console.log(`  🔴 Averías reales que dejarían de avisar: ${perdidas.length}`);
for (const k of perdidas) console.log(`     ${k}`);
console.log(`\n  Los ${despues.msgs.length} mensajes que quedan:`);
for (const g of despues.msgs) {
  console.log(`   ${g.t.slice(0, 16)}  ${g.items.map((i) => `${i.par}(${i.motivo},${i.streak})`).join(" ")}`);
}

console.log(`\n\n═══ 2) POR QUÉ RECIBOS E INGRESOS NO ENTRAN A LA ALERTA B ═══\n`);
console.log("La métrica exacta de B: máximo de la columna de escritura, por empresa, AHORA.\n");
for (const [tabla, col] of [["switch_recibos", "synced_at"], ["switch_ingresos_mercancia", "synced_at"]]) {
  console.log(`  ${tabla}:`);
  const r = await sql(`select empresa_key, round(extract(epoch from (now()-max(${col})))/3600::numeric,1) horas
    from ${tabla} group by 1 order by 2 desc`);
  for (const f of r) console.log(`    ${f.empresa_key.padEnd(22)} ${String(f.horas).padStart(7)} h`);
}
console.log(`\n  El umbral de B es 40 h. Todo lo que esté por encima estando SANO es un`);
console.log(`  falso positivo desde la primera pasada.\n`);
console.log("  Y el hueco más largo SIN una compra (la ventana de ingresos son 45 días):");
for (const f of await sql(`
  with d as (select empresa_key, fecha::date f from switch_ingresos_mercancia group by 1,2),
  g as (select empresa_key, f, lag(f) over (partition by empresa_key order by f) prev from d)
  select empresa_key, max(f-prev) dias from g group by 1 order by 2 desc`)) {
  console.log(`    ${f.empresa_key.padEnd(22)} ${String(f.dias).padStart(4)} días`);
}

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ¿SE PUEDEN VIGILAR LOS PAGOS? — la medición que sostiene el cambio del
// 9-sep-2026. SOLO LECTURA: no escribe ni un byte.
//
// Daniel, textual: «Siempre que me llega un telegrama me dices que es falsa
// alarma. Quiero que me lleguen de veras.»
//
// Contesta cuatro preguntas con números:
//   1) ¿Por qué los pagos NO pueden ir por la alerta B (silencio de escritura)?
//   2) ¿Por qué SÍ pueden ir por la regla 1 (última corrida exitosa del sync)?
//   3) Backtest de 90 días: ¿cuántos mensajes, y cuántos con una avería detrás?
//   4) ¿Cuál es el costo MARGINAL, si comparten mensaje y dedup con las ventas?
//
// Uso:  node scripts/_medir-pagos-vigilados.mjs
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const H = 3600000;
/** Los mismos de `datos-frescos.ts`. Si allá cambian, acá también. */
const HORAS_DATO_VIEJO = 24;
const HORAS_ENTRE_AVISOS = 20;
/** El umbral de la alerta B (`silencio-de-datos.ts`), para el contraste. */
const HORAS_SIN_ESCRIBIR = 40;

const token = (readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN=")) ?? "").split("=")[1]?.trim();
if (!token) { console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local"); process.exit(1); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

const EMPRESAS = `array['vistana','fashion_wear','fashion_shoes','active_shoes',
                       'active_wear','joystep','american_classic','confecciones_boston']`;

/** Las 3 pasadas diarias de `switch-reconciliacion` (10/14/18 UTC). */
const PASADAS = `
  select g as t from generate_series(date_trunc('day', now()-interval '90 days')+interval '10 hours', now(), interval '1 day') g
  union all select g from generate_series(date_trunc('day', now()-interval '90 days')+interval '14 hours', now(), interval '1 day') g
  union all select g from generate_series(date_trunc('day', now()-interval '90 days')+interval '18 hours', now(), interval '1 day') g`;

/** Aplica el dedup real de la regla 1: un mensaje, y nada más por 20 h. */
function conDedup(momentos) {
  let ultimo = null;
  const out = [];
  for (const t of momentos) {
    if (ultimo === null || t - ultimo >= HORAS_ENTRE_AVISOS * H) { out.push(t); ultimo = t; }
  }
  return out;
}

console.log("═".repeat(74));
console.log("  ¿SE PUEDEN VIGILAR LOS PAGOS?  —  medición contra producción");
console.log("═".repeat(74));

// ── 1) Por qué NO la alerta B ────────────────────────────────────────────────
console.log("\n1) LA TABLA NO SIRVE DE TESTIGO — `switch_recibos` se escribe por DIFERENCIA");
console.log(`   (la alerta B avisaría a las ${HORAS_SIN_ESCRIBIR} h sin una escritura)\n`);
const tabla = await sql(`
  select r.empresa_key,
    round(extract(epoch from (now() - max(r.synced_at)))/3600.0,1) as h_sin_escribir,
    (select round(extract(epoch from (now() - max(coalesce(l.finished_at,l.started_at))))/3600.0,1)
       from switch_sync_log l
      where l.empresa_key=r.empresa_key and l.sync_type='recibos' and l.status='success') as h_sin_correr
  from switch_recibos r group by 1 order by 2 desc`);
console.log("   empresa                 tabla escrita hace   sync exitoso hace   la B diría");
for (const f of tabla) {
  const ruido = Number(f.h_sin_escribir) > HORAS_SIN_ESCRIBIR;
  console.log(
    `   ${f.empresa_key.padEnd(22)} ${String(f.h_sin_escribir).padStart(10)} h ` +
    `${String(f.h_sin_correr).padStart(17)} h   ${ruido ? "🔴 «está viejo» (FALSO)" : "ok"}`,
  );
}
const falsos = tabla.filter((f) => Number(f.h_sin_escribir) > HORAS_SIN_ESCRIBIR).length;
console.log(`\n   → ${falsos} de ${tabla.length} empresas darían un falso positivo AHORA MISMO, estando sanas.`);
console.log("   Por eso `switch_recibos` sigue FUERA de TABLAS_VIGILADAS.");

// ── 2 y 3) El backtest de la regla 1 ─────────────────────────────────────────
console.log(`\n2) LA CORRIDA SÍ SIRVE — backtest de 90 días, umbral ${HORAS_DATO_VIEJO} h, dedup ${HORAS_ENTRE_AVISOS} h\n`);
const back = await sql(`
  with pasadas as (${PASADAS}),
  combos as (select e, st from (select unnest(${EMPRESAS}) e) a
             cross join (select unnest(array['recibos','facturas']) st) b),
  nace as (select empresa_key, sync_type, min(started_at) desde from switch_sync_log
            where status='success' and sync_type in ('recibos','facturas') group by 1,2),
  med as (
    select p.t, c.e, c.st,
      (select max(coalesce(l.finished_at,l.started_at)) from switch_sync_log l
        where l.empresa_key=c.e and l.sync_type=c.st and l.status='success' and l.started_at<=p.t) as ultimo
    from pasadas p cross join combos c
    join nace n on n.empresa_key=c.e and n.sync_type=c.st and p.t >= n.desde + interval '24 hours')
  select t,
    count(*) filter (where st='facturas') as ventas,
    count(*) filter (where st='recibos')  as pagos,
    string_agg(distinct e, ', ') filter (where st='recibos') as empresas_de_pagos
  from med where ultimo is null or (t-ultimo) > interval '${HORAS_DATO_VIEJO} hours'
  group by t order by t`);

const P = back.map((r) => ({ t: new Date(r.t).getTime(), v: +r.ventas, p: +r.pagos, emp: r.empresas_de_pagos }));
const soloPagos = conDedup(P.filter((r) => r.p > 0).map((r) => r.t));
const soloVentas = conDedup(P.filter((r) => r.v > 0).map((r) => r.t));
const juntos = conDedup(P.filter((r) => r.v > 0 || r.p > 0).map((r) => r.t));

// ¿Había una avería REAL detrás de cada mensaje de pagos?
const errores = await sql(`
  select date_trunc('day', started_at)::date as dia, empresa_key,
         min(left(coalesce(error_message,''),55)) as err
  from switch_sync_log
  where sync_type='recibos' and status <> 'success' and started_at > now() - interval '90 days'
  group by 1,2 order by 1`);
const diasConError = new Set(errores.map((e) => String(e.dia).slice(0, 10)));

console.log("   mensajes de PAGOS y qué había detrás:");
let reales = 0;
for (const t of soloPagos) {
  const dia = new Date(t).toISOString().slice(0, 10);
  const fila = P.find((r) => r.t === t);
  const real = diasConError.has(dia);
  if (real) reales++;
  console.log(
    `   ${dia}  ${String(fila.p).padStart(2)} empresa(s)  ` +
    `${real ? "✅ avería REAL en switch_sync_log" : "❌ RUIDO — nada roto"}   ${fila.emp ?? ""}`,
  );
}
console.log(`\n   → ${soloPagos.length} mensajes en 90 días · ${reales} reales · ${soloPagos.length - reales} de ruido`);

// ── 4) El costo marginal ─────────────────────────────────────────────────────
console.log("\n3) EL COSTO MARGINAL — los pagos comparten mensaje y dedup con las ventas\n");
console.log(`   solo ventas (lo de hoy) ...... ${soloVentas.length} mensajes`);
console.log(`   ventas + pagos ............... ${juntos.length} mensajes`);
console.log(`   → agregar los pagos cuesta ${juntos.length - soloVentas.length} mensaje(s) más en 90 días.`);
const soloPorPagos = juntos.filter((t) => !soloVentas.includes(t));
for (const t of soloPorPagos) {
  console.log(`     · ${new Date(t).toISOString().slice(0, 16)} — las ventas estaban bien y los cobros parados: HOY NADIE AVISA.`);
}

// ── 5) ¿Qué cubría la regla 2? ───────────────────────────────────────────────
console.log("\n4) ¿NO LO CUBRÍA YA LA REGLA 2 (dos fallos seguidos)?\n");
const racha = await sql(`
  with s as (select empresa_key, started_at, status,
                    lag(status) over (partition by empresa_key order by started_at) as prev
             from switch_sync_log
             where sync_type='recibos' and started_at > now() - interval '90 days')
  select empresa_key, started_at::date as dia from s
  where status<>'success' and prev is not null and prev<>'success' order by started_at`);
console.log(`   averías de cobros en 90 días (días con al menos un error): ${diasConError.size}`);
console.log(`   de ésas, la regla 2 avisó: ${racha.length}` +
            (racha.length ? ` (${racha.map((r) => `${r.empresa_key} ${r.dia}`).join(", ")})` : ""));
console.log(`   → ${diasConError.size - racha.length} pasaron CALLADAS. Ése es el agujero.`);

// ── Ritmo del cron: la razón de que hoy casi no suene ────────────────────────
const ritmo = await sql(`
  select count(*)::numeric / count(distinct empresa_key) / 30 as por_dia
  from switch_sync_log
  where sync_type='recibos' and status='success' and started_at > now() - interval '30 days'`);
console.log(`\n   ⚠️ Hoy el sync corre ${Number(ritmo[0].por_dia).toFixed(1)}×/día: un tropiezo suelto se cura en horas y`);
console.log("      nunca llega a 24 h. La alerta solo suena si los pagos se detienen un día entero.");
console.log("      Si alguien bajara ese ritmo, hay que volver a medir el umbral.");
console.log("\n" + "═".repeat(74));

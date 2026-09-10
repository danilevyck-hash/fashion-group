#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DEL MES Y EL DEL AÑO NO MUEVEN UN NÚMERO — la prueba, contra
// producción.
//
// Daniel, 9-sep-2026: *«Los paso a PDF también, para que todo el módulo se
// comporte igual»*. Los dos botones de arriba de Comisiones —«Descargar el mes»
// y «Descargar el año»— dejan de salir por el diálogo de imprimir del navegador
// y bajan un PDF armado por el sistema. Es un cambio de CÓMO SALE EL PAPEL: no
// toca la RPC, ni los descuentos, ni quién se paga, ni el Excel.
//
// Este script lo DEMUESTRA corriendo la MISMA cadena que corre la app
// —`comision_b2b_v9` mes a mes, los descuentos con su vigencia, el neteo por
// (empresa, vendedor) y la suma de lo pagable— y escupiendo las **27 celdas**
// (3 personas × 9 meses de 2026).
//
// SOLO LECTURA contra producción: no escribe ni un byte en la base.
//
// 🔑 EL SEPTIEMBRE EN CURSO SE MUEVE SOLO, ASÍ QUE SE MIDE DOS VECES.
//   node scripts/_medir-comisiones-papel-mes-anio.mjs --guardar /tmp/antes.json
//   …se hace el cambio…
//   node scripts/_medir-comisiones-papel-mes-anio.mjs --contra /tmp/antes.json
// Y además, ENERO–AGOSTO están congelados acá con su valor medido: son los
// meses cerrados, los que NO pueden moverse pase lo que pase.
//
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"];
const YEAR = 2026;
const MESES = 9; // ene–sep 2026

/** Los que NO se pagan (lib/comisiones/sin-pago) y los RETIRADOS (retirados.ts). */
const SIN_PAGO = ["DEFAULT", "DANIEL LEVY"];
const RETIRADOS = ["REY STOUTE AGUAS", "AGUAS", "COLABORADOR"];

/** Los meses CERRADOS: medidos el 6, el 8 y el 9-sep-2026, idénticos las tres veces. */
const CERRADOS_ENE_AGO = { EDWIN: 8995.40, "REYNALDO ESPINOSA": 60057.17, RODRIGO: 234.49 };

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : null;
};
const guardarEn = opcion("--guardar");
const contra = opcion("--contra");

const token = (readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN=")) ?? "").split("=")[1]?.trim();
if (!token) {
  console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local");
  process.exit(1);
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 400));
  return j;
}

const lista = EMPRESAS.map((e) => `('${e}')`).join(",");

// La MISMA cadena que corre la app, en una consulta:
//  · `comision_b2b_v9` por (empresa, mes) — la RPC vigente;
//  · los descuentos fijos ACTIVOS y VIGENTES de ese mes, con su excepción;
//  · el neteo por (empresa, vendedor), redondeado a dos, y DEFAULT nunca netea;
//  · los retirados fuera de todo.
const CONSULTA = `
with bruto as (
  select e.k as empresa, m.mes,
         upper(trim(v->>'vendedor')) as vendedor,
         (v->>'comision_total')::numeric as bruto
  from (values ${lista}) e(k)
  cross join generate_series(1, ${MESES}) m(mes)
  cross join lateral jsonb_array_elements((comision_b2b_v9(e.k, ${YEAR}, m.mes))->'vendedores') v
),
desc_mes as (
  select d.empresa_key, upper(trim(d.vendedor_nombre)) as vendedor, m.mes,
         sum(d.monto) as descuento
  from comision_descuentos_fijos d
  cross join generate_series(1, ${MESES}) m(mes)
  left join comision_descuento_excepciones x
    on x.descuento_id = d.id and x.mes = make_date(${YEAR}, m.mes, 1)
  where d.activo
    and (d.desde is null or d.desde <= (make_date(${YEAR}, m.mes, 1) + interval '1 month - 1 day')::date)
    and (d.hasta is null or d.hasta >= make_date(${YEAR}, m.mes, 1))
    and coalesce(x.activo, true)
  group by 1, 2, 3
),
neto as (
  select b.vendedor, b.mes,
         case when coalesce(dm.descuento, 0) <> 0 and b.vendedor <> 'DEFAULT'
              then round(b.bruto - dm.descuento, 2) else b.bruto end as neto
  from bruto b
  left join desc_mes dm
    on dm.empresa_key = b.empresa and dm.vendedor = b.vendedor and dm.mes = b.mes
)
select vendedor, mes, round(sum(neto), 2) as neto
from neto
where vendedor not in (${RETIRADOS.map((r) => `'${r}'`).join(",")})
group by 1, 2
order by 1, 2;`;

const NOMBRE = { "REYNALDO ESPINOSA": "Reynaldo", EDWIN: "Edwin", RODRIGO: "Rodrigo" };
const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const filas = await sql(CONSULTA);
const pagables = filas.filter((f) => !SIN_PAGO.includes(f.vendedor));
const personas = [...new Set(pagables.map((f) => f.vendedor))].sort();

console.log(`\nCOMISIÓN NETA POR PERSONA Y MES — ${YEAR}, las 6 empresas del grupo\n`);
console.log(["mes", ...personas.map((p) => NOMBRE[p] ?? p)]
  .map((c, i) => (i === 0 ? c.padEnd(5) : c.padStart(14))).join(""));

/** Las 27 celdas, con su llave: `EDWIN|3`. Es lo que se compara antes/después. */
const celdas = {};
const totalPersona = Object.fromEntries(personas.map((p) => [p, 0]));
for (let m = 1; m <= MESES; m++) {
  const linea = [String(m).padStart(2, "0").padEnd(5)];
  for (const p of personas) {
    const f = pagables.find((x) => x.vendedor === p && Number(x.mes) === m);
    const v = f ? Number(f.neto) : 0;
    celdas[`${p}|${m}`] = v;
    totalPersona[p] += v;
    linea.push(money(v).padStart(14));
  }
  console.log(linea.join(""));
}
console.log("─".repeat(5 + personas.length * 14));
console.log("TOT".padEnd(5) +
  personas.map((p) => money(Math.round(totalPersona[p] * 100) / 100).padStart(14)).join(""));

const total = Math.round(personas.reduce((s, p) => s + totalPersona[p], 0) * 100) / 100;
console.log(`\n${Object.keys(celdas).length} celdas medidas · TOTAL A PAGAR ${YEAR}: $${money(total)}`);

// ── Los meses CERRADOS: enero–agosto no se mueve pase lo que pase ────────────
for (const p of personas) {
  const esperado = CERRADOS_ENE_AGO[p];
  if (esperado === undefined) continue;
  const hastaAgosto = Math.round(
    pagables.filter((f) => f.vendedor === p && Number(f.mes) <= 8)
      .reduce((s, f) => s + Number(f.neto), 0) * 100) / 100;
  const ok = Math.abs(hastaAgosto - esperado) < 0.005;
  console.log(`${ok ? "✅" : "🔴"} ${NOMBRE[p] ?? p} ene–ago: $${money(hastaAgosto)} (medido: $${money(esperado)})`);
  if (!ok) process.exitCode = 1;
}

// ── Antes / después ─────────────────────────────────────────────────────────
if (guardarEn) {
  writeFileSync(guardarEn, JSON.stringify({ celdas, total }, null, 2));
  console.log(`\n📸 Guardado en ${guardarEn} — vuelve a correrlo con --contra ${guardarEn}.`);
}
if (contra) {
  const antes = JSON.parse(readFileSync(contra, "utf8"));
  const llaves = [...new Set([...Object.keys(antes.celdas), ...Object.keys(celdas)])];
  const distintas = llaves.filter((k) => Math.abs((antes.celdas[k] ?? 0) - (celdas[k] ?? 0)) >= 0.005);
  console.log(`\nANTES/DESPUÉS — ${llaves.length} celdas comparadas`);
  if (distintas.length === 0) {
    console.log(`✅ Las ${llaves.length} celdas dan IDÉNTICAS. Total antes $${money(antes.total)} · ahora $${money(total)}.`);
  } else {
    console.log(`🔴 ${distintas.length} celda(s) cambiaron:`);
    for (const k of distintas) console.log(`   ${k}: ${money(antes.celdas[k] ?? 0)} → ${money(celdas[k] ?? 0)}`);
    process.exitCode = 1;
  }
}

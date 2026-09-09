#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LA FLECHITA NO MUEVE UN NÚMERO — la prueba, contra producción.
//
// Los dos cambios del 8-sep-2026 —la flechita ↓ en la celda y los dos botones
// de arriba (el mes en PDF y el mes en Excel)— son de FORMA y de cuántos toques
// cuesta bajar un reporte. Ninguno toca la RPC, ni los descuentos, ni quién se
// paga. Este script lo DEMUESTRA corriendo la misma cadena que corre la app
// —`comision_b2b_v9` mes a mes, los descuentos con su vigencia, el neteo por
// (empresa, vendedor) y la suma de lo pagable— y escupiendo las **27 celdas**
// (3 personas × 9 meses de 2026) más el total del año.
//
// SOLO LECTURA contra producción: no escribe ni un byte.
//
// ⚠️ EL BASELINE ES EL DEL 8-sep-2026, NO EL DEL 6. Medido antes de tocar una
// línea, hoy:
//   Edwin       9.066,09
//   Reynaldo   58.943,26
//   Rodrigo       315,83
//   ─────────────────────
//   TOTAL      68.325,18
//
// 🔑 Y NO SE MOVIÓ POR CÓDIGO: los meses **enero a agosto están idénticos** a la
// medición del 6-sep (Edwin 8.995,40 · Reynaldo 60.057,17 · Rodrigo 234,49). Lo
// único que cambió es SEPTIEMBRE, porque entraron dos días más de producción:
// Edwin 41,77 → 70,69 · Reynaldo −1.513,08 → −1.113,91 · Rodrigo 0 → 81,34. Por
// eso el total del 6-sep ($67.815,75) ya no da: es el dato que avanzó, no la
// pantalla.
//
// Uso:  node scripts/_medir-comisiones-flecha.mjs
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"];
const YEAR = 2026;
const MESES = 9; // ene–sep 2026

/** Los que NO se pagan (lib/comisiones/sin-pago) y los RETIRADOS (retirados.ts). */
const SIN_PAGO = ["DEFAULT", "DANIEL LEVY"];
const RETIRADOS = ["REY STOUTE AGUAS", "AGUAS", "COLABORADOR"];

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
const cab = ["mes", ...personas.map((p) => NOMBRE[p] ?? p)];
console.log(cab.map((c, i) => (i === 0 ? c.padEnd(5) : c.padStart(14))).join(""));

let celdas = 0;
const totalPersona = Object.fromEntries(personas.map((p) => [p, 0]));
for (let m = 1; m <= MESES; m++) {
  const linea = [String(m).padStart(2, "0").padEnd(5)];
  for (const p of personas) {
    const f = pagables.find((x) => x.vendedor === p && Number(x.mes) === m);
    const v = f ? Number(f.neto) : 0;
    totalPersona[p] += v;
    celdas++;
    linea.push(money(v).padStart(14));
  }
  console.log(linea.join(""));
}
console.log("─".repeat(5 + personas.length * 14));
console.log(
  "TOT".padEnd(5) + personas.map((p) => money(Math.round(totalPersona[p] * 100) / 100).padStart(14)).join(""),
);

const total = Math.round(personas.reduce((s, p) => s + totalPersona[p], 0) * 100) / 100;
console.log(`\n${celdas} celdas medidas · TOTAL A PAGAR ${YEAR}: $${money(total)}`);

// Enero–agosto, la parte del año que ya no se mueve: es lo que demuestra que un
// cambio de total viene de septiembre (dato nuevo) y no de la pantalla.
const CERRADOS = { EDWIN: 8995.40, "REYNALDO ESPINOSA": 60057.17, RODRIGO: 234.49 };
for (const p of personas) {
  const hastaAgosto = Math.round(
    pagables.filter((f) => f.vendedor === p && Number(f.mes) <= 8)
      .reduce((s, f) => s + Number(f.neto), 0) * 100) / 100;
  const esperado = CERRADOS[p];
  if (esperado === undefined) continue;
  const ok = Math.abs(hastaAgosto - esperado) < 0.005;
  console.log(`${ok ? "✅" : "🔴"} ${NOMBRE[p] ?? p} ene–ago: $${money(hastaAgosto)} (6-sep: $${money(esperado)})`);
  if (!ok) process.exitCode = 1;
}

const ESPERADO = 68325.18; // medido el 8-sep-2026, ANTES de tocar una línea
if (Math.abs(total - ESPERADO) < 0.005) {
  console.log(`✅ Idéntico a lo medido ANTES de la flechita ($${money(ESPERADO)}).`);
} else {
  console.log(`🔴 SE MOVIÓ: se esperaba $${money(ESPERADO)}.`);
  process.exitCode = 1;
}

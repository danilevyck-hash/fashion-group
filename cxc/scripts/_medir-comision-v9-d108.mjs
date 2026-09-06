#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Comisiones — v8 (Multi Fashion Holding excluido por NOMBRE dentro del SQL)
// contra v9 (excluido por CÓDIGO D-108, con el comodín de vendedor `*`), sobre
// los datos REALES de ene–sep 2026 en las 6 empresas del grupo.
// SOLO LECTURA contra producción: no escribe ni un byte.
//
// LO QUE HAY QUE PROBAR, porque es plata que se le paga a gente:
//   · Que la comisión por PERSONA y por MES da EXACTAMENTE igual con las dos.
//   · Que las filas de D-108 hacen el trabajo (control: sin ellas, cambia).
//
// CÓMO. No se puede crear la v9 en producción (es solo lectura), así que se
// corre su cuerpo INLINE, con `comision_exclusion` reemplazada por una CTE que
// es la tabla real MÁS las 6 filas simuladas de D-108. Tres corridas:
//   A) la RPC v8 real, mes por mes                      → la referencia
//   B) el cuerpo de la v9 (sin ILIKE, con comodín)      → tiene que dar igual
//   C) CONTROL: sin ILIKE y SIN las filas de D-108      → tiene que diferir
//
// Uso:  node scripts/_medir-comision-v9-d108.mjs
// Necesita SUPABASE_ACCESS_TOKEN en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const PROYECTO = "rspocgqhtpveytgbtler";
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"];
const MESES = 9;

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

/** A) La RPC v8 REAL, tal como corre hoy en producción. */
const REFERENCIA = `
select (v->>'vendedor') as vendedor, m.mes,
  round(sum((v->>'comision_total')::numeric),2) as bruto
from (values ${lista}) e(k)
cross join generate_series(1,${MESES}) m(mes)
cross join lateral jsonb_array_elements((comision_b2b_v8(e.k, 2026, m.mes))->'vendedores') v
group by 1,2 order by 1,2;`;

/** B y C) El cuerpo de la v9, inline. `conD108` mete las 6 filas del comodín. */
const v9 = (conD108) => `
with e as (select unnest(array[${EMPRESAS.map((x) => `'${x}'`).join(",")}]) as k),
per as (select e.k as empresa, m.mes, make_date(2026,m.mes,1) as ini,
        (make_date(2026,m.mes,1)+interval '1 month'-interval '1 day')::date as fin
        from e cross join generate_series(1,${MESES}) m(mes)),
ce_sim as (
  select id, empresa_key, cliente_codigo, vendedor, activa, excluye_venta, excluye_cobro from comision_exclusion
  ${conD108 ? "union all select -1, k, 'D-108', '*', true, true, true from e" : ""}
),
doc_vendedor as (
  select distinct on (p.empresa, p.mes, sf.secuencial) p.empresa, p.mes, sf.secuencial,
    comision_vendedor_canonico(sf.vendedor_nombre) as vendedor_factura,
    upper(trim(sc.codigo)) as cliente_codigo
  from per p join switch_facturas sf on sf.empresa_key = p.empresa
  left join switch_clientes sc on sc.empresa_key=sf.empresa_key and sc.cliente_switch_id=sf.cliente_switch_id
  where sf.fecha >= p.ini::timestamptz - interval '2 days'
    and sf.fecha <  (p.fin+1)::timestamptz + interval '2 days'
  order by p.empresa, p.mes, sf.secuencial, sf.fecha desc
),
ventas as (
  select p.empresa, p.mes, coalesce(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) as vendedor,
    sum(case when f.tipo_comprobante='Nota de Crédito' then -abs(f.subtotal_con_descuento)
             when f.tipo_comprobante='Factura' and f.pct_utilidad>20 then abs(f.subtotal_con_descuento)
             else 0 end) as base
  from per p join switch_factura_utilidad f on f.empresa_key=p.empresa
  left join doc_vendedor dv on dv.empresa=p.empresa and dv.mes=p.mes and dv.secuencial=f.secuencial
  left join ce_sim ce on ce.empresa_key=p.empresa and ce.cliente_codigo=dv.cliente_codigo
    and (ce.vendedor='*' or ce.vendedor=upper(coalesce(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))
    and ce.activa=true and ce.excluye_venta=true
  where ce.id is null and f.fecha between p.ini and p.fin
    and coalesce(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) is not null
    and upper(trim(coalesce(f.cliente,''))) not in ('VENTAS','CONTADO')
  group by 1,2,3
),
cobros as (
  select p.empresa, p.mes, comision_vendedor_canonico(r.vendedor_registro) as vendedor, sum(r.total) as base
  from per p join switch_recibos r on r.empresa_key=p.empresa
  left join ce_sim ce on ce.empresa_key=p.empresa and ce.cliente_codigo=upper(trim(r.cliente_codigo))
    and (ce.vendedor='*' or ce.vendedor=upper(comision_vendedor_canonico(r.vendedor_registro)))
    and ce.activa=true and ce.excluye_cobro=true
  where ce.id is null and r.fecha between p.ini and p.fin and r.es_retencion=false
    and coalesce(r.cliente_codigo,'') <> 'TCKCTA'
    and comision_vendedor_canonico(r.vendedor_registro) is not null
  group by 1,2,3
),
universo as (
  select p.empresa, p.mes, comision_vendedor_canonico(v.nombre) as vendedor
  from per p join vendedores v on v.empresa_key=p.empresa and v.activo=true
  join comision_vendedor_tasa t on t.vendedor_nombre=comision_vendedor_canonico(v.nombre) and t.activo=true
  union select empresa,mes,vendedor from ventas
  union select empresa,mes,vendedor from cobros
)
select u.vendedor, u.mes,
  round(sum(round(coalesce(vt.base,0)*coalesce(t.tasa_venta,0.0050),2)
          + round(coalesce(cb.base,0)*coalesce(t.tasa_cobro,0.0050),2)),2) as bruto
from universo u
left join ventas vt on vt.empresa=u.empresa and vt.mes=u.mes and vt.vendedor=u.vendedor
left join cobros cb on cb.empresa=u.empresa and cb.mes=u.mes and cb.vendedor=u.vendedor
left join comision_vendedor_tasa t on t.vendedor_nombre=u.vendedor
group by 1,2 order by 1,2;`;

const clave = (f) => f.map((x) => `${x.vendedor}|${x.mes}|${Number(x.bruto).toFixed(2)}`).sort();

const [a, b, c] = await Promise.all([sql(REFERENCIA), sql(v9(true)), sql(v9(false))]);

console.log(`\nA) RPC comision_b2b_v8 real .................... ${a.length} pares (vendedor, mes)`);
console.log(`B) v9 simulada (D-108 por código + comodín) ... ${b.length} pares`);
console.log(`C) CONTROL sin las filas de D-108 ............. ${c.length} pares\n`);

const ka = clave(a), kb = clave(b), kc = clave(c);
const igual = JSON.stringify(ka) === JSON.stringify(kb);
console.log(igual
  ? "✅ A == B — la comisión por PERSONA y por MES no cambia ni un centavo."
  : "❌ A != B — el cambio MUEVE plata. Diferencias:");
if (!igual) {
  const mapa = new Map(ka.map((k) => [k.split("|").slice(0, 2).join("|"), k]));
  for (const k of kb) {
    const id = k.split("|").slice(0, 2).join("|");
    if (mapa.get(id) !== k) console.log(`   ${mapa.get(id) ?? "(no estaba)"}  →  ${k}`);
  }
}

const distintos = kc.filter((k, i) => ka[i] !== k).length + Math.abs(ka.length - kc.length);
console.log(distintos > 0
  ? `✅ CONTROL: sin las filas de D-108 cambian ${distintos} pares — la exclusión SÍ hace el trabajo.`
  : "❌ CONTROL: sin las filas de D-108 no cambia nada. La medición no prueba nada.");

const total = (f) => f.reduce((s, x) => s + Number(x.bruto), 0);
console.log(`\nBruto 2026, las 6 empresas:  v8 $${total(a).toFixed(2)}   v9 $${total(b).toFixed(2)}   (control $${total(c).toFixed(2)})`);

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION — QUÉ NÚMEROS CAMBIAN CON EL REDISEÑO (6-sep-2026). SOLO LECTURA.
//
// El rediseño mueve pantallas, no cuentas. Este script lo demuestra contra
// PRODUCCIÓN, midiendo lo mismo antes y después:
//
//   A. Los números del Resumen (venta del mes, tiquetes, año, proyección y sobre
//      cuántos días está hecha) — tienen que quedar IDÉNTICOS.
//   B. El ranking de Vendedoras con y sin el amarre de códigos
//      (`multifashion_vendedora_alias`, migración PENDIENTE): la única cosa que
//      puede moverse, y lo que se mueve son FILAS, no la suma.
//   C. La cobertura de Clientes (los dos porcentajes de la línea nueva).
//   D. «Cuándo vende la tienda»: el día más fuerte y la hora pico, con la
//      ventana de UN mes (lo de antes) y de TRES (lo de ahora).
//   E. Por qué el total de Vendedoras NO cuadra con el del mes — y por qué el
//      amarre no lo arregla.
//
// Uso:  node scripts/_medir-multifashion-rediseno.mjs [YYYY-MM]
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const TOKEN = (env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!TOKEN) { console.error("falta SUPABASE_ACCESS_TOKEN en .env.local"); process.exit(1); }
const PROYECTO = "rspocgqhtpveytgbtler";

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (j?.message) throw new Error(j.message);
  return j;
}

const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const arg = process.argv[2] ?? null;

const hoy = (await q("select multifashion_hoy_panama() d;"))[0].d;
const ANIO = arg ? Number(arg.slice(0, 4)) : Number(hoy.slice(0, 4));
const MES = arg ? Number(arg.slice(5, 7)) : Number(hoy.slice(5, 7));
const MM = String(MES).padStart(2, "0");

console.log(`\n═══ MULTIFASHION · ${ANIO}-${MM} (hoy en Panamá: ${hoy}) ═══\n`);

// ── A. El Resumen ────────────────────────────────────────────────────────────
const det = (await q(`select multifashion_detalle_mensual_v2(${ANIO}, ${MES}) - 'dias' d;`))[0].d;
const ov = (await q(`select multifashion_mensual_v7(${ANIO}, ${MES}) - 'wholesale' d;`))[0].d;
const proy = (await q(`select proyeccion_mensual_retail_v1(${ANIO}, ${MES}) d;`))[0].d
  .find((r) => r.empresa_key === "american_classic");

console.log("A · EL RESUMEN — nada de esto se puede mover");
console.log(`   Ventas del mes ....... ${money(det.totales.ventas)}   (${det.mes_label} ${ANIO}, al día ${det.dia_actual})`);
console.log(`   Tickets .............. ${det.totales.n_tickets}   ·  ticket promedio $${Number(det.totales.ticket_promedio).toFixed(2)}`);
console.log(`   Cierra en ............ ${money(proy.proyeccion_retail)}   ← NUEVO: «con ${proy.dia_corte} días» (de ${proy.dias_mes})`);
console.log(`   Año ${ANIO} ............ ${money(ov.retail.ytdVentas)}`);
console.log(`   Comprobación de la regla de tres: ${money(det.totales.ventas)} ÷ ${proy.dia_corte} × ${proy.dias_mes} = ${money(det.totales.ventas / proy.dia_corte * proy.dias_mes)}`);

// El «YTD» de la tabla Mes a mes es la suma de sus filas: tiene que dar lo mismo
// que la tarjeta del año, o son dos cifras con el mismo nombre y distinto valor.
const sumaMeses = ov.retail.meses.reduce((s, m) => s + Number(m.ventas), 0);
console.log(`   Suma de los meses de la tabla: ${money(sumaMeses)}  ${Math.abs(sumaMeses - Number(ov.retail.ytdVentas)) < 0.005 ? "= la tarjeta ✅" : "≠ LA TARJETA 🩸"}`);

// ── B. Vendedoras: antes y después del amarre ────────────────────────────────
const ALIAS = "(values (12,'Ana Trejos'),(13,'Cindy De Gracia'),(14,'Yeisibeth Muñoz'))";
async function ranking({ desde, hasta, conAmarre }) {
  const vend = conAmarre
    ? "coalesce(a.canon, regexp_replace(trim(sf.vendedor_nombre),'\\s+',' ','g'))"
    : "regexp_replace(trim(sf.vendedor_nombre),'\\s+',' ','g')";
  return q(`
    with alias(cod, canon) as ${ALIAS},
    v as (
      select ${vend} vend,
        case when sf.tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito') then sf.subtotal_descuento
             when sf.tipo_comprobante='Nota de Crédito' then -sf.subtotal_descuento else 0 end sub,
        case when sf.tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito') and sf.condicion_venta='Contado' then sf.subtotal_descuento
             when sf.tipo_comprobante='Nota de Crédito' then -sf.subtotal_descuento else 0 end subc
      from switch_facturas sf left join alias a on a.cod = sf.vendedor_switch_id
      where sf.empresa_key='american_classic'
        and mf_panama_date(sf.fecha) between '${desde}' and '${hasta}'
        and sf.vendedor_nombre is not null and trim(sf.vendedor_nombre) <> ''
        and upper(trim(sf.vendedor_nombre)) <> 'DEFAULT')
    select vend, count(*) tickets, round(sum(sub),2)::text ventas, round(sum(subc)*0.005,2)::text comision
    from v group by 1 order by sum(sub) desc;`);
}

const desde12 = `${ANIO - 1}-${String(MES + 1 > 12 ? 1 : MES + 1).padStart(2, "0")}-01`;
const hasta12 = `${ANIO}-${MM}-${new Date(ANIO, MES, 0).getDate()}`;
const antes = await ranking({ desde: desde12, hasta: hasta12, conAmarre: false });
const despues = await ranking({ desde: desde12, hasta: hasta12, conAmarre: true });
const suma = (r) => r.reduce((s, x) => s + Number(x.ventas), 0);
const sumaCom = (r) => r.reduce((s, x) => s + Number(x.comision), 0);

console.log(`\nB · VENDEDORAS · últimos 12 meses (${desde12} → ${hasta12})`);
console.log(`   filas ANTES: ${antes.length}   →   DESPUÉS: ${despues.length}`);
console.log(`   venta ANTES: ${money(suma(antes))}   →   DESPUÉS: ${money(suma(despues))}  ${Math.abs(suma(antes) - suma(despues)) < 0.005 ? "✅ idéntica" : "🩸 CAMBIÓ"}`);
console.log(`   comisión ANTES: ${money(sumaCom(antes))}   →   DESPUÉS: ${money(sumaCom(despues))}  ${Math.abs(sumaCom(antes) - sumaCom(despues)) < 0.005 ? "✅ idéntica" : "🩸 CAMBIÓ"}`);
const mapAntes = new Map(antes.map((r) => [r.vend, r]));
for (const r of despues) {
  const a = mapAntes.get(r.vend);
  if (!a || Number(a.ventas) !== Number(r.ventas)) {
    console.log(`   · ${r.vend.padEnd(20)} ${money(a?.ventas ?? 0).padStart(14)} → ${money(r.ventas).padStart(14)}`);
  }
}
for (const r of antes) if (!despues.some((d) => d.vend === r.vend)) {
  console.log(`   · ${r.vend.padEnd(20)} ${money(r.ventas).padStart(14)} → (se junta con su persona)`);
}

// ── C. Clientes ──────────────────────────────────────────────────────────────
const cli = (await q(`select to_jsonb(x) - 'clientes' d from multifashion_retail_recurrentes_v2('${ANIO}-${MM}-01','${hasta12}',50) x;`))[0].d;
const tTot = Number(cli.tickets_identificados) + Number(cli.tickets_anonimos);
const vTot = Number(cli.ventas_identificadas) + Number(cli.ventas_anonimas);
console.log(`\nC · CLIENTES · la línea nueva, para ${ANIO}-${MM}`);
console.log(`   ${Math.round(cli.tickets_identificados / tTot * 100)}% de los tiquetes con nombre — el ${Math.round(cli.ventas_identificadas / vTot * 100)}% de la venta`);
console.log(`   (${cli.tickets_identificados} de ${tTot} tiquetes · ${money(cli.ventas_identificadas)} de ${money(vTot)})`);
console.log(`   clientes identificados: ${cli.clientes_identificados}  → la lista abre con 10 y ofrece «Ver los ${cli.clientes_identificados}»`);

// ── D. Cuándo vende la tienda ────────────────────────────────────────────────
const desde3 = (() => { const t = ANIO * 12 + (MES - 1) - 2; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`; })();
const dow1 = det.heatmap_dia_semana.reduce((a, h) => (Number(h.ventas_promedio) > Number(a?.ventas_promedio ?? -1) ? h : a), null);
const h1 = (await q(`select multifashion_horas_pico_v1(${ANIO},${MES}) d;`))[0].d;
const dow3 = (await q(`
  with d as (select mf_panama_date(fecha) f,
    sum(case when tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito') then subtotal_descuento
             when tipo_comprobante='Nota de Crédito' then -subtotal_descuento else 0 end) net
    from switch_facturas where empresa_key='american_classic' and is_wholesale=false
      and mf_panama_date(fecha) between '${desde3}' and '${hasta12}' group by 1)
  select extract(dow from f)::int dow, count(*) dias, round(avg(net),2)::text prom from d group by 1 order by avg(net) desc limit 1;`))[0];
const h3 = (await q(`
  select extract(hour from (fecha at time zone 'America/Panama'))::int h,
    round(sum(case when tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito') then subtotal_descuento
                   when tipo_comprobante='Nota de Crédito' then -subtotal_descuento else 0 end),2)::text v
  from switch_facturas where empresa_key='american_classic' and is_wholesale=false
    and mf_panama_date(fecha) between '${desde3}' and '${hasta12}' group by 1
  order by sum(case when tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito') then subtotal_descuento
                    when tipo_comprobante='Nota de Crédito' then -subtotal_descuento else 0 end) desc limit 1;`))[0];
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
console.log(`\nD · CUÁNDO VENDE LA TIENDA`);
console.log(`   Mejor día del MES ......... ${money(det.mejor_dia?.ventas ?? 0)}  el ${det.mejor_dia?.fecha}`);
console.log(`   ANTES · día más fuerte .... ${dow1?.dow_label} ${money(dow1?.ventas_promedio ?? 0)} promedio  sobre ${dow1?.count_dias} día(s)  ${Math.abs(Number(dow1?.ventas_promedio ?? 0) - Number(det.mejor_dia?.ventas ?? -1)) < 0.005 ? "🩸 ES EL MISMO NÚMERO que el mejor día del mes" : ""}`);
console.log(`   DESPUÉS · día más fuerte .. ${DOW[dow3.dow]} ${money(dow3.prom)} promedio  sobre ${dow3.dias} días  (${desde3} → ${hasta12})`);
console.log(`   ANTES · hora pico ......... ${h1.hora_pico}:00  ${money(h1.hora_pico_ventas ?? 0)}  (solo el mes)`);
console.log(`   DESPUÉS · hora pico ....... ${h3.h}:00  ${money(h3.v)}  (3 meses)`);

// ── E. Por qué el total de Vendedoras no cuadra con el del mes ───────────────
const mesRank = await ranking({ desde: `${ANIO}-${MM}-01`, hasta: hasta12, conAmarre: true });
const def = (await q(`
  select round(sum(subtotal),2)::text d from _multifashion_sf_vw
  where anio=${ANIO} and mes=${MES} and upper(trim(coalesce(vendedor,'')))='DEFAULT';`))[0].d;
console.log(`\nE · POR QUÉ EL TOTAL DE VENDEDORAS NO CUADRA CON EL DEL MES`);
console.log(`   Venta del mes ..................... ${money(det.totales.ventas)}`);
console.log(`   Suma de las vendedoras ............ ${money(suma(mesRank))}`);
console.log(`   Diferencia ........................ ${money(Number(det.totales.ventas) - suma(mesRank))}`);
console.log(`   DEFAULT (el marcador de Switch) ... ${money(def ?? 0)}`);
console.log(`   🔑 La diferencia es DEFAULT, que las RPC excluyen a propósito.`);
console.log(`      Juntar los códigos NO la arregla: reparte la misma suma en menos filas.\n`);

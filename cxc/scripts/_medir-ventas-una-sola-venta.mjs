// Medición de SOLO LECTURA contra producción: las tres definiciones de venta
// (Resumen · Clientes › Utilidad · Productos), empresa por empresa, para un año.
// Uso: node scripts/_medir-ventas-una-sola-venta.mjs 2026 [resumen|utilidad|todo|dias]
//   · `dias` además lista los días en que el reporte por artículo no cuadra con
//     las facturas (los «renglones que el reporte no trae»).
// Lee .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), pagina de
// a 1.000 con COUNT exacto y no escribe nada. 23-sep-2026, postmortem de Ventas.
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync("/Users/daniellevy/Code/fashion-group/cxc/.env.local", "utf8")
    .split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}` };

async function todo(tabla, query, orden = "id") {
  const out = [];
  for (let p = 0; p < 2000; p++) {
    const desde = p * 1000, hasta = desde + 999;
    const r = await fetch(`${U}/rest/v1/${tabla}?${query}&order=${orden}.asc`, { headers: { ...H, Range: `${desde}-${hasta}`, Prefer: p === 0 ? "count=exact" : "" } });
    if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...j);
    if (p === 0) { const cr = r.headers.get("content-range"); out.esperadas = Number(cr.split("/")[1]); }
    if (j.length < 1000) break;
  }
  if (out.length !== out.esperadas) throw new Error(`${tabla}: leí ${out.length} de ${out.esperadas}`);
  return out;
}
const r2 = (n) => Math.round(n * 100) / 100;
const GRUPO = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const OCHO = [...GRUPO, "confecciones_boston", "american_classic"];
const SUMAN = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);
const signo = (t) => SUMAN.has(t) ? 1 : t === "Nota de Crédito" ? -1 : 0;
const fechaPanama = (iso) => new Date(new Date(iso).getTime() - 5 * 3600e3).toISOString().slice(0, 10);

const anio = Number(process.argv[2] ?? 2026);
const que = process.argv[3] ?? "todo";

// 1. switch_facturas del año (en UTC amplio, se filtra por día de Panamá)
const fac = await todo("switch_facturas", `select=id,empresa_key,tipo_comprobante,fecha,subtotal_descuento,cliente_switch_id,secuencial,switch_factura_id&fecha=gte.${anio}-01-01T00:00:00&fecha=lt.${anio + 1}-01-01T06:00:00`);
const facAnio = fac.filter(f => fechaPanama(f.fecha).slice(0, 4) === String(anio));
console.log(`switch_facturas ${anio}: ${facAnio.length} comprobantes (de ${fac.length} leídos)`);
const resumen = {}, porTipo = {};
for (const f of facAnio) {
  const v = signo(f.tipo_comprobante) * Number(f.subtotal_descuento);
  resumen[f.empresa_key] = (resumen[f.empresa_key] ?? 0) + v;
  const k = `${f.empresa_key}|${f.tipo_comprobante}`;
  porTipo[k] = (porTipo[k] ?? 0) + v;
}
console.log("\n== RESUMEN (switch_facturas firmado, día de Panamá) ==");
let tot = 0; for (const e of OCHO) { console.log(e.padEnd(20), r2(resumen[e] ?? 0).toFixed(2)); tot += resumen[e] ?? 0; }
console.log("TOTAL".padEnd(20), r2(tot).toFixed(2));
console.log("\n== por tipo ==");
for (const k of Object.keys(porTipo).sort()) console.log(k.padEnd(40), r2(porTipo[k]).toFixed(2));

if (que === "resumen") process.exit(0);

// 2. switch_factura_utilidad del año
const uti = await todo("switch_factura_utilidad", `select=id,empresa_key,tipo_comprobante,fecha,subtotal_con_descuento,costo,utilidad,cliente_switch_id,secuencial,switch_id&fecha=gte.${anio}-01-01&fecha=lt.${anio + 1}-01-01`);
console.log(`\nswitch_factura_utilidad ${anio}: ${uti.length} filas`);
const utiE = {}, utiTipo = {}, utiCosto = {};
for (const u of uti) {
  utiE[u.empresa_key] = (utiE[u.empresa_key] ?? 0) + Number(u.subtotal_con_descuento);
  utiCosto[u.empresa_key] = (utiCosto[u.empresa_key] ?? 0) + Number(u.costo);
  const k = `${u.empresa_key}|${u.tipo_comprobante}`;
  utiTipo[k] = (utiTipo[k] ?? 0) + Number(u.subtotal_con_descuento);
}
console.log("\n== UTILIDAD (subtotal_con_descuento por empresa) vs RESUMEN ==");
for (const e of GRUPO) console.log(e.padEnd(20), r2(utiE[e] ?? 0).toFixed(2).padStart(14), "dif", r2((utiE[e] ?? 0) - (resumen[e] ?? 0)).toFixed(2).padStart(12), "costo", r2(utiCosto[e] ?? 0).toFixed(2));
console.log("\n== utilidad por tipo ==");
for (const k of Object.keys(utiTipo).sort()) console.log(k.padEnd(40), r2(utiTipo[k]).toFixed(2));

// ¿Qué comprobantes de facturas NO están en utilidad? (por empresa+secuencial)
const enUti = new Set(uti.map(u => `${u.empresa_key}|${u.secuencial}`));
const faltan = {};
for (const f of facAnio) {
  if (!GRUPO.includes(f.empresa_key)) continue;
  if (!enUti.has(`${f.empresa_key}|${f.secuencial}`)) {
    const k = `${f.empresa_key}|${f.tipo_comprobante}`;
    faltan[k] = faltan[k] ?? { n: 0, monto: 0 };
    faltan[k].n++; faltan[k].monto += signo(f.tipo_comprobante) * Number(f.subtotal_descuento);
  }
}
console.log("\n== comprobantes de switch_facturas que NO están en switch_factura_utilidad ==");
for (const k of Object.keys(faltan).sort()) console.log(k.padEnd(40), faltan[k].n, r2(faltan[k].monto).toFixed(2));
// ¿y al revés?
const enFac = new Set(facAnio.map(f => `${f.empresa_key}|${f.secuencial}`));
const sobran = {};
for (const u of uti) if (!enFac.has(`${u.empresa_key}|${u.secuencial}`)) { const k = `${u.empresa_key}|${u.tipo_comprobante}`; sobran[k] = sobran[k] ?? { n: 0, monto: 0 }; sobran[k].n++; sobran[k].monto += Number(u.subtotal_con_descuento); }
console.log("\n== filas de utilidad que NO están en switch_facturas ==");
for (const k of Object.keys(sobran).sort()) console.log(k.padEnd(40), sobran[k].n, r2(sobran[k].monto).toFixed(2));
// diferencias de monto en los que están en ambas
const facMap = new Map(facAnio.map(f => [`${f.empresa_key}|${f.secuencial}`, f]));
const difMonto = {};
for (const u of uti) { const f = facMap.get(`${u.empresa_key}|${u.secuencial}`); if (!f) continue; const d = Number(u.subtotal_con_descuento) - signo(f.tipo_comprobante) * Number(f.subtotal_descuento); if (Math.abs(d) > 0.005) { difMonto[u.empresa_key] = difMonto[u.empresa_key] ?? { n: 0, monto: 0 }; difMonto[u.empresa_key].n++; difMonto[u.empresa_key].monto += d; } }
console.log("\n== mismos comprobantes con monto distinto (utilidad − facturas) ==");
for (const k of Object.keys(difMonto).sort()) console.log(k.padEnd(40), difMonto[k].n, r2(difMonto[k].monto).toFixed(2));

if (que === "utilidad") process.exit(0);

// 3. switch_articulo_diario del año, las 6 del grupo
console.log("\n== PRODUCTOS (switch_articulo_diario firmado) vs RESUMEN ==");
const artTipo = {};
for (const e of GRUPO) {
  const art = await todo("switch_articulo_diario", `select=id,fecha,tipo,venta_total,costo_total,codigo&empresa_key=eq.${e}&fecha=gte.${anio}-01-01&fecha=lt.${anio + 1}-01-01`);
  let v = 0, c = 0, ultimo = "";
  for (const a of art) { const s = a.tipo === "NC" ? -1 : 1; v += s * Number(a.venta_total); c += s * Number(a.costo_total); const k = `${e}|${a.tipo}`; artTipo[k] = (artTipo[k] ?? 0) + s * Number(a.venta_total); if (a.fecha > ultimo) ultimo = a.fecha; }
  const nd = porTipo[`${e}|Nota de Débito`] ?? 0;
  console.log(e.padEnd(20), `filas ${art.length}`.padEnd(12), "venta", r2(v).toFixed(2).padStart(14), "dif vs resumen", r2(v - (resumen[e] ?? 0)).toFixed(2).padStart(12), "ND en facturas", r2(nd).toFixed(2).padStart(11), "dif sin ND", r2(v + nd - (resumen[e] ?? 0)).toFixed(2).padStart(10), "último", ultimo);
  // Por día: facturas (no ND) vs artículo, para hallar el resto
  if (que === "dias" ) {
    const porDiaF = {}, porDiaA = {};
    for (const f of facAnio) if (f.empresa_key === e && f.tipo_comprobante !== "Nota de Débito") { const d = fechaPanama(f.fecha); porDiaF[d] = (porDiaF[d] ?? 0) + signo(f.tipo_comprobante) * Number(f.subtotal_descuento); }
    for (const a of art) { const s = a.tipo === "NC" ? -1 : 1; porDiaA[a.fecha] = (porDiaA[a.fecha] ?? 0) + s * Number(a.venta_total); }
    const dias = new Set([...Object.keys(porDiaF), ...Object.keys(porDiaA)]);
    for (const d of [...dias].sort()) { const df = (porDiaA[d] ?? 0) - (porDiaF[d] ?? 0); if (Math.abs(df) > 0.02) console.log("   ", d, "art", r2(porDiaA[d] ?? 0).toFixed(2), "fac", r2(porDiaF[d] ?? 0).toFixed(2), "dif", r2(df).toFixed(2)); }
  }
}
console.log("\n== artículo por tipo ==");
for (const k of Object.keys(artTipo).sort()) console.log(k.padEnd(40), r2(artTipo[k]).toFixed(2));

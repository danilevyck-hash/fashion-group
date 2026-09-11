// Medición (SOLO LECTURA) de los reclamos vivos SIN fecha de factura, para la
// migración 20261114120000. Uso: npx tsx scripts/_medir-reclamos-fecha-factura.mjs
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const q = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

const recs = await q("reclamos?deleted=eq.false&select=id,nro_reclamo,empresa,estado,fecha_reclamo,fecha_factura,factura_pdf_path&order=fecha_reclamo.asc");
const sinFecha = recs.filter((r) => !r.fecha_factura);
const sinFechaSinPdf = sinFecha.filter((r) => !r.factura_pdf_path);
const sinFechaConPdf = sinFecha.filter((r) => !!r.factura_pdf_path);

console.log(`Reclamos vivos: ${recs.length}`);
console.log(`  con fecha de factura: ${recs.length - sinFecha.length}`);
console.log(`  SIN fecha de factura: ${sinFecha.length}  (sin PDF ${sinFechaSinPdf.length} · con PDF ${sinFechaConPdf.length})`);
console.log(`  sin fecha_reclamo (no se pueden rellenar): ${sinFechaSinPdf.filter((r) => !r.fecha_reclamo).length}`);

console.log("\n--- los que se rellenarían (D): vivos, sin fecha de factura y SIN PDF ---");
for (const r of sinFechaSinPdf) {
  console.log(`    '${r.id}', -- ${r.nro_reclamo.padEnd(14)} · ${String(r.empresa).padEnd(22)} · fecha_reclamo ${r.fecha_reclamo}`);
}
console.log("\n--- los que NO se tocan: tienen PDF, su fecha sale releyéndolo ---");
for (const r of sinFechaConPdf) console.log(`  ${r.nro_reclamo} · ${r.empresa} · pdf ${r.factura_pdf_path}`);

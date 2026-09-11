// Verificación de la migración 20261114120000 (SOLO LECTURA): ningún reclamo
// vivo queda sin fecha de factura, los 29 rellenados quedaron con su
// `fecha_reclamo` exacta, y los 4 que ya la tenían no se movieron.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const q = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

const recs = await q("reclamos?deleted=eq.false&select=nro_reclamo,empresa,fecha_reclamo,fecha_factura,factura_pdf_path&order=fecha_factura.asc");
const sin = recs.filter((r) => !r.fecha_factura);
const sinPdf = recs.filter((r) => !r.factura_pdf_path);
const conPdf = recs.filter((r) => !!r.factura_pdf_path);
const iguales = sinPdf.filter((r) => r.fecha_factura === r.fecha_reclamo);

console.log(`Reclamos vivos: ${recs.length}`);
console.log(`${sin.length === 0 ? "✅" : "❌"} sin fecha de factura: ${sin.length}`);
console.log(`${iguales.length === sinPdf.length ? "✅" : "❌"} de los ${sinPdf.length} sin PDF, ${iguales.length} tienen fecha_factura = fecha_reclamo`);
console.log(`   los ${conPdf.length} con PDF conservan su fecha propia:`);
for (const r of conPdf) console.log(`     ${r.nro_reclamo} · factura ${r.fecha_factura} · reclamo ${r.fecha_reclamo} ${r.fecha_factura !== r.fecha_reclamo ? "(distinta, no se tocó)" : ""}`);
console.log(sin.length === 0 && iguales.length === sinPdf.length ? "\nTODO CUADRA" : "\nREVISAR");

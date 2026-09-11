// Medición (SOLO LECTURA) del papel del reclamo: los totales de REC-2026-0026 y
// qué columnas condicionales (Género, Factura, PO) traen datos en los reclamos
// vivos. Uso: npx tsx scripts/_medir-reclamos-papel.mjs
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const q = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

const recs = await q("reclamos?deleted=eq.false&select=nro_reclamo,empresa,proveedor,marca,nro_factura,fecha_factura,reclamo_items(referencia,descripcion,talla,genero,cantidad,precio_unitario,motivo,nro_factura,nro_orden_compra,deleted)");
const r26 = recs.find((r) => r.nro_reclamo === "REC-2026-0026");
if (r26) {
  const items = (r26.reclamo_items || []).filter((i) => !i.deleted);
  const sub = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);
  const imp = sub * 0.10;
  const itbms = (sub + imp) * 0.07;
  console.log(`REC-2026-0026 · ${r26.empresa} · ${items.length} renglones`);
  console.log(`  Subtotal ${sub.toFixed(2)} · Importación ${imp.toFixed(2)} · ITBMS ${itbms.toFixed(2)} · Total ${(sub + imp + itbms).toFixed(2)}`);
  console.log(`  Proveedor ${r26.proveedor} · Marca ${r26.marca} · Factura ${r26.nro_factura} · fecha_factura ${r26.fecha_factura}`);
  console.log(`  Género en alguna fila: ${items.some((i) => !!i.genero)} · Factura por fila: ${items.some((i) => !!i.nro_factura)} · PO por fila: ${items.some((i) => !!i.nro_orden_compra)}`);
}
let conG = 0, conF = 0, conP = 0;
for (const r of recs) {
  const items = (r.reclamo_items || []).filter((i) => !i.deleted);
  if (items.some((i) => !!i.genero)) conG++;
  if (items.some((i) => !!i.nro_factura)) conF++;
  if (items.some((i) => !!i.nro_orden_compra)) conP++;
}
console.log(`\nDe ${recs.length} reclamos vivos: con Género ${conG} · con Factura por renglón ${conF} · con PO por renglón ${conP}`);
console.log(`O sea que hoy la tabla del papel se dibuja con ${10 - (conG ? 0 : 1) - (conF ? 0 : 1) - (conP ? 0 : 1)} columnas en el mejor caso.`);

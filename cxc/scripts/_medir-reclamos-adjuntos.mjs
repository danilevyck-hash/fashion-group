// Medición contra producción (SOLO LECTURA) para los dos encargos de Reclamos
// del 11-sep-2026:
//   A. el correo al proveedor lleva ADJUNTOS (factura PDF + fotos achicadas)
//   B. los reclamos abiertos sin `reclamado_en` se marcan con su `created_at`
//
// Uso:  npx tsx scripts/_medir-reclamos-adjuntos.mjs
import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function q(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const recs = await q(
  "reclamos?deleted=eq.false&select=id,nro_reclamo,empresa,estado,created_at,reclamado_en,factura_pdf_path,reclamo_items(cantidad,precio_unitario),reclamo_fotos(storage_path)&order=created_at.asc",
);

const TASA = { "Active Shoes": { imp: 0.15, itbms: 0 } };
function total(empresa, sub) {
  const t = TASA[empresa];
  if (t) return sub * (1 + t.imp);
  return sub * 1.10 * 1.07;
}
const sub = (r) =>
  (r.reclamo_items || []).reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);

const porCobrar = recs.filter((r) => r.estado !== "Pagado");
const sinReclamar = porCobrar.filter((r) => !r.reclamado_en);
const sum = (arr) => arr.reduce((s, r) => s + total(r.empresa, sub(r)), 0);

console.log(`Por cobrar: ${porCobrar.length} · $${sum(porCobrar).toFixed(2)}`);
console.log(`  sin reclamar: ${sinReclamar.length} · $${sum(sinReclamar).toFixed(2)}`);
console.log("\n--- los que se marcarían (B) ---");
for (const r of sinReclamar) {
  console.log(`  '${r.id}', -- ${r.nro_reclamo} · ${r.empresa} · ${r.estado} · created_at ${r.created_at}`);
}

console.log("\n--- adjuntos que viajarían (A) ---");
const conFactura = recs.filter((r) => r.factura_pdf_path);
const fotos = recs.flatMap((r) => (r.reclamo_fotos || []).map((f) => ({ rec: r.nro_reclamo, path: f.storage_path })));
console.log(`Reclamos con factura PDF: ${conFactura.length} de ${recs.length}`);
console.log(`Fotos en total: ${fotos.length}`);
const porRec = new Map();
for (const r of recs) porRec.set(r.nro_reclamo, (r.reclamo_fotos || []).length);
const maxFotos = [...porRec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log("Más fotos en un reclamo:", maxFotos.map(([k, v]) => `${k}=${v}`).join(" · "));

// Peso real de los archivos (HEAD a signed URL)
async function pesar(bucket, paths) {
  if (!paths.length) return [];
  const r = await fetch(`${URL}/storage/v1/object/sign/${bucket}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ paths, expiresIn: 600 }),
  });
  const rows = await r.json();
  const out = [];
  for (const row of rows) {
    if (!row.signedURL) { out.push({ path: row.path, bytes: null }); continue; }
    const h = await fetch(`${URL}/storage/v1${row.signedURL}`, { method: "HEAD" });
    out.push({ path: row.path, bytes: Number(h.headers.get("content-length") || 0) });
  }
  return out;
}

const pesosF = await pesar("reclamo-facturas", conFactura.map((r) => r.factura_pdf_path));
const pesosP = await pesar("reclamo-fotos", fotos.map((f) => f.path));
const mb = (b) => (b / 1024 / 1024).toFixed(2);
const sumB = (a) => a.reduce((s, x) => s + (x.bytes || 0), 0);
console.log(`Facturas: ${pesosF.length} archivos · ${mb(sumB(pesosF))} MB · mayor ${mb(Math.max(0, ...pesosF.map((x) => x.bytes || 0)))} MB`);
console.log(`Fotos:    ${pesosP.length} archivos · ${mb(sumB(pesosP))} MB · mayor ${mb(Math.max(0, ...pesosP.map((x) => x.bytes || 0)))} MB`);

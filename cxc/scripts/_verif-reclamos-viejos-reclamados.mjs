// Verificación de la migración 20261113120000 (SOLO LECTURA): los 6 reclamos
// viejos quedaron marcados con su fecha de creación, y nadie más se movió.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const q = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

const IDS = [
  "27c0e999-12de-4bec-8694-a369bab5a6bb",
  "43322771-d75f-496c-906b-257af811ea12",
  "fc4eec5c-5081-4392-a2e9-494831b1cd72",
  "a405a5cb-77e9-40eb-a251-dcdbf61febfd",
  "0ba1ab3c-dfd3-44ae-b1b6-b00522e470c7",
  "b63bf282-6d0a-4746-b49d-2d6cfcae3aed",
];
const recs = await q(`reclamos?id=in.(${IDS.join(",")})&select=id,nro_reclamo,created_at,reclamado_en`);
let ok = true;
for (const r of recs) {
  const igual = r.reclamado_en === r.created_at;
  if (!igual) ok = false;
  console.log(`${igual ? "✅" : "❌"} ${r.nro_reclamo} · reclamado_en=${r.reclamado_en} · created_at=${r.created_at}`);
}
const abiertos = await q("reclamos?deleted=eq.false&estado=neq.Pagado&reclamado_en=is.null&select=id,nro_reclamo");
console.log(`\nAbiertos SIN reclamado_en: ${abiertos.length} ${abiertos.length === 0 ? "✅" : "❌ " + abiertos.map((r) => r.nro_reclamo).join(", ")}`);
console.log(ok && abiertos.length === 0 ? "\nTODO CUADRA" : "\nREVISAR");

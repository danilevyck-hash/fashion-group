// Verificación VISUAL del papel del reclamo (solo lectura de producción): baja
// REC-2026-0026, arma el PDF con el código real y lo vuelca a texto con
// pdftotext -layout. Uso: npx tsx scripts/_verif-reclamos-papel.mjs
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const q = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

const nro = process.argv[2] || "REC-2026-0026";
const [rec] = await q(`reclamos?nro_reclamo=eq.${nro}&deleted=eq.false&select=*,reclamo_items(*),reclamo_fotos(*),reclamo_settlements(*)`);
if (!rec) { console.log("No existe", nro); process.exit(1); }
const [contacto] = await q(`reclamo_contactos?empresa=eq.${encodeURIComponent(rec.empresa)}&limit=1`);

const { buildBulkReclamosPdf } = await import("../src/lib/reclamos/pdf-bulk.ts");
// Las fotos se omiten a propósito: acá se mira la FORMA del papel.
const doc = await buildBulkReclamosPdf([{ ...rec, reclamo_fotos: [] }], rec.empresa, contacto ?? null);
const dir = mkdtempSync(path.join(tmpdir(), "papel-"));
const pdf = path.join(dir, "r.pdf");
writeFileSync(pdf, Buffer.from(doc.output("arraybuffer")));
execFileSync("pdftotext", ["-layout", pdf, path.join(dir, "r.txt")]);
console.log(readFileSync(path.join(dir, "r.txt"), "utf8"));
console.log(`\nPDF en ${pdf}`);

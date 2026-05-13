import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const empresas = ["fashion_wear", "vistana", "fashion_shoes", "active_shoes", "active_wear", "joystep", "boston", "multifashion"];

console.log("Listado completo de CSVs en backups/cxc-uploads/ por empresa:\n");
for (const emp of empresas) {
  const { data, error } = await sb.storage.from("backups").list(`cxc-uploads/${emp}`, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) { console.log(`  [${emp}]  ERROR: ${error.message}`); continue; }
  const csvs = (data ?? []).filter((f) => /\.csv$/i.test(f.name));
  if (csvs.length === 0) { console.log(`  [${emp}]  (vacío)`); continue; }
  console.log(`  [${emp}]  ${csvs.length} archivos:`);
  for (const f of csvs.slice(0, 5)) {
    const size = f.metadata?.size ?? "?";
    console.log(`     ${f.updated_at || f.created_at}  ${String(size).padStart(8)} bytes  ${f.name}`);
  }
}

// Cruzar con cxc_uploads
console.log("\nFilas en cxc_uploads (header table):");
const { data: uploads } = await sb.from("cxc_uploads").select("*").order("uploaded_at", { ascending: false });
for (const u of uploads ?? []) {
  console.log(`  ${u.uploaded_at}  ${String(u.company_key).padEnd(15)}  rows=${u.row_count}  ${u.filename}`);
}

// Conteo de cxc_rows por empresa
const { data: rowsByCo } = await sb.from("cxc_rows").select("company_key");
const counts = new Map();
for (const r of rowsByCo ?? []) counts.set(r.company_key, (counts.get(r.company_key) ?? 0) + 1);
console.log("\nFilas en cxc_rows por empresa:");
for (const [k, v] of [...counts.entries()].sort()) console.log(`  ${k.padEnd(15)} ${v}`);

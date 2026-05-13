// Baja los CSVs más recientes de cxc-uploads/ desde el bucket "backups"
// a /tmp/cxc-samples/ para diagnóstico del parser.
//
// Uso: node scripts/fetch-cxc-csv-from-storage.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const OUTDIR = "/tmp/cxc-samples";
mkdirSync(OUTDIR, { recursive: true });

const empresas = ["fashion_wear", "vistana", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

const allFiles = [];
for (const emp of empresas) {
  const { data, error } = await sb.storage.from("backups").list(`cxc-uploads/${emp}`, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) { console.error(`[${emp}] error:`, error.message); continue; }
  for (const f of data ?? []) {
    if (!f.name.endsWith(".csv") && !f.name.endsWith(".CSV")) continue;
    allFiles.push({ emp, name: f.name, path: `cxc-uploads/${emp}/${f.name}`, updated: f.updated_at ?? f.created_at ?? "" });
  }
}

allFiles.sort((a, b) => b.updated.localeCompare(a.updated));

console.log(`Encontrados ${allFiles.length} CSVs en storage. Bajando los 6 más recientes:`);
const top = allFiles.slice(0, 6);
for (const f of top) {
  const { data, error } = await sb.storage.from("backups").download(f.path);
  if (error) { console.error(`fail ${f.path}:`, error.message); continue; }
  const buffer = Buffer.from(await data.arrayBuffer());
  const localPath = `${OUTDIR}/${f.emp}__${f.name}`;
  writeFileSync(localPath, buffer);
  console.log(`  ${(buffer.length / 1024).toFixed(1).padStart(8)} KB  ${f.updated}  ${localPath}`);
}
